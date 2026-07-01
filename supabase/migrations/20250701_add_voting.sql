-- Aggiunge il flag voting_open alle partite
ALTER TABLE matches ADD COLUMN IF NOT EXISTS voting_open boolean NOT NULL DEFAULT false;

-- Tabella voti dei giocatori
CREATE TABLE IF NOT EXISTS player_votes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   uuid NOT NULL REFERENCES matches(id)  ON DELETE CASCADE,
  voter_id   uuid NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  voted_id   uuid NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  vote       numeric(3,1) NOT NULL CHECK (vote >= 1 AND vote <= 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, voter_id, voted_id),
  CHECK (voter_id <> voted_id)
);

ALTER TABLE player_votes ENABLE ROW LEVEL SECURITY;

-- Tutti gli utenti autenticati possono leggere i voti (per calcolare le medie)
CREATE POLICY "player_votes_select"
  ON player_votes FOR SELECT TO authenticated USING (true);

-- Ogni giocatore può inserire solo i propri voti
CREATE POLICY "player_votes_insert"
  ON player_votes FOR INSERT TO authenticated
  WITH CHECK (voter_id = auth.uid());

-- Ogni giocatore può aggiornare solo i propri voti (per poterli modificare prima della chiusura)
CREATE POLICY "player_votes_update"
  ON player_votes FOR UPDATE TO authenticated
  USING (voter_id = auth.uid())
  WITH CHECK (voter_id = auth.uid());

-- Gli admin possono gestire tutti i voti
CREATE POLICY "player_votes_admin"
  ON player_votes FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
