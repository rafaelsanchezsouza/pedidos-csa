import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  ShoppingCart, BookOpen, Wheat, Settings, ClipboardList,
  CreditCard, UserCircle, Truck, CheckCircle, MoreHorizontal, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

const memberItems = [
  { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { to: '/pagamentos', label: 'Pagamentos', icon: CreditCard },
  { to: '/perfil', label: 'Perfil', icon: UserCircle },
]

const produtorItems = [
  { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { to: '/pagamentos', label: 'Pagamentos', icon: CreditCard },
  { to: '/verificar-pagamentos', label: 'Verificar', icon: CheckCircle },
  { to: '/perfil', label: 'Perfil', icon: UserCircle },
]

const adminMainItems = [
  { to: '/entregas', label: 'Entregas', icon: Truck },
  { to: '/verificar-pagamentos', label: 'Verificar', icon: CheckCircle },
  { to: '/consolidado-geral', label: 'Consolidado', icon: ClipboardList },
  { to: '/ofertas', label: 'Ofertas', icon: Wheat },
]

const adminMoreItems = [
  { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { to: '/pagamentos', label: 'Pagamentos', icon: CreditCard },
  { to: '/catalogo', label: 'Catálogo', icon: BookOpen },
  { to: '/admin', label: 'Administração', icon: Settings },
  { to: '/perfil', label: 'Meu Perfil', icon: UserCircle },
]

export function BottomNav() {
  const { user } = useAuth()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  const isAdmin = user?.acesso === 'admin' || user?.acesso === 'superadmin'
  const isProdutor = user?.acesso === 'produtor'

  const mainItems = isAdmin ? adminMainItems : isProdutor ? produtorItems : memberItems
  const moreActive = isAdmin && adminMoreItems.some((i) => location.pathname === i.to)

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {isAdmin && moreOpen && (
        <div className="fixed bottom-16 left-0 right-0 z-50 bg-background border-t rounded-t-xl shadow-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-medium">Mais opções</span>
            <button onClick={() => setMoreOpen(false)} className="text-muted-foreground p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="grid grid-cols-3 gap-1 p-3">
            {adminMoreItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 p-3 rounded-lg text-xs transition-colors',
                    isActive
                      ? 'bg-accent text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent'
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t flex items-stretch h-16">
        {mainItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span className="truncate w-full text-center leading-none">{label}</span>
          </NavLink>
        ))}

        {isAdmin && (
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs transition-colors',
              moreActive || moreOpen ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="leading-none">Mais</span>
          </button>
        )}
      </nav>
    </>
  )
}
