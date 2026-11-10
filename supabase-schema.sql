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

-- demandes : tout visiteur peut en envoyer une nouvelle, seule l'équipe les lit et les modifie
drop policy if exists demandes_envoyer on public.demandes;
create policy demandes_envoyer on public.demandes for insert to anon, authenticated
  with check (data ->> 'statut' = 'nouvelle' and coalesce(data ->> 'visite','') = '' and pg_column_size(data) < 20000);
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

-- Votre compte propriétaire :
insert into public.equipe (email, role) values (lower('VOTRE-EMAIL@exemple.fr'), 'owner') on conflict do nothing;
