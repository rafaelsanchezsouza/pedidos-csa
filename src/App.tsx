import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/layout/Layout'
import { LoginPage } from '@/pages/LoginPage'
import { PedidosPage } from '@/pages/PedidosPage'
import { CatalogoPage } from '@/pages/CatalogoPage'
import { OfertasPage } from '@/pages/OfertasPage'
import { AdminPage } from '@/pages/AdminPage'
import { ConsolidadoPage } from '@/pages/ConsolidadoPage'
import { PagamentosPage } from '@/pages/PagamentosPage'
import { PerfilPage } from '@/pages/PerfilPage'
import { HistoricoPage } from '@/pages/HistoricoPage'
import { EntregasPage } from '@/pages/EntregasPage'
import { VerificarPagamentosPage } from '@/pages/VerificarPagamentosPage'
import { DefinirSenhaPage } from '@/pages/DefinirSenhaPage'
import { ReactNode } from 'react'

function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { firebaseUser, user, colmeia, loading } = useAuth()

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>
  if (!firebaseUser || !colmeia) return <Navigate to="/login" replace />
  if (user?.mustChangePassword) return <Navigate to="/definir-senha" replace />
  if (adminOnly && user?.role !== 'admin' && user?.role !== 'superadmin') {
    return <Navigate to="/pedidos" replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  const { firebaseUser, colmeia, loading } = useAuth()

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>

  return (
    <Routes>
      <Route
        path="/"
        element={
          firebaseUser && colmeia ? <Navigate to="/pedidos" replace /> : <Navigate to="/login" replace />
        }
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/definir-senha" element={<DefinirSenhaPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/pedidos" element={<PedidosPage />} />
        <Route
          path="/catalogo"
          element={
            <ProtectedRoute adminOnly>
              <CatalogoPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ofertas"
          element={
            <ProtectedRoute adminOnly>
              <OfertasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/consolidado"
          element={
            <ProtectedRoute adminOnly>
              <ConsolidadoPage />
            </ProtectedRoute>
          }
        />
        <Route path="/pagamentos" element={<PagamentosPage />} />
        <Route path="/verificar-pagamentos" element={<VerificarPagamentosPage />} />
        <Route path="/perfil" element={<PerfilPage />} />
        <Route path="/historico" element={<HistoricoPage />} />
        <Route
          path="/entregas"
          element={
            <ProtectedRoute adminOnly>
              <EntregasPage />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
