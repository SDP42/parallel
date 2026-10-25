import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken } from './api'

export type User = { id: number; email: string; name: string; persona: string | null; goals: string[]; vip: string[]; xp: number }

type Ctx = {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<User>
  signUp: (name: string, email: string, password: string) => Promise<User>
  demo: (persona: string) => Promise<User>
  setUser: (u: User) => void
  signOut: () => void
}

const AuthCtx = createContext<Ctx>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!getToken())

  useEffect(() => {
    if (!getToken()) return
    api<User>('/me').then(setUser).catch(() => setToken(null)).finally(() => setLoading(false))
  }, [])

  const handle = useCallback((r: { token: string; user: User }) => { setToken(r.token); setUser(r.user); return r.user }, [])

  const value: Ctx = {
    user, loading, setUser,
    signIn: (email, password) => api('/auth/signin', { body: { email, password } }).then(handle),
    signUp: (name, email, password) => api('/auth/signup', { body: { name, email, password } }).then(handle),
    demo: (persona) => api(`/auth/demo?persona=${persona}`, { method: 'POST' }).then(handle),
    signOut: () => { setToken(null); setUser(null) },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
