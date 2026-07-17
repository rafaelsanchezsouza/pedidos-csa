import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ordersApi, usersApi } from '@/services/api'
import type { Order, User } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { StickyNote, Ban, MapPin } from 'lucide-react'
import { getWeekStart, getWeekDelivery, isFixoWeek, isUserDeliveryWeek } from '@/lib/weekUtils'
import { WeekNavigator } from '@/components/WeekNavigator'
import { PageHeader } from '@/components/PageHeader'
import { EstadoLista } from '@/components/EstadoLista'

export function EntregasPage() {
  const { colmeia } = useAuth()
  const [weekId, setWeekId] = useState(getWeekStart())
  const [orders, setOrders] = useState<Order[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [reportOpen, setReportOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingNote, setEditingNote] = useState<{ userId: string; userName: string; order: Order | null } | null>(null)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [togglingSuspend, setTogglingSuspend] = useState<string | null>(null)
  const [editingAddress, setEditingAddress] = useState<{ userId: string; userName: string; order: Order | null; defaultAddress: string } | null>(null)
  const [addressText, setAddressText] = useState('')
  const [savingAddress, setSavingAddress] = useState(false)

  const load = useCallback(async () => {
    if (!colmeia) return
    setLoading(true)
    try {
      const [ords, us] = await Promise.all([
        ordersApi.getConsolidated(weekId, colmeia.id),
        usersApi.list(colmeia.id),
      ])
      setOrders(ords)
      setUsers(us)
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
    if (orderByUser.get(u.id)?.doacao) return false
    return true
  })

  const porEntrega = activeUsers.filter((u) => u.deliveryType === 'entrega')

  function buildReport(): string {
    const delivery = getWeekDelivery(weekId)
    const [y, m, d] = delivery.split('-')
    const dataStr = `${d}/${m}/${y}`

    function userLines(list: User[]): string {
      return list.map((u) => {
        const order = orderByUser.get(u.id)
        if (order?.suspensa) return null
        const lines = [u.name, '--------------------------', u.quota, u.neighborhood, order?.weeklyAddress ?? u.address, u.contact]
        if (order?.weeklyNote) lines.push(`⚠ ${order.weeklyNote}`)
        if (order?.status === 'enviado' && order.items.length > 0) {
          order.items.forEach((i) => lines.push(`- ${i.qty} ${i.unit} ${i.productName}`))
        }
        return lines.join('\n')
      }).filter(Boolean).join('\n\n')
    }

    const parts: string[] = [`Entregas — ${dataStr}`]
    if (porEntrega.length > 0) {
      parts.push(userLines(porEntrega))
    }
    return parts.join('\n\n')
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function openEditNote(u: User) {
    const order = orderByUser.get(u.id) ?? null
    setNoteText(order?.weeklyNote ?? '')
    setEditingNote({ userId: u.id, userName: u.name, order })
  }

  async function saveNote() {
    if (!colmeia || !editingNote) return
    setSavingNote(true)
    try {
      const { userId, userName, order } = editingNote
      if (order) {
        await ordersApi.update(order.id, { weeklyNote: noteText }, colmeia.id)
        setOrders((prev) => prev.map((o) => o.userId === userId ? { ...o, weeklyNote: noteText } : o))
      } else {
        const created = await ordersApi.create({
          userId, userName, colmeiaId: colmeia.id, weekId, items: [], status: 'rascunho', weeklyNote: noteText,
        }, colmeia.id)
        setOrders((prev) => [...prev, created])
      }
      setEditingNote(null)
      setNoteText('')
    } finally {
      setSavingNote(false)
    }
  }

  function openEditAddress(u: User) {
    const order = orderByUser.get(u.id) ?? null
    setAddressText(order?.weeklyAddress ?? u.address ?? '')
    setEditingAddress({ userId: u.id, userName: u.name, order, defaultAddress: u.address ?? '' })
  }

  async function saveAddress() {
    if (!colmeia || !editingAddress) return
    setSavingAddress(true)
    try {
      const { userId, userName, order } = editingAddress
      if (order) {
        await ordersApi.update(order.id, { weeklyAddress: addressText }, colmeia.id)
        setOrders((prev) => prev.map((o) => o.userId === userId ? { ...o, weeklyAddress: addressText } : o))
      } else {
        const created = await ordersApi.create({
          userId, userName, colmeiaId: colmeia.id, weekId, items: [], status: 'rascunho', weeklyAddress: addressText,
        }, colmeia.id)
        setOrders((prev) => [...prev, created])
      }
      setEditingAddress(null)
      setAddressText('')
    } finally {
      setSavingAddress(false)
    }
  }

  async function handleSuspend(u: User) {
    if (!colmeia) return
    setTogglingSuspend(u.id)
    try {
      const order = orderByUser.get(u.id)
      if (order) {
        const novoValor = !order.suspensa
        await ordersApi.update(order.id, { suspensa: novoValor }, colmeia.id)
        setOrders((prev) => prev.map((o) => o.userId === u.id ? { ...o, suspensa: novoValor } : o))
      } else {
        const created = await ordersApi.create({
          userId: u.id, userName: u.name, colmeiaId: colmeia.id, weekId, items: [], status: 'rascunho', suspensa: true,
        }, colmeia.id)
        setOrders((prev) => [...prev, created])
      }
    } finally {
      setTogglingSuspend(null)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Entregas da Semana"
        subtitle={fixoThisWeek ? 'Semana de fixo (quinzenais recebem)' : 'Semana sem fixo (quinzenais não recebem)'}
        secondaryAction={
          <Button variant="outline" size="sm" onClick={() => { setReportOpen(true); setCopied(false) }} disabled={loading || activeUsers.length === 0}>
            Relatório
          </Button>
        }
        dateNav={<WeekNavigator weekId={weekId} onChange={setWeekId} />}
      />

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Relatório de Entregas</DialogTitle>
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
                <Button className="w-full" onClick={() => handleCopy(text)}>
                  {copied ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={editingAddress !== null} onOpenChange={(open) => { if (!open) { setEditingAddress(null); setAddressText('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Endereço da semana — {editingAddress?.userName}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-1">
            <input
              type="text"
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
              placeholder={editingAddress?.defaultAddress}
              className="w-full text-sm border rounded px-2 py-1.5 bg-background"
            />
            {editingAddress?.defaultAddress && (
              <p className="text-xs text-muted-foreground">Padrão: {editingAddress.defaultAddress}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingAddress(null); setAddressText('') }}>Cancelar</Button>
            <Button disabled={savingAddress} onClick={saveAddress}>
              {savingAddress ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingNote !== null} onOpenChange={(open) => { if (!open) { setEditingNote(null); setNoteText('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nota da semana — {editingNote?.userName}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <textarea
              rows={3}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Ex: horário especial, doação pontual..."
              className="w-full text-sm border rounded px-2 py-1.5 resize-none bg-background"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingNote(null); setNoteText('') }}>Cancelar</Button>
            <Button disabled={savingNote} onClick={saveNote}>
              {savingNote ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EstadoLista
        loading={loading}
        vazio={activeUsers.length === 0}
        mensagemVazia="Nenhum membro ativo para esta semana."
      >
        {porEntrega.length === 0 ? null : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Entrega em Domicílio</span>
              <span className="text-sm font-normal text-muted-foreground">{porEntrega.length} membros</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left px-4 py-2">Membro</th>
                  <th className="text-left px-4 py-2">Extras</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="px-4">
                {porEntrega.map((u) => {
                  const order = orderByUser.get(u.id)
                  const suspensa = order?.suspensa ?? false
                  const isSuspending = togglingSuspend === u.id
                  return (
                    <tr key={u.id} className={`border-b last:border-0 ${suspensa ? 'opacity-50 bg-gray-50' : ''}`}>
                      <td className="px-4 py-2 font-medium">
                        <div className={suspensa ? 'line-through text-muted-foreground' : ''}>{u.name}</div>
                        {u.quota && (
                          <div className="text-xs text-muted-foreground">{u.quota}</div>
                        )}
                        {u.contact && (
                          <div className="text-xs text-muted-foreground">{u.contact}</div>
                        )}
                        {u.frequency === 'quinzenal' && (
                          <span className="text-xs text-muted-foreground">quinzenal</span>
                        )}
                        {order?.weeklyAddress ? (
                          <div className="text-xs text-blue-700 font-medium">{order.weeklyAddress}</div>
                        ) : u.address ? (
                          <div className="text-xs text-muted-foreground">{u.address}</div>
                        ) : null}
                        {order?.weeklyNote && (
                          <div className="mt-0.5 text-xs bg-yellow-100 text-yellow-800 rounded px-1 inline-block">{order.weeklyNote}</div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {order ? (
                          <div className="space-y-0.5">
                            {order.items.map((item, i) => (
                              <div key={`${item.offeringId}_${item.productId}_${i}`}>
                                {item.productName} × {item.qty} {item.unit}
                              </div>
                            ))}
                            {order.items.length === 0 && <span className="text-muted-foreground">—</span>}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => openEditAddress(u)}
                            className={`${order?.weeklyAddress ? 'text-blue-600' : 'text-muted-foreground hover:text-foreground'}`}
                            title="Endereço da semana"
                          >
                            <MapPin className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEditNote(u)}
                            className={`${order?.weeklyNote ? 'text-yellow-500' : 'text-muted-foreground hover:text-foreground'}`}
                            title="Nota da semana"
                          >
                            <StickyNote className="h-4 w-4" />
                          </button>
                          <button
                            disabled={isSuspending}
                            onClick={() => handleSuspend(u)}
                            className={`${suspensa ? 'text-red-500' : 'text-muted-foreground hover:text-red-400'} ${isSuspending ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={suspensa ? 'Reativar entrega' : 'Suspender entrega esta semana'}
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
        )}
      </EstadoLista>
    </div>
  )
}
