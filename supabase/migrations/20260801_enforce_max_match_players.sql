-- Il numero di giocatori per partita è fisso a 10 anche per la modalità
-- "seleziona manualmente", che scrive direttamente su match_players
-- bypassando il trigger su match_bookings (usato solo dal sondaggio).
create or replace function enforce_max_match_players() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from matches where id = new.match_id for update;
  if (select count(*) from match_players where match_id = new.match_id) >= 10 then
    raise exception 'Numero massimo di giocatori raggiunto: il numero di giocatori per partita è fisso a 10';
  end if;
  return new;
end $$;

drop trigger if exists match_players_max10 on match_players;
create trigger match_players_max10
  before insert on match_players
  for each row execute function enforce_max_match_players();
