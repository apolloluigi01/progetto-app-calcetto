import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ErrorNotice from '../components/ErrorNotice'
import EditButton from '../components/EditButton'

interface PressLink {
  id: string
  title: string
  url: string
  created_at: string
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export default function UfficioStampa() {
  const { player, isAdmin } = useAuth()
  const [links, setLinks] = useState<PressLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Form (aggiunta o modifica)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    supabase
      .from('press_links')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setLinks((data ?? []) as PressLink[])
        setLoading(false)
      })
  }, [reloadToken])

  function openNewForm() {
    setEditingId(null)
    setTitle('')
    setUrl('')
    setFormError(null)
    setShowForm(true)
  }

  function openEditForm(link: PressLink) {
    setEditingId(link.id)
    setTitle(link.title)
    setUrl(link.url)
    setFormError(null)
    setShowForm(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!title.trim()) {
      setFormError('Inserisci un titolo per il post.')
      return
    }
    if (!isValidUrl(url.trim())) {
      setFormError('Inserisci un link valido (es. https://www.instagram.com/p/...).')
      return
    }

    setSaving(true)
    const payload = { title: title.trim(), url: url.trim() }
    const { error: saveError } = editingId
      ? await supabase.from('press_links').update(payload).eq('id', editingId)
      : await supabase.from('press_links').insert({ ...payload, created_by: player?.id ?? null })
    setSaving(false)

    if (saveError) {
      setFormError(saveError.message)
      return
    }
    setShowForm(false)
    setReloadToken((t) => t + 1)
  }

  async function handleDelete(link: PressLink) {
    if (!confirm(`Rimuovere "${link.title}" dall'ufficio stampa?`)) return
    setDeletingId(link.id)
    const { error: delError } = await supabase.from('press_links').delete().eq('id', link.id)
    setDeletingId(null)
    if (delError) {
      setError(delError.message)
      return
    }
    setReloadToken((t) => t + 1)
  }

  return (
    <div className="p-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-field-green-dark">Ufficio Stampa</h1>
        {isAdmin && !showForm && (
          <button
            onClick={openNewForm}
            className="rounded-lg bg-field-green px-3 py-1.5 text-sm font-medium text-white hover:bg-field-green-dark"
          >
            + Aggiungi post
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500">
        I post Instagram ufficiali della Pavone League: tocca un post per aprirlo su Instagram.
      </p>

      {isAdmin && showForm && (
        <form onSubmit={handleSave} className="mt-4 space-y-3 rounded-xl bg-white p-4 shadow">
          <h2 className="font-medium text-gray-800">{editingId ? 'Modifica post' : 'Nuovo post'}</h2>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Titolo</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es. Highlights giornata 5"
              maxLength={120}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Link del post Instagram</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.instagram.com/p/..."
              inputMode="url"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
            />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
            >
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Annulla
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-gray-500">Caricamento...</p>}
        {!loading && error && <ErrorNotice message={error} onRetry={() => setReloadToken((t) => t + 1)} />}
        {!loading && !error && links.length === 0 && (
          <p className="text-sm text-gray-500">Nessun post pubblicato finora.</p>
        )}
        {!loading &&
          links.map((link) => (
            <div key={link.id} className="rounded-xl bg-white p-3 shadow">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 hover:opacity-80"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-lg text-white">
                  📸
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-gray-800">{link.title}</span>
                  <span className="block text-xs text-gray-400">
                    {formatDate(link.created_at)} · Apri su Instagram ↗
                  </span>
                </span>
              </a>
              {isAdmin && (
                <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
                  <EditButton onClick={() => openEditForm(link)} />
                  <button
                    onClick={() => handleDelete(link)}
                    disabled={deletingId === link.id}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === link.id ? 'Rimozione...' : 'Rimuovi'}
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}
