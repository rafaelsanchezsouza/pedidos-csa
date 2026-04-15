import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { offeringsApi, ordersApi } from '@/services/api'
import type { WeeklyOffering, Order, OrderItem } from '@/types'
import { Minus, Plus, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getWeekDelivery, getPresentWeekId, isUserDeliveryWeek } from '@/lib/weekUtils'
import { WeekNavigator } from '@/components/WeekNavigator'

export function PedidosPage() {
  const { user, colmeia } = useAuth()
  const [offerings, setOfferings] = useState<WeeklyOffering[]>([])
  const [order, setOrder] = useState<Order | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [weekId, setWeekId] = useState(getPresentWeekId())
  const [locked, setLocked] = useState(false)
  const showFixo = user ? isUserDeliveryWeek(user, weekId) : true
  const isAdmin = user?.acesso === 'admin' || user?.acesso === 'superadmin'

  const load = useCallback(async () => {
    if (!colmeia) return
    setLoading(true)
    setQuantities({})
    try {
      const [offs, myOrder, lockStatus] = await Promise.all([
        offeringsApi.list(weekId, colmeia.id),
        ordersApi.getMy(weekId, colmeia.id),
        ordersApi.getWeekLock(weekId, colmeia.id),
      ])
      setOfferings(offs)
      setOrder(myOrder)
      setLocked(lockStatus.locked)
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

  async function handleDoacao(doacao: boolean) {
    if (!user || !colmeia) return
    setSaving(true)
    setMessage('')
    try {
      if (order) {
        await ordersApi.update(order.id, { doacao }, colmeia.id)
      } else {
        await ordersApi.create({
          userId: user.id,
          userName: user.name,
          colmeiaId: colmeia.id,
          weekId,
          items: [],
          status: 'rascunho',
          doacao,
        }, colmeia.id)
      }
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao atualizar')
    } finally {
      setSaving(false)
    }
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
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Extras</h1>
          {order && (
            <Badge variant={order.status === 'enviado' ? 'default' : 'secondary'}>
              {order.status === 'enviado' ? 'Enviado' : 'Rascunho'}
            </Badge>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-sm text-muted-foreground mr-9">Entrega em</span>
          <WeekNavigator weekId={weekId} onChange={setWeekId} />
        </div>
      </div>

      {locked && !isAdmin && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="py-3 text-sm text-yellow-800">
            Pedido bloqueado — o pedido desta semana já foi enviado ao produtor. Contate o administrador para alterações.
          </CardContent>
        </Card>
      )}

      <Card
        className={order?.doacao ? 'border-orange-300 bg-orange-50 cursor-pointer' : locked && !isAdmin ? 'opacity-50' : 'cursor-pointer hover:bg-muted/50'}
        onClick={() => !saving && (!locked || isAdmin) && handleDoacao(!order?.doacao)}
      >
        <CardContent className="py-3 flex items-center gap-3">
          <Heart className={`h-4 w-4 flex-shrink-0 ${order?.doacao ? 'fill-orange-500 text-orange-500' : 'text-muted-foreground'}`} />
          <div>
            <p className={`text-sm font-medium ${order?.doacao ? 'text-orange-800' : 'text-muted-foreground'}`}>
              {order?.doacao ? 'Cota marcada para doação' : 'Marcar para doação'}
            </p>
            {order?.doacao && (
              <p className="text-xs text-orange-700">Você não receberá entrega esta semana. Clique para cancelar.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {user?.frequency === 'quinzenal' && !showFixo && (
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
                    </div>
                  <span className="text-sm text-muted-foreground w-16 text-right">
                    R$ {item.price.toFixed(2)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-10 w-10"
                      disabled={locked && !isAdmin}
                      onClick={() => setQty(key, qty - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium tabular-nums">{qty}</span>
                    <Button variant="outline" size="icon" className="h-10 w-10"
                      disabled={locked && !isAdmin}
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
        <div className="sticky bottom-0 bg-background border-t flex items-center justify-between py-2">
          <div className="text-base font-semibold">
            Total: R$ {total.toFixed(2)}
          </div>
          <div className="flex items-center gap-3">
            {message && <span className="text-sm text-muted-foreground">{message}</span>}
            <Button size="sm" onClick={handleSave} disabled={saving || (locked && !isAdmin)}>
              {saving ? 'Salvando...' : order ? 'Atualizar Pedido' : 'Enviar Pedido'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
