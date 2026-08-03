-- I singoli voti erano leggibili da chiunque (player_votes_select using(true)):
-- l'interfaccia mostra il dettaglio "chi ha votato cosa" solo agli admin, ma
-- l'API lo restituiva a tutti. Ora la riga grezza la vedono solo l'autore del
-- voto e gli admin; a tutti gli altri servono le medie, esposte da una RPC
-- che restituisce solo dati aggregati.

drop policy if exists "player_votes_select" on player_votes;
create policy "player_votes_select" on player_votes
  for select to authenticated
  using (voter_id = (select auth.uid()) or is_admin());

-- Peso del voto: admin e superadmin valgono doppio (stessa regola di
-- src/lib/voting.ts voteWeight()).
create or replace function match_vote_summary(p_match_id uuid)
returns table (
  voted_id uuid,
  weighted_sum numeric,
  weight_total numeric,
  raw_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.voted_id,
    sum(v.vote * (case when p.role in ('admin', 'superadmin') then 2 else 1 end))::numeric,
    sum(case when p.role in ('admin', 'superadmin') then 2 else 1 end)::numeric,
    count(*)::integer
  from player_votes v
  join players p on p.id = v.voter_id
  where v.match_id = p_match_id
    and (select auth.uid()) is not null
  group by v.voted_id;
$$;

-- Chi ha votato (non cosa): serve per l'avanzamento "x/y admin hanno votato".
create or replace function match_voter_ids(p_match_id uuid)
returns table (voter_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct v.voter_id
  from player_votes v
  where v.match_id = p_match_id
    and (select auth.uid()) is not null;
$$;

revoke execute on function match_vote_summary(uuid) from public, anon;
revoke execute on function match_voter_ids(uuid) from public, anon;
grant execute on function match_vote_summary(uuid) to authenticated;
grant execute on function match_voter_ids(uuid) to authenticated;;
