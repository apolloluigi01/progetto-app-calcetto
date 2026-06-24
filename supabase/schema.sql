-- Calcetto App — Schema DB completo (Fase 1)
-- Eseguire nel SQL Editor del progetto Supabase.

-- =========================================================
-- TABELLE
-- =========================================================

create table if not exists players (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  nickname text,
  avatar_url text,
  role text not null default 'player' check (role in ('admin', 'player', 'superadmin')),
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete restrict,
  match_date date not null,
  match_time time,
  field text,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team text not null check (team in ('A', 'B')),
  unique (match_id, player_id)
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team text not null check (team in ('A', 'B'))
);

create table if not exists match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references matches(id) on delete cascade,
  score_a int not null default 0,
  score_b int not null default 0
);

create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references players(id) on delete cascade,
  rating_value numeric(5,2) not null default 0 check (rating_value >= 0 and rating_value <= 100),
  fascia text not null default 'D' check (fascia in ('A', 'B', 'C', 'D')),
  updated_at timestamptz not null default now()
);

create table if not exists rating_weights (
  id uuid primary key default gen_random_uuid(),
  stat_key text not null unique,
  weight_percent numeric(5,2) not null
);

create table if not exists pagelle (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  voto text not null,
  titolo text,
  descrizione text,
  is_mvp boolean not null default false,
  published_at timestamptz,
  unique (match_id, player_id)
);

-- Pesi rating di default (modificabili da pannello admin)
insert into rating_weights (stat_key, weight_percent) values
  ('win_percentage', 30),
  ('goals_per_match', 25),
  ('voto_medio_pagelle', 25),
  ('mvp_count', 20)
on conflict (stat_key) do nothing;

-- =========================================================
-- HELPER: ruolo admin dell'utente corrente
-- =========================================================

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from players where id = auth.uid() and role in ('admin', 'superadmin')
  );
$$;

-- RPC che l'utente autenticato chiama per confermare che ha impostato una password conforme
create or replace function clear_must_change_password()
returns void
language sql
security definer
set search_path = public
as $$
  update players set must_change_password = false where id = auth.uid();
$$;

grant execute on function clear_must_change_password() to authenticated;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table players enable row level security;
alter table seasons enable row level security;
alter table matches enable row level security;
alter table match_players enable row level security;
alter table goals enable row level security;
alter table match_results enable row level security;
alter table ratings enable row level security;
alter table rating_weights enable row level security;
alter table pagelle enable row level security;

-- players: tutti gli autenticati vedono il roster; solo admin scrive
create policy "players_select_all" on players for select to authenticated using (true);
create policy "players_insert_admin" on players for insert to authenticated with check (is_admin());
create policy "players_update_admin" on players for update to authenticated using (is_admin());
create policy "players_delete_admin" on players for delete to authenticated using (is_admin());

-- seasons: lettura libera, scrittura admin
create policy "seasons_select_all" on seasons for select to authenticated using (true);
create policy "seasons_write_admin" on seasons for all to authenticated using (is_admin()) with check (is_admin());

-- matches: lettura libera, scrittura admin
create policy "matches_select_all" on matches for select to authenticated using (true);
create policy "matches_write_admin" on matches for all to authenticated using (is_admin()) with check (is_admin());

-- match_players: lettura libera, scrittura admin
create policy "match_players_select_all" on match_players for select to authenticated using (true);
create policy "match_players_write_admin" on match_players for all to authenticated using (is_admin()) with check (is_admin());

-- goals: lettura libera, scrittura admin
create policy "goals_select_all" on goals for select to authenticated using (true);
create policy "goals_write_admin" on goals for all to authenticated using (is_admin()) with check (is_admin());

-- match_results: lettura libera, scrittura admin
create policy "match_results_select_all" on match_results for select to authenticated using (true);
create policy "match_results_write_admin" on match_results for all to authenticated using (is_admin()) with check (is_admin());

-- ratings: lettura libera, scrittura admin
create policy "ratings_select_all" on ratings for select to authenticated using (true);
create policy "ratings_write_admin" on ratings for all to authenticated using (is_admin()) with check (is_admin());

-- rating_weights: lettura libera, scrittura admin
create policy "rating_weights_select_all" on rating_weights for select to authenticated using (true);
create policy "rating_weights_write_admin" on rating_weights for all to authenticated using (is_admin()) with check (is_admin());

-- pagelle: i player vedono solo le pubblicate, gli admin vedono tutto (incluse le bozze)
create policy "pagelle_select_published_or_admin" on pagelle for select to authenticated
  using (published_at is not null or is_admin());
create policy "pagelle_write_admin" on pagelle for all to authenticated using (is_admin()) with check (is_admin());
