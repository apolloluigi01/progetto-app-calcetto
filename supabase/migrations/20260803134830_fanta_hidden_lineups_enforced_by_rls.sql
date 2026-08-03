-- La "formazione invisibile" era rispettata solo dal frontend: le policy di
-- SELECT su fanta_lineups/fanta_lineup_players erano using(true), quindi
-- chiunque poteva leggere via API la formazione nascosta di un altro
-- partecipante prima del blocco. La regola passa nel database.

-- Le formazioni di una partita sono "bloccate" (e quindi tutte visibili)
-- quando la partita ha un risultato oppure e' passata la deadline dei 15'.
create or replace function fanta_lineups_locked(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from match_results r where r.match_id = p_match_id)
      or coalesce(fanta_lineup_deadline(p_match_id) <= now(), false);
$$;

-- Chi puo' vedere il contenuto (giocatori + capitano) di una formazione:
-- il proprietario, gli admin, tutti se non e' nascosta o se e' ormai bloccata.
create or replace function fanta_lineup_visible(p_lineup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from fanta_lineups l
    where l.id = p_lineup_id
      and (
        l.member_id = (select auth.uid())
        or not l.hidden
        or fanta_lineups_locked(l.match_id)
        or is_admin()
      )
  );
$$;

grant execute on function fanta_lineups_locked(uuid) to authenticated;
grant execute on function fanta_lineup_visible(uuid) to authenticated;
revoke execute on function fanta_lineups_locked(uuid) from anon;
revoke execute on function fanta_lineup_visible(uuid) from anon;

drop policy if exists "fanta_lineup_players_select" on fanta_lineup_players;
create policy "fanta_lineup_players_select" on fanta_lineup_players
  for select to authenticated
  using (fanta_lineup_visible(lineup_id));;
