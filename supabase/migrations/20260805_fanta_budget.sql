-- Budget crediti del fantallenatore, manutenibile dal CDA -> Gestione crediti
-- Fantacalcetto. Prima era la costante FANTA_BUDGET = 15 lato client.
-- Vale solo per le formazioni da schierare: quelle già salvate e le giornate
-- già calcolate non risentono dei cambiamenti.
alter table fanta_settings add column if not exists budget integer not null default 15;
