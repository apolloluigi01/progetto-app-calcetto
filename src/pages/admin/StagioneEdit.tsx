import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Season } from '../../types/database'

export default function StagioneEdit() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'nuova'
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth()
      if (month >= 8) {
        setName(`${year}/${year + 1}`)
        setStartDate(`${year}-09-01`)
      } else {
        setName(`${year - 1}/${year}`)
        setStartDate(`${year}-01-01`)
      }
      return
    }

    supabase
      .from('seasons')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          const s = data as Season
          setName(s.name)
          setStartDate(s.start_date)
          setEndDate(s.end_date ?? '')
        }
        setLoading(false)
      })
  }, [id, isNew])

  async function handleSave() {
    if (!name.trim() || !startDate) {
      setError('Nome e data di inizio sono obbligatori.')
      return
    }
    setSaving(true)
    setError(null)

    const payload = { name: name.trim(), start_date: startDate, end_date: endDate || null }

    const { error: err } = isNew
      ? await supabase.from('seasons').insert(payload)
      : await supabase.from('seasons').update(payload).eq('id', id)

    setSaving(false)
    if (err) { setError(err.message); return }
    navigate('/admin/stagioni')
  }

  async function handleDelete() {
    if (!id || isNew) return
    if (!confirm(`Eliminare la stagione "${name}"? Tutte le partite collegate saranno preservate ma orfane.`)) return
    setDeleting(true)
    const { error: err } = await supabase.from('seasons').delete().eq('id', id)
    setDeleting(false)
    if (err) { setError(err.message); return }
    navigate('/admin/stagioni')
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Caricamento...</div>

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">
        {isNew ? 'Nuova stagione' : 'Modifica stagione'}
      </h1>

      <div className="mt-4 space-y-4 rounded-xl bg-white p-4 shadow">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nome stagione</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="es. 2024/25"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Data inizio</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Data fine <span className="font-normal text-gray-400">(opzionale)</span>
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">
            Lascia vuoto se la stagione è ancora in corso. La stagione senza data di fine più recente sarà considerata quella corrente.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-field-green px-4 py-2 font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
        >
          {saving ? 'Salvataggio...' : isNew ? 'Crea stagione' : 'Salva modifiche'}
        </button>
      </div>

      {!isNew && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="mt-4 w-full rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          {deleting ? 'Eliminazione...' : 'Elimina stagione'}
        </button>
      )}
    </div>
  )
}
