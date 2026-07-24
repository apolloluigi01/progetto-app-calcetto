import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Player } from '../types/database'

interface AuthContextValue {
  session: Session | null
  player: Player | null
  loading: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshPlayer: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  // Dipende dall'id utente, NON dall'oggetto session: al ritorno del focus
  // (alt-tab, cambio app) Supabase emette TOKEN_REFRESHED con una nuova
  // session (stesso utente). Se dipendessimo da `session` l'effect si
  // ri-eseguirebbe rimettendo loading=true, ProtectedRoute smonterebbe la
  // pagina e le form aperte (pagelle, nuova partita, ...) si azzererebbero.
  const userId = session?.user.id ?? null
  useEffect(() => {
    if (!userId) {
      setPlayer(null)
      setLoading(false)
      return
    }

    let cancelled = false
    supabase
      .from('players')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        setPlayer(data as Player | null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshPlayer() {
    if (!session) return
    const { data } = await supabase.from('players').select('*').eq('id', session.user.id).single()
    setPlayer(data as Player | null)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        player,
        loading,
        isAdmin: player?.role === 'admin' || player?.role === 'superadmin',
        isSuperAdmin: player?.role === 'superadmin',
        signIn,
        signOut,
        refreshPlayer,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider')
  return ctx
}
