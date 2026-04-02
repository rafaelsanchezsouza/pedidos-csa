import { NavLink } from 'react-router-dom'
import { ShoppingCart, BookOpen, Wheat, Settings, ClipboardList, CreditCard, UserCircle, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { ReportarProblema } from '@/components/ReportarProblema'

const navItems = [
  { to: '/pedidos', label: 'Meus Pedidos', icon: ShoppingCart, adminOnly: false },
  { to: '/pagamentos', label: 'Pagamentos', icon: CreditCard, adminOnly: false },
  { to: '/entregas', label: 'Entregas', icon: Truck, adminOnly: true },
  { to: '/perfil', label: 'Meu Perfil', icon: UserCircle, adminOnly: false },
  { to: '/ofertas', label: 'Ofertas da Semana', icon: Wheat, adminOnly: true },
  { to: '/consolidado', label: 'Consolidado', icon: ClipboardList, adminOnly: true },
  { to: '/catalogo', label: 'Catálogo', icon: BookOpen, adminOnly: true },
  { to: '/admin', label: 'Administração', icon: Settings, adminOnly: true },
]

export function Sidebar() {
  const { user, colmeia } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  return (
    <aside className="w-56 border-r bg-background flex flex-col">
      {colmeia && (
        <div className="px-4 py-3 border-b">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Colmeia</p>
          <p className="font-medium text-sm truncate">{colmeia.name}</p>
        </div>
      )}
      <nav className="flex-1 py-2">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
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
