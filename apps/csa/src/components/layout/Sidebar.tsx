import { NavLink } from 'react-router-dom'
import { ShoppingCart, BookOpen, Wheat, Settings, ClipboardList, CreditCard, UserCircle, Truck, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { ReportarProblema } from '@/components/ReportarProblema'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const navItems = [
  { to: '/pedidos', label: 'Meus Pedidos', icon: ShoppingCart, adminOnly: false, produtorVisible: false },
  { to: '/pagamentos', label: 'Pagamentos', icon: CreditCard, adminOnly: false, produtorVisible: false },
  { to: '/verificar-pagamentos', label: 'Verificar Pagamentos', icon: CheckCircle, adminOnly: true, produtorVisible: true },
  { to: '/ofertas', label: 'Extras da Semana', icon: Wheat, adminOnly: true, produtorVisible: false },
  { to: '/entregas', label: 'Entregas', icon: Truck, adminOnly: true, produtorVisible: false },
  { to: '/consolidado-geral', label: 'Consolidado', icon: ClipboardList, adminOnly: true, produtorVisible: false },
  { to: '/catalogo', label: 'Catálogo', icon: BookOpen, adminOnly: true, produtorVisible: false },
  { to: '/admin', label: 'Administração', icon: Settings, adminOnly: true, produtorVisible: false },
  { to: '/perfil', label: 'Meu Perfil', icon: UserCircle, adminOnly: false, produtorVisible: false },
]

export function Sidebar() {
  const { user, colmeia, colmeias, selectColmeia } = useAuth()
  const isAdmin = user?.acesso === 'admin' || user?.acesso === 'superadmin'
  const isProdutor = user?.acesso === 'produtor'
  const isSuperAdmin = user?.acesso === 'superadmin'

  return (
    <aside className="w-56 border-r bg-background flex flex-col">
      {colmeia && (
        <div className="px-4 py-3 border-b">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Colmeia</p>
          {isSuperAdmin && colmeias.length > 1 ? (
            <Select value={colmeia.id} onValueChange={selectColmeia}>
              <SelectTrigger className="h-auto text-sm font-medium border-0 p-0 shadow-none focus:ring-0 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {colmeias.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="font-medium text-sm truncate">{colmeia.name}</p>
          )}
        </div>
      )}
      <nav className="flex-1 py-2">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin || (item.produtorVisible && isProdutor))
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
