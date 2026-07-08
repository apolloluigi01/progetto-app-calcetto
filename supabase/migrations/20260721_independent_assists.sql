-- ===== ASSIST INDIPENDENTI DAI GOL =====
-- Gli assist non sono più un campo del gol: vengono censiti in una tabella
-- dedicata, in modo che gol e assist si possano registrare separatamente.
create table if not exists assists (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team text not null check (team in ('A', 'B')),
  created_at timestamptz not null default now()
);

alter table assists enable row level security;
create policy "assists_select" on assists for select to authenticated using (true);
create policy "assists_admin_write" on assists for all to authenticated
  using (is_admin()) with check (is_admin());

-- Backfill: gli assist finora salvati sul gol diventano righe autonome.
insert into assists (match_id, player_id, team)
select g.match_id, g.assist_player_id, g.team
from goals g
where g.assist_player_id is not null;

-- La colonna sul gol non serve più.
alter table goals drop column if exists assist_player_id;
