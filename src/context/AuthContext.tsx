import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiFetch, jsonBody } from '../lib/api'

export interface UserOrganization {
  id: string
  name: string
  slug: string
  kind: 'client' | 'operator' | 'platform'
  plan: string
  memberRole: 'owner' | 'admin' | 'member' | 'billing'
}

export interface AuthUser {
  id: string
  email: string
  displayName: string
  status: string
  platformRole: 'user' | 'support' | 'admin'
  emailVerified: boolean
  organizations: UserOrganization[]
}

interface SignupInput {
  email: string
  password: string
  displayName: string
  accountType: 'client' | 'operator'
  organizationName: string
  termsAccepted: true
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  signup: (input: SignupInput) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch<{ user: AuthUser }>('/auth/me')
      setUser(response.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    await apiFetch('/auth/login', { method: 'POST', body: jsonBody({ email, password }) })
    await refresh()
  }, [refresh])

  const signup = useCallback(async (input: SignupInput) => {
    await apiFetch('/auth/signup', { method: 'POST', body: jsonBody(input) })
    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, refresh, login, signup, logout }), [user, loading, refresh, login, signup, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
