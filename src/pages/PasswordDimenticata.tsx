import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PasswordDimenticata() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await supabase.functions.invoke('request-password-reset', { body: { email } })
    setSubmitting(false)
    setSent(true)
    setTimeout(() => navigate('/reset-password', { state: { email } }), 1500)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-field-green px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-2xl font-semibold text-field-green-dark">Password dimenticata?</h1>
        <p className="mb-6 text-sm text-gray-500">
          Inserisci la tua email: se l'account esiste, riceverai un codice per reimpostare la password.
        </p>

        {sent ? (
          <p className="text-sm text-green-700">
            Se l'indirizzo esiste, riceverai una mail con un codice per reimpostare la password. Controlla anche lo
            spam.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-field-green px-4 py-2 font-medium text-white transition hover:bg-field-green-dark disabled:opacity-60"
            >
              {submitting ? 'Invio in corso...' : 'Invia codice di reset'}
            </button>
          </form>
        )}

        <Link to="/login" className="mt-4 block text-center text-sm text-gray-500 hover:underline">
          Torna al login
        </Link>
      </div>
    </div>
  )
}
