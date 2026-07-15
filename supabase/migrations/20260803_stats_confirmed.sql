-- Conferma statistiche partita.
--
-- Dopo il risultato l'admin censisce gol e assist, poi preme "Salva statistiche"
-- per fissarli: solo allora si sblocca il box votazioni. Ogni modifica a gol/
-- assist o al risultato azzera il flag (le statistiche vanno risalvate).
alter table matches add column if not exists stats_confirmed_at timestamptz;

-- Le partite già concluse (con risultato) prima di questa feature avevano già
-- i voti/pagelle sbloccati: le consideriamo con statistiche già confermate per
-- non regredirle.
update matches m
set stats_confirmed_at = coalesce(m.stats_confirmed_at, now())
where exists (select 1 from match_results r where r.match_id = m.id)
  and m.stats_confirmed_at is null;
