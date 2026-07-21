import { NavLink } from 'react-router-dom'
import { ShoppingCart, BookOpen, Wheat, Settings, ClipboardList, CreditCard, UserCircle, Truck, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin as checkAdmin, isFornecedor, isSuperadmin } from '@/lib/acesso'
import { MULTI_TENANT } from '@/lib/features'
import { ReportarProblema } from '@/components/ReportarProblema'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// fornecedorVisible: item visível também para fornecedor (gerencia/vê só o que é dele)
const navItems = [
  { to: '/pedidos', label: 'Meus Pedidos', icon: ShoppingCart, adminOnly: false, fornecedorVisible: false },
  { to: '/pagamentos', label: 'Pagamentos', icon: CreditCard, adminOnly: false, fornecedorVisible: false },
  { to: '/verificar-pagamentos', label: 'Verificar Pagamentos', icon: CheckCircle, adminOnly: true, fornecedorVisible: true },
  { to: '/ofertas', label: 'Extras da Semana', icon: Wheat, adminOnly: true, fornecedorVisible: true },
  { to: '/entregas', label: 'Entregas', icon: Truck, adminOnly: true, fornecedorVisible: false },
  { to: '/consolidado-geral', label: 'Consolidado', icon: ClipboardList, adminOnly: true, fornecedorVisible: false },
  { to: '/catalogo', label: 'Catálogo', icon: BookOpen, adminOnly: true, fornecedorVisible: true },
  { to: '/admin', label: 'Administração', icon: Settings, adminOnly: true, fornecedorVisible: false },
  { to: '/perfil', label: 'Meu Perfil', icon: UserCircle, adminOnly: false, fornecedorVisible: false },
]

export function Sidebar() {
  const { user, tenant, tenants, selectTenant } = useAuth()
  const isAdmin = checkAdmin(user)
  const isFornec = isFornecedor(user)
  const isSuperAdmin = isSuperadmin(user)

  return (
    <aside className="w-56 border-r bg-background flex flex-col">
      {/* Bloco da organização: só com multi-loja ligado E mais de uma organização */}
      {tenant && MULTI_TENANT && tenants.length > 1 && (
        <div className="px-4 py-3 border-b">
          {isSuperAdmin ? (
            <Select value={tenant.id} onValueChange={selectTenant}>
              <SelectTrigger className="h-auto text-sm font-medium border-0 p-0 shadow-none focus:ring-0 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tenants.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="font-medium text-sm truncate">{tenant.name}</p>
          )}
        </div>
      )}
      <nav className="flex-1 py-2">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin || (item.fornecedorVisible && isFornec))
          .map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent',
                  isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
      </nav>

      <div className="border-t py-2">
        <ReportarProblema />
      </div>
    </aside>
  )
}
