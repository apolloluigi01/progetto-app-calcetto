-- Giocatori ospite (guest).
--
-- Un ospite è un giocatore non anagrafato: non ha un account auth, vale solo
-- per la partita a cui è legato (guest_match_id, con cascade alla cancellazione
-- della partita). A parte questo è un player normale: entra in
-- match_players/match_players_draft, ratings, goals, assists, pagelle come
-- qualsiasi altro id in players, senza bisogno di toccare quelle tabelle.
alter table players add column if not exists is_guest boolean not null default false;
alter table players add column if not exists guest_match_id uuid references matches(id) on delete cascade;

-- players.id non aveva default (arriva sempre dall'id auth.users al signup):
-- un ospite ne ha bisogno per generarsi un id senza passare da auth.
alter table players alter column id set default gen_random_uuid();

-- players.id referenziava sempre auth.users(id): un ospite non ha un utente
-- auth associato. Sostituiamo la FK rigida con un trigger che la applica solo
-- ai giocatori "veri" (is_guest = false).
alter table players drop constraint if exists players_id_fkey;

create or replace function check_player_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.is_guest and not exists (select 1 from auth.users where id = new.id) then
    raise exception 'players.id deve corrispondere a un utente auth quando is_guest = false';
  end if;
  return new;
end $$;

drop trigger if exists players_check_auth_user on players;
create trigger players_check_auth_user
  before insert or update of id, is_guest on players
  for each row execute function check_player_auth_user();
