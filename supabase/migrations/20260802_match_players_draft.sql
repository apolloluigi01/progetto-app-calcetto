-- Bozza squadre (snapshot workflow).
--
-- Tutto il lavoro degli admin sulle squadre (generazione, scambi manuali,
-- ricalcolo, sostituzioni, approvazioni) avviene su match_players_draft, che è
-- visibile SOLO agli admin. La tabella match_players — letta da tutti (player,
-- campetto, statistiche, fantacalcetto) — viene aggiornata soltanto al momento
-- dell'ufficializzazione, copiando la bozza. In questo modo i player continuano
-- a vedere l'ultima versione UFFICIALIZZATA delle squadre finché gli admin non
-- ne ufficializzano una nuova, anche mentre stanno rilavorando la formazione.
create table if not exists match_players_draft (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team text not null check (team in ('A', 'B')),
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

alter table match_players_draft enable row level security;

-- Solo gli admin lavorano (e vedono) le bozze delle squadre.
create policy "mpd_select_admin" on match_players_draft for select to authenticated using (is_admin());
create policy "mpd_insert_admin" on match_players_draft for insert to authenticated with check (is_admin());
create policy "mpd_update_admin" on match_players_draft for update to authenticated using (is_admin());
create policy "mpd_delete_admin" on match_players_draft for delete to authenticated using (is_admin());

-- Seed dei dati esistenti: per le partite che hanno già le squadre in
-- match_players, la bozza parte allineata alla versione attuale.
insert into match_players_draft (match_id, player_id, team)
select mp.match_id, mp.player_id, mp.team
from match_players mp
on conflict (match_id, player_id) do nothing;
