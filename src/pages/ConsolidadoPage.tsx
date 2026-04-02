import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { offeringsApi, ordersApi } from '@/services/api'
import type { WeeklyOffering, Order } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function getWeekStart(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function weekOptions(): string[] {
  const weeks: string[] = []
  const d = new Date()
  for (let i = 0; i < 8; i++) {
    weeks.push(getWeekStart(d))
    d.setDate(d.getDate() - 7)
  }
  return weeks
}

export function ConsolidadoPage() {
  const { colmeia } = useAuth()
  const [weekId, setWeekId] = useState(getWeekStart())
  const [offerings, setOfferings] = useState<WeeklyOffering[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!colmeia) return
    setLoading(true)
    setTexts({})
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

  const sentOrders = orders.filter((o) => o.status === 'enviado')

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Consolidado</h1>
          <p className="text-muted-foreground text-sm">{sentOrders.length} pedido(s) enviado(s)</p>
        </div>
        <select
          value={weekId}
          onChange={(e) => setWeekId(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          {weekOptions().map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
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

          // Aggregate totals per product
          const totals = new Map<string, { name: string; unit: string; qty: number; type: string }>()
          for (const order of relevantOrders) {
            for (const item of order.items) {
              const oi = offering.items.find((i) => i.productId === item.productId)
              if (!oi) continue
              const existing = totals.get(item.productId)
              if (existing) {
                existing.qty += item.qty
              } else {
                totals.set(item.productId, { name: item.productName, unit: item.unit, qty: item.qty, type: oi.type })
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
                          <th className="py-1">Tipo</th>
                          <th className="text-right py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.name} className="border-b last:border-0">
                            <td className="py-1.5 font-medium">{item.name}</td>
                            <td className="py-1.5 text-muted-foreground">{item.unit}</td>
                            <td className="py-1.5 text-center">
                              <Badge variant={item.type === 'fixo' ? 'default' : 'secondary'} className="text-xs">
                                {item.type}
                              </Badge>
                            </td>
                            <td className="py-1.5 text-right font-semibold">{item.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="space-y-1 pt-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Membros</p>
                      {relevantOrders.map((order) => {
                        const userItems = order.items.filter((i) =>
                          offering.items.some((oi) => oi.productId === i.productId)
                        )
                        return (
                          <div key={order.id} className="text-sm flex gap-2">
                            <span className="font-medium w-36 shrink-0">{order.userName}</span>
                            <span className="text-muted-foreground">
                              {userItems.map((i) => `${i.productName} ×${i.qty}`).join(', ')}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                <div className="flex items-center gap-2 pt-1">
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
