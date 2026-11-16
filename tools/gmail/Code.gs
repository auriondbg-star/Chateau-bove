/**
 * Château de la Bôve : envoie un e-mail en français à chaque demande du site.
 * À coller dans un projet Google Apps Script créé avec le compte Gmail qui doit recevoir les demandes,
 * puis déployer en « Application Web » (Exécuter en tant que : moi ; Accès : tout le monde).
 * Le site envoie : sujet, champs [[libellé, valeur]], dates demandées, jours déjà occupés, e-mail du client.
 */
var MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
var JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
var COUL = {
  demande:  {fond:'#2f5d50', texte:'#ffffff', nom:'Dates demandées'},
  conflit:  {fond:'#b3261e', texte:'#ffffff', nom:'Demandé mais déjà pris'},
  mariage:  {fond:'#e8c9c4', texte:'#3a2a27', nom:'Mariage déjà réservé'},
  seminaire:{fond:'#ead9a8', texte:'#3a2f12', nom:'Séminaire déjà réservé'},
  sejour:   {fond:'#cfd8e3', texte:'#1f2b38', nom:'Déjà réservé'}
};

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (!d || !d.sujet) return out('ignoré');
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: String(d.sujet).slice(0, 200),
      htmlBody: corps(d),
      name: 'Site Château de la Bôve',
      replyTo: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(d.email || '') ? d.email : undefined
    });
    return out('ok');
  } catch (err) {
    return out('erreur');
  }
}
function doGet() { return out('Le service d’envoi des demandes fonctionne.'); }
function out(t) { return ContentService.createTextOutput(t); }

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}
function okDate(k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); }

function corps(d) {
  var h = '<div style="font-family:Georgia,serif;color:#2b2622;max-width:640px">';
  h += '<h2 style="font-weight:normal;margin:0 0 4px">' + esc(d.titre || 'Nouvelle demande') + '</h2>';
  h += '<p style="margin:0 0 18px;color:#776d63;font-family:Arial,sans-serif;font-size:13px">Reçue via le site du Château de la Bôve. Pour répondre au client, utilisez simplement « Répondre ».</p>';
  h += '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px">';
  (d.champs || []).forEach(function (c) {
    if (!c || c[1] === '' || c[1] == null) return;
    h += '<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid #e6dfd6;color:#776d63;vertical-align:top;white-space:nowrap">' + esc(c[0]) +
         '</td><td style="padding:8px 0;border-bottom:1px solid #e6dfd6">' +
         (/^https:\/\/[^\s"<>]+$/.test(c[1]) ? '<a href="' + esc(c[1]) + '" style="color:#2f5d50">Ouvrir dans l’espace propriétaire</a>' : esc(c[1])) + '</td></tr>';
  });
  h += '</table>';
  h += calendriers(d);
  h += '</div>';
  return h;
}

function calendriers(d) {
  var dem = (d.demandees || []).filter(okDate), occ = {};
  (d.occupes || []).forEach(function (o) { if (o && okDate(o[0])) occ[o[0]] = o[1]; });
  var mois = {};
  dem.forEach(function (k) { mois[k.slice(0, 7)] = 1; });
  var liste = Object.keys(mois).sort().slice(0, 3);
  if (!liste.length) return '';
  var demSet = {}; dem.forEach(function (k) { demSet[k] = 1; });
  var vus = {}, h = '<h3 style="font-weight:normal;margin:26px 0 8px">Calendrier</h3>';
  liste.forEach(function (m) { h += unMois(m, demSet, occ, vus); });
  h += '<table cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;font-size:12px;margin-top:6px">';
  Object.keys(COUL).forEach(function (c) {
    if (!vus[c]) return;
    h += '<tr><td style="padding:3px 8px 3px 0"><span style="display:inline-block;width:14px;height:14px;background:' + COUL[c].fond +
         ';border-radius:3px;vertical-align:middle"></span></td><td style="padding:3px 0">' + COUL[c].nom + '</td></tr>';
  });
  h += '</table>';
  return h;
}

function unMois(m, demSet, occ, vus) {
  var an = +m.slice(0, 4), mo = +m.slice(5, 7) - 1;
  var premier = new Date(an, mo, 1), nb = new Date(an, mo + 1, 0).getDate();
  var decal = (premier.getDay() + 6) % 7; // lundi en premier
  var h = '<table cellpadding="0" cellspacing="3" style="border-collapse:separate;font-family:Arial,sans-serif;font-size:13px;text-align:center;margin:0 0 14px">';
  h += '<tr><td colspan="7" style="text-align:left;font-family:Georgia,serif;font-size:16px;padding:0 0 4px">' + MOIS[mo].charAt(0).toUpperCase() + MOIS[mo].slice(1) + ' ' + an + '</td></tr><tr>';
  ['L','M','M','J','V','S','D'].forEach(function (j) { h += '<td style="width:38px;color:#776d63;font-size:11px">' + j + '</td>'; });
  h += '</tr><tr>';
  for (var i = 0; i < decal; i++) h += '<td></td>';
  for (var j = 1; j <= nb; j++) {
    var k = m + '-' + (j < 10 ? '0' : '') + j, c = null;
    if (demSet[k]) c = occ[k] ? 'conflit' : 'demande';
    else if (occ[k]) c = COUL[occ[k]] ? occ[k] : 'sejour';
    var st = 'height:30px;border-radius:4px;';
    if (c) { vus[c] = 1; st += 'background:' + COUL[c].fond + ';color:' + COUL[c].texte + ';font-weight:bold;'; }
    else st += 'background:#f4f0ea;color:#2b2622;';
    h += '<td style="' + st + '">' + j + '</td>';
    if ((decal + j) % 7 === 0 && j < nb) h += '</tr><tr>';
  }
  h += '</tr></table>';
  return h;
}
