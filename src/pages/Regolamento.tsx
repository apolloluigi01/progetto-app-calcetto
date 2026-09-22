import type { ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import RegolamentoAmichevoli from './regolamento/RegolamentoAmichevoli'
import RegolamentoFantacalcetto from './regolamento/RegolamentoFantacalcetto'
import RegolamentoFormat from './regolamento/RegolamentoFormat'

const TABS = [
  { key: 'format', label: 'Format', intro: 'Le regole della stagione ufficiale e della Classifica Format.' },
  { key: 'amichevoli', label: 'Amichevoli', intro: 'Le regole delle stagioni amichevoli, fuori dal Format.' },
  { key: 'fantacalcetto', label: 'Fantacalcetto', intro: 'Tutto quello che serve per giocare al fantacalcetto.' },
] as const

type TabKey = (typeof TABS)[number]['key']

/**
 * Regolamento consultabile da tutti. Ogni tipologia ha un indirizzo proprio
 * (/regolamento/format, /amichevoli, /fantacalcetto), così si può linkare
 * direttamente il regolamento giusto.
 */
export default function Regolamento() {
  const { tipo } = useParams<{ tipo: string }>()
  const current = TABS.find((t) => t.key === tipo)
  if (!current) return <Navigate to="/regolamento/format" replace />

  const content: Record<TabKey, ReactNode> = {
    format: <RegolamentoFormat />,
    amichevoli: <RegolamentoAmichevoli />,
    fantacalcetto: <RegolamentoFantacalcetto />,
  }

  return (
    <div className="p-4 pb-12">
      <h1 className="text-xl font-semibold text-field-green-dark">📖 Regolamento</h1>
      <p className="mt-1 text-sm text-gray-500">{current.intro} Tocca un argomento per aprirlo.</p>

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

      <div className="mt-4">{content[current.key]}</div>
    </div>
  )
}
