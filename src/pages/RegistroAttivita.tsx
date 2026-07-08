import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { actionLabels, type ActivityAction } from '../lib/activityLog'
import ErrorNotice from '../components/ErrorNotice'

interface LogEntry {
  id: string
  admin_name: string
  action: ActivityAction
  details: Record<string, unknown>
  created_at: string
}

const actionColors: Record<ActivityAction, string> = {
  giocatore_creato:      'bg-field-green/10 text-field-green-dark',
  giocatore_modificato:  'bg-blue-50 text-blue-700',
  overall_modificato:    'bg-blue-50 text-blue-700',
  giocatore_eliminato:   'bg-red-50 text-red-700',
  password_reimpostata:  'bg-field-yellow/20 text-field-orange',
  partita_creata:        'bg-field-green/10 text-field-green-dark',
  partita_modificata:    'bg-blue-50 text-blue-700',
  risultato_salvato:     'bg-blue-50 text-blue-700',
  gol_aggiunto:          'bg-field-green/10 text-field-green-dark',
  gol_rimosso:           'bg-red-50 text-red-600',
  assist_aggiunto:       'bg-field-green/10 text-field-green-dark',
  assist_rimosso:        'bg-red-50 text-red-600',
  pagelle_bozza:         'bg-field-yellow/20 text-field-orange',
  pagelle_pubblicate:    'bg-field-orange/10 text-field-orange',
  partita_eliminata:     'bg-red-50 text-red-700',
  sondaggio_aperto:      'bg-blue-50 text-blue-700',
  sondaggio_chiuso:      'bg-blue-50 text-blue-700',
  squadre_generate:      'bg-field-green/10 text-field-green-dark',
  squadre_modificate:    'bg-blue-50 text-blue-700',
  giocatore_sostituito:  'bg-field-orange/10 text-field-orange',
  prenotazione_aggiunta: 'bg-field-green/10 text-field-green-dark',
  prenotazione_rimossa:  'bg-red-50 text-red-600',
  votazioni_aperte:      'bg-purple-50 text-purple-700',
  votazioni_chiuse:      'bg-purple-50 text-purple-700',
  fanta_lega_creata:     'bg-field-yellow/20 text-field-orange',
  fanta_giornata_calcolata: 'bg-field-yellow/20 text-field-orange',
  fanta_calcolo_annullato:  'bg-red-50 text-red-600',
  fanta_parametri_modificati: 'bg-field-yellow/20 text-field-orange',
}

function formatDetails(action: ActivityAction, details: Record<string, unknown>): string {
  const parts: string[] = []

  if (Array.isArray(details.modifiche) && details.modifiche.length > 0) {
    if (details.giocatore) parts.push(String(details.giocatore))
    const changes = (details.modifiche as { campo: string; da: string; a: string }[])
      .map((m) => `${m.campo}: ${m.da} → ${m.a}`)
      .join(' · ')
    parts.push(changes)
    return parts.join(' — ')
  }

  if (details.nome)      parts.push(String(details.nome))
  if (details.email)     parts.push(String(details.email))
  if (details.data)      parts.push(new Date(String(details.data)).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }))
  if (details.campo)     parts.push(`Campo: ${details.campo}`)
  if (details.squadra)   parts.push(`Squadra ${details.squadra}`)
  if (details.giocatore) parts.push(String(details.giocatore))
  if (action === 'giocatore_sostituito' && details.uscito && details.entrato)
    parts.push(`${details.uscito} → ${details.entrato}`)
  if (action === 'risultato_salvato' && details.scoreA !== undefined)
    parts.push(`${details.scoreA} - ${details.scoreB}`)
  if (details.autogol)   parts.push('(autogol)')
  if (details.ruolo)     parts.push(`Ruolo: ${details.ruolo}`)
  return parts.join(' · ')
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

const PAGE_SIZE = 30

export default function RegistroAttivita() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)

  async function load(pageIndex: number, append = false) {
    setLoading(true)
    setError(null)
    const from = pageIndex * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('admin_activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const rows = (data ?? []) as LogEntry[]
    setEntries(prev => append ? [...prev, ...rows] : rows)
    setHasMore(rows.length === PAGE_SIZE)
    setLoading(false)
  }

  useEffect(() => {
    load(0)
  }, [])

  function loadMore() {
    const next = page + 1
    setPage(next)
    load(next, true)
  }

  return (
    <div className="p-4 pb-8">
      <h1 className="text-xl font-semibold text-field-green-dark">Registro attività</h1>
      <p className="mt-1 text-sm text-gray-500">Tutte le azioni effettuate dagli amministratori.</p>

      <div className="mt-4 space-y-2">
        {!loading && error && <ErrorNotice message={error} onRetry={() => load(0)} />}
        {!loading && !error && entries.length === 0 && (
          <p className="text-sm text-gray-500">Nessuna attività registrata.</p>
        )}

        {entries.map((entry) => (
          <div key={entry.id} className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-800 text-sm">{entry.admin_name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      actionColors[entry.action] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {actionLabels[entry.action] ?? entry.action}
                  </span>
                </div>
                {formatDetails(entry.action, entry.details) && (
                  <p className="mt-1 text-xs text-gray-500 truncate">
                    {formatDetails(entry.action, entry.details)}
                  </p>
                )}
              </div>
              <time className="shrink-0 text-[11px] text-gray-400 mt-0.5 whitespace-nowrap">
                {formatTime(entry.created_at)}
              </time>
            </div>
          </div>
        ))}

        {loading && (
          <p className="text-center text-sm text-gray-400 py-4">Caricamento...</p>
        )}

        {!loading && hasMore && (
          <button
            onClick={loadMore}
            className="w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50"
          >
            Carica altri
          </button>
        )}
      </div>
    </div>
  )
}
