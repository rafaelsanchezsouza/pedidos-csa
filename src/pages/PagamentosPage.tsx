import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { paymentsApi, ordersApi } from '@/services/api'
import { useUploadProof } from '@/hooks/useUploadProof'
import type { Payment, User, Order, OrderItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MonthNavigator } from '@/components/MonthNavigator'
import { getWeekDelivery } from '@/lib/weekUtils'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function statusLabel(p: Payment) {
  if (p.verified) return 'Verificado'
  if (p.proofUrl) return 'Aguardando verificação'
  return 'Pendente'
}

function statusVariant(p: Payment): 'default' | 'secondary' | 'destructive' {
  if (p.verified) return 'default'
  if (p.proofUrl) return 'secondary'
  return 'destructive'
}

// --- Helpers para breakdown semanal ---

interface WeekGroup {
  weekId: string
  deliveryDate: string
  items: OrderItem[]
  subtotal: number
}

function groupOrdersByWeek(orders: Order[], producerName: string): WeekGroup[] {
  const map = new Map<string, OrderItem[]>()
  for (const order of orders) {
    const relevant = order.items.filter((i) => i.producerName === producerName)
    if (relevant.length === 0) continue
    const existing = map.get(order.weekId) ?? []
    map.set(order.weekId, [...existing, ...relevant])
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekId, items]) => ({
      weekId,
      deliveryDate: getWeekDelivery(weekId),
      items,
      subtotal: items.reduce((s, i) => s + i.price * i.qty, 0),
    }))
}

function formatDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-')
  return `${d}/${m}`
}

// --- Breakdown semanal ---

function WeeklyBreakdown({ weeks }: { weeks: WeekGroup[] }) {
  if (weeks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Nenhum item encontrado para este produtor neste mês.
      </p>
    )
  }
  return (
    <div className="space-y-4 pt-2">
      {weeks.map((week) => (
        <div key={week.weekId} className="border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Entrega {formatDate(week.deliveryDate)}
          </p>
          <table className="w-full text-sm">
            <tbody>
              {week.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-0.5">{item.productName}</td>
                  <td className="py-0.5 text-center text-muted-foreground">
                    {item.qty} {item.unit}
                  </td>
                  <td className="py-0.5 text-right text-muted-foreground">
                    R$ {(item.price * item.qty).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-right text-sm font-medium mt-1">
            Subtotal: R$ {week.subtotal.toFixed(2)}
          </div>
        </div>
      ))}
    </div>
  )
}

// --- Card de pagamento por produtor ---

function PaymentCard({
  payment,
  colmeiaId,
  userId,
  month,
  onReload,
}: {
  payment: Payment
  colmeiaId: string
  userId: string
  month: string
  onReload: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [weeks, setWeeks] = useState<WeekGroup[] | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { uploadProof } = useUploadProof()

  async function handleUpload(file: File) {
    setUploading(true)
    setMessage('')
    try {
      const url = await uploadProof(file, colmeiaId, userId, month)
      await paymentsApi.update(payment.id, { proofUrl: url }, colmeiaId)
      setMessage('Comprovante enviado!')
      onReload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao enviar comprovante')
    } finally {
      setUploading(false)
    }
  }

  async function handleToggle() {
    const next = !expanded
    setExpanded(next)
    if (next && weeks === null) {
      setLoadingDetails(true)
      try {
        const orders = await ordersApi.getMonthly(month, colmeiaId)
        setWeeks(groupOrdersByWeek(orders, payment.producerName))
      } catch {
        setWeeks([])
      } finally {
        setLoadingDetails(false)
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{payment.producerName}</span>
          <Badge variant={statusVariant(payment)}>{statusLabel(payment)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold">R$ {payment.amount.toFixed(2)}</div>

        <button
          onClick={handleToggle}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          {expanded ? 'Ocultar detalhes ▲' : 'Ver detalhes ▼'}
        </button>

        {expanded && (
          loadingDetails
            ? <p className="text-sm text-muted-foreground py-2">Carregando...</p>
            : <WeeklyBreakdown weeks={weeks ?? []} />
        )}

        {payment.proofUrl && (
          <a
            href={payment.proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline block"
          >
            Ver comprovante enviado
          </a>
        )}

        {!payment.verified && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              variant={payment.proofUrl ? 'secondary' : 'default'}
              size="sm"
            >
              {uploading ? 'Enviando...' : payment.proofUrl ? 'Substituir comprovante' : 'Enviar comprovante'}
            </Button>
          </>
        )}

        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  )
}

// --- Card de cota mensal ---

function QuotaCard({
  payment,
  colmeiaId,
  userId,
  month,
  onReload,
}: {
  payment: Payment
  colmeiaId: string
  userId: string
  month: string
  onReload: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const { uploadProof } = useUploadProof()

  async function handleUpload(file: File) {
    setUploading(true)
    setMessage('')
    try {
      const url = await uploadProof(file, colmeiaId, userId, month)
      await paymentsApi.update(payment.id, { proofUrl: url }, colmeiaId)
      setMessage('Comprovante enviado!')
      onReload()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao enviar comprovante')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Cota Mensal</span>
          <Badge variant={statusVariant(payment)}>{statusLabel(payment)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold">R$ {payment.amount.toFixed(2)}</div>

        {payment.proofUrl && (
          <a
            href={payment.proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline block"
          >
            Ver comprovante enviado
          </a>
        )}

        {!payment.verified && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              variant={payment.proofUrl ? 'secondary' : 'default'}
              size="sm"
            >
              {uploading ? 'Enviando...' : payment.proofUrl ? 'Substituir comprovante' : 'Enviar comprovante'}
            </Button>
          </>
        )}

        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  )
}

// --- Meus Pagamentos (todos os papéis) ---

function MyPayments({ user, colmeiaId }: { user: User; colmeiaId: string }) {
  const [month, setMonth] = useState(currentMonth())
  const [payments, setPayments] = useState<Payment[]>([])
  const [quotaPayment, setQuotaPayment] = useState<Payment | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await paymentsApi.getMy(month, colmeiaId)
      setPayments(all.filter((p) => p.producerName !== 'Cota'))
      if (user.quota) {
        const qp = await paymentsApi.ensureQuota(month, colmeiaId)
        setQuotaPayment(qp)
      }
    } finally {
      setLoading(false)
    }
  }, [month, colmeiaId, user.quota])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-muted-foreground">Carregando...</div>

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meus Pagamentos</h1>
        <MonthNavigator month={month} onChange={setMonth} />
      </div>

      {quotaPayment && (
        <QuotaCard
          payment={quotaPayment}
          colmeiaId={colmeiaId}
          userId={user.id}
          month={month}
          onReload={load}
        />
      )}

      {payments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum pagamento para este mês. Envie um pedido para gerar faturas.
          </CardContent>
        </Card>
      ) : (
        payments.map((p) => (
          <PaymentCard
            key={p.id}
            payment={p}
            colmeiaId={colmeiaId}
            userId={user.id}
            month={month}
            onReload={load}
          />
        ))
      )}
    </div>
  )
}

// --- Entry point ---

export function PagamentosPage() {
  const { user, colmeia } = useAuth()
  if (!user || !colmeia) return null
  return <MyPayments user={user} colmeiaId={colmeia.id} />
}
