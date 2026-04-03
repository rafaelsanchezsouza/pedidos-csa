import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usersApi } from '@/services/api'
import type { User } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function PerfilPage() {
  const { user, colmeia, refreshUser } = useAuth()
  const [form, setForm] = useState<Partial<User>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        address: user.address,
        neighborhood: user.neighborhood,
        contact: user.contact,
        frequency: user.frequency,
        deliveryType: user.deliveryType,
      })
    }
  }, [user])

  function set(field: keyof User, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      await usersApi.updateMe(form, colmeia?.id)
      await refreshUser()
      setMessage('Perfil atualizado!')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Meu Perfil</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground">{user.email}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Endereço</Label>
            <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Bairro</Label>
            <Input value={form.neighborhood ?? ''} onChange={(e) => set('neighborhood', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Contato (WhatsApp)</Label>
            <Input value={form.contact ?? ''} onChange={(e) => set('contact', e.target.value)} placeholder="+55 11 99999-9999" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Frequência</Label>
              <Select value={form.frequency} onValueChange={(v) => set('frequency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="quinzenal">Quinzenal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Retirada</Label>
              <Select value={form.deliveryType} onValueChange={(v) => set('deliveryType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="colmeia">Na colmeia</SelectItem>
                  <SelectItem value="entrega">Entrega</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {user.frequency === 'quinzenal' && user.quinzenalParity && (
            <div className="space-y-1">
              <Label>Ciclo quinzenal</Label>
              <p className="text-sm text-muted-foreground">
                {user.quinzenalParity === 'impar' ? 'Semana A' : 'Semana B'}
              </p>
            </div>
          )}
          {user.quota && (
            <div className="space-y-1">
              <Label>Cota</Label>
              <p className="text-sm text-muted-foreground">
                {user.quota}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
            {message && <span className="text-sm text-muted-foreground">{message}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
