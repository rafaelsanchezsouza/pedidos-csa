import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/layout/Layout'
import { LoginPage } from '@/pages/LoginPage'
import { PedidosPage } from '@/pages/PedidosPage'
import { CatalogoPage } from '@/pages/CatalogoPage'
import { OfertasPage } from '@/pages/OfertasPage'
import { AdminPage } from '@/pages/AdminPage'
import { PagamentosPage } from '@/pages/PagamentosPage'
import { PerfilPage } from '@/pages/PerfilPage'
import { EntregasPage } from '@/pages/EntregasPage'
import { ConsolidadoGeralPage } from '@/pages/ConsolidadoGeralPage'
import { VerificarPagamentosPage } from '@/pages/VerificarPagamentosPage'
import { DefinirSenhaPage } from '@/pages/DefinirSenhaPage'
import { isAdmin, isFornecedor } from '@/lib/acesso'
import { ReactNode } from 'react'

function ProtectedRoute({ children, adminOnly = false, fornecedorOk = false }: { children: ReactNode; adminOnly?: boolean; fornecedorOk?: boolean }) {
  const { firebaseUser, user, tenant, loading } = useAuth()

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>
  if (!firebaseUser || !tenant) return <Navigate to="/login" replace />
  if (user?.mustChangePassword) return <Navigate to="/definir-senha" replace />
  // adminOnly: admin sempre entra; fornecedor entra só onde fornecedorOk (com escopo próprio).
  if (adminOnly && !isAdmin(user) && !(fornecedorOk && isFornecedor(user))) {
    return <Navigate to="/pedidos" replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  const { firebaseUser, tenant, loading } = useAuth()

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>

  return (
    <Routes>
      <Route
        path="/"
        element={
          firebaseUser && tenant ? <Navigate to="/pedidos" replace /> : <Navigate to="/login" replace />
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
            <ProtectedRoute adminOnly fornecedorOk>
              <CatalogoPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ofertas"
          element={
            <ProtectedRoute adminOnly fornecedorOk>
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
        <Route path="/pagamentos" element={<PagamentosPage />} />
        <Route path="/verificar-pagamentos" element={<VerificarPagamentosPage />} />
        <Route path="/perfil" element={<PerfilPage />} />
        <Route
          path="/entregas"
          element={
            <ProtectedRoute adminOnly>
              <EntregasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/consolidado-geral"
          element={
            <ProtectedRoute adminOnly>
              <ConsolidadoGeralPage />
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
