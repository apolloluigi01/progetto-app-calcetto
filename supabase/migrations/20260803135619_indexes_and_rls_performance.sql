-- 1) Indici su tutte le chiavi esterne che non ne avevano uno (33 segnalate
--    dall'advisor). Nelle migration non esisteva un solo create index.
do $$
declare r record;
begin
  for r in
    select t.relname as tbl, a.attname as col
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and n.nspname = 'public'
      and cardinality(c.conkey) = 1
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
      )
  loop
    execute format(
      'create index if not exists %I on public.%I (%I)',
      'idx_' || r.tbl || '_' || r.col, r.tbl, r.col
    );
  end loop;
end $$;

-- 2) auth.uid() racchiuso in (select ...): senza, Postgres lo rivaluta per
--    ogni riga esaminata dalla policy.
drop policy if exists "log_insert_admin_only" on admin_activity_log;
create policy "log_insert_admin_only" on admin_activity_log for insert to authenticated
  with check (is_admin());

drop policy if exists "match_bookings_insert_self_or_admin" on match_bookings;
create policy "match_bookings_insert_self_or_admin" on match_bookings for insert to authenticated
  with check (player_id = (select auth.uid()) or is_admin());

drop policy if exists "match_bookings_delete_self_or_admin" on match_bookings;
create policy "match_bookings_delete_self_or_admin" on match_bookings for delete to authenticated
  using (player_id = (select auth.uid()) or is_admin());

drop policy if exists "fanta_members_insert_self" on fanta_league_members;
create policy "fanta_members_insert_self" on fanta_league_members for insert to authenticated
  with check (player_id = (select auth.uid()));

drop policy if exists "fanta_members_delete_self" on fanta_league_members;
create policy "fanta_members_delete_self" on fanta_league_members for delete to authenticated
  using (player_id = (select auth.uid()));

drop policy if exists "fanta_resets_select_self" on fanta_lineup_resets;
create policy "fanta_resets_select_self" on fanta_lineup_resets for select to authenticated
  using (member_id = (select auth.uid()) or is_admin());

drop policy if exists "fanta_resets_delete_self" on fanta_lineup_resets;
create policy "fanta_resets_delete_self" on fanta_lineup_resets for delete to authenticated
  using (member_id = (select auth.uid()) or is_admin());

drop policy if exists "team_approvals_insert_self_admin" on team_approvals;
create policy "team_approvals_insert_self_admin" on team_approvals for insert to authenticated
  with check (is_admin() and admin_id = (select auth.uid()));

drop policy if exists "player_votes_insert" on player_votes;
create policy "player_votes_insert" on player_votes for insert to authenticated
  with check (
    voter_id = (select auth.uid()) and (
      exists (
        select 1 from match_players mp
        where mp.match_id = player_votes.match_id and mp.player_id = (select auth.uid())
      )
      or (is_superadmin() and not match_has_admin_participant(match_id))
    )
  );

drop policy if exists "player_votes_update" on player_votes;
create policy "player_votes_update" on player_votes for update to authenticated
  using (
    voter_id = (select auth.uid()) and (
      exists (
        select 1 from match_players mp
        where mp.match_id = player_votes.match_id and mp.player_id = (select auth.uid())
      )
      or (is_superadmin() and not match_has_admin_participant(match_id))
    )
  )
  with check (
    voter_id = (select auth.uid()) and (
      exists (
        select 1 from match_players mp
        where mp.match_id = player_votes.match_id and mp.player_id = (select auth.uid())
      )
      or (is_superadmin() and not match_has_admin_participant(match_id))
    )
  );

-- 3) Policy permissive sovrapposte: le "write_admin" erano FOR ALL, quindi
--    valevano anche in SELECT insieme alla policy di lettura, e Postgres le
--    valutava entrambe. Restano solo su INSERT/UPDATE/DELETE.
do $$
declare r record;
begin
  for r in
    select unnest(array[
      'assists:assists_admin_write',
      'goals:goals_write_admin',
      'honor_entries:honor_entries_admin_write',
      'match_players:match_players_write_admin',
      'match_results:match_results_write_admin',
      'matches:matches_write_admin',
      'pagelle:pagelle_write_admin',
      'press_links:press_links_admin_write',
      'rating_weights:rating_weights_write_admin',
      'ratings:ratings_write_admin',
      'seasons:seasons_write_admin'
    ]) as spec
  loop
    declare
      v_tbl text := split_part(r.spec, ':', 1);
      v_pol text := split_part(r.spec, ':', 2);
    begin
      execute format('drop policy if exists %I on public.%I', v_pol, v_tbl);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (is_admin())',
        v_pol || '_insert', v_tbl);
      execute format(
        'create policy %I on public.%I for update to authenticated using (is_admin()) with check (is_admin())',
        v_pol || '_update', v_tbl);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (is_admin())',
        v_pol || '_delete', v_tbl);
    end;
  end loop;
end $$;

drop policy if exists "fanta_lineup_players_write_self" on fanta_lineup_players;
create policy "fanta_lineup_players_insert_self" on fanta_lineup_players for insert to authenticated
  with check (exists (
    select 1 from fanta_lineups l where l.id = lineup_id and l.member_id = (select auth.uid())
  ));
create policy "fanta_lineup_players_update_self" on fanta_lineup_players for update to authenticated
  using (exists (
    select 1 from fanta_lineups l where l.id = lineup_id and l.member_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from fanta_lineups l where l.id = lineup_id and l.member_id = (select auth.uid())
  ));
create policy "fanta_lineup_players_delete_self" on fanta_lineup_players for delete to authenticated
  using (exists (
    select 1 from fanta_lineups l where l.id = lineup_id and l.member_id = (select auth.uid())
  ));

-- 4) Coppie di policy sulla stessa operazione unite in una sola con OR.
drop policy if exists "fanta_lineups_update_self" on fanta_lineups;
drop policy if exists "fanta_lineups_update_admin" on fanta_lineups;
create policy "fanta_lineups_update" on fanta_lineups for update to authenticated
  using (member_id = (select auth.uid()) or is_admin())
  with check (member_id = (select auth.uid()) or is_admin());

drop policy if exists "fanta_lineups_delete_self" on fanta_lineups;
drop policy if exists "fanta_lineups_delete_admin" on fanta_lineups;
create policy "fanta_lineups_delete" on fanta_lineups for delete to authenticated
  using (member_id = (select auth.uid()) or is_admin());

drop policy if exists "fanta_lineups_insert_self" on fanta_lineups;
create policy "fanta_lineups_insert_self" on fanta_lineups for insert to authenticated
  with check (member_id = (select auth.uid()));

drop policy if exists "players_update_admin" on players;
drop policy if exists "players_update_superadmin" on players;
create policy "players_update" on players for update to authenticated
  using ((is_admin() and role = 'player') or is_superadmin())
  with check ((is_admin() and role = 'player') or is_superadmin());

drop policy if exists "players_delete_admin" on players;
drop policy if exists "players_delete_superadmin" on players;
create policy "players_delete" on players for delete to authenticated
  using ((is_admin() and role = 'player') or is_superadmin());;
