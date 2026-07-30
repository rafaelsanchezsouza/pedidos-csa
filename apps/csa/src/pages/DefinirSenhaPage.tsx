import { useState, FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Leaf } from 'lucide-react'
import { updatePassword } from 'firebase/auth'
import { useAuth } from '@/hooks/useAuth'
import { usersApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function DefinirSenhaPage() {
  const { firebaseUser, user, loading, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>
  if (!firebaseUser) return <Navigate to="/login" replace />
  if (!user?.mustChangePassword) return <Navigate to="/pedidos" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('A senha deve ter ao menos 6 caracteres'); return }
    if (password !== confirm) { setError('As senhas não coincidem'); return }
    setSubmitting(true)
    try {
      await updatePassword(firebaseUser!, password)
      await usersApi.updateMe({ mustChangePassword: false })
      await refreshUser()
      navigate('/pedidos', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao definir senha')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Leaf className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Bem-vindo(a), {user.name.split(' ')[0]}!</CardTitle>
          <CardDescription>Defina sua senha para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar senha</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Definir senha'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
