import { LogOut } from 'lucide-react'
import { Button } from '@pedidos/core/ui'
import { useAuth } from '@/hooks/useAuth'
import { BRAND } from '@/lib/brand'

export function Header() {
  const { user, tenant, tenants, logout } = useAuth()

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <img src={BRAND.icon} alt="" className="h-6 w-6 object-contain" />
        <span className="font-semibold text-primary">{BRAND.name}</span>
        {/* Nome da organização só aparece quando há mais de uma (evita "Fermentou! / Fermentou") */}
        {tenant && tenants.length > 1 && (
          <span className="text-muted-foreground text-sm ml-2">/ {tenant.name}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {user && <span className="hidden lg:inline text-sm text-muted-foreground">{user.name}</span>}
        <Button variant="ghost" size="icon" onClick={logout} title="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
