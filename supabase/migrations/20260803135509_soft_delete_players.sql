-- Cancellazione logica dei giocatori.
--
-- Prima: delete-player cancellava l'utente auth contando sul cascade della FK
-- players.id -> auth.users. Quella FK e' stata rimossa dalla migration sugli
-- ospiti (20260806), quindi da allora la riga players sopravviveva orfana.
-- E quando il cascade funzionava, cancellava a catena gol, presenze, pagelle e
-- voti: le statistiche storiche e l'albo d'oro cambiavano retroattivamente.
--
-- Ora il giocatore viene anonimizzato e marcato come rimosso: i dati personali
-- spariscono (nome, foto, account auth), i dati sportivi restano coerenti.

alter table players add column if not exists deleted_at timestamptz;

create or replace function soft_delete_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from players where id = p_player_id) then
    raise exception 'Giocatore non trovato';
  end if;

  -- Dati personali via, riga conservata per non spezzare lo storico.
  update players set
    deleted_at = now(),
    name = 'Giocatore',
    surname = 'rimosso',
    nickname = null,
    avatar_url = null,
    nationality = null,
    position = null,
    jersey_number = null,
    must_change_password = false
  where id = p_player_id;

  -- Impegni futuri: un giocatore rimosso non deve restare convocato,
  -- prenotato o iscritto a una lega per le partite ancora da giocare.
  delete from match_bookings b
   where b.player_id = p_player_id
     and not exists (select 1 from match_results r where r.match_id = b.match_id);

  delete from match_players mp
   where mp.player_id = p_player_id
     and not exists (select 1 from match_results r where r.match_id = mp.match_id);

  delete from match_players_draft d
   where d.player_id = p_player_id
     and not exists (select 1 from match_results r where r.match_id = d.match_id);

  delete from fanta_lineups l
   where l.member_id = p_player_id
     and not exists (select 1 from match_results r where r.match_id = l.match_id);

  delete from fanta_league_members m
   where m.player_id = p_player_id
     and not exists (
       select 1 from fanta_calculations c where c.league_id = m.league_id
     );
end;
$$;

-- Funzione potente: la chiama solo l'edge function delete-player (service_role),
-- che prima verifica ruolo del chiamante e permessi sul bersaglio.
revoke execute on function soft_delete_player(uuid) from public, anon, authenticated;
grant execute on function soft_delete_player(uuid) to service_role;

-- I giocatori rimossi non compaiono piu' negli elenchi, ma restano leggibili
-- (le pagelle e le classifiche storiche li citano ancora).
comment on column players.deleted_at is
  'Data di cancellazione logica: la riga resta per lo storico, i dati personali sono stati anonimizzati.';;
