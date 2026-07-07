-- ===== FANTACALCETTO =====
-- Leghe agganciate alla stagione: una sola lega per stagione.
create table if not exists fanta_leagues (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null unique references seasons(id) on delete cascade,
  name text not null,
  created_by uuid references players(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists fanta_league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references fanta_leagues(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (league_id, player_id)
);

-- Formazione schierata da un partecipante per una partita.
create table if not exists fanta_lineups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references fanta_leagues(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  member_id uuid not null references players(id) on delete cascade,
  captain_id uuid not null references players(id),
  updated_at timestamptz not null default now(),
  unique (league_id, match_id, member_id)
);

create table if not exists fanta_lineup_players (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references fanta_lineups(id) on delete cascade,
  player_id uuid not null references players(id),
  unique (lineup_id, player_id)
);

-- Assist sul gol (bonus fantacalcetto +1). Volutamente senza foreign key:
-- un secondo vincolo verso players renderebbe ambigui gli embed PostgREST
-- "players(name)" usati dalle query esistenti sui goals.
alter table goals add column if not exists assist_player_id uuid;

alter table fanta_leagues enable row level security;
alter table fanta_league_members enable row level security;
alter table fanta_lineups enable row level security;
alter table fanta_lineup_players enable row level security;

create policy "fanta_leagues_select" on fanta_leagues for select to authenticated using (true);
create policy "fanta_leagues_insert_admin" on fanta_leagues for insert to authenticated with check (is_admin());
create policy "fanta_leagues_delete_admin" on fanta_leagues for delete to authenticated using (is_admin());

create policy "fanta_members_select" on fanta_league_members for select to authenticated using (true);
create policy "fanta_members_insert_self" on fanta_league_members for insert to authenticated with check (player_id = auth.uid());
create policy "fanta_members_delete_self" on fanta_league_members for delete to authenticated using (player_id = auth.uid());

create policy "fanta_lineups_select" on fanta_lineups for select to authenticated using (true);
create policy "fanta_lineups_insert_self" on fanta_lineups for insert to authenticated with check (member_id = auth.uid());
create policy "fanta_lineups_update_self" on fanta_lineups for update to authenticated using (member_id = auth.uid()) with check (member_id = auth.uid());
create policy "fanta_lineups_delete_self" on fanta_lineups for delete to authenticated using (member_id = auth.uid());

create policy "fanta_lineup_players_select" on fanta_lineup_players for select to authenticated using (true);
create policy "fanta_lineup_players_write_self" on fanta_lineup_players for all to authenticated
  using (exists (select 1 from fanta_lineups l where l.id = lineup_id and l.member_id = auth.uid()))
  with check (exists (select 1 from fanta_lineups l where l.id = lineup_id and l.member_id = auth.uid()));
