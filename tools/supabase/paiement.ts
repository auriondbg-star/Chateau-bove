// Fonction Supabase « paiement » : paiement par carte des logements (gîte et appartement) avec Stripe.
// À coller dans Supabase › Edge Functions › nom « paiement » (voir tools/supabase/INSTALLATION.md).
// Ce fichier ne contient aucun secret : les clés sont lues dans les « Secrets » de Supabase.
//
// Trois usages :
//  1. Le site demande un paiement  -> {action:'payer', ...}      : recalcule le prix, vérifie les dates, ouvre la page Stripe.
//  2. Stripe prévient du paiement  -> appel de Stripe (webhook)  : la réservation passe en « Confirmée » et les nuits sont bloquées.
//  3. L'espace propriétaire annule -> {action:'rembourser', ...} : rembourse 90 % (ou 40 % à 7 jours ou moins de l'arrivée), ou 100 %.

type Env = (k: string) => string | undefined;
// deno-lint-ignore no-explicit-any
const g: any = globalThis;
let env: Env = (k) => (g.Deno ? g.Deno.env.get(k) : undefined);
export function setEnv(e: Env) { env = e; }

// ---------- règles du site (identiques à index.html) ----------
export const LOGEMENTS: Record<string, { nom: string; min: number; max: number }> = {
  gite: { nom: 'Gîte de la Bôve', min: 6, max: 11 },
  appart: { nom: 'Appartement de la Bôve', min: 2, max: 4 },
};
// Conditions d'annulation : plus de 7 jours avant l'arrivée, 90 % remboursés ; à 7 jours ou moins, 40 % remboursés.
export const JOURS_LIMITE = 7, REMB_AVANT = 0.9, REMB_APRES = 0.4;
const HOLD_MINUTES = 35; // une page de paiement Stripe reste ouverte 30 minutes : les dates sont gardées pendant ce temps

const jour = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function nuits(a: string, b: string): string[] {
  const out: string[] = []; const d = jour(a), fin = jour(b);
  while (d < fin) { out.push(iso(d)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function paques(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g2 = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g2 + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31),
    da = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(Date.UTC(y, mo - 1, da));
}
function fete(k: string): string {
  const d = jour(k), mo = d.getUTCMonth() + 1, j = d.getUTCDate();
  if ((mo === 12 && j >= 20) || (mo === 1 && j <= 2)) return 'noel';
  const p = paques(d.getUTCFullYear()), deb = new Date(p); deb.setUTCDate(deb.getUTCDate() - 8);
  return d >= deb && d <= p ? 'paques' : '';
}
function tarifNuit(k: string, type: string, v: number): number {
  const f = fete(k), base = type === 'appart' ? (v <= 2 ? 30 : 25) : 23;
  return f === 'noel' ? Math.max(base, 30) : f === 'paques' ? Math.max(base, 28) : base;
}
export const minNuits = (a: string, b: string) => (nuits(a, b).some(fete) ? 3 : 2);
export const prix = (type: string, a: string, b: string, v: number) => nuits(a, b).reduce((t, k) => t + tarifNuit(k, type, v) * v, 0);
// date du jour à Paris
export const aujourdhui = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const ecartJours = (a: string, b: string) => Math.round((jour(b).getTime() - jour(a).getTime()) / 86400000);
// part remboursée selon la date d'annulation
export function partRemboursee(arrivee: string, today = aujourdhui()): number {
  return ecartJours(today, arrivee) > JOURS_LIMITE ? REMB_AVANT : REMB_APRES;
}

// ---------- base Supabase (accès serveur) ----------
const SB_URL = () => env('SUPABASE_URL') || '';
const SB_KEY = () => env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_SECRET_KEY') || '';
function sbHeaders(extra: Record<string, string> = {}) {
  const k = SB_KEY(); const h: Record<string, string> = { apikey: k, 'Content-Type': 'application/json', ...extra };
  if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;
  return h;
}
async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(SB_URL() + '/rest/v1/' + path, { ...init, headers: sbHeaders((init.headers as Record<string, string>) || {}) });
  if (!r.ok) throw new Error('Base : ' + r.status + ' ' + (await r.text()));
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
type Demande = { id: string; data: Record<string, any>; created_at?: string };
const lireDemande = async (id: string): Promise<Demande | null> => (await sb('demandes?select=id,data,created_at&id=eq.' + encodeURIComponent(id)))[0] || null;
const majDemande = (id: string, data: Record<string, unknown>) => sb('demandes?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ data }) });

// occupation publique (jours pris, sans nom) : {event:[[jour,{...}]], gite:[...], appart:[...]}
async function lireOccupation(): Promise<Record<string, [string, Record<string, unknown>][]>> {
  const r = await sb("etat?select=valeur&cle=eq.occupation");
  return (r[0] && r[0].valeur) || { event: [], gite: [], appart: [] };
}
async function ajouterOccupation(type: string, ks: string[]) {
  const occ = await lireOccupation(); const list = occ[type] || []; const pris = new Set(list.map((x) => x[0]));
  ks.forEach((k, i) => { if (!pris.has(k)) list.push([k, { type: 'conf', kind: type, show: i === 0 || k.endsWith('-01') }]); });
  occ[type] = list.sort((x, y) => x[0].localeCompare(y[0]));
  await sb('etat', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ cle: 'occupation', valeur: occ, maj: new Date().toISOString() }) });
}
async function retirerOccupation(type: string, ks: string[]) {
  const occ = await lireOccupation(); const enlever = new Set(ks);
  occ[type] = (occ[type] || []).filter((x) => !enlever.has(x[0]));
  await sb('etat', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ cle: 'occupation', valeur: occ, maj: new Date().toISOString() }) });
}
// nuits déjà prises : occupation publique + séjours confirmés + paiements en cours
async function nuitsPrises(type: string, sauf = ''): Promise<Set<string>> {
  const pris = new Set<string>(((await lireOccupation())[type] || []).map((x) => x[0]));
  const rows: Demande[] = await sb('demandes?select=id,data,created_at&data->>type=eq.' + type);
  const limite = Date.now() - HOLD_MINUTES * 60000;
  rows.forEach((r) => {
    const d = r.data || {};
    if (r.id === sauf || !d.date || !d.depart) return;
    const tient = d.statut === 'confirmee' || (d.statut === 'attente-paiement' && Date.parse(r.created_at || '') > limite);
    if (tient) nuits(d.date, d.depart).forEach((k) => pris.add(k));
  });
  return pris;
}

// ---------- Stripe ----------
function formulaire(o: Record<string, unknown>, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') formulaire(v as Record<string, unknown>, key, out); else out.append(key, String(v));
  }
  return out;
}
async function stripe(path: string, params: Record<string, unknown>, idem?: string) {
  const h: Record<string, string> = { Authorization: 'Bearer ' + (env('STRIPE_SECRET_KEY') || ''), 'Content-Type': 'application/x-www-form-urlencoded' };
  if (idem) h['Idempotency-Key'] = idem;
  const r = await fetch('https://api.stripe.com/v1/' + path, { method: 'POST', headers: h, body: formulaire(params) });
  const j = await r.json();
  if (!r.ok) throw new Error('Stripe : ' + (j.error && j.error.message || r.status));
  return j;
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export async function signatureValide(corps: string, entete: string, secret: string, maintenant = Date.now()): Promise<boolean> {
  const parts = Object.fromEntries(entete.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v]));
  const v1s = entete.split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !v1s.length || Math.abs(maintenant / 1000 - t) > 300) return false;
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const attendu = hex(await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(t + '.' + corps)));
  return v1s.some((s) => s.length === attendu.length && [...s].reduce((acc, c, i) => acc | (c.charCodeAt(0) ^ attendu.charCodeAt(i)), 0) === 0);
}

// ---------- réponses ----------
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SITES = ['https://chateau-bove.pages.dev', 'https://chateaudelabove.fr', 'https://www.chateaudelabove.fr', 'http://localhost:8765'];
const texte = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

// 1. demande de paiement depuis le site
async function payer(b: Record<string, unknown>) {
  const type = String(b.type), a = String(b.arrivee || ''), d = String(b.depart || ''), v = Number(b.voyageurs);
  // Object.hasOwn : refuse les noms piégés comme « constructor », qui passeraient sinon le contrôle
  const L = Object.hasOwn(LOGEMENTS, type) ? LOGEMENTS[type] : undefined; const en = b.langue === 'en', es = b.langue === 'es';
  const err = (fr: string, enMsg: string, esMsg: string) => json({ erreur: es ? esMsg : en ? enMsg : fr }, 400);
  if (!L) return err('Logement inconnu.', 'Unknown accommodation.', 'Alojamiento desconocido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d <= a) return err('Dates non valables.', 'Invalid dates.', 'Fechas no válidas.');
  if (a < aujourdhui()) return err("La date d'arrivée est passée.", 'The arrival date has passed.', 'La fecha de llegada ya ha pasado.');
  if (!Number.isInteger(v) || v < L.min || v > L.max) return err('Nombre de voyageurs non valable.', 'Invalid number of guests.', 'Número de huéspedes no válido.');
  const n = nuits(a, d); if (n.length < minNuits(a, d)) return err('Séjour trop court.', 'Stay too short.', 'Estancia demasiado corta.');
  if (n.length > 60) return err('Séjour trop long : écrivez-nous.', 'Stay too long: please contact us.', 'Estancia demasiado larga: escríbanos.');
  const nom = texte(b.nom, 120), email = texte(b.email, 160);
  if (!nom || !/^\S+@\S+\.\S+$/.test(email)) return err('Nom ou e-mail manquant.', 'Name or email missing.', 'Falta el nombre o el correo electrónico.');
  if (b.conditions !== true) return err("Les conditions d'annulation doivent être acceptées.", 'The cancellation terms must be accepted.', 'Debe aceptar las condiciones de cancelación.');
  const pris = await nuitsPrises(type);
  if (n.some((k) => pris.has(k))) return json({ erreur: es ? 'Algunas de estas noches acaban de reservarse. Elija otras fechas.' : en ? 'Some of these nights have just been booked. Please choose other dates.' : 'Une partie de ces nuits vient d\'être réservée. Choisissez d\'autres dates.', pris: true }, 409);

  const total = prix(type, a, d, v);
  const id = 'p' + Date.now() + Math.random().toString(36).slice(2, 6);
  const retour = SITES.includes(String(b.site)) ? String(b.site) : SITES[0];
  const lg = es ? '&lang=es' : en ? '&lang=en' : '';
  const data = {
    id, type, recu: aujourdhui(), noms: nom, date: a, depart: d, invites: v + ' voyageur' + (v > 1 ? 's' : ''),
    formule: 'Séjour : ' + (type === 'gite' ? 'le gîte' : "l'appartement") + ' · ' + total.toLocaleString('fr-FR') + ' €',
    email, tel: texte(b.tel, 40), msg: texte(b.msg, 2000), statut: 'attente-paiement', paiement: { total, etat: 'en attente' },
    ...(en ? { langue: 'en' } : es ? { langue: 'es' } : {}),
  };
  await sb('demandes', { method: 'POST', body: JSON.stringify({ id, data }) });
  const session = await stripe('checkout/sessions', {
    mode: 'payment', locale: es ? 'es' : en ? 'en' : 'fr', customer_email: email, client_reference_id: id,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60 + 30,
    success_url: `${retour}/?paiement=ok&ref=${id}${lg}#logements`,
    cancel_url: `${retour}/?paiement=annule&ref=${id}${lg}#logements`,
    metadata: { demande: id, logement: type, arrivee: a, depart: d },
    payment_intent_data: { description: `${L.nom} · ${a} → ${d} · ${v} voyageurs`, metadata: { demande: id } },
    line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(total * 100), product_data: {
      name: L.nom + (es ? ` · ${n.length} noches · ${v} huéspedes` : en ? ` · ${n.length} nights · ${v} guests` : ` · ${n.length} nuits · ${v} voyageurs`),
      description: es ? `Llegada el ${a}, salida el ${d}. Cancelación más de ${JOURS_LIMITE} días antes de la llegada: se reembolsa el 90 %; ${JOURS_LIMITE} días o menos: se reembolsa el 40 %.`
        : en ? `Arrival ${a}, departure ${d}. Cancellation more than ${JOURS_LIMITE} days before arrival: 90% refunded; ${JOURS_LIMITE} days or less: 40% refunded.`
        : `Arrivée le ${a}, départ le ${d}. Annulation plus de ${JOURS_LIMITE} jours avant l'arrivée : 90 % remboursés ; ${JOURS_LIMITE} jours ou moins : 40 % remboursés.`,
    } } } },
  }, 'checkout-' + id);
  await majDemande(id, { ...data, paiement: { total, etat: 'en attente', session: session.id } });
  return json({ url: session.url, id, total });
}

// 2. message de Stripe (webhook)
async function webhook(corps: string, signature: string) {
  if (!(await signatureValide(corps, signature, env('STRIPE_WEBHOOK_SECRET') || ''))) return json({ erreur: 'signature' }, 400);
  const ev = JSON.parse(corps); const s = ev.data && ev.data.object || {};
  const id = s.client_reference_id || (s.metadata && s.metadata.demande);
  if (!id) return json({ ok: true });
  const r = await lireDemande(id); if (!r) return json({ ok: true });
  const d = r.data;
  if (ev.type === 'checkout.session.completed' && s.payment_status === 'paid') {
    if (d.statut === 'confirmee' && d.paiement && d.paiement.etat === 'payé') return json({ ok: true }); // déjà traité
    const ks = nuits(d.date, d.depart);
    const conflit = [...await nuitsPrises(d.type, id)].some((k) => ks.includes(k));
    const paiement = { ...(d.paiement || {}), etat: 'payé', montant: s.amount_total / 100, intent: s.payment_intent, le: aujourdhui(), ...(conflit ? { conflit: true } : {}) };
    // en cas de conflit (cas très rare), la demande reste « Nouvelle » : le propriétaire décide et rembourse si besoin
    await majDemande(id, { ...d, statut: conflit ? 'nouvelle' : 'confirmee', paiement });
    if (!conflit) await ajouterOccupation(d.type, ks);
  } else if (ev.type === 'checkout.session.expired' && d.statut === 'attente-paiement') {
    await sb('demandes?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  }
  return json({ ok: true });
}

// le visiteur a quitté la page de paiement sans payer : les dates sont libérées tout de suite
async function abandon(id: string) {
  const r = await lireDemande(id);
  if (!r || r.data.statut !== 'attente-paiement') return json({ ok: true });
  const sid = r.data.paiement && r.data.paiement.session;
  // on ne libère les dates que si Stripe confirme que la page de paiement est fermée (sinon le paiement a peut-être abouti)
  if (sid) { try { await stripe('checkout/sessions/' + sid + '/expire', {}); } catch (_) { return json({ ok: true }); } }
  const r2 = await lireDemande(id);
  if (r2 && r2.data.statut === 'attente-paiement') await sb('demandes?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  return json({ ok: true });
}

// 3. annulation et remboursement, depuis l'espace propriétaire
async function rembourser(b: Record<string, unknown>, auth: string) {
  const u = await fetch(SB_URL() + '/auth/v1/user', { headers: { apikey: env('SUPABASE_ANON_KEY') || SB_KEY(), Authorization: auth } });
  if (!u.ok) return json({ erreur: 'Connexion expirée : reconnectez-vous.' }, 401);
  const email = String((await u.json()).email || '').toLowerCase();
  const eq = await sb('equipe?select=email&email=eq.' + encodeURIComponent(email));
  if (!eq.length) return json({ erreur: 'Accès refusé.' }, 403);
  const r = await lireDemande(String(b.id)); if (!r) return json({ erreur: 'Réservation introuvable.' }, 404);
  const d = r.data, p = d.paiement || {};
  if (p.etat !== 'payé' || !p.intent) return json({ erreur: "Cette réservation n'a pas été payée par carte, ou elle est déjà remboursée." }, 400);
  const part = b.total === true ? 1 : partRemboursee(d.date);
  const montant = Math.round(p.montant * 100 * part) / 100;
  const ref = await stripe('refunds', { payment_intent: p.intent, amount: Math.round(montant * 100), metadata: { demande: d.id } }, 'refund-' + d.id);
  const ks = nuits(d.date, d.depart);
  const nd = { ...d, statut: 'annulee', paiement: { ...p, etat: 'remboursé', rembourse: montant, garde: Math.round((p.montant - montant) * 100) / 100, part, rembourse_le: aujourdhui(), refund: ref.id } };
  await majDemande(d.id, nd);
  await retirerOccupation(d.type, ks);
  return json({ ok: true, rembourse: montant, garde: nd.paiement.garde, part });
}

export async function traiter(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non permise' }, 405);
  try {
    const corps = await req.text();
    const sig = req.headers.get('stripe-signature');
    if (sig) return await webhook(corps, sig);
    const b = JSON.parse(corps || '{}');
    if (b.action === 'payer') return await payer(b);
    if (b.action === 'abandon') return await abandon(String(b.id || ''));
    if (b.action === 'rembourser') return await rembourser(b, req.headers.get('authorization') || '');
    if (b.action === 'test') return json({ ok: true, stripe: !!env('STRIPE_SECRET_KEY'), webhook: !!env('STRIPE_WEBHOOK_SECRET') });
    return json({ erreur: 'Action inconnue' }, 400);
  } catch (e) {
    console.error(e);
    return json({ erreur: 'Le paiement est momentanément indisponible. Réessayez plus tard ou écrivez-nous.' }, 500);
  }
}

if (g.Deno && g.Deno.serve) g.Deno.serve(traiter);
