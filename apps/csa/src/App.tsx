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
import { AcolhidaPage } from '@/pages/AcolhidaPage'
import { ReactNode } from 'react'
import { isAdmin, emAcolhida, UTC_OFFSET_PADRAO } from '@pedidos/core'
import { config } from '@/config'

function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { firebaseUser, user, colmeia, loading } = useAuth()

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>
  if (!firebaseUser || !colmeia) return <Navigate to="/login" replace />
  if (user?.mustChangePassword) return <Navigate to="/definir-senha" replace />
  if (adminOnly && !isAdmin(user)) {
    return <Navigate to="/pedidos" replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  const { firebaseUser, user, colmeia, loading } = useAuth()

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>

  // Quem está em acolhida cai na tela da semana: as duas ações com prazo (confirmar e anexar
  // comprovante) ficam na frente. O menu segue inteiro — ele está decidindo se fica.
  const naAcolhida = !!user && emAcolhida(user, new Date(), config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO)
  const inicio = naAcolhida ? '/acolhida' : '/pedidos'

  return (
    <Routes>
      <Route
        path="/"
        element={
          firebaseUser && colmeia ? <Navigate to={inicio} replace /> : <Navigate to="/login" replace />
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
        <Route path="/acolhida" element={<AcolhidaPage />} />
        {/* Extras não existem na acolhida: o pedido é só a cesta da semana. A rota é barrada
            aqui e no servidor (routes/orders.ts) — esconder o menu não impede um POST. */}
        <Route path="/pedidos" element={naAcolhida ? <Navigate to="/acolhida" replace /> : <PedidosPage />} />
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
