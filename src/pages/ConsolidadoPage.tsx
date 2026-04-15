import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { offeringsApi, ordersApi } from '@/services/api'
import type { WeeklyOffering, Order } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getPresentWeekId, getWeekDelivery } from '@/lib/weekUtils'
import { WeekNavigator } from '@/components/WeekNavigator'

export function ConsolidadoPage() {
  const { colmeia } = useAuth()
  const [weekId, setWeekId] = useState(() => getPresentWeekId(colmeia?.weekChangeDay ?? 0))
  const [offerings, setOfferings] = useState<WeeklyOffering[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  // Edição de extras
  const [editedQtys, setEditedQtys] = useState<Record<string, Record<string, number>>>({})
  const [savingOrder, setSavingOrder] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!colmeia) return
    setLoading(true)
    setTexts({})
    setEditedQtys({})
    try {
      const [offs, ords] = await Promise.all([
        offeringsApi.list(weekId, colmeia.id),
        ordersApi.getConsolidated(weekId, colmeia.id),
      ])
      setOfferings(offs)
      setOrders(ords)
    } finally {
      setLoading(false)
    }
  }, [colmeia, weekId])

  useEffect(() => { load() }, [load])

  async function handleGenerate(producerId: string) {
    if (!colmeia) return
    setGenerating(producerId)
    try {
      const { text } = await ordersApi.getConsolidatedText(weekId, colmeia.id, producerId)
      setTexts((prev) => ({ ...prev, [producerId]: text }))
    } finally {
      setGenerating(null)
    }
  }

  async function handleCopy(producerId: string) {
    await navigator.clipboard.writeText(texts[producerId] ?? '')
    setCopied(producerId)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleSendWhatsApp(producerId: string) {
    if (!colmeia) return
    setSending(producerId)
    setSendError(null)
    try {
      await ordersApi.sendConsolidatedWhatsApp(weekId, colmeia.id, producerId)
      setSent(producerId)
      setTimeout(() => setSent(null), 2000)
    } catch (err) {
      setSendError(producerId)
      setTimeout(() => setSendError(null), 3000)
    } finally {
      setSending(null)
    }
  }

  async function handleSaveOrderEdits(order: Order, offering: WeeklyOffering) {
    if (!colmeia) return
    setSavingOrder(order.id)
    try {
      const changes = editedQtys[order.id] ?? {}
      const updatedItems = order.items.map((item) =>
        changes[item.productId] !== undefined ? { ...item, qty: changes[item.productId] } : item
      )
      await ordersApi.update(order.id, { items: updatedItems }, colmeia.id)
      setEditedQtys((prev) => { const next = { ...prev }; delete next[order.id]; return next })
      await load()
    } finally {
      setSavingOrder(null)
    }
  }

  const sentOrders = orders.filter((o) => o.status === 'enviado')

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Consolidado</h1>
          <p className="text-muted-foreground text-sm">Entrega em {getWeekDelivery(weekId)} · {sentOrders.length} pedido(s) enviado(s)</p>
        </div>
        <WeekNavigator weekId={weekId} onChange={setWeekId} />
      </div>

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Carregando...</div>
      ) : offerings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma oferta registrada para esta semana.
          </CardContent>
        </Card>
      ) : (
        offerings.map((offering) => {
          const relevantOrders = sentOrders.filter((o) =>
            o.items.some((i) => offering.items.some((oi) => oi.productId === i.productId))
          )

          // Aggregate totals per product (usando qtd editada se houver)
          const totals = new Map<string, { name: string; unit: string; qty: number; type: string }>()
          for (const order of relevantOrders) {
            for (const item of order.items) {
              const oi = offering.items.find((i) => i.productId === item.productId)
              if (!oi) continue
              const qty = editedQtys[order.id]?.[item.productId] ?? item.qty
              const existing = totals.get(item.productId)
              if (existing) {
                existing.qty += qty
              } else {
                totals.set(item.productId, { name: item.productName, unit: item.unit, qty, type: oi.type })
              }
            }
          }

          const items = [...totals.values()]

          return (
            <Card key={offering.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{offering.producerName}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {relevantOrders.length} pedido(s)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item pedido.</p>
                ) : (
                  <>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-1">Produto</th>
                          <th className="text-left py-1">Unid.</th>
                          <th className="text-right py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.name} className="border-b last:border-0">
                            <td className="py-1.5 font-medium">{item.name}</td>
                            <td className="py-1.5 text-muted-foreground">{item.unit}</td>
                            <td className="py-1.5 text-right font-semibold">{item.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Membros</p>
                      {relevantOrders.map((order) => {
                        const userItems = order.items.filter((i) =>
                          offering.items.some((oi) => oi.productId === i.productId)
                        )
                        const hasChanges = !!editedQtys[order.id]
                        return (
                          <div key={order.id} className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{order.userName}</span>
                              {hasChanges && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={savingOrder === order.id}
                                  onClick={() => handleSaveOrderEdits(order, offering)}
                                >
                                  {savingOrder === order.id ? 'Salvando...' : 'Salvar'}
                                </Button>
                              )}
                            </div>
                            {userItems.map((item) => {
                              const oi = offering.items.find((o) => o.productId === item.productId)
                              const isExtra = oi?.type === 'extra'
                              const currentQty = editedQtys[order.id]?.[item.productId] ?? item.qty
                              return (
                                <div key={item.productId} className="flex items-center gap-2 text-sm text-muted-foreground pl-2">
                                  <span className="flex-1">{item.productName}</span>
                                  {isExtra ? (
                                    <input
                                      type="number"
                                      min="0"
                                      value={currentQty}
                                      className="w-14 text-right border rounded px-1 bg-background"
                                      onChange={(e) => setEditedQtys((prev) => ({
                                        ...prev,
                                        [order.id]: { ...(prev[order.id] ?? {}), [item.productId]: Number(e.target.value) },
                                      }))}
                                    />
                                  ) : (
                                    <span>{currentQty}</span>
                                  )}
                                  <span>{item.unit}</span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={generating === offering.producerId}
                    onClick={() => handleGenerate(offering.producerId)}
                  >
                    {generating === offering.producerId ? 'Gerando...' : 'Gerar texto WhatsApp'}
                  </Button>
                  {texts[offering.producerId] && (
                    <Button size="sm" variant="outline" onClick={() => handleCopy(offering.producerId)}>
                      {copied === offering.producerId ? 'Copiado!' : 'Copiar'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={sending === offering.producerId}
                    onClick={() => handleSendWhatsApp(offering.producerId)}
                  >
                    {sending === offering.producerId ? 'Enviando...' : sent === offering.producerId ? 'Enviado!' : 'Enviar por WhatsApp'}
                  </Button>
                  {sendError === offering.producerId && (
                    <span className="text-xs text-destructive">Erro ao enviar</span>
                  )}
                </div>

                {texts[offering.producerId] && (
                  <pre className="text-sm bg-muted rounded p-3 whitespace-pre-wrap font-mono">
                    {texts[offering.producerId]}
                  </pre>
                )}
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
