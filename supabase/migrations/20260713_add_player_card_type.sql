-- Tipo/stile grafico della carta giocatore (scelto dall'admin in anagrafica).
alter table players add column if not exists card_type text not null default 'gold' check (card_type in ('gold', 'special', 'blue'));
