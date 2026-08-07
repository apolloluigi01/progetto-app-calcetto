import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { validatePassword } from '../lib/passwordPolicy'

// La lunghezza del codice non e' decisa dall'app ma dalle impostazioni Auth del
// progetto Supabase (oggi 8 cifre, in passato 6) e puo' cambiare senza toccare
// il codice. Qui accettiamo l'intero intervallo previsto da Supabase invece di
// fissare un numero: con maxLength=6 il campo troncava i codici da 8 cifre e il
// reset falliva sempre con "codice non valido".
const CODE_MIN_LENGTH = 6
const CODE_MAX_LENGTH = 10

export default function ResetPassword() {
  const location = useLocation()
  const prefillEmail = (location.state as { email?: string } | null)?.email ?? ''

  const [email, setEmail] = useState(prefillEmail)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  // Il codice si consuma alla prima verifica: se il salvataggio fallisce dopo
  // (password rifiutata dal server, rete caduta) un secondo tentativo con lo
  // stesso codice darebbe "codice non valido" pur essendo gia' autenticati.
  const [verified, setVerified] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const policyError = validatePassword(password)
    if (policyError) {
      setError(policyError)
      return
    }
    if (password !== confirmPassword) {
      setError('Le due password non coincidono.')
      return
    }
    if (!verified && code.length < CODE_MIN_LENGTH) {
      setError(`Il codice deve contenere almeno ${CODE_MIN_LENGTH} cifre.`)
      return
    }

    setSubmitting(true)

    if (!verified) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code,
        type: 'recovery',
      })
      if (verifyError) {
        setSubmitting(false)
        setError('Codice non valido o scaduto. Richiedi un nuovo codice dalla pagina "Password dimenticata".')
        return
      }
      setVerified(true)
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setSubmitting(false)
      setError(updateError.message)
      return
    }

    const { error: rpcError } = await supabase.rpc('clear_must_change_password')
    if (rpcError) {
      setSubmitting(false)
      setError(rpcError.message)
      return
    }

    setSubmitting(false)
    setDone(true)
    // Ricarica completa invece di navigate(): il profilo in memoria e' quello
    // letto appena verificato il codice e puo' avere ancora
    // must_change_password a true, che rimanderebbe subito a /imposta-password.
    setTimeout(() => window.location.assign('/'), 1500)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-field-green px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-2xl font-semibold text-field-green-dark">Reimposta password</h1>
        <p className="mb-6 text-sm text-gray-500">
          Inserisci il codice ricevuto via email e scegli una nuova password: almeno 6 caratteri, una lettera
          maiuscola e un numero.
        </p>

        {done ? (
          <p className="text-sm text-green-700">Password aggiornata. Reindirizzamento in corso...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                disabled={verified}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="code">
                Codice ricevuto via email
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={CODE_MAX_LENGTH}
                required
                disabled={verified}
                value={code}
                // Il codice incollato dalla mail puo' portarsi dietro spazi o un
                // a capo: teniamo solo le cifre.
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_MAX_LENGTH))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 tracking-widest focus:border-field-green focus:outline-none disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="password">
                Nuova password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="confirmPassword">
                Conferma password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-field-green focus:outline-none"
              />
            </div>

            {verified && (
              <p className="text-sm text-green-700">Codice verificato: scegli la nuova password e salva.</p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-field-green px-4 py-2 font-medium text-white transition hover:bg-field-green-dark disabled:opacity-60"
            >
              {submitting ? 'Salvataggio...' : 'Salva password'}
            </button>
          </form>
        )}

        <Link to="/password-dimenticata" className="mt-4 block text-center text-sm text-gray-500 hover:underline">
          Non hai ricevuto il codice? Richiedine uno nuovo
        </Link>
      </div>
    </div>
  )
}
