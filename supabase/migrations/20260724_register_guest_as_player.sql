-- Conversione di un ospite in giocatore registrato.
--
-- Un ospite (is_guest = true) ha un id generato localmente e NON legato ad
-- auth.users. Quando decide di registrarsi, l'admin crea un vero utente auth
-- (edge function register-guest) e poi chiama questa RPC per "spostare" l'ospite
-- sul nuovo id auth SENZA perdere le statistiche accumulate.
--
-- Le FK verso players sono ON DELETE CASCADE ma NON ON UPDATE CASCADE, quindi
-- non si puo' semplicemente cambiare players.id in-place. La strategia e':
--   1. inserire la nuova riga players con id = utente auth (giocatore "vero");
--   2. ripuntare tutti i riferimenti dal vecchio id ospite al nuovo id;
--   3. eliminare la vecchia riga ospite (ormai senza figli).
-- Tutto in un'unica transazione (la funzione). Il nuovo id e' appena creato,
-- quindi nessun conflitto con vincoli unique esistenti.
create or replace function register_guest_as_player(
  p_guest_id uuid,
  p_new_id uuid,
  p_name text,
  p_surname text default null,
  p_nickname text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g players%rowtype;
begin
  select * into g from players where id = p_guest_id;
  if not found then
    raise exception 'Ospite non trovato';
  end if;
  if not g.is_guest then
    raise exception 'Il giocatore indicato non e'' un ospite';
  end if;
  if not exists (select 1 from auth.users where id = p_new_id) then
    raise exception 'Utente auth inesistente per il nuovo giocatore';
  end if;

  -- 1) Nuova riga giocatore "vero": id dell'utente auth, dati carta ereditati
  --    dall'ospite, must_change_password = true (sceglie la password al 1° login).
  insert into players (
    id, name, surname, nickname, avatar_url, role, nationality, position,
    jersey_number, must_change_password, is_guest, guest_match_id, created_at
  ) values (
    p_new_id,
    coalesce(nullif(trim(p_name), ''), g.name),
    nullif(trim(coalesce(p_surname, g.surname)), ''),
    nullif(trim(coalesce(p_nickname, g.nickname)), ''),
    g.avatar_url, 'player', g.nationality, g.position,
    g.jersey_number, true, false, null, g.created_at
  );

  -- 2) Ripunta tutte le statistiche/riferimenti dall'ospite al nuovo id.
  update match_players        set player_id = p_new_id where player_id = p_guest_id;
  update match_players_draft  set player_id = p_new_id where player_id = p_guest_id;
  update goals                set player_id = p_new_id where player_id = p_guest_id;
  update assists              set player_id = p_new_id where player_id = p_guest_id;
  update ratings              set player_id = p_new_id where player_id = p_guest_id;
  update pagelle              set player_id = p_new_id where player_id = p_guest_id;
  update match_bookings       set player_id = p_new_id where player_id = p_guest_id;
  update player_votes         set voted_id  = p_new_id where voted_id  = p_guest_id;
  update player_votes         set voter_id  = p_new_id where voter_id  = p_guest_id;
  update honor_entries        set first_player_id  = p_new_id where first_player_id  = p_guest_id;
  update honor_entries        set second_player_id = p_new_id where second_player_id = p_guest_id;
  update honor_entries        set third_player_id  = p_new_id where third_player_id  = p_guest_id;
  update fanta_league_members set player_id  = p_new_id where player_id  = p_guest_id;
  update fanta_lineups        set member_id  = p_new_id where member_id  = p_guest_id;
  update fanta_lineups        set captain_id = p_new_id where captain_id = p_guest_id;
  update fanta_lineup_players set player_id  = p_new_id where player_id  = p_guest_id;
  update fanta_lineup_resets  set member_id  = p_new_id where member_id  = p_guest_id;

  -- Colonne di audit/creazione: un ospite non vi compare mai, ma per completezza.
  update fanta_calculations     set calculated_by = p_new_id where calculated_by = p_guest_id;
  update fanta_leagues          set created_by    = p_new_id where created_by    = p_guest_id;
  update fanta_lineup_reminders set sent_by       = p_new_id where sent_by       = p_guest_id;
  update fanta_settings         set updated_by     = p_new_id where updated_by    = p_guest_id;
  update fascia_settings        set updated_by     = p_new_id where updated_by    = p_guest_id;
  update press_links            set created_by     = p_new_id where created_by    = p_guest_id;
  update admin_activity_log     set admin_id       = p_new_id where admin_id      = p_guest_id;
  update team_approvals         set admin_id       = p_new_id where admin_id      = p_guest_id;

  -- 3) Elimina la vecchia riga ospite (non ha piu' figli).
  delete from players where id = p_guest_id;
end;
$$;

-- Funzione potente (security definer): solo il service_role (edge function, che
-- verifica il ruolo admin del chiamante) puo' eseguirla. Mai da PostgREST.
revoke all on function register_guest_as_player(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function register_guest_as_player(uuid, uuid, text, text, text) to service_role;
