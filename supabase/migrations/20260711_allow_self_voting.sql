-- Consente agli admin/superadmin di votare anche se stessi tra i partecipanti alla partita
ALTER TABLE player_votes DROP CONSTRAINT IF EXISTS player_votes_check;
