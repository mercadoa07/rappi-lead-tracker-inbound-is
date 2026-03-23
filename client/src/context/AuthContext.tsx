import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthUser = Pick<User, 'id' | 'email' | 'fullName' | 'role' | 'country' | 'team'> & {
  leaderId?: string
}

interface AuthState {
  user:            AuthUser | null
  isAuthenticated: boolean
  isLoading:       boolean
}

interface AuthContextValue extends AuthState {
  login:  (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user:            null,
    isAuthenticated: false,
    isLoading:       true,
  })

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, country, team, leader_id')
      .eq('id', userId)
      .single()

    if (data) {
      setState({
        user: {
          id:       data.id,
          email:    data.email,
          fullName: data.full_name,
          role:     data.role,
          country:  data.country,
          team:     data.team,
          leaderId: data.leader_id ?? undefined,
        },
        isAuthenticated: true,
        isLoading:       false,
      })
    } else {
      setState({ user: null, isAuthenticated: false, isLoading: false })
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setState((s) => ({ ...s, isLoading: false }))
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setState({ user: null, isAuthenticated: false, isLoading: false })
      }
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setState({ user: null, isAuthenticated: false, isLoading: false })
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
