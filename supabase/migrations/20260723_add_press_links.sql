-- ===== UFFICIO STAMPA =====
-- Link ai post Instagram della Pavone League: tutti gli utenti autenticati
-- li vedono, solo gli admin possono aggiungerli/modificarli/rimuoverli.
create table if not exists press_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  created_at timestamptz not null default now(),
  created_by uuid references players(id) on delete set null
);

alter table press_links enable row level security;
create policy "press_links_select" on press_links for select to authenticated using (true);
create policy "press_links_admin_write" on press_links for all to authenticated
  using (is_admin()) with check (is_admin());
