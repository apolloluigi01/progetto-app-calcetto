-- L'MVP torna a essere calcolato automaticamente dal sistema in base alla
-- media voti più alta (in caso di parimerito sceglie l'admin alla
-- pubblicazione delle pagelle): il voto MVP esplicito non serve più.
drop table if exists mvp_votes;
