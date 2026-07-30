import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { auth } from '@/services/firebase'
import { tenantsApi, usersApi } from '@/services/api'
import type { User, Tenant } from '@/types'

interface AuthContextType {
  firebaseUser: FirebaseUser | null
  user: User | null
  tenant: Tenant | null
  tenants: Tenant[]
  loading: boolean
  authError: string
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  selectTenant: (tenantId: string) => void
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  user: null,
  tenant: null,
  tenants: [],
  loading: true,
  authError: '',
  login: async () => {},
  logout: async () => {},
  selectTenant: () => {},
  refreshUser: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  async function loadUserData(fbUser: FirebaseUser) {
    setAuthError('')
    try {
      const [me, allTenants] = await Promise.all([
        usersApi.getMe(),
        tenantsApi.list(),
      ])
      setUser(me)
      setTenants(allTenants)
      if (allTenants.length === 1) {
        setTenant(allTenants[0])
      } else {
        const saved = localStorage.getItem(`tenant_${fbUser.uid}`)
        const savedFound = saved ? allTenants.find((c) => c.id === saved) : null
        const ownTenant = me.tenantId ? allTenants.find((c) => c.id === me.tenantId) : null
        setTenant(savedFound ?? ownTenant ?? allTenants[0] ?? null)
      }
    } catch (err) {
      setUser(null)
      setTenants([])
      setAuthError(err instanceof Error ? err.message : 'Erro ao carregar dados do usuário')
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser)
      if (fbUser) {
        await loadUserData(fbUser)
      } else {
        setUser(null)
        setTenant(null)
        setTenants([])
      }
      setLoading(false)
    })
    return unsub
  }, [])

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password)
  }

  async function logout() {
    await signOut(auth)
    setTenant(null)
    setTenants([])
    setUser(null)
  }

  function selectTenant(tenantId: string) {
    const found = tenants.find((c) => c.id === tenantId)
    if (found) {
      setTenant(found)
      if (firebaseUser) {
        localStorage.setItem(`tenant_${firebaseUser.uid}`, tenantId)
      }
    }
  }

  async function refreshUser() {
    if (firebaseUser) await loadUserData(firebaseUser)
  }

  return (
    <AuthContext.Provider
      value={{ firebaseUser, user, tenant, tenants, loading, authError, login, logout, selectTenant, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
