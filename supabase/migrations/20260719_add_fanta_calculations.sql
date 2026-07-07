-- Il calcolo della giornata fantacalcetto diventa un'azione esplicita
-- dell'admin ("Calcola giornata"), annullabile e ripetibile.
alter table fanta_lineups add column if not exists score numeric(6,2);

create table if not exists fanta_calculations (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references fanta_leagues(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  calculated_at timestamptz not null default now(),
  calculated_by uuid references players(id) on delete set null,
  unique (league_id, match_id)
);

alter table fanta_calculations enable row level security;
create policy "fanta_calc_select" on fanta_calculations for select to authenticated using (true);
create policy "fanta_calc_insert_admin" on fanta_calculations for insert to authenticated with check (is_admin());
create policy "fanta_calc_delete_admin" on fanta_calculations for delete to authenticated using (is_admin());

-- L'admin scrive il punteggio calcolato sulle formazioni di tutti.
create policy "fanta_lineups_update_admin" on fanta_lineups for update to authenticated using (is_admin()) with check (is_admin());
