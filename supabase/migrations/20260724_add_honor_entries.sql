-- ===== ALBO D'ORO MANUALE =====
-- Voci dell'albo d'oro censite a mano dagli admin: servono per registrare
-- stagioni disputate prima dell'esistenza dell'app e per il podio del
-- fantacalcetto. kind = 'format' (classifica format) | 'fanta' (fantacalcetto).
create table if not exists honor_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('format', 'fanta')),
  season_name text not null,
  end_date date,
  first_player_id uuid references players(id) on delete set null,
  second_player_id uuid references players(id) on delete set null,
  third_player_id uuid references players(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table honor_entries enable row level security;
create policy "honor_entries_select" on honor_entries for select to authenticated using (true);
create policy "honor_entries_admin_write" on honor_entries for all to authenticated
  using (is_admin()) with check (is_admin());
