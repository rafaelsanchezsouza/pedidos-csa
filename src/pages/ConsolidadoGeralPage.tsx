import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ordersApi, usersApi, offeringsApi } from '@/services/api'
import type { Order, User, WeeklyOffering } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Pencil } from 'lucide-react'
import { getWeekStart, getWeekDelivery, isFixoWeek, isUserDeliveryWeek } from '@/lib/weekUtils'
import { WeekNavigator } from '@/components/WeekNavigator'

export function ConsolidadoGeralPage() {
  const { colmeia } = useAuth()
  const [weekId, setWeekId] = useState(getWeekStart())
  const [orders, setOrders] = useState<Order[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [offerings, setOfferings] = useState<WeeklyOffering[]>([])
  const [loading, setLoading] = useState(true)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportCopied, setReportCopied] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [togglingDoacao, setTogglingDoacao] = useState<string | null>(null)
  const [editingOrder, setEditingOrder] = useState<{ order: Order; userName: string } | null>(null)
  const [editedQtys, setEditedQtys] = useState<Record<string, number>>({})
  const [savingOrder, setSavingOrder] = useState(false)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!colmeia) return
    setLoading(true)
    setTexts({})
    try {
      const [ords, us, offs] = await Promise.all([
        ordersApi.getConsolidated(weekId, colmeia.id),
        usersApi.list(colmeia.id),
        offeringsApi.list(weekId, colmeia.id),
      ])
      setOrders(ords)
      setUsers(us)
      setOfferings(offs)
    } finally {
      setLoading(false)
    }
  }, [colmeia, weekId])

  useEffect(() => { load() }, [load])

  const fixoThisWeek = isFixoWeek(weekId)

  const orderByUser = new Map<string, Order>()
  orders.forEach((o) => orderByUser.set(o.userId, o))

  const activeUsers = users.filter((u) => {
    if (u.disabled || u.deleted) return false
    if (u.acesso === 'produtor') return false
    if (!isUserDeliveryWeek(u, weekId)) return false
    return true
  })

  async function handleDoacao(u: User, doacao: boolean) {
    if (!colmeia) return
    setTogglingDoacao(u.id)
    try {
      const order = orderByUser.get(u.id)
      if (order) {
        await ordersApi.update(order.id, { doacao }, colmeia.id)
        setOrders((prev) => prev.map((o) => o.userId === u.id ? { ...o, doacao } : o))
      } else {
        const created = await ordersApi.create({
          userId: u.id, userName: u.name, colmeiaId: colmeia.id,
          weekId, items: [], status: 'rascunho', doacao,
        }, colmeia.id)
        setOrders((prev) => [...prev, created])
      }
    } finally {
      setTogglingDoacao(null)
    }
  }

  async function handleRecebido(u: User, recebido: boolean) {
    if (!colmeia) return
    setToggling(u.id)
    try {
      const updated = await ordersApi.toggleRecebido(u.id, u.name, weekId, colmeia.id, recebido)
      setOrders((prev) => {
        const existing = prev.find((o) => o.userId === u.id)
        if (existing) {
          return prev.map((o) => o.userId === u.id ? { ...o, recebido: updated.recebido } : o)
        }
        return [...prev, { id: updated.id, userId: u.id, userName: u.name, colmeiaId: colmeia.id, weekId, items: [], status: 'rascunho', recebido: updated.recebido, dateCreated: '', dateUpdated: '' }]
      })
    } finally {
      setToggling(null)
    }
  }

  function openEditOrder(order: Order, userName: string) {
    const qtys: Record<string, number> = {}
    order.items.forEach((i) => { qtys[i.productId] = i.qty })
    setEditedQtys(qtys)
    setEditingOrder({ order, userName })
  }

  async function saveOrderEdits() {
    if (!colmeia || !editingOrder) return
    setSavingOrder(true)
    try {
      const { order } = editingOrder
      const updatedItems = order.items.map((i) => ({ ...i, qty: editedQtys[i.productId] ?? i.qty }))
      await ordersApi.update(order.id, { items: updatedItems }, colmeia.id)
      setEditingOrder(null)
      setEditedQtys({})
      await load()
    } finally {
      setSavingOrder(false)
    }
  }

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

  async function handleCopyText(producerId: string) {
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

  function buildReport(): string {
    const delivery = getWeekDelivery(weekId)
    const [y, m, d] = delivery.split('-')
    const dataStr = `${d}/${m}/${y}`

    const lines = [`Consolidado — ${dataStr}`]
    activeUsers.forEach((u) => {
      const order = orderByUser.get(u.id)
      const parts = [u.name, '--------------------------', u.quota, u.neighborhood, u.address, u.contact]
      if (order?.doacao) parts.push('⟶ DOAÇÃO')
      if (order?.recebido) parts.push('⟶ RECEBIDO')
      if (order?.status === 'enviado' && order.items.length > 0) {
        order.items.forEach((i) => parts.push(`- ${i.qty} ${i.unit} ${i.productName}`))
      }
      lines.push(parts.join('\n'))
    })
    return lines.join('\n\n')
  }

  async function handleCopyReport(text: string) {
    await navigator.clipboard.writeText(text)
    setReportCopied(true)
    setTimeout(() => setReportCopied(false), 2000)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Consolidado</h1>
          <p className="text-muted-foreground text-sm">
            {fixoThisWeek ? 'Semana de fixo (quinzenais recebem)' : 'Semana sem fixo (quinzenais não recebem)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setReportOpen(true); setReportCopied(false) }} disabled={loading || activeUsers.length === 0}>
            Relatório
          </Button>
          <WeekNavigator weekId={weekId} onChange={setWeekId} />
        </div>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Relatório Consolidado Geral</DialogTitle>
          </DialogHeader>
          {reportOpen && (() => {
            const text = buildReport()
            return (
              <div className="space-y-3">
                <textarea
                  readOnly
                  value={text}
                  className="w-full h-72 text-sm font-mono border rounded p-2 resize-none bg-muted"
                />
                <Button className="w-full" onClick={() => handleCopyReport(text)}>
                  {reportCopied ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={editingOrder !== null} onOpenChange={(open) => { if (!open) { setEditingOrder(null); setEditedQtys({}) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar pedido — {editingOrder?.userName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {editingOrder?.order.items.map((item) => (
              <div key={item.productId} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{item.productName}</span>
                <input
                  type="number"
                  min="0"
                  value={editedQtys[item.productId] ?? item.qty}
                  className="w-14 text-right border rounded px-1 bg-background"
                  onChange={(e) => setEditedQtys((p) => ({ ...p, [item.productId]: Number(e.target.value) }))}
                />
                <span className="text-muted-foreground w-8">{item.unit}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingOrder(null); setEditedQtys({}) }}>Cancelar</Button>
            <Button disabled={savingOrder} onClick={saveOrderEdits}>
              {savingOrder ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Carregando...</div>
      ) : (
        <>
          {/* Tabela de membros */}
          {activeUsers.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum membro ativo para esta semana.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Todos os membros</span>
                  <span className="text-sm font-normal text-muted-foreground">{activeUsers.length} membros</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left px-4 py-2">Membro</th>
                      <th className="text-left px-4 py-2">Extras</th>
                      <th className="text-center px-3 py-2">Doação</th>
                      <th className="text-center px-3 py-2">Recebido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeUsers.map((u) => {
                      const order = orderByUser.get(u.id)
                      const isTogglingThis = toggling === u.id
                      const isTogglingDoacao = togglingDoacao === u.id
                      return (
                        <tr key={u.id} className={`border-b last:border-0 ${order?.doacao ? 'bg-orange-50' : ''}`}>
                          <td className="px-4 py-2 font-medium">
                            <div className="flex items-center gap-1.5">
                              {order && order.items.length > 0 && (
                                <button
                                  onClick={() => openEditOrder(order, u.name)}
                                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <span>{u.name}</span>
                            </div>
                            {u.quota && <div className="text-xs text-muted-foreground">{u.quota}</div>}
                            {u.contact && <div className="text-xs text-muted-foreground">{u.contact}</div>}
                            {u.deliveryType === 'colmeia' && (
                              <div className="text-xs text-blue-600">retira na colmeia</div>
                            )}
                            {u.frequency === 'quinzenal' && (
                              <div className="text-xs text-muted-foreground">quinzenal</div>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {order && order.items.length > 0 ? (
                              <div className="space-y-0.5">
                                {order.items.map((item, i) => (
                                  <div key={`${item.offeringId}_${item.productId}_${i}`} className="text-sm">
                                    {item.productName} × {item.qty} {item.unit}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              disabled={isTogglingDoacao}
                              onClick={() => handleDoacao(u, !order?.doacao)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                                order?.doacao
                                  ? 'bg-orange-400 border-orange-400 text-white'
                                  : 'border-gray-300 hover:border-orange-300'
                              } ${isTogglingDoacao ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {order?.doacao && <span className="text-xs leading-none">✓</span>}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              disabled={isTogglingThis}
                              onClick={() => handleRecebido(u, !order?.recebido)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                                order?.recebido
                                  ? 'bg-green-500 border-green-500 text-white'
                                  : 'border-gray-300 hover:border-green-400'
                              } ${isTogglingThis ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {order?.recebido && <span className="text-xs leading-none">✓</span>}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Pedido por agricultor */}
          {offerings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pedido por agricultor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {offerings.map((offering) => (
                  <div key={offering.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{offering.producerName}</span>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={generating === offering.producerId}
                          onClick={() => handleGenerate(offering.producerId)}
                        >
                          {generating === offering.producerId ? 'Gerando...' : 'Gerar texto WhatsApp'}
                        </Button>
                        {texts[offering.producerId] && (
                          <Button size="sm" variant="outline" onClick={() => handleCopyText(offering.producerId)}>
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
                    </div>
                    {texts[offering.producerId] && (
                      <pre className="text-sm bg-muted rounded p-3 whitespace-pre-wrap font-mono">
                        {texts[offering.producerId]}
                      </pre>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
