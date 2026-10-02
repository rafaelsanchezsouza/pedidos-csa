import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { acolhidaApi, ordersApi, usersApi } from '@/services/api'
import type { AcolhidaWeek, Order, User } from '@/types'
import { formatQuota } from '@/lib/quota'
import { Card, CardContent, CardHeader, CardTitle, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, EstadoLista, WeekNavigator, Input } from '@pedidos/core/ui'
import { StickyNote, Ban, MapPin, GripVertical } from 'lucide-react'
import { getWeekStart, getWeekDelivery, isFixoWeek, isUserDeliveryWeek, emAcolhida, UTC_OFFSET_PADRAO } from '@pedidos/core'
import { config } from '@/config'
import { PageHeader } from '@pedidos/core/ui'
import { sortByDeliveryOrder, mergeReorder, isEntrega, isFornecedor } from '@pedidos/core'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function EntregasPage() {
  const { colmeia } = useAuth()
  const [weekId, setWeekId] = useState(getWeekStart())
  const [orders, setOrders] = useState<Order[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [confirmacoes, setConfirmacoes] = useState<AcolhidaWeek[]>([])
  const [loading, setLoading] = useState(true)
  const [reportOpen, setReportOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingNote, setEditingNote] = useState<{ userId: string; userName: string; order: Order | null } | null>(null)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [togglingSuspend, setTogglingSuspend] = useState<string | null>(null)
  const [editingAddress, setEditingAddress] = useState<{ userId: string; userName: string; order: Order | null; defaultAddress: string } | null>(null)
  const [busca, setBusca] = useState('')
  const [incluindo, setIncluindo] = useState<string | null>(null)
  const [addressText, setAddressText] = useState('')
  const [savingAddress, setSavingAddress] = useState(false)

  const load = useCallback(async () => {
    if (!colmeia) return
    setLoading(true)
    try {
      const [ords, us, confs] = await Promise.all([
        ordersApi.getConsolidated(weekId, colmeia.id),
        usersApi.list(colmeia.id),
        // Falha aqui não pode derrubar a lista de entrega: sem as confirmações a tela volta
        // ao comportamento antigo (todos aparecem), que é o lado seguro do erro.
        acolhidaApi.listSemana(weekId, colmeia.id).catch(() => [] as AcolhidaWeek[]),
      ])
      setOrders(ords)
      setUsers(us)
      setConfirmacoes(confs)
    } finally {
      setLoading(false)
    }
  }, [colmeia, weekId])

  useEffect(() => { load() }, [load])

  const fixoThisWeek = isFixoWeek(weekId)

  const orderByUser = new Map<string, Order>()
  orders.forEach((o) => orderByUser.set(o.userId, o))

  // Quem está em acolhida só entra na semana que confirmou. Sem isto o membro diz "esta
  // semana não" e continua na lista do motoboy.
  const confirmouSemana = new Map(confirmacoes.map((c) => [c.userId, c.confirmado]))
  const utcOffset = config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO

  // Quem pode aparecer, por cadastro — independe da semana.
  const elegivelBase = (u: User) => !u.disabled && !u.deleted && !isFornecedor(u)

  // Quem a semana traz sozinho: quinzenal na vez, não doou e, se em acolhida, confirmou.
  const naSemana = (u: User) =>
    isUserDeliveryWeek(u, weekId) &&
    !orderByUser.get(u.id)?.doacao &&
    !(emAcolhida(u, new Date(), utcOffset) && confirmouSemana.get(u.id) !== true)

  // Exceção da semana: o admin incluiu à mão. Vence os filtros semanais E o `isEntrega` —
  // o caso principal é justamente quem normalmente retira na colmeia e nesta semana precisa
  // receber em casa.
  const incluidaManual = (u: User) => orderByUser.get(u.id)?.incluida === true

  // Visíveis nesta semana, na ordem manual salva (novos caem no fim, alfabético).
  const porEntrega = sortByDeliveryOrder(
    users.filter((u) => elegivelBase(u) && (incluidaManual(u) || (naSemana(u) && isEntrega(u)))),
  )

  // Base do merge que preserva a posição de quem não aparece nesta semana. Precisa conter
  // todo mundo que PODE aparecer: sem os incluídos à mão, arrastar a lista com um membro de
  // retirada dentro dela o perderia no merge, em silêncio.
  const todosEntrega = users.filter((u) => elegivelBase(u) && (isEntrega(u) || incluidaManual(u)))

  // Quem está fora da lista desta semana e por quê — o motivo evita o admin incluir alguém
  // sem entender o que mudou (e perceber, por exemplo, que o caso era confirmar a acolhida).
  const motivoDeFora = (u: User): string => {
    if (orderByUser.get(u.id)?.doacao) return 'doou a cota'
    if (emAcolhida(u, new Date(), utcOffset) && confirmouSemana.get(u.id) !== true) return 'acolhida não confirmada'
    if (!isUserDeliveryWeek(u, weekId)) return 'quinzenal — outra semana'
    if (!isEntrega(u)) return `retira na ${config.vocabulary.pickupLabel.toLowerCase()}`
    return ''
  }

  const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const naLista = new Set(porEntrega.map((u) => u.id))
  const candidatos = users
    .filter((u) => elegivelBase(u) && !naLista.has(u.id))
    .filter((u) => semAcento(u.name).includes(semAcento(busca.trim())))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const MAX_SUGESTOES = 8

  const sensors = useSensors(
    // distância de ativação: um toque curto ainda clica nos botões da linha
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id || !colmeia) return
    const ids = porEntrega.map((u) => u.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const novaOrdemVisivel = arrayMove(ids, from, to)
    const ordemCompleta = mergeReorder(todosEntrega, novaOrdemVisivel)

    // Otimista: aplica deliveryOrder localmente já na nova ordem completa.
    const posicao = new Map(ordemCompleta.map((id, i) => [id, i]))
    setUsers((prev) =>
      prev.map((u) => (posicao.has(u.id) ? { ...u, deliveryOrder: posicao.get(u.id) } : u)),
    )
    try {
      await usersApi.reorderDelivery(ordemCompleta, colmeia.id)
    } catch {
      await load() // desfaz o otimista recarregando a verdade do servidor
    }
  }

  function buildReport(): string {
    const delivery = getWeekDelivery(weekId)
    const [y, m, d] = delivery.split('-')
    const dataStr = `${d}/${m}/${y}`

    function userLines(list: User[]): string {
      return list.map((u) => {
        const order = orderByUser.get(u.id)
        if (order?.suspensa) return null
        const lines = [u.name, '--------------------------', formatQuota(u), u.neighborhood, order?.weeklyAddress ?? u.address, u.contact]
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
          userId, userName, tenantId: colmeia.id, weekId, items: [], status: 'rascunho', weeklyNote: noteText,
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
          userId, userName, tenantId: colmeia.id, weekId, items: [], status: 'rascunho', weeklyAddress: addressText,
        }, colmeia.id)
        setOrders((prev) => [...prev, created])
      }
      setEditingAddress(null)
      setAddressText('')
    } finally {
      setSavingAddress(false)
    }
  }

  // Marca a exceção no pedido da semana (cria um mínimo se o membro ainda não tem),
  // exatamente como nota, endereço e suspensão já fazem.
  async function marcarInclusao(u: User, incluida: boolean) {
    if (!colmeia) return
    setIncluindo(u.id)
    try {
      const order = orderByUser.get(u.id)
      if (order) {
        await ordersApi.update(order.id, { incluida }, colmeia.id)
        setOrders((prev) => prev.map((o) => (o.userId === u.id ? { ...o, incluida } : o)))
      } else {
        const created = await ordersApi.create({
          userId: u.id, userName: u.name, tenantId: colmeia.id, weekId,
          items: [], status: 'rascunho', incluida,
        }, colmeia.id)
        setOrders((prev) => [...prev, created])
      }
      setBusca('')
    } finally {
      setIncluindo(null)
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
          userId: u.id, userName: u.name, tenantId: colmeia.id, weekId, items: [], status: 'rascunho', suspensa: true,
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
          <Button variant="outline" size="sm" onClick={() => { setReportOpen(true); setCopied(false) }} disabled={loading || porEntrega.length === 0}>
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
        vazio={porEntrega.length === 0}
        mensagemVazia="Ninguém recebe em casa nesta semana."
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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="w-8 px-2 py-2"></th>
                    <th className="text-left px-4 py-2">Membro</th>
                    <th className="text-left px-4 py-2">Extras</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  <SortableContext items={porEntrega.map((u) => u.id)} strategy={verticalListSortingStrategy}>
                    {porEntrega.map((u) => (
                      <LinhaEntrega
                        key={u.id}
                        user={u}
                        order={orderByUser.get(u.id) ?? null}
                        isSuspending={togglingSuspend === u.id || incluindo === u.id}
                        incluida={incluidaManual(u)}
                        onEditAddress={() => openEditAddress(u)}
                        onEditNote={() => openEditNote(u)}
                        onSuspend={() =>
                          incluidaManual(u) ? marcarInclusao(u, false) : handleSuspend(u)
                        }
                      />
                    ))}
                  </SortableContext>
                </tbody>
              </table>
            </DndContext>
          </CardContent>
        </Card>
        )}
      </EstadoLista>

      {/* Dá para TIRAR alguém da semana (suspender) desde sempre; faltava o caminho inverso. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar à entrega desta semana</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            aria-label="Buscar membro para adicionar"
            placeholder="Buscar pelo nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {candidatos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {busca.trim() ? 'Ninguém com esse nome fora da lista.' : 'Todo mundo já está na lista.'}
            </p>
          ) : (
            <ul className="divide-y rounded border">
              {candidatos.slice(0, MAX_SUGESTOES).map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{u.name}</span>
                    <span className="block text-xs text-muted-foreground">{motivoDeFora(u)}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={incluindo === u.id}
                    onClick={() => marcarInclusao(u, true)}
                  >
                    {incluindo === u.id ? '...' : 'Adicionar'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {candidatos.length > MAX_SUGESTOES && (
            <p className="text-xs text-muted-foreground">
              +{candidatos.length - MAX_SUGESTOES} fora da lista — refine a busca.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface LinhaEntregaProps {
  user: User
  order: Order | null
  isSuspending: boolean
  incluida: boolean
  onEditAddress: () => void
  onEditNote: () => void
  onSuspend: () => void
}

function LinhaEntrega({ user: u, order, isSuspending, incluida, onEditAddress, onEditNote, onSuspend }: LinhaEntregaProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: u.id })
  const suspensa = order?.suspensa ?? false
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative' as const, zIndex: 10 } : {}),
  }
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b last:border-0 ${suspensa ? 'opacity-50 bg-gray-50' : ''} ${isDragging ? 'bg-background shadow' : ''}`}
    >
      <td className="w-10 px-1 align-middle">
        <button
          {...attributes}
          {...listeners}
          className="flex h-11 w-9 items-center justify-center cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          title="Arrastar para reordenar"
          aria-label={`Reordenar ${u.name}`}
        >
          <GripVertical className="h-5 w-5" />
        </button>
      </td>
      <td className="px-4 py-2 font-medium">
        <div className={suspensa ? 'line-through text-muted-foreground' : ''}>
          {u.name}
          {incluida && (
            <span className="ml-2 text-xs font-normal bg-blue-100 text-blue-800 rounded px-1">
              Adicionada
            </span>
          )}
        </div>
        {formatQuota(u) && <div className="text-xs text-muted-foreground">{formatQuota(u)}</div>}
        {u.contact && <div className="text-xs text-muted-foreground">{u.contact}</div>}
        {u.frequency === 'quinzenal' && <span className="text-xs text-muted-foreground">quinzenal</span>}
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
            onClick={onEditAddress}
            className={`${order?.weeklyAddress ? 'text-blue-600' : 'text-muted-foreground hover:text-foreground'}`}
            title="Endereço da semana"
          >
            <MapPin className="h-4 w-4" />
          </button>
          <button
            onClick={onEditNote}
            className={`${order?.weeklyNote ? 'text-yellow-500' : 'text-muted-foreground hover:text-foreground'}`}
            title="Nota da semana"
          >
            <StickyNote className="h-4 w-4" />
          </button>
          <button
            disabled={isSuspending}
            onClick={onSuspend}
            className={`${suspensa ? 'text-red-500' : 'text-muted-foreground hover:text-red-400'} ${isSuspending ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={
              incluida
                ? 'Tirar da entrega desta semana'
                : suspensa ? 'Reativar entrega' : 'Suspender entrega esta semana'
            }
          >
            <Ban className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}
