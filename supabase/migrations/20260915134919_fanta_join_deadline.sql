-- Iscrizione a una lega del fantacalcetto consentita solo entro il primo mese
-- dall'inizio della stagione collegata (es. stagione dal 1 settembre: iscrizioni
-- aperte fino al 30 settembre compreso). La data corrente e' quella italiana.
-- Lo stesso calcolo vive nel frontend in src/lib/fantacalcetto.ts (joinDeadline).

create or replace function public.fanta_league_join_open(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from fanta_leagues l
      join seasons s on s.id = l.season_id
     where l.id = p_league_id
       and (now() at time zone 'Europe/Rome')::date < (s.start_date + interval '1 month')::date
  );
$$;

revoke execute on function public.fanta_league_join_open(uuid) from public, anon;
grant execute on function public.fanta_league_join_open(uuid) to authenticated;

drop policy if exists "fanta_members_insert_self" on fanta_league_members;
create policy "fanta_members_insert_self" on fanta_league_members for insert to authenticated
  with check (player_id = (select auth.uid()) and public.fanta_league_join_open(league_id));
