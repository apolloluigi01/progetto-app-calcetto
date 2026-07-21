import { useState } from 'react'
import { downloadCsv } from '../lib/exportCsv'

/**
 * Pulsante "Scarica Excel": esporta in CSV (apribile in Excel) le righe passate.
 * Le righe sono già formattate come stringhe, coerenti con la tabella a schermo.
 */
export default function DownloadCsvButton({
  filename,
  headers,
  rows,
  className = '',
}: {
  filename: string
  headers: string[]
  rows: string[][]
  className?: string
}) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    setBusy(true)
    try {
      await downloadCsv(filename, headers, rows)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || rows.length === 0}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-field-green/40 bg-white px-3 py-1.5 text-sm font-medium text-field-green-dark hover:bg-field-green/5 disabled:opacity-50 ${className}`}
    >
      ⬇ Scarica Excel
    </button>
  )
}
