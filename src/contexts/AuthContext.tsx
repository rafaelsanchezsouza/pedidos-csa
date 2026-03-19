import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { auth } from '@/services/firebase'
import { colmeiasApi, usersApi } from '@/services/api'
import type { User, Colmeia } from '@/types'

interface AuthContextType {
  firebaseUser: FirebaseUser | null
  user: User | null
  colmeia: Colmeia | null
  colmeias: Colmeia[]
  loading: boolean
  authError: string
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  selectColmeia: (colmeiaId: string) => void
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  user: null,
  colmeia: null,
  colmeias: [],
  loading: true,
  authError: '',
  login: async () => {},
  logout: async () => {},
  selectColmeia: () => {},
  refreshUser: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [colmeia, setColmeia] = useState<Colmeia | null>(null)
  const [colmeias, setColmeias] = useState<Colmeia[]>([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  async function loadUserData(fbUser: FirebaseUser) {
    setAuthError('')
    try {
      const [me, allColmeias] = await Promise.all([
        usersApi.getMe(),
        colmeiasApi.list(),
      ])
      setUser(me)
      setColmeias(allColmeias)
      if (allColmeias.length === 1) {
        setColmeia(allColmeias[0])
      } else {
        const saved = localStorage.getItem(`colmeia_${fbUser.uid}`)
        if (saved) {
          const found = allColmeias.find((c) => c.id === saved)
          if (found) setColmeia(found)
        }
      }
    } catch (err) {
      setUser(null)
      setColmeias([])
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
        setColmeia(null)
        setColmeias([])
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
    setColmeia(null)
    setColmeias([])
    setUser(null)
  }

  function selectColmeia(colmeiaId: string) {
    const found = colmeias.find((c) => c.id === colmeiaId)
    if (found) {
      setColmeia(found)
      if (firebaseUser) {
        localStorage.setItem(`colmeia_${firebaseUser.uid}`, colmeiaId)
      }
    }
  }

  async function refreshUser() {
    if (firebaseUser) await loadUserData(firebaseUser)
  }

  return (
    <AuthContext.Provider
      value={{ firebaseUser, user, colmeia, colmeias, loading, authError, login, logout, selectColmeia, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
