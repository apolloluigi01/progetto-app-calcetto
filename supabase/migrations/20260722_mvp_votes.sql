-- ===== VOTO MVP NELLE VOTAZIONI =====
-- Ogni votante (admin partecipante, o superadmin nel caso limite) esprime
-- un voto MVP per partita. In caso di parimerito decide l'admin al momento
-- della pubblicazione delle pagelle.
create table if not exists mvp_votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  voter_id uuid not null references players(id) on delete cascade,
  voted_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (match_id, voter_id)
);

alter table mvp_votes enable row level security;

create policy "mvp_votes_select" on mvp_votes for select to authenticated using (true);

-- Stesse regole dei voti normali: solo gli admin che partecipano alla partita;
-- superadmin esterno solo se nessun admin fa parte della partita.
create policy "mvp_votes_insert"
  on mvp_votes for insert to authenticated
  with check (
    voter_id = auth.uid() and (
      (is_admin() and exists (
        select 1 from match_players mp
        where mp.match_id = mvp_votes.match_id and mp.player_id = auth.uid()
      ))
      or (is_superadmin() and not match_has_admin_participant(mvp_votes.match_id))
    )
  );

create policy "mvp_votes_update"
  on mvp_votes for update to authenticated
  using (
    voter_id = auth.uid() and (
      (is_admin() and exists (
        select 1 from match_players mp
        where mp.match_id = mvp_votes.match_id and mp.player_id = auth.uid()
      ))
      or (is_superadmin() and not match_has_admin_participant(mvp_votes.match_id))
    )
  )
  with check (
    voter_id = auth.uid() and (
      (is_admin() and exists (
        select 1 from match_players mp
        where mp.match_id = mvp_votes.match_id and mp.player_id = auth.uid()
      ))
      or (is_superadmin() and not match_has_admin_participant(mvp_votes.match_id))
    )
  );

create policy "mvp_votes_admin_delete" on mvp_votes for delete to authenticated using (is_admin());
