-- ===== VOTAZIONI: APERTE A TUTTI O SOLO AGLI ADMIN =====
-- All'apertura delle votazioni l'admin sceglie chi puo' votare:
--   voting_admins_only = false -> tutti i partecipanti alla partita (come prima)
--   voting_admins_only = true  -> solo gli admin/superadmin che hanno giocato
-- La regola la applica il database: il frontend nasconde solo il box di voto.
-- Resta il bypass del superadmin quando nessun admin ha giocato la partita.

alter table matches
  add column if not exists voting_admins_only boolean not null default false;

drop policy if exists "player_votes_insert" on player_votes;
create policy "player_votes_insert"
  on player_votes for insert to authenticated
  with check (
    voter_id = (select auth.uid()) and (
      (
        exists (
          select 1 from match_players mp
          where mp.match_id = player_votes.match_id and mp.player_id = (select auth.uid())
        )
        and (
          is_admin()
          or not exists (
            select 1 from matches m
            where m.id = player_votes.match_id and m.voting_admins_only
          )
        )
      )
      or (is_superadmin() and not match_has_admin_participant(match_id))
    )
  );

drop policy if exists "player_votes_update" on player_votes;
create policy "player_votes_update"
  on player_votes for update to authenticated
  using (
    voter_id = (select auth.uid()) and (
      (
        exists (
          select 1 from match_players mp
          where mp.match_id = player_votes.match_id and mp.player_id = (select auth.uid())
        )
        and (
          is_admin()
          or not exists (
            select 1 from matches m
            where m.id = player_votes.match_id and m.voting_admins_only
          )
        )
      )
      or (is_superadmin() and not match_has_admin_participant(match_id))
    )
  )
  with check (
    voter_id = (select auth.uid()) and (
      (
        exists (
          select 1 from match_players mp
          where mp.match_id = player_votes.match_id and mp.player_id = (select auth.uid())
        )
        and (
          is_admin()
          or not exists (
            select 1 from matches m
            where m.id = player_votes.match_id and m.voting_admins_only
          )
        )
      )
      or (is_superadmin() and not match_has_admin_participant(match_id))
    )
  );
