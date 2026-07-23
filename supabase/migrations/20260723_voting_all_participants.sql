-- ===== VOTAZIONI APERTE A TUTTI I PARTECIPANTI =====
-- D'ora in poi può votare CHIUNQUE giochi la partita (non più solo gli admin).
-- La differenza tra ruoli non è più sul "chi può votare" ma sull'obbligo:
-- gli admin che giocano sono tenuti a votare, gli altri no (vincolo applicato
-- lato app, non dal DB). Il peso del voto resta gestito nel frontend
-- (admin ×2, giocatori ×1).
--
-- Resta il bypass del superadmin: può votare una partita a cui non ha
-- partecipato solo nel caso limite in cui nessun admin/superadmin vi giochi.

drop policy if exists "player_votes_insert" on player_votes;
create policy "player_votes_insert"
  on player_votes for insert to authenticated
  with check (
    voter_id = auth.uid() and (
      exists (
        select 1 from match_players mp
        where mp.match_id = player_votes.match_id and mp.player_id = auth.uid()
      )
      or (is_superadmin() and not match_has_admin_participant(player_votes.match_id))
    )
  );

drop policy if exists "player_votes_update" on player_votes;
create policy "player_votes_update"
  on player_votes for update to authenticated
  using (
    voter_id = auth.uid() and (
      exists (
        select 1 from match_players mp
        where mp.match_id = player_votes.match_id and mp.player_id = auth.uid()
      )
      or (is_superadmin() and not match_has_admin_participant(player_votes.match_id))
    )
  )
  with check (
    voter_id = auth.uid() and (
      exists (
        select 1 from match_players mp
        where mp.match_id = player_votes.match_id and mp.player_id = auth.uid()
      )
      or (is_superadmin() and not match_has_admin_participant(player_votes.match_id))
    )
  );
