import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { paymentsApi } from '@/services/api'
import { useUploadProof } from '@/hooks/useUploadProof'
import type { Payment, User } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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

// --- Card de pagamento por produtor (usuário) ---

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
          <span>{payment.producerName}</span>
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
            className="text-sm text-blue-600 hover:underline"
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

// --- Visão do usuário ---

function UserPayments({ user, colmeiaId }: { user: User; colmeiaId: string }) {
  const [month, setMonth] = useState(currentMonth())
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPayments(await paymentsApi.getMy(month, colmeiaId))
    } finally {
      setLoading(false)
    }
  }, [month, colmeiaId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-muted-foreground">Carregando...</div>

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meus Pagamentos</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
      </div>

      {payments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum pagamento para {month}. Envie um pedido para gerar faturas.
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

// --- Visão do admin ---

function AdminPayments({ colmeiaId }: { colmeiaId: string }) {
  const [month, setMonth] = useState(currentMonth())
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPayments(await paymentsApi.list(month, colmeiaId))
    } finally {
      setLoading(false)
    }
  }, [month, colmeiaId])

  useEffect(() => { load() }, [load])

  async function handleVerify(p: Payment) {
    setVerifying(p.id)
    try {
      await paymentsApi.update(p.id, { verified: true }, colmeiaId)
      await load()
    } finally {
      setVerifying(null)
    }
  }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pagamentos</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        />
      </div>

      {payments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum pagamento registrado para {month}.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left px-4 py-3">Membro</th>
                  <th className="text-left px-4 py-3">Produtor</th>
                  <th className="text-right px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Comprovante</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{p.userName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.producerName}</td>
                    <td className="px-4 py-3 text-right">R$ {p.amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={statusVariant(p)}>{statusLabel(p)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.proofUrl ? (
                        <a
                          href={p.proofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Ver
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!p.verified && p.proofUrl && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={verifying === p.id}
                          onClick={() => handleVerify(p)}
                        >
                          {verifying === p.id ? '...' : 'Verificar'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// --- Entry point ---

export function PagamentosPage() {
  const { user, colmeia } = useAuth()
  if (!user || !colmeia) return null

  const isAdmin = user.role === 'admin' || user.role === 'superadmin'
  return isAdmin
    ? <AdminPayments colmeiaId={colmeia.id} />
    : <UserPayments user={user} colmeiaId={colmeia.id} />
}
