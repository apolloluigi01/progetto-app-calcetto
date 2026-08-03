-- Le formazioni di una giornata, con il contenuto mascherato per quelle
-- nascoste: il capitano vive sulla riga fanta_lineups (che resta leggibile,
-- serve per punteggio e "ha schierato"), quindi le RLS da sole non bastano a
-- nasconderlo. Questa funzione e' l'unico modo in cui il client legge le
-- formazioni altrui.
create or replace function fanta_match_lineups(p_league_id uuid, p_match_id uuid)
returns table (
  member_id uuid,
  member_name text,
  member_surname text,
  member_nickname text,
  captain_id uuid,
  player_ids uuid[],
  score numeric,
  hidden boolean,
  visible boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.member_id,
    p.name,
    p.surname,
    p.nickname,
    case when v.visible then l.captain_id end,
    case when v.visible
      then coalesce((select array_agg(lp.player_id) from fanta_lineup_players lp where lp.lineup_id = l.id), '{}')
      else '{}'::uuid[]
    end,
    l.score,
    l.hidden,
    v.visible
  from fanta_lineups l
  join players p on p.id = l.member_id
  cross join lateral (
    select (
      l.member_id = (select auth.uid())
      or not l.hidden
      or fanta_lineups_locked(l.match_id)
      or is_admin()
    ) as visible
  ) v
  where l.league_id = p_league_id
    and l.match_id = p_match_id
    and (select auth.uid()) is not null;
$$;

revoke execute on function fanta_match_lineups(uuid, uuid) from public, anon;
grant execute on function fanta_match_lineups(uuid, uuid) to authenticated;;
