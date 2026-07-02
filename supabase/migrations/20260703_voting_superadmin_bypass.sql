-- Un admin può votare solo le partite a cui partecipa; un superadmin può votare anche
-- partite a cui non ha partecipato (serve per garantire che le votazioni si possano sempre
-- svolgere anche quando nessun admin fa parte della partita).

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM players WHERE id = auth.uid() AND role = 'superadmin'
  );
$$;

DROP POLICY IF EXISTS "player_votes_insert" ON player_votes;
CREATE POLICY "player_votes_insert"
  ON player_votes FOR INSERT TO authenticated
  WITH CHECK (
    voter_id = auth.uid() AND (
      is_superadmin() OR (
        is_admin() AND EXISTS (
          SELECT 1 FROM match_players mp
          WHERE mp.match_id = player_votes.match_id AND mp.player_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "player_votes_update" ON player_votes;
CREATE POLICY "player_votes_update"
  ON player_votes FOR UPDATE TO authenticated
  USING (
    voter_id = auth.uid() AND (
      is_superadmin() OR (
        is_admin() AND EXISTS (
          SELECT 1 FROM match_players mp
          WHERE mp.match_id = player_votes.match_id AND mp.player_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    voter_id = auth.uid() AND (
      is_superadmin() OR (
        is_admin() AND EXISTS (
          SELECT 1 FROM match_players mp
          WHERE mp.match_id = player_votes.match_id AND mp.player_id = auth.uid()
        )
      )
    )
  );
