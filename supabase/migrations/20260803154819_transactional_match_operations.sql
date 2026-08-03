-- Le operazioni piu' delicate del pannello partita erano sequenze di chiamate
-- separate dal client, senza controllo dell'esito: se una falliva a meta', il
-- database restava in uno stato incoerente e l'interfaccia dichiarava comunque
-- successo. Il caso peggiore: "Ufficializza squadre" cancellava match_players,
-- e se il reinserimento falliva la partita restava senza squadre ma marcata
-- come ufficializzata, con le formazioni fanta comunque azzerate.
--
-- Qui ogni sequenza diventa una sola chiamata: o riesce tutta, o non lascia
-- traccia (rollback automatico della transazione della funzione).

-- 1) Salvataggio della bozza squadre (genera / ricalcola / sostituzione).
create or replace function save_match_draft_teams(
  p_match_id uuid,
  p_team_a uuid[],
  p_team_b uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo un admin puo'' modificare le squadre';
  end if;
  if p_match_id is null or not exists (select 1 from matches where id = p_match_id) then
    raise exception 'Partita non trovata';
  end if;
  if coalesce(cardinality(p_team_a), 0) + coalesce(cardinality(p_team_b), 0) = 0 then
    raise exception 'Le squadre da salvare sono vuote';
  end if;

  delete from match_players_draft where match_id = p_match_id;

  insert into match_players_draft (match_id, player_id, team)
  select p_match_id, pid, 'A' from unnest(coalesce(p_team_a, '{}')) as pid
  union all
  select p_match_id, pid, 'B' from unnest(coalesce(p_team_b, '{}')) as pid;
end;
$$;

-- 2) Ufficializzazione: la bozza diventa la squadra visibile a tutti, e le
--    formazioni fantacalcetto schierate sulle squadre precedenti decadono.
create or replace function officialize_match_teams(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft_count integer;
begin
  if not is_admin() then
    raise exception 'Solo un admin puo'' ufficializzare le squadre';
  end if;

  select count(*) into v_draft_count from match_players_draft where match_id = p_match_id;
  if v_draft_count = 0 then
    raise exception 'Non c''e'' nessuna squadra in bozza da ufficializzare';
  end if;

  delete from match_players where match_id = p_match_id;

  insert into match_players (match_id, player_id, team)
  select match_id, player_id, team from match_players_draft where match_id = p_match_id;

  update matches set teams_official_at = now() where id = p_match_id;

  -- Traccia per l'avviso "rischiera la formazione" in Home, poi via le
  -- formazioni non piu' valide.
  insert into fanta_lineup_resets (league_id, match_id, member_id)
  select l.league_id, l.match_id, l.member_id
  from fanta_lineups l
  where l.match_id = p_match_id
  on conflict (league_id, match_id, member_id) do nothing;

  delete from fanta_lineups where match_id = p_match_id;
end;
$$;

-- 3) Salvataggio risultato: punteggio, stato partita e invalidazione delle
--    statistiche gia' confermate erano tre chiamate indipendenti.
create or replace function save_match_result(
  p_match_id uuid,
  p_score_a integer,
  p_score_b integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Solo un admin puo'' salvare il risultato';
  end if;
  if p_score_a < 0 or p_score_b < 0 then
    raise exception 'Il punteggio non puo'' essere negativo';
  end if;

  insert into match_results (match_id, score_a, score_b)
  values (p_match_id, p_score_a, p_score_b)
  on conflict (match_id) do update set score_a = excluded.score_a, score_b = excluded.score_b;

  update matches
     set status = 'completed',
         -- Cambiare il risultato invalida le statistiche gia' confermate.
         stats_confirmed_at = null
   where id = p_match_id;
end;
$$;

revoke execute on function save_match_draft_teams(uuid, uuid[], uuid[]) from public, anon;
revoke execute on function officialize_match_teams(uuid) from public, anon;
revoke execute on function save_match_result(uuid, integer, integer) from public, anon;
grant execute on function save_match_draft_teams(uuid, uuid[], uuid[]) to authenticated;
grant execute on function officialize_match_teams(uuid) to authenticated;
grant execute on function save_match_result(uuid, integer, integer) to authenticated;;
