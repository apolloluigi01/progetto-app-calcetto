-- Il template della carta giocatore ora è derivato automaticamente dall'overall
-- (vedi la logica in src/components/PlayerCard.tsx), non è più una scelta manuale.
alter table players drop column if exists card_type;
