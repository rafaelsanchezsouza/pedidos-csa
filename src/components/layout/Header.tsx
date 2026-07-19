import { LogOut, Leaf } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { APP_NAME } from '@/lib/brand'

export function Header() {
  const { user, tenant, logout } = useAuth()

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <Leaf className="h-5 w-5 text-primary" />
        <span className="font-semibold text-primary">{APP_NAME}</span>
        {tenant && (
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
