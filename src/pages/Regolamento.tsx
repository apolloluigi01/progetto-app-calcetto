import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import RegolamentoAmichevoli from './regolamento/RegolamentoAmichevoli'
import RegolamentoFantacalcetto from './regolamento/RegolamentoFantacalcetto'
import RegolamentoFormat from './regolamento/RegolamentoFormat'
import { applySearch, clearHighlights, searchTerms } from './regolamento/search'

const TABS = [
  { key: 'format', label: 'Format', intro: 'Le regole della stagione ufficiale e della Classifica Format.' },
  { key: 'amichevoli', label: 'Amichevoli', intro: 'Le regole delle stagioni amichevoli, fuori dal Format.' },
  { key: 'fantacalcetto', label: 'Fantacalcetto', intro: 'Tutto quello che serve per giocare al fantacalcetto.' },
] as const

type TabKey = (typeof TABS)[number]['key']

const CONTENT: Record<TabKey, () => ReactNode> = {
  format: () => <RegolamentoFormat />,
  amichevoli: () => <RegolamentoAmichevoli />,
  fantacalcetto: () => <RegolamentoFantacalcetto />,
}

/**
 * Regolamento consultabile da tutti. Ogni tipologia ha un indirizzo proprio
 * (/regolamento/format, /amichevoli, /fantacalcetto), così si può linkare
 * direttamente il regolamento giusto. La ricerca invece guarda in tutti e tre.
 */
export default function Regolamento() {
  const { tipo } = useParams<{ tipo: string }>()
  const [query, setQuery] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)

  const terms = searchTerms(query)
  const termsKey = terms.join(' ')
  const searching = terms.length > 0

  // Applica la ricerca dopo ogni render e ogni volta che il testo cambia (i
  // numeri del fantacalcetto arrivano dal database dopo il primo disegno).
  // Lavora direttamente sul DOM: vedi regolamento/search.ts.
  useLayoutEffect(() => {
    const container = contentRef.current
    if (!container) return
    const activeTerms = termsKey ? termsKey.split(' ') : []

    const run = () => {
      const count = applySearch(container, activeTerms)
      const result = resultRef.current
      if (result) {
        result.hidden = activeTerms.length === 0
        result.textContent =
          count === 0
            ? 'Nessun argomento trovato. Prova con parole diverse.'
            : `${count} ${count === 1 ? 'argomento trovato' : 'argomenti trovati'}`
      }
    }
    run()

    if (activeTerms.length === 0) return
    let frame = 0
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(run)
    })
    observer.observe(container, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [termsKey, tipo])

  // Uscendo dalla pagina l'evidenziazione non deve restare registrata.
  useEffect(() => clearHighlights, [])

  const current = TABS.find((t) => t.key === tipo)
  if (!current) return <Navigate to="/regolamento/format" replace />

  return (
    <div className="p-4 pb-12">
      <h1 className="text-xl font-semibold text-field-green-dark">📖 Regolamento</h1>
      <p className="mt-1 text-sm text-gray-500">
        {searching ? 'Risultati della ricerca in tutti i regolamenti.' : `${current.intro} Tocca un argomento per aprirlo.`}
      </p>

      <div className="relative mt-4">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">
          🔍
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca nel regolamento (es. capitano, media voto)"
          aria-label="Cerca nel regolamento"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-9 text-sm focus:border-field-green focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Cancella la ricerca"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-lg leading-none text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>
      <p ref={resultRef} hidden className="mt-2 text-xs text-gray-500" aria-live="polite" />

      {!searching && (
        <div className="mt-4 flex gap-1 rounded-lg bg-gray-100 p-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              to={`/regolamento/${t.key}`}
              replace
              className={`flex-1 rounded-md py-1.5 text-center text-sm font-medium transition ${
                t.key === current.key ? 'bg-white text-field-green-dark shadow-sm' : 'text-gray-500'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}

      <div ref={contentRef} className="mt-4">
        {searching ? (
          <div className="space-y-6">
            {TABS.map((t) => (
              <section key={t.key} data-rule-group>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Regolamento {t.label}
                </h2>
                {CONTENT[t.key]()}
              </section>
            ))}
          </div>
        ) : (
          CONTENT[current.key]()
        )}
      </div>
    </div>
  )
}
