-- Formazione invisibile agli altri: il flag nasconde i giocatori schierati
-- (non il fatto di aver schierato) finché le formazioni non si bloccano.
alter table fanta_lineups add column if not exists hidden boolean not null default false;

-- Traccia dei reset da ricalcolo squadre: una riga per ogni partecipante che
-- aveva schierato quando l'admin ha rifatto le squadre. La Home mostra
-- l'avviso "rischiera la formazione" finché la riga esiste; si cancella al
-- nuovo salvataggio della formazione.
create table if not exists fanta_lineup_resets (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references fanta_leagues(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  member_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (league_id, match_id, member_id)
);

alter table fanta_lineup_resets enable row level security;
create policy "fanta_resets_select_self" on fanta_lineup_resets for select to authenticated using (member_id = auth.uid() or is_admin());
create policy "fanta_resets_insert_admin" on fanta_lineup_resets for insert to authenticated with check (is_admin());
create policy "fanta_resets_delete_self" on fanta_lineup_resets for delete to authenticated using (member_id = auth.uid() or is_admin());
