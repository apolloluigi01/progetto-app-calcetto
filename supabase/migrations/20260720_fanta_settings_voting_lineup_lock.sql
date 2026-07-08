-- ===== 1) PARAMETRI FANTACALCETTO MANUTENIBILI DAGLI ADMIN =====
-- Riga singola (id = 1): i bonus/malus non sono più hardcodati nel frontend.
create table if not exists fanta_settings (
  id integer primary key default 1 check (id = 1),
  bonus_mvp numeric(4,1) not null default 3,
  bonus_gol numeric(4,1) not null default 2,
  bonus_assist numeric(4,1) not null default 1,
  malus_autogol numeric(4,1) not null default -1,
  malus_peggiore numeric(4,1) not null default -2,
  captain_multiplier numeric(4,2) not null default 1.2 check (captain_multiplier > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references players(id) on delete set null
);

insert into fanta_settings (id) values (1) on conflict (id) do nothing;

alter table fanta_settings enable row level security;
create policy "fanta_settings_select" on fanta_settings for select to authenticated using (true);
create policy "fanta_settings_update_admin" on fanta_settings for update to authenticated using (is_admin()) with check (is_admin());

-- ===== 2) VOTAZIONI: SOLO GLI ADMIN CHE PARTECIPANO ALLA PARTITA =====
-- Il superadmin può votare una partita a cui non ha partecipato SOLO se
-- nessun admin/superadmin fa parte della partita (caso limite).
create or replace function match_has_admin_participant(p_match_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from match_players mp
    join players p on p.id = mp.player_id
    where mp.match_id = p_match_id and p.role in ('admin', 'superadmin')
  );
$$;

drop policy if exists "player_votes_insert" on player_votes;
create policy "player_votes_insert"
  on player_votes for insert to authenticated
  with check (
    voter_id = auth.uid() and (
      (is_admin() and exists (
        select 1 from match_players mp
        where mp.match_id = player_votes.match_id and mp.player_id = auth.uid()
      ))
      or (is_superadmin() and not match_has_admin_participant(player_votes.match_id))
    )
  );

drop policy if exists "player_votes_update" on player_votes;
create policy "player_votes_update"
  on player_votes for update to authenticated
  using (
    voter_id = auth.uid() and (
      (is_admin() and exists (
        select 1 from match_players mp
        where mp.match_id = player_votes.match_id and mp.player_id = auth.uid()
      ))
      or (is_superadmin() and not match_has_admin_participant(player_votes.match_id))
    )
  )
  with check (
    voter_id = auth.uid() and (
      (is_admin() and exists (
        select 1 from match_players mp
        where mp.match_id = player_votes.match_id and mp.player_id = auth.uid()
      ))
      or (is_superadmin() and not match_has_admin_participant(player_votes.match_id))
    )
  );

-- La vecchia policy "FOR ALL" permetteva a qualunque admin di inserire voti
-- aggirando il vincolo di partecipazione: la limitiamo alla sola delete
-- (pulizia voti da parte degli admin).
drop policy if exists "player_votes_admin" on player_votes;
create policy "player_votes_admin_delete"
  on player_votes for delete to authenticated
  using (is_admin());

-- ===== 3) BLOCCO FORMAZIONI FANTACALCETTO (15 MINUTI PRIMA DEL CALCIO D'INIZIO) =====
-- Le formazioni sono inseribili/modificabili solo fino a 15 minuti prima
-- dell'orario della partita (orari intesi come ora italiana).
create or replace function fanta_lineup_deadline(p_match_id uuid)
returns timestamptz
language sql
stable
as $$
  select case
    when m.match_time is null then null
    else ((m.match_date + m.match_time) at time zone 'Europe/Rome') - interval '15 minutes'
  end
  from matches m
  where m.id = p_match_id;
$$;

create or replace function check_fanta_lineup_lock()
returns trigger
language plpgsql
as $$
declare
  v_match_id uuid;
  v_deadline timestamptz;
begin
  if tg_table_name = 'fanta_lineups' then
    v_match_id := coalesce(new.match_id, old.match_id);
  else
    select l.match_id into v_match_id
    from fanta_lineups l
    where l.id = coalesce(new.lineup_id, old.lineup_id);
  end if;

  -- Partita non trovata (es. delete a cascata): nessun blocco.
  if v_match_id is null then
    return coalesce(new, old);
  end if;

  v_deadline := fanta_lineup_deadline(v_match_id);
  if v_deadline is not null and now() >= v_deadline then
    raise exception 'Formazioni bloccate: mancano meno di 15 minuti al calcio d''inizio (o la partita è già iniziata).';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists fanta_lineups_lock_insert on fanta_lineups;
create trigger fanta_lineups_lock_insert
  before insert on fanta_lineups
  for each row execute function check_fanta_lineup_lock();

-- Solo il cambio capitano è una modifica di formazione: gli update del punteggio
-- (score) da parte dell'admin dopo la partita devono restare consentiti.
drop trigger if exists fanta_lineups_lock_update on fanta_lineups;
create trigger fanta_lineups_lock_update
  before update of captain_id on fanta_lineups
  for each row
  when (old.captain_id is distinct from new.captain_id)
  execute function check_fanta_lineup_lock();

drop trigger if exists fanta_lineup_players_lock on fanta_lineup_players;
create trigger fanta_lineup_players_lock
  before insert or delete on fanta_lineup_players
  for each row execute function check_fanta_lineup_lock();
