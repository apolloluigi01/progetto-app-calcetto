-- Le squadre sono visibili ai player normali solo dopo l'ufficializzazione
-- (restano visibili per le partite già giocate, per lo storico); gli admin
-- le vedono sempre, così possono lavorarci prima di pubblicarle.
drop policy if exists "match_players_select_all" on match_players;
create policy "match_players_select" on match_players for select to authenticated
  using (
    is_admin()
    or exists (
      select 1 from matches m
      where m.id = match_id
        and (
          m.teams_official_at is not null
          or exists (select 1 from match_results r where r.match_id = m.id)
        )
    )
  );

-- Approvazione squadre: prima dell'ufficializzazione tutti gli admin devono
-- approvare la versione corrente delle squadre. Ogni modifica alle squadre
-- (ricalcolo, modifica manuale, sostituzione) azzera le approvazioni.
create table if not exists team_approvals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  admin_id uuid not null references players(id) on delete cascade,
  approved_at timestamptz not null default now(),
  unique (match_id, admin_id)
);

alter table team_approvals enable row level security;
create policy "team_approvals_select" on team_approvals for select to authenticated using (true);
create policy "team_approvals_insert_self_admin" on team_approvals for insert to authenticated
  with check (is_admin() and admin_id = auth.uid());
create policy "team_approvals_delete_admin" on team_approvals for delete to authenticated using (is_admin());
