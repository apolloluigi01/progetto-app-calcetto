import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { validatePassword } from '../lib/passwordPolicy'

const roleLabels: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  player: 'Player',
}

export default function Impostazioni() {
  const { player, session, signOut } = useAuth()

  const [showForm, setShowForm] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const policyError = validatePassword(password)
    if (policyError) {
      setError(policyError)
      return
    }
    if (password !== confirmPassword) {
      setError('Le due password non coincidono.')
      return
    }

    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    setPassword('')
    setConfirmPassword('')
    setShowForm(false)
    setSuccess(true)
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-field-green-dark">Impostazioni</h1>

      {player && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow">
          <p className="font-medium">{player.name}</p>
          {player.nickname && <p className="text-sm text-gray-500">{player.nickname}</p>}
          {session?.user.email && <p className="mt-1 text-sm text-gray-500">{session.user.email}</p>}
          <p className="mt-2 text-xs uppercase text-field-green">{roleLabels[player.role] ?? player.role}</p>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-white p-4 shadow">
        <h2 className="font-medium text-gray-800">Sicurezza</h2>

        {success && <p className="mt-2 text-sm text-green-700">Password aggiornata correttamente.</p>}

        {showForm ? (
          <form onSubmit={handleChangePassword} className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="newPassword">
                Nuova password
              </label>
              <input
                id="newPassword"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="confirmNewPassword">
                Conferma password
              </label>
              <input
                id="confirmNewPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-field-green px-4 py-2 text-sm font-medium text-white hover:bg-field-green-dark disabled:opacity-60"
              >
                {submitting ? 'Salvataggio...' : 'Salva'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setError(null)
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Annulla
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => {
              setShowForm(true)
              setSuccess(false)
            }}
            className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Cambia password
          </button>
        )}
      </div>

      <Link
        to="/registro-attivita"
        className="mt-4 block rounded-lg border border-gray-300 px-4 py-2 text-center text-sm text-gray-700 hover:bg-gray-50"
      >
        Registro attività admin
      </Link>

      <button
        onClick={signOut}
        className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
      >
        Esci
      </button>
    </div>
  )
}
