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

export default function RegolamentoAmichevoli() {
  return (
    <div className="space-y-2">
      <Section icon="🤝" title="Cosa sono le amichevoli">
        <p>
          Le <strong>stagioni amichevoli</strong> sono i periodi fuori dal Format, per esempio l'estate: si gioca con
          le stesse regole di sempre, ma senza la Classifica Format.
        </p>
        <p className="font-medium text-gray-800">Cosa resta uguale al Format:</p>
        <List
          items={[
            'prenotazioni, generazione delle squadre, risultato e tabellino;',
            'voti, MVP, pagelle e mail;',
            'statistiche di stagione, carte e overall;',
            'il fantacalcetto, se gli admin creano una lega per la stagione.',
          ]}
        />
        <p className="font-medium text-gray-800">Cosa cambia:</p>
        <List
          items={[
            'non esiste la Classifica Format, e quindi nemmeno la soglia minima di presenze;',
            <>
              il podio dell'Albo d'oro è la <strong>classifica marcatori</strong>: i tre giocatori con più gol fatti
              nella stagione (autogol esclusi).
            </>,
          ]}
        />
        <Note>Le statistiche delle amichevoli restano separate da quelle del Format: ogni stagione ha le sue.</Note>
      </Section>

      <RegoleBase />
      <Prenotazioni />
      <Squadre />
      <RisultatoStatistiche />
      <VotiMvp />
      <Pagelle />
      <MediaVoto format={false} />
      <CarteOverall />
      <Statistiche />
      <AlboOro format={false} />
      <UfficioStampa />
      <Admin />
    </div>
  )
}
