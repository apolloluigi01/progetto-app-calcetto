-- Limite rigido di 10 prenotazioni per partita, imposto a livello di DB:
-- la UI nasconde già i bottoni a quota piena, ma senza vincolo server due
-- prenotazioni simultanee (o una pagina non aggiornata) potevano superare
-- i 10 giocatori. Il lock sulla riga della partita serializza gli insert
-- concorrenti sulla stessa partita.
create or replace function enforce_max_bookings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from matches where id = new.match_id for update;
  if (select count(*) from match_bookings where match_id = new.match_id) >= 10 then
    raise exception 'Sondaggio al completo: il numero di giocatori per partita è fisso a 10';
  end if;
  return new;
end $$;

drop trigger if exists match_bookings_max10 on match_bookings;
create trigger match_bookings_max10
  before insert on match_bookings
  for each row execute function enforce_max_bookings();
