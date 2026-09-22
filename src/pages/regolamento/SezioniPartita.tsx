import { Link } from 'react-router-dom'
import { useFasce } from '../../hooks/useFasce'
import { fasciaLabel } from '../../lib/fasce'
import { List, Note, Section, Table } from './ui'

/*
 * Sezioni comuni ai regolamenti Format e Amichevoli: le partite si giocano,
 * si votano e si raccontano allo stesso modo, cambia solo la classifica
 * finale. I valori configurabili (fasce delle carte) si leggono dal database,
 * così il regolamento resta allineato a quello che l'app applica davvero.
 */

export function RegoleBase() {
  return (
    <Section icon="⚽" title="Regole base del calcetto">
      <p>
        Si gioca a calcio a 5: <strong>due squadre da 5 giocatori</strong>, per un totale fisso di{' '}
        <strong>10 giocatori a partita</strong> (l'app non ne accetta di più).
      </p>
      <List
        items={[
          'Nessun ruolo è obbligatorio: il portiere può essere fisso o a rotazione, come si accordano le squadre in campo.',
          'Vale il fair play: niente entrate pericolose, si rispettano compagni, avversari e campo.',
          'Il risultato che conta è quello inserito dagli admin a fine partita, insieme a gol, assist e autogol.',
          "Chi si prenota si impegna a esserci: se non puoi più venire, avvisa il prima possibile così l'admin può sostituirti.",
        ]}
      />
      <Note>
        Le regole di gioco di dettaglio (durata, rimesse, falli) sono quelle concordate dal gruppo in campo:
        l'app si occupa di tutto quello che viene prima e dopo la partita.
      </Note>
    </Section>
  )
}

export function Prenotazioni() {
  return (
    <Section icon="📋" title="Prenotazioni e ospiti">
      <p>
        Per ogni partita l'admin apre il <strong>sondaggio prenotazioni</strong>: dalla scheda della partita
        (menu <em>Partite</em>) tocchi <em>Prenota il tuo posto</em>.
      </p>
      <List
        items={[
          'I posti sono 10: quando il sondaggio è pieno non si accettano altre prenotazioni.',
          "L'admin può aggiungere o togliere giocatori a mano (per esempio chi ha confermato in chat).",
          <>
            Se manca qualcuno si può chiamare un <strong>ospite</strong>: gioca solo quella partita e prende voto e
            pagella come tutti, ma <strong>non entra nelle statistiche e nelle classifiche di stagione</strong>.
          </>,
          'Un ospite che poi entra stabilmente nel gruppo può essere registrato come giocatore vero e proprio.',
        ]}
      />
    </Section>
  )
}

export function Squadre() {
  return (
    <Section icon="⚖️" title="Come si formano le squadre">
      <p>
        Le squadre le genera l'app, in modo che siano il più possibile equilibrate, partendo
        dall'<strong>overall</strong> dei 10 giocatori prenotati.
      </p>
      <List
        items={[
          "L'app valuta tutte le divisioni possibili dei 10 giocatori (252) e sceglie la più equilibrata.",
          <>
            Conta soprattutto la <strong>differenza tra le medie overall</strong> delle due squadre, poi il
            confronto <strong>giocatore per giocatore</strong>: il più forte di una squadra viene confrontato con
            il più forte dell'altra, il secondo con il secondo e così via. Così i due più forti finiscono in
            squadre opposte, e lo stesso vale per i due meno forti.
          </>,
          'Se più divisioni sono equilibrate allo stesso modo, ne viene scelta una a caso, per variare le squadre da una partita all’altra.',
        ]}
      />
      <p>
        Le squadre nascono in <strong>bozza</strong>, visibile solo agli admin: possono ricalcolarle, spostare
        giocatori o sostituire chi dà forfait. Quando sono pronte gli admin le <strong>ufficializzano</strong>:
        solo da quel momento sono visibili a tutti, sulla scheda della partita e sul campetto.
      </p>
      <Note tone="warning">
        Se le squadre vengono cambiate e ufficializzate di nuovo, le formazioni del fantacalcetto già schierate per
        quella partita vengono azzerate: chi le aveva schierate trova un avviso in Home e deve rischierarle.
      </Note>
    </Section>
  )
}

export function RisultatoStatistiche() {
  return (
    <Section icon="📝" title="Risultato, gol e assist">
      <p>A fine partita un admin inserisce il risultato e il tabellino.</p>
      <List
        items={[
          'Gol, assist e autogol sono censiti giocatore per giocatore. Gli assist sono indipendenti dai gol: un gol può non avere assist.',
          'Il numero di gol di ogni squadra deve coincidere con il risultato: finché non torna, voti e pagelle restano bloccati.',
          <>
            Quando il tabellino è corretto l'admin preme <strong>Salva statistiche</strong>: solo allora si possono
            aprire le votazioni. Se poi cambia il risultato o un marcatore, le statistiche vanno salvate di nuovo.
          </>,
          <>
            Con le pagelle pubblicate la partita si chiude e non è più modificabile. Resta solo una{' '}
            <strong>correzione eccezionale</strong>, riservata agli admin, per rimediare a errori di risultato, gol
            o assist: squadre, data e pagelle non si toccano più.
          </>,
        ]}
      />
    </Section>
  )
}

export function VotiMvp() {
  return (
    <Section icon="🗳️" title="Voti e MVP">
      <p>
        Salvate le statistiche, l'admin apre le <strong>votazioni</strong>. Nel farlo sceglie chi può votare:{' '}
        <strong>tutti i partecipanti</strong> oppure <strong>solo gli admin che hanno giocato</strong>. Ricevi una
        mail quando le votazioni si aprono.
      </p>
      <List
        items={[
          'Si vota ogni giocatore della partita, compreso sé stessi, con un voto da 1 a 10 (sono ammessi i mezzi voti).',
          <>
            I voti hanno un <strong>peso</strong>: quello di un admin vale doppio (×2), quello di un giocatore vale ×1.
          </>,
          'Per gli admin che hanno giocato il voto è obbligatorio.',
          'I voti sono segreti: ognuno vede solo i propri. Tutti vedono le medie e chi ha già votato.',
          'Se nessun admin ha giocato la partita, può votare il superadmin.',
        ]}
      />
      <p>
        La <strong>media</strong> di ogni giocatore è la media ponderata dei voti ricevuti, calcolata al centesimo.
      </p>
      <p className="font-medium text-gray-800">L'MVP viene calcolato in automatico, con questi criteri in ordine:</p>
      <List
        ordered
        items={[
          'media voto più alta (quella esatta, non arrotondata);',
          'a parità di media, chi ha vinto la partita;',
          'poi chi ha più bonus, cioè gol + assist;',
          'poi chi ha segnato più gol.',
        ]}
      />
      <Note>Se dopo tutti i criteri resta un pareggio, l'MVP lo sceglie l'admin alla pubblicazione delle pagelle.</Note>
    </Section>
  )
}

export function Pagelle() {
  return (
    <Section icon="📰" title="Pagelle e mail">
      <p>
        Chiuse le votazioni, l'admin prepara le <strong>pagelle</strong>. Per ogni giocatore l'app propone come voto
        la media ponderata arrotondata al mezzo voto (6,2 diventa 6; 6,3 diventa 6,5; 6,8 diventa 7): l'admin la
        conferma o la corregge, può aggiungere un titolo e un commento, e conferma l'MVP.
      </p>
      <List
        items={[
          <>
            In pagella sono ammessi anche i voti con <strong>+</strong> e <strong>−</strong>: 6+ vale 6,25 e 6− vale
            5,75 nelle medie.
          </>,
          <>
            Alla pubblicazione tutti i partecipanti ricevono una <strong>mail</strong> con risultato, marcatori e
            pagelle complete. Le pagelle sono visibili anche nell'app, nella scheda della partita.
          </>,
          'Solo le pagelle pubblicate contano per statistiche, classifiche e fantacalcetto.',
        ]}
      />
    </Section>
  )
}

export function MediaVoto({ format }: { format: boolean }) {
  return (
    <Section icon="⭐" title="Perché la media voto è importante">
      <p>La media voto di stagione è il numero che conta di più nell'app:</p>
      <List
        items={[
          ...(format
            ? [
                <>
                  è il <strong>primo criterio della Classifica Format</strong>, subito dopo la soglia di presenze;
                </>,
              ]
            : []),
          'compare sulla tua carta ed è la classifica "Media voto" delle statistiche;',
          "decide l'MVP di ogni partita;",
          'è la base del punteggio al fantacalcetto: il voto in pagella è il punto di partenza di ogni giocatore schierato.',
        ]}
      />
      <Note>
        Conta la media dei voti delle pagelle pubblicate: una buona partita vale, ma vale di più la costanza nel
        corso della stagione.
      </Note>
    </Section>
  )
}

export function CarteOverall() {
  const { fasce } = useFasce()
  return (
    <Section icon="🃏" title="Carte e overall">
      <p>
        Ogni giocatore ha un <strong>overall</strong> da 1 a 100, in stile FIFA: lo assegnano e lo aggiornano gli
        admin (CDA → Gestione overall). Nella generazione delle squadre, chi non ha ancora un overall vale 50.
      </p>
      <p>L'overall è importante perché decide:</p>
      <List
        items={[
          'il colore della carta del giocatore;',
          'l’equilibrio delle squadre generate dall’app;',
          'il costo in crediti del giocatore al fantacalcetto.',
        ]}
      />
      <p className="font-medium text-gray-800">Leggenda delle carte (range impostati dagli admin):</p>
      <Table
        headers={['Carta', 'Overall', 'Fascia']}
        rows={fasce.map((f) => [f.cardLabel, `${f.min} – ${f.max}`, fasciaLabel(f)])}
      />
      <p>Aprendo una carta (basta toccarla) trovi le statistiche di stagione del giocatore:</p>
      <List
        items={[
          'Media voto – media delle pagelle ricevute;',
          '% Vittorie – partite vinte sul totale giocate;',
          'Gol fatti – autogol esclusi;',
          'Partite vinte e MVP;',
          'Serie vittorie – la striscia più lunga di vittorie consecutive.',
        ]}
      />
      <p>
        Sulla carta compaiono anche ruolo (portiere, difensore, centrocampista, attaccante), nazionalità e numero di
        maglia: ognuno li può impostare dalle <em>Impostazioni</em>. Sul campetto i giocatori sono disposti per
        ruolo; chi non ne ha uno va a centrocampo.
      </p>
    </Section>
  )
}

export function Statistiche() {
  return (
    <Section icon="📊" title="Consultare le statistiche">
      <p>
        Dal menu <Link to="/statistiche" className="text-field-green underline">Statistiche</Link> scegli la stagione
        e trovi tutte le classifiche:
      </p>
      <List
        items={[
          'Gol, Assist, Presenze, MVP, Media voto;',
          'Percentuale vittorie – ordinata prima per partite giocate, poi per percentuale;',
          'Sconfitte e Autogol;',
          'Schieramenti Fanta – quante volte un giocatore è stato scelto al fantacalcetto, e quante da capitano;',
          'Overall.',
        ]}
      />
      <List
        items={[
          'Contano solo le partite con risultato e le pagelle pubblicate.',
          'Gli ospiti non entrano nelle statistiche.',
          'Dalla pagina di ogni giocatore (menu Giocatori) trovi la sua carta e le sue statistiche.',
          'Gli admin possono scaricare le classifiche in CSV e consultare le statistiche mese per mese.',
        ]}
      />
    </Section>
  )
}

export function UfficioStampa() {
  return (
    <Section icon="📸" title="Ufficio Stampa e Instagram">
      <p>
        La Pavone League ha una pagina Instagram ufficiale. Nel menu{' '}
        <Link to="/ufficio-stampa" className="text-field-green underline">
          Ufficio Stampa
        </Link>{' '}
        trovi i post pubblicati: tocca un post per aprirlo direttamente su Instagram.
      </p>
      <p>I post vengono aggiunti all'elenco dagli admin.</p>
    </Section>
  )
}

export function AlboOro({ format }: { format: boolean }) {
  return (
    <Section icon="🏆" title="Albo d'oro">
      <p>
        A fine stagione il podio entra nell'
        <Link to="/albo-oro" className="text-field-green underline">
          Albo d'oro
        </Link>
        {format ? (
          <>
            : per le stagioni format sono i <strong>primi tre della Classifica Format</strong>.
          </>
        ) : (
          <>
            : per le stagioni amichevoli sono i <strong>primi tre della classifica marcatori</strong> (gol fatti,
            autogol esclusi).
          </>
        )}
      </p>
      <p>
        Il podio si calcola da solo alla chiusura della stagione. Gli admin possono anche inserire a mano le stagioni
        giocate prima dell'app e i podi del fantacalcetto.
      </p>
    </Section>
  )
}

export function Admin() {
  return (
    <Section icon="🛡️" title="Ruoli e compiti degli admin">
      <p>Nell'app ci sono tre ruoli:</p>
      <Table
        headers={['Ruolo', 'Cosa fa']}
        rows={[
          ['Giocatore', 'Si prenota, gioca, vota (se ammesso), consulta tutto e partecipa al fantacalcetto.'],
          ['Admin', 'Gestisce partite, squadre, risultati, votazioni, pagelle e giocatori. Il suo voto vale doppio.'],
          ['Superadmin', 'Come un admin, e in più può modificare o rimuovere gli altri admin.'],
        ]}
      />
      <p className="font-medium text-gray-800">Compiti degli admin, partita per partita:</p>
      <List
        ordered
        items={[
          'creano la partita (data, ora, campo) e aprono il sondaggio prenotazioni;',
          'generano le squadre, le sistemano se serve e le ufficializzano;',
          'dopo la partita inseriscono risultato, gol e assist e salvano le statistiche;',
          'aprono e chiudono le votazioni (e, se hanno giocato, votano);',
          'pubblicano le pagelle, che partono via mail ai partecipanti.',
        ]}
      />
      <p>
        Gestiscono inoltre stagioni, giocatori e overall, fasce delle carte, albo d'oro, Ufficio Stampa e
        fantacalcetto dal pannello <strong>CDA</strong>. Ogni operazione degli admin viene registrata nel{' '}
        <strong>registro attività</strong>.
      </p>
    </Section>
  )
}
