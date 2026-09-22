import { FORMAT_MIN_PRESENZE_RATIO } from '../../lib/statistiche'
import {
  Admin,
  AlboOro,
  CarteOverall,
  MediaVoto,
  Pagelle,
  Prenotazioni,
  RegoleBase,
  RisultatoStatistiche,
  Squadre,
  Statistiche,
  UfficioStampa,
  VotiMvp,
} from './SezioniPartita'
import { List, Note, Section } from './ui'

const sogliaPct = Math.round(FORMAT_MIN_PRESENZE_RATIO * 100)

export default function RegolamentoFormat() {
  return (
    <div className="space-y-2">
      <Section icon="🏟️" title="Cos'è il Format">
        <p>
          Il <strong>Format</strong> è la stagione ufficiale della Pavone League: una serie di partite (in genere
          settimanali) in cui ogni presenza, voto, gol e vittoria contribuisce alla{' '}
          <strong>Classifica Format</strong>.
        </p>
        <p>
          Ogni stagione ha una data di inizio e una di fine, decise dagli admin. Alla chiusura, i primi tre della
          Classifica Format salgono sul podio dell'Albo d'oro.
        </p>
        <Note>
          Le stagioni <strong>amichevoli</strong> seguono le stesse regole di partita, ma senza Classifica Format:
          trovi le differenze nel regolamento Amichevoli.
        </Note>
      </Section>

      <Section icon="🥇" title="Classifica Format: i criteri">
        <p>
          La classifica mette in fila i giocatori confrontando questi criteri <strong>in ordine</strong>: si passa al
          successivo solo in caso di parità sul precedente.
        </p>
        <List
          ordered
          items={[
            <>
              <strong>Presenze</strong>: chi ha giocato più del {sogliaPct}% delle partite della stagione sta sopra a
              chi non raggiunge la soglia;
            </>,
            <>
              <strong>Media voto</strong> (quella delle pagelle, non il fantavoto);
            </>,
            <>
              <strong>Gol fatti</strong> (autogol esclusi);
            </>,
            <>
              <strong>Percentuale di vittorie</strong>;
            </>,
            <>
              <strong>Numero di vittorie</strong>;
            </>,
            <>
              <strong>Numero di MVP</strong>;
            </>,
            <>
              <strong>Assist</strong>.
            </>,
          ]}
        />
        <Note>
          Esempio sulla soglia presenze: su 10 partite giocate in stagione ne servono almeno 5 (più del {sogliaPct}%),
          con 4 si resta sotto. La soglia si ricalcola a ogni partita, quindi conviene non restare indietro con le
          presenze.
        </Note>
        <p>
          Contano solo le partite con un risultato e le pagelle pubblicate. La classifica è sempre consultabile dal
          menu Statistiche.
        </p>
      </Section>

      <RegoleBase />
      <Prenotazioni />
      <Squadre />
      <RisultatoStatistiche />
      <VotiMvp />
      <Pagelle />
      <MediaVoto format />
      <CarteOverall />
      <Statistiche />
      <AlboOro format />
      <UfficioStampa />
      <Admin />
    </div>
  )
}
