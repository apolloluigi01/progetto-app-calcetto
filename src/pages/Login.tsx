import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const EMAIL_NOT_CONFIRMED = 'Email non confermata. Controlla la tua casella di posta (anche lo spam) e clicca sul link di conferma prima di accedere.'
const INVALID_CREDENTIALS = 'Email o password non corrette.'

export default function Login() {
  const { session, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error === 'Email not confirmed') {
      setError(EMAIL_NOT_CONFIRMED)
    } else if (error === 'Invalid login credentials') {
      setError(INVALID_CREDENTIALS)
    } else if (error) {
      setError(error)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-field-green px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-2xl font-semibold text-field-green-dark">Pavone League</h1>
        <p className="mb-6 text-sm text-gray-500">Accedi con le tue credenziali</p>

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
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-field-green px-4 py-2 font-medium text-white transition hover:bg-field-green-dark disabled:opacity-60"
          >
            {submitting ? 'Accesso in corso...' : 'Accedi'}
          </button>
        </form>

        <Link to="/password-dimenticata" className="mt-4 block text-center text-sm text-gray-500 hover:underline">
          Password dimenticata?
        </Link>
      </div>
    </div>
  )
}
