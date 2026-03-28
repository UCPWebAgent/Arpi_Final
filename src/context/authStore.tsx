// authStore.tsx — mechanic authentication context
// Wraps Supabase Auth and enriches the session with the mechanic profile row.
// On mount, onAuthStateChange fires immediately with the existing session
// (INITIAL_SESSION event), so no separate getSession() call is needed.

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MechanicProfile {
  id: string
  storeId: string
  name: string
  languagePreference: 'en' | 'hy' | 'es'
}

interface AuthContextValue {
  mechanic: MechanicProfile | null
  /** True while the initial session check is in flight. */
  loading: boolean
  /** Returns an error message on failure, null on success. */
  login(email: string, password: string): Promise<string | null>
  logout(): Promise<void>
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [mechanic, setMechanic] = useState<MechanicProfile | null>(null)
  const [loading, setLoading]   = useState(true)

  // Fetch mechanic profile after a successful Supabase Auth session
  async function loadMechanic(userId: string) {
    const { data } = await supabase
      .from('mechanics')
      .select('id, store_id, name, language_preference')
      .eq('id', userId)
      .single()

    if (data) {
      setMechanic({
        id:                 data.id,
        storeId:            data.store_id,
        name:               data.name,
        languagePreference: data.language_preference as MechanicProfile['languagePreference'],
      })
    } else {
      // Auth user exists but no mechanics row — treat as logged out
      setMechanic(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session) {
          await loadMechanic(session.user.id)
        } else {
          setMechanic(null)
          setLoading(false)
        }
      },
    )
    return () => subscription.unsubscribe()
  }, [])

  const login = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  const logout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ mechanic, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
