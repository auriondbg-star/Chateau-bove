-- Copiez tout ce texte dans Supabase > SQL Editor > New query.
-- Remplacez VOTRE-EMAIL@exemple.fr (tout en bas) par l'e-mail de votre compte propriétaire, puis touchez Run.

-- Château de la Bôve : base de données Supabase
-- À exécuter une fois dans Supabase › SQL Editor (ou via le connecteur).

-- Équipe : qui peut ouvrir l'espace propriétaire.
create table if not exists public.equipe (
  email text primary key check (email = lower(email)),
  role  text not null check (role in ('owner','acces')),
  cree  date not null default current_date
);

-- Demandes envoyées depuis le site (mariage, séminaire, visite, gîte, appartement).
create table if not exists public.demandes (
  id         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- Petites valeurs partagées : blocages manuels du calendrier et occupation publique.
--   bloques, gite-bloques, appart-bloques : réservés à l'équipe
--   occupation : jours pris, sans aucun nom, lisible par tous les visiteurs
create table if not exists public.etat (
  cle    text primary key,
  valeur jsonb not null,
  maj    timestamptz not null default now()
);

create or replace function public.est_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipe where email = lower(auth.jwt() ->> 'email'));
$$;

create or replace function public.est_proprietaire() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipe where email = lower(auth.jwt() ->> 'email') and role = 'owner');
$$;

alter table public.equipe   enable row level security;
alter table public.demandes enable row level security;
alter table public.etat     enable row level security;

-- equipe
drop policy if exists equipe_lire on public.equipe;
create policy equipe_lire on public.equipe for select to authenticated using (public.est_equipe());
drop policy if exists equipe_ajouter on public.equipe;
create policy equipe_ajouter on public.equipe for insert to authenticated with check (public.est_proprietaire() and role = 'acces');
drop policy if exists equipe_retirer on public.equipe;
create policy equipe_retirer on public.equipe for delete to authenticated using (public.est_proprietaire() and role = 'acces');

-- demandes : tout visiteur peut en envoyer une nouvelle (sans partie « paiement », que seule la fonction « paiement » écrit),
-- seule l'équipe les lit et les modifie
drop policy if exists demandes_envoyer on public.demandes;
create policy demandes_envoyer on public.demandes for insert to anon, authenticated
  with check (data ->> 'statut' = 'nouvelle' and coalesce(data ->> 'visite','') = ''
              and not (data ? 'paiement') and not (data ? 'paye') and pg_column_size(data) < 20000);
drop policy if exists demandes_lire on public.demandes;
create policy demandes_lire on public.demandes for select to authenticated using (public.est_equipe());
drop policy if exists demandes_modifier on public.demandes;
create policy demandes_modifier on public.demandes for update to authenticated using (public.est_equipe()) with check (public.est_equipe());
drop policy if exists demandes_supprimer on public.demandes;
create policy demandes_supprimer on public.demandes for delete to authenticated using (public.est_equipe());

-- etat
drop policy if exists etat_lire_public on public.etat;
create policy etat_lire_public on public.etat for select to anon, authenticated using (cle = 'occupation' or public.est_equipe());
drop policy if exists etat_ecrire on public.etat;
create policy etat_ecrire on public.etat for insert to authenticated with check (public.est_equipe());
drop policy if exists etat_maj on public.etat;
create policy etat_maj on public.etat for update to authenticated using (public.est_equipe()) with check (public.est_equipe());

grant select, insert, update, delete on public.equipe, public.demandes, public.etat to authenticated;
grant insert on public.demandes to anon;
grant select on public.etat to anon;

-- ===================== Avis des clients =====================
-- Le lendemain de la fin d'un séjour, d'un séminaire ou d'un mariage confirmé, le script Google
-- (tools/gmail/Code.gs) envoie au client un lien personnel. L'avis arrive ici « à lire » ;
-- seul le propriétaire le publie. Le site n'affiche que les avis publiés et acceptés par le client.
create table if not exists public.avis (
  id        text primary key,                               -- id de la demande
  jeton     uuid not null unique default gen_random_uuid(), -- lien personnel du client
  type      text not null,
  nom       text,
  email     text,
  langue    text,
  fin       date,
  envoye_le timestamptz,
  note      int  check (note between 1 and 5),
  texte     text check (char_length(texte) <= 3000),
  auteur    text check (char_length(auteur) <= 80),
  accord    boolean not null default false,                 -- le client accepte la publication
  recu_le   timestamptz,
  publie    boolean not null default false check (not publie or accord),
  cree      timestamptz not null default now()
);
alter table public.avis enable row level security;
drop policy if exists avis_lire on public.avis;
create policy avis_lire on public.avis for select to authenticated using (public.est_equipe());
drop policy if exists avis_modifier on public.avis;
create policy avis_modifier on public.avis for update to authenticated using (public.est_equipe()) with check (public.est_equipe());
drop policy if exists avis_supprimer on public.avis;
create policy avis_supprimer on public.avis for delete to authenticated using (public.est_equipe());
grant select, update, delete on public.avis to authenticated;

-- Réglages privés (aucune règle : personne ne les lit directement). Clé du script Google.
create table if not exists public.reglages (cle text primary key, valeur text not null);
alter table public.reglages enable row level security;
insert into public.reglages (cle, valeur) values ('cle_script', replace(gen_random_uuid()::text, '-', '')) on conflict do nothing;

-- Le propriétaire lit la clé dans l'espace propriétaire (onglet Avis) pour la coller dans le script.
create or replace function public.cle_script() returns text
language sql stable security definer set search_path = public as $$
  select case when public.est_proprietaire() then (select valeur from public.reglages where cle = 'cle_script') end;
$$;

-- Dernier jour d'une demande (le site l'enregistre dans « fin » à la confirmation ; sinon on le déduit).
create or replace function public.fin_demande(d jsonb) returns date
language plpgsql immutable as $$
declare j date;
begin
  if coalesce(d->>'fin','') ~ '^\d{4}-\d{2}-\d{2}$' then return (d->>'fin')::date; end if;
  if d->>'type' in ('gite','appart') then
    return case when coalesce(d->>'depart','') ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'depart')::date end;
  end if;
  if jsonb_typeof(d->'dates') = 'array' and jsonb_array_length(d->'dates') > 0 then
    select max(x)::date into j from jsonb_array_elements_text(d->'dates') x where x ~ '^\d{4}-\d{2}-\d{2}$';
    return j;
  end if;
  if coalesce(d->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  if d->>'type' = 'seminaire' then return (d->>'date')::date + greatest(coalesce(nullif(d->>'jours','')::int, 1), 1) - 1; end if;
  return (d->>'date')::date + 2;  -- mariage : week-end du vendredi au dimanche
end $$;

-- Appelé chaque matin par le script Google : prépare les avis des demandes confirmées terminées
-- dans les 10 derniers jours (au moins la veille), et renvoie ceux dont l'e-mail reste à envoyer.
create or replace function public.avis_a_envoyer(p_cle text)
returns table (id text, jeton uuid, type text, nom text, email text, langue text)
language plpgsql security definer set search_path = public as $$
declare auj date := (now() at time zone 'Europe/Paris')::date;
begin
  if p_cle is null or p_cle is distinct from (select valeur from public.reglages where cle = 'cle_script') then
    raise exception 'cle invalide';
  end if;
  insert into public.avis (id, type, nom, email, langue, fin)
  select d.id, d.data->>'type', d.data->>'noms', lower(trim(d.data->>'email')), d.data->>'langue', public.fin_demande(d.data)
  from public.demandes d
  where d.data->>'statut' = 'confirmee'
    and d.data->>'type' in ('mariage','seminaire','gite','appart')
    and coalesce(d.data->>'ex','') = ''
    and trim(coalesce(d.data->>'email','')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and public.fin_demande(d.data) between auj - 10 and auj - 1
  on conflict on constraint avis_pkey do nothing;
  return query select a.id, a.jeton, a.type, a.nom, a.email, a.langue from public.avis a
    where a.envoye_le is null and a.recu_le is null and a.email is not null order by a.cree limit 50;
end $$;

create or replace function public.avis_envoye(p_cle text, p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_cle is null or p_cle is distinct from (select valeur from public.reglages where cle = 'cle_script') then
    raise exception 'cle invalide';
  end if;
  update public.avis set envoye_le = now() where id = p_id;
end $$;

-- Page du client (lien personnel) : ce qu'il faut afficher, puis l'envoi de l'avis (une seule fois).
create or replace function public.avis_info(p_jeton uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('type', type, 'nom', nom, 'fait', recu_le is not null) from public.avis where jeton = p_jeton;
$$;

create or replace function public.avis_deposer(p_jeton uuid, p_note int, p_texte text, p_auteur text, p_accord boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_note is null or p_note not between 1 and 5 or char_length(trim(coalesce(p_texte,''))) = 0 then return false; end if;
  update public.avis set note = p_note, texte = left(trim(p_texte), 3000), auteur = left(nullif(trim(coalesce(p_auteur,'')), ''), 80),
         accord = coalesce(p_accord, false), recu_le = now()
   where jeton = p_jeton and recu_le is null;
  return found;
end $$;

-- Avis visibles sur le site : publiés et acceptés, sans e-mail ni nom de famille de la demande.
create or replace function public.avis_publies()
returns table (auteur text, type text, note int, texte text, quand date)
language sql stable security definer set search_path = public as $$
  select coalesce(a.auteur, 'Un client'), a.type, a.note, a.texte, coalesce(a.fin, a.recu_le::date)
  from public.avis a where a.publie and a.accord and a.recu_le > now() - interval '3 years'
  order by a.recu_le desc limit 30;
$$;

revoke all on function public.cle_script(), public.avis_a_envoyer(text), public.avis_envoye(text, text),
  public.avis_info(uuid), public.avis_deposer(uuid, int, text, text, boolean), public.avis_publies() from public;
grant execute on function public.cle_script() to authenticated;
grant execute on function public.avis_a_envoyer(text), public.avis_envoye(text, text) to anon, authenticated;
grant execute on function public.avis_info(uuid), public.avis_deposer(uuid, int, text, text, boolean), public.avis_publies() to anon, authenticated;

-- Votre compte propriétaire :
insert into public.equipe (email, role) values (lower('VOTRE-EMAIL@exemple.fr'), 'owner') on conflict do nothing;
