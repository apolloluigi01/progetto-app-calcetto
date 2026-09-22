import { Link } from 'react-router-dom'
import { useFantaSettings } from '../../hooks/useFantaSettings'
import { useFasce } from '../../hooks/useFasce'
import {
  FANTA_TEAM_SIZE,
  computeFantaBudget,
  formatFantaPoints,
  formatLockMinutes,
} from '../../lib/fantacalcetto'
import { List, Note, Section, Table } from './ui'

/** Numero con segno e virgola italiana: 1.5 → "+1,5", -0.5 → "−0,5". */
function signed(v: number): string {
  const abs = Math.abs(v).toLocaleString('it-IT', { maximumFractionDigits: 2 })
  return v > 0 ? `+${abs}` : v < 0 ? `−${abs}` : '0'
}

/** Costi di esempio dei 10 giocatori in campo, per spiegare il budget. */
const ESEMPIO_COSTI = [1, 1, 2, 2, 2, 2, 3, 3, 3, 4]

export default function RegolamentoFantacalcetto() {
  // Bonus, malus, capitano, blocco formazioni e crediti li decidono gli admin:
  // il regolamento li legge dal database, così non va mai riscritto.
  const { settings: s } = useFantaSettings()
  const { fasce } = useFasce()
  const lock = formatLockMinutes(s.lineupLockMinutes)
  const fmt = (v: number) => formatFantaPoints(v)

  const sommaEsempio = ESEMPIO_COSTI.reduce((a, c) => a + c, 0)
  const mediaEsempio = sommaEsempio / ESEMPIO_COSTI.length
  const budgetEsempio = computeFantaBudget(ESEMPIO_COSTI)

  // Esempio di punteggio: capitano con voto 6,5, un gol e un assist.
  const bonusEsempio = s.bonusGol + s.bonusAssist
  const capitanoEsempio = Math.round((6.5 + bonusEsempio * s.captainMultiplier) * 100) / 100

  return (
    <div className="space-y-2">
      <Section icon="🎮" title="Cos'è il Fantacalcetto">
        <p>
          Il fantacalcetto si gioca sulle partite vere della Pavone League. A ogni partita schieri una formazione
          di <strong>{FANTA_TEAM_SIZE} giocatori</strong> scelti tra i 10 in campo: prendono punti in base a voto in
          pagella, gol, assist e MVP.
        </p>
        <List
          items={[
            'Si gioca in leghe, una per stagione, create dagli admin.',
            'È un tutti contro tutti: ogni giornata i punti della tua formazione si sommano in classifica e vince chi a fine stagione ne ha di più.',
            'Puoi schierare anche te stesso, se giochi quella partita.',
          ]}
        />
      </Section>

      <Section icon="✍️" title="Iscrizione alla lega">
        <p>
          Dal menu <Link to="/fantacalcetto" className="text-field-green underline">Fantacalcetto</Link> tocchi{' '}
          <em>Unisciti a una lega</em> e scegli la lega della stagione.
        </p>
        <List
          items={[
            <>
              Ogni lega ha una <strong>scadenza per le iscrizioni</strong>: la sceglie l'admin quando crea la lega e
              può cambiarla in qualsiasi momento, anche per riaprire iscrizioni già chiuse. La data è indicata
              nell'elenco delle leghe e nella pagina della lega.
            </>,
            "La scadenza è compresa: ci si può iscrivere fino alla mezzanotte di quel giorno (ora italiana).",
            'Scaduto il termine non ci si può più iscrivere, nemmeno gli admin.',
          ]}
        />
      </Section>

      <Section icon="🚪" title="Iscrizione a stagione in corso">
        <p>
          Chi si iscrive quando sono già state calcolate delle giornate non parte da zero: entra con i{' '}
          <strong>punti d'ingresso</strong>, cioè il punteggio più basso della classifica in quel momento.
        </p>
        <List
          items={[
            'Le giornate giocate prima della tua iscrizione non ti vengono conteggiate: non potevi schierare.',
            'In classifica i punti d’ingresso compaiono accanto alle giornate con la sigla "ingr.".',
            'Se ti iscrivi prima della prima giornata calcolata, parti da 0 come tutti.',
          ]}
        />
      </Section>

      <Section icon="🗓️" title="Quando si schiera la formazione">
        <List
          items={[
            <>
              Si schiera solo per la <strong>prossima partita in programma</strong>: le successive si sbloccano
              una alla volta.
            </>,
            <>
              Lo schieramento si apre quando gli admin <strong>ufficializzano le squadre</strong> della partita.
            </>,
            <>
              Si può inserire e modificare la formazione fino a <strong>{lock} prima del calcio d'inizio</strong>.
              Poi le formazioni si bloccano e diventano visibili a tutti. Il termine lo decidono gli admin e l'orario
              esatto è indicato nella pagina della formazione.
            </>,
            'Se gli admin cambiano le squadre e le ufficializzano di nuovo, le formazioni già schierate vengono azzerate: trovi un avviso in Home e devi rischierarla.',
          ]}
        />
      </Section>

      <Section icon="🧩" title="Regole della formazione">
        <List
          items={[
            <>
              <strong>{FANTA_TEAM_SIZE} giocatori</strong> tra i 10 in campo.
            </>,
            <>
              Almeno <strong>1 giocatore per squadra</strong>: non si può puntare tutto su una squadra sola.
            </>,
            <>
              Il costo totale non deve superare il <strong>budget</strong> della giornata (vedi sotto).
            </>,
            <>
              Tra i {FANTA_TEAM_SIZE} nomini un <strong>capitano</strong>.
            </>,
          ]}
        />
      </Section>

      <Section icon="ℹ️" title="Statistiche durante lo schieramento">
        <p>
          Mentre scegli la formazione, accanto al nome di ogni giocatore c'è l'icona <strong>ⓘ</strong>: toccala per
          vedere in un piccolo riquadro le sue statistiche della stagione, senza lasciare la pagina.
        </p>
        <List
          items={[
            'Media voto – la media delle pagelle;',
            <>
              <strong>Media fantavoto</strong> – la media di voto più bonus e malus del fantacalcetto, partita per
              partita, senza il moltiplicatore del capitano (dipende da chi lo schiera);
            </>,
            'Gol e Assist.',
          ]}
        />
        <p>Il riquadro si chiude con la ×, toccando fuori o con il tasto Esc. Toccando il nome, invece, scegli il giocatore.</p>
      </Section>

      <Section icon="💰" title="Crediti e budget della giornata">
        <p>
          Ogni giocatore ha un <strong>costo in crediti</strong> che dipende dalla fascia della sua carta, cioè dal
          suo overall. I costi li decidono gli admin:
        </p>
        <Table
          headers={['Carta', 'Overall', 'Costo']}
          rows={fasce.map((f) => [f.cardLabel, `${f.min} – ${f.max}`, `${f.creditCost} crediti`])}
        />
        <p>
          Il <strong>budget</strong> non è fisso: si ricalcola <strong>a ogni giornata</strong> sui 10 giocatori in
          campo, così segue il livello della partita.
        </p>
        <List
          ordered
          items={[
            'si fa la media del costo dei 10 giocatori in campo;',
            `si moltiplica per ${FANTA_TEAM_SIZE} (i giocatori da schierare) e si arrotonda;`,
            'si toglie 1 credito, così non si possono prendere tutti i migliori.',
          ]}
        />
        <Note>
          Esempio: costi {ESEMPIO_COSTI.join(', ')}. Media {fmt(mediaEsempio)} × {FANTA_TEAM_SIZE} ={' '}
          {fmt(mediaEsempio * FANTA_TEAM_SIZE)}, arrotondato {Math.round(mediaEsempio * FANTA_TEAM_SIZE)}, meno 1 ={' '}
          <strong>{budgetEsempio} crediti</strong>.
        </Note>
        <p>
          Unica eccezione: se tutti i 10 giocatori costano uguale il credito non si toglie, altrimenti nessuna
          formazione sarebbe possibile. Chi non ha ancora un overall vale come la carta più bassa.
        </p>
      </Section>

      <Section icon="🧮" title="Come si calcolano i punti">
        <p>
          Ogni giocatore schierato parte dal <strong>voto in pagella</strong> e somma bonus e malus. I valori li
          decidono gli admin:
        </p>
        <Table
          headers={['Evento', 'Punti']}
          rows={[
            ['MVP della partita', signed(s.bonusMvp)],
            ['Ogni gol', signed(s.bonusGol)],
            ['Ogni assist', signed(s.bonusAssist)],
            ['Ogni autogol', signed(s.malusAutogol)],
            ['Peggior voto in campo', signed(s.malusPeggiore)],
          ]}
        />
        <List
          items={[
            'Il punteggio della formazione è la somma dei punti dei suoi giocatori.',
            <>
              Il malus <strong>peggior voto</strong> va al giocatore con il voto più basso tra tutti i 10 in campo;
              in caso di parità, a tutti quelli con il voto più basso.
            </>,
            'I voti con + e − valgono un quarto di punto: 6+ vale 6,25 e 6− vale 5,75.',
            'Un giocatore senza voto in pagella prende solo bonus e malus.',
          ]}
        />
      </Section>

      <Section icon="©️" title="Il capitano">
        <p>
          I <strong>bonus</strong> del capitano (MVP, gol, assist) valgono{' '}
          <strong>×{fmt(s.captainMultiplier)}</strong>. Voto e malus invece restano invariati: se il capitano non fa
          bonus, il moltiplicatore non ha effetto.
        </p>
        <Note>
          Esempio: capitano con voto 6,5, un gol e un assist. Bonus {fmt(s.bonusGol)} + {fmt(s.bonusAssist)} ={' '}
          {fmt(bonusEsempio)}, × {fmt(s.captainMultiplier)} = {fmt(bonusEsempio * s.captainMultiplier)}. Totale 6,5 +{' '}
          {fmt(bonusEsempio * s.captainMultiplier)} = <strong>{fmt(capitanoEsempio)} punti</strong>.
        </Note>
      </Section>

      <Section icon="🙈" title="Formazione invisibile">
        <p>
          Quando schieri puoi rendere la formazione <strong>invisibile</strong>: gli altri vedono che hai schierato,
          ma non chi hai scelto né il capitano. Così nessuno può copiarti.
        </p>
        <p>
          Allo scadere del termine per schierare tutte le formazioni diventano visibili, e dopo il calcolo della
          giornata restano visibili per sempre nello storico.
        </p>
      </Section>

      <Section icon="📣" title="Reminder">
        <p>
          Finché le formazioni sono aperte, un admin può mandare a tutti i partecipanti della lega una{' '}
          <strong>mail di promemoria</strong> per schierare. Si possono inviare al massimo 3 reminder per giornata, e
          nessuno dopo il blocco delle formazioni.
        </p>
      </Section>

      <Section icon="✅" title="Calcolo della giornata">
        <List
          ordered
          items={[
            'Si gioca la partita e gli admin inseriscono risultato, gol e assist.',
            'Si vota e le pagelle vengono pubblicate.',
            <>
              Un admin preme <strong>Calcola giornata</strong> nella pagina della lega: l'app calcola il punteggio di
              ogni formazione e aggiorna la classifica.
            </>,
          ]}
        />
        <List
          items={[
            'Dopo il calcolo, nella pagina della giornata trovi il dettaglio punto per punto di tutte le formazioni, non solo della tua.',
            'Il calcolo usa i bonus e i malus in vigore in quel momento.',
            'Se serve una correzione (per esempio una pagella o un gol sistemati dopo), l’admin può annullare il calcolo e rifarlo.',
          ]}
        />
      </Section>

      <Section icon="🚫" title="Formazione non schierata">
        <p>
          Chi non schiera la formazione in una giornata non prende zero: riceve il <strong>punteggio d'ufficio</strong>,
          cioè il punteggio più basso tra chi ha schierato in quella giornata.
        </p>
        <List
          items={[
            'In classifica queste giornate compaiono con la sigla "n.s." (non schierata).',
            'Il punteggio d’ufficio segue eventuali ricalcoli della giornata.',
            'Non vale per le giornate giocate prima della tua iscrizione alla lega.',
          ]}
        />
      </Section>

      <Section icon="📈" title="Classifica e statistiche">
        <List
          items={[
            'La classifica della lega somma punti d’ingresso, punti delle giornate schierate e punteggi d’ufficio.',
            'Per ogni partecipante trovi le giornate conteggiate, quelle non schierate (n.s.) e gli eventuali punti d’ingresso (ingr.).',
            <>
              Nelle <Link to="/statistiche" className="text-field-green underline">Statistiche</Link> la classifica{' '}
              <strong>Schieramenti Fanta</strong> dice quante volte ogni giocatore è stato scelto e quante da capitano.
              Contano solo le giornate calcolate.
            </>,
            "Il podio della lega a fine stagione viene inserito dagli admin nell'Albo d'oro, sezione Fantacalcetto.",
          ]}
        />
      </Section>

      <Section icon="🛡️" title="Cosa fanno gli admin">
        <List
          items={[
            'creano le leghe e decidono la scadenza delle iscrizioni;',
            'decidono bonus, malus, moltiplicatore del capitano e minuti di blocco delle formazioni (Gestione parametri Fantacalcetto);',
            'decidono il costo in crediti di ogni fascia (Gestione crediti Fantacalcetto);',
            'ufficializzano le squadre, che aprono lo schieramento;',
            'mandano i reminder e calcolano (o annullano) le giornate.',
          ]}
        />
        <Note>Ogni modifica ai parametri viene registrata nel registro attività.</Note>
      </Section>
    </div>
  )
}
