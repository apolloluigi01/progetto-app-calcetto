-- Riallineamento permessi admin/superadmin:
-- 1) Qualunque admin (admin o superadmin) può votare le pagelle di qualsiasi partita,
--    anche se non vi ha partecipato: rimossa la distinzione introdotta in
--    20260703_voting_superadmin_bypass.sql (e la policy "player_votes_admin" ridondante
--    che comunque la aggirava di fatto).
-- 2) Un admin normale non può modificare né eliminare un altro admin o un superadmin:
--    la restrizione, finora imposta solo lato frontend, viene ora imposta anche dalle RLS.
--    Un superadmin resta libero di modificare/eliminare chiunque.
-- Nota: l'overall/rating (tabella "ratings") resta modificabile da qualunque admin per
-- qualunque giocatore, invariato — è un valore di gioco, non un privilegio sull'account.

DROP POLICY IF EXISTS "player_votes_admin" ON player_votes;
DROP POLICY IF EXISTS "player_votes_insert" ON player_votes;
DROP POLICY IF EXISTS "player_votes_update" ON player_votes;

CREATE POLICY "player_votes_insert"
  ON player_votes FOR INSERT TO authenticated
  WITH CHECK (voter_id = auth.uid() AND is_admin());

CREATE POLICY "player_votes_update"
  ON player_votes FOR UPDATE TO authenticated
  USING (voter_id = auth.uid() AND is_admin())
  WITH CHECK (voter_id = auth.uid() AND is_admin());

DROP POLICY IF EXISTS "players_update_admin" ON players;
DROP POLICY IF EXISTS "players_delete_admin" ON players;

CREATE POLICY "players_update_admin"
  ON players FOR UPDATE TO authenticated
  USING (is_admin() AND role = 'player')
  WITH CHECK (is_admin() AND role = 'player');

CREATE POLICY "players_update_superadmin"
  ON players FOR UPDATE TO authenticated
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "players_delete_admin"
  ON players FOR DELETE TO authenticated
  USING (is_admin() AND role = 'player');

CREATE POLICY "players_delete_superadmin"
  ON players FOR DELETE TO authenticated
  USING (is_superadmin());
