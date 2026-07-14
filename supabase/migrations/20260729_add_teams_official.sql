-- Ufficializzazione squadre: step esplicito dell'admin dopo la generazione.
-- Da quel momento le squadre non possono più essere modificate, ricalcolate
-- o soggette a sostituzioni, e si apre lo schieramento delle formazioni
-- fantacalcetto.
alter table matches add column if not exists teams_official_at timestamptz;

-- Backfill: le partite già concluse si considerano ufficializzate, così
-- lo storico del fantacalcetto resta consultabile senza azioni manuali.
update matches m
  set teams_official_at = now()
  where teams_official_at is null
    and exists (select 1 from match_results r where r.match_id = m.id);
