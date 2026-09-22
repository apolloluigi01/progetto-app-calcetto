import type { ReactNode } from 'react'

/**
 * Mattoni grafici del regolamento: ogni argomento è una sezione richiudibile,
 * così la pagina resta consultabile anche da telefono senza scorrere
 * chilometri di testo.
 */
export function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <details data-rule-section className="group overflow-hidden rounded-xl bg-white shadow">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
        <span className="text-lg" aria-hidden="true">
          {icon}
        </span>
        <span className="flex-1 font-semibold text-field-green-dark">{title}</span>
        <span className="text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="space-y-3 border-t border-gray-100 px-4 py-3 text-sm leading-relaxed text-gray-700">
        {children}
      </div>
    </details>
  )
}

/** Elenco puntato (o numerato, per regole in ordine di priorità). */
export function List({ items, ordered = false }: { items: ReactNode[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className={`space-y-1.5 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-field-green`}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Tag>
  )
}

/** Riquadro evidenziato per note ed esempi. */
export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  return (
    <div
      className={`rounded-lg px-3 py-2 text-xs ${
        tone === 'warning' ? 'bg-field-orange/10 text-field-orange' : 'bg-field-green/5 text-field-green-dark'
      }`}
    >
      {children}
    </div>
  )
}

/** Tabella compatta a due o più colonne. */
export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-100">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
