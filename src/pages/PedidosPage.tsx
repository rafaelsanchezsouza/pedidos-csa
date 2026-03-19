import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { offeringsApi, ordersApi } from '@/services/api'
import type { WeeklyOffering, Order, OrderItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

function getWeekStart(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export function PedidosPage() {
  const { user, colmeia } = useAuth()
  const [offerings, setOfferings] = useState<WeeklyOffering[]>([])
  const [order, setOrder] = useState<Order | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const weekId = getWeekStart()

  const load = useCallback(async () => {
    if (!colmeia) return
    setLoading(true)
    try {
      const [offs, myOrder] = await Promise.all([
        offeringsApi.list(weekId, colmeia.id),
        ordersApi.getMy(weekId, colmeia.id),
      ])
      setOfferings(offs)
      setOrder(myOrder)
      if (myOrder) {
        const q: Record<string, number> = {}
        myOrder.items.forEach((i) => { q[i.productId] = i.qty })
        setQuantities(q)
      }
    } finally {
      setLoading(false)
    }
  }, [colmeia, weekId])

  useEffect(() => { load() }, [load])

  function setQty(productId: string, val: string) {
    const n = parseInt(val, 10)
    setQuantities((prev) => ({ ...prev, [productId]: isNaN(n) || n < 0 ? 0 : n }))
  }

  async function handleSave() {
    if (!user || !colmeia) return
    setSaving(true)
    setMessage('')
    try {
      const items: OrderItem[] = []
      offerings.forEach((off) => {
        off.items.forEach((item) => {
          const qty = quantities[item.productId] || 0
          if (qty > 0) {
            items.push({
              productId: item.productId,
              productName: item.productName,
              unit: item.unit,
              price: item.price,
              qty,
            })
          }
        })
      })

      if (order) {
        await ordersApi.update(order.id, { items, status: 'enviado' }, colmeia.id)
      } else {
        await ordersApi.create({
          userId: user.id,
          userName: user.name,
          colmeiaId: colmeia.id,
          weekId,
          items,
          status: 'enviado',
        }, colmeia.id)
      }
      setMessage('Pedido salvo com sucesso!')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao salvar pedido')
    } finally {
      setSaving(false)
    }
  }

  const total = offerings.flatMap((o) => o.items).reduce((sum, item) => {
    return sum + item.price * (quantities[item.productId] || 0)
  }, 0)

  if (loading) return <div className="text-muted-foreground">Carregando...</div>

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pedido da Semana</h1>
          <p className="text-muted-foreground text-sm">Semana de {weekId}</p>
        </div>
        {order && (
          <Badge variant={order.status === 'enviado' ? 'default' : 'secondary'}>
            {order.status === 'enviado' ? 'Enviado' : 'Rascunho'}
          </Badge>
        )}
      </div>

      {offerings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma oferta disponível para esta semana.
          </CardContent>
        </Card>
      ) : (
        offerings.map((offering) => (
          <Card key={offering.id}>
            <CardHeader>
              <CardTitle className="text-lg">{offering.producerName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {offering.items.map((item) => (
                <div key={item.productId} className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <span className="font-medium">{item.productName}</span>
                    <span className="text-muted-foreground text-sm ml-2">({item.unit})</span>
                    <Badge variant={item.type === 'fixo' ? 'default' : 'secondary'} className="ml-2 text-xs">
                      {item.type}
                    </Badge>
                  </div>
                  <span className="text-sm text-muted-foreground w-16 text-right">
                    R$ {item.price.toFixed(2)}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={quantities[item.productId] || 0}
                    onChange={(e) => setQty(item.productId, e.target.value)}
                    className="w-20 text-center"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {offerings.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-lg font-semibold">
            Total: R$ {total.toFixed(2)}
          </div>
          <div className="flex items-center gap-3">
            {message && <span className="text-sm text-muted-foreground">{message}</span>}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : order ? 'Atualizar Pedido' : 'Enviar Pedido'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
