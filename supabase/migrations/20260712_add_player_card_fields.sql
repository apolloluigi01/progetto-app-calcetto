-- Aggiunge i campi anagrafici per la carta giocatore in stile FIFA Ultimate Team
-- (nazionalità, ruolo di gioco, numero di maglia), modificabili solo dagli admin.
alter table players add column if not exists nationality text;
alter table players add column if not exists position text check (position in ('POR', 'DIF', 'CEN', 'ATT'));
alter table players add column if not exists jersey_number integer check (jersey_number between 1 and 99);
