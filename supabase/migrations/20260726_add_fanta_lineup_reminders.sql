-- Reminder via mail per ricordare ai partecipanti della lega di schierare
-- la formazione. Inviabili solo dagli admin, massimo 3 per giornata e solo
-- finché le formazioni sono ancora schierabili (stesso blocco delle lineup).
-- L'insert avviene solo dalla edge function (service role): nessuna policy
-- di insert per gli utenti.
create table if not exists fanta_lineup_reminders (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references fanta_leagues(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  sent_by uuid references players(id) on delete set null,
  sent_at timestamptz not null default now()
);

alter table fanta_lineup_reminders enable row level security;
create policy "fanta_reminders_select" on fanta_lineup_reminders for select to authenticated using (true);
