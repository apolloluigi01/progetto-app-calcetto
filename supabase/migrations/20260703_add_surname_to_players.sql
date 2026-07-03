-- Aggiunge il cognome all'anagrafica giocatori
alter table players add column if not exists surname text;
