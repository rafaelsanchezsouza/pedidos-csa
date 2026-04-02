import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { offeringsApi, ordersApi } from '@/services/api'
import type { WeeklyOffering, Order, OrderItem } from '@/types'
import { Minus, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getWeekStart, getWeekDelivery, getPresentWeekId, shiftWeek, isFixoWeek, weekOptions } from '@/lib/weekUtils'

export function PedidosPage() {
  const { user, colmeia } = useAuth()
  const [offerings, setOfferings] = useState<WeeklyOffering[]>([])
  const [order, setOrder] = useState<Order | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [weekId, setWeekId] = useState(getPresentWeekId())
  const quinzenal = user?.frequency === 'quinzenal'
  const fixoThisWeek = isFixoWeek(weekId)
  const showFixo = !quinzenal || fixoThisWeek

  const load = useCallback(async () => {
    if (!colmeia) return
    setLoading(true)
    setQuantities({})
    try {
      const [offs, myOrder] = await Promise.all([
        offeringsApi.list(weekId, colmeia.id),
        ordersApi.getMy(weekId, colmeia.id),
      ])
      setOfferings(offs)
      setOrder(myOrder)
      if (myOrder) {
        const q: Record<string, number> = {}
        offs.forEach((off) => {
          off.items.forEach((item) => {
            const saved = myOrder.items.find((oi) => oi.productId === item.productId)
            if (saved) q[`${off.id}_${item.productId}`] = saved.qty
          })
        })
        setQuantities(q)
      }
    } finally {
      setLoading(false)
    }
  }, [colmeia, weekId])

  useEffect(() => { load() }, [load])

  function qtyKey(offeringId: string, productId: string) {
    return `${offeringId}_${productId}`
  }

  function setQty(key: string, n: number) {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(0, n) }))
  }

  async function handleSave() {
    if (!user || !colmeia) return
    setSaving(true)
    setMessage('')
    try {
      const items: OrderItem[] = []
      offerings.forEach((off) => {
        off.items.forEach((item) => {
          const qty = quantities[qtyKey(off.id, item.productId)] || 0
          if (qty > 0) {
            items.push({
              productId: item.productId,
              productName: item.productName,
              unit: item.unit,
              price: item.price,
              qty,
              offeringId: off.id,
              producerName: off.producerName,
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

  const total = offerings.reduce((sum, off) => {
    return sum + off.items
      .filter((i) => showFixo || i.type !== 'fixo')
      .reduce((s, item) => s + item.price * (quantities[qtyKey(off.id, item.productId)] || 0), 0)
  }, 0)

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Pedido da Semana</h1>
            {order && (
              <Badge variant={order.status === 'enviado' ? 'default' : 'secondary'}>
                {order.status === 'enviado' ? 'Enviado' : 'Rascunho'}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">Entrega em {getWeekDelivery(weekId)}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekId(shiftWeek(weekId, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <select
              value={weekId}
              onChange={(e) => setWeekId(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              {weekOptions().map((w) => (
                <option key={w} value={w}>{getWeekDelivery(w)}</option>
              ))}
            </select>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekId(shiftWeek(weekId, 1))} disabled={weekId >= getPresentWeekId()}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {quinzenal && !fixoThisWeek && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-800">
            Esta semana você não recebe itens fixos (frequência quinzenal). Apenas extras estão disponíveis.
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Carregando...</div>
      ) : offerings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma oferta disponível para esta semana.
          </CardContent>
        </Card>
      ) : (
        offerings.map((offering) => {
          const visibleItems = offering.items.filter((i) => showFixo || i.type !== 'fixo')
          if (visibleItems.length === 0) return null
          return (
          <Card key={offering.id}>
            <CardHeader>
              <CardTitle className="text-lg">{offering.producerName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {visibleItems.map((item) => {
                const key = qtyKey(offering.id, item.productId)
                const qty = quantities[key] || 0
                return (
                <div key={key} className="flex items-center justify-between gap-4">
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
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => setQty(key, qty - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium tabular-nums">{qty}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => setQty(key, qty + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                )
              })}
            </CardContent>
          </Card>
          )
        })
      )}

      {!loading && offerings.length > 0 && (
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
