import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { paymentsApi } from '@/services/api'
import type { Payment } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MonthNavigator } from '@/components/MonthNavigator'

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

export function VerificarPagamentosPage() {
  const { user, colmeia } = useAuth()
  const colmeiaId = colmeia?.id ?? ''
  const [month, setMonth] = useState(currentMonth())
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState<string | null>(null)

  const isAllowed = user?.acesso === 'admin' || user?.acesso === 'superadmin' || user?.acesso === 'produtor'
  if (user && !isAllowed) return <Navigate to="/pedidos" replace />

  const isProdutor = user?.acesso === 'produtor'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (!isProdutor) await paymentsApi.ensureQuotaAll(month, colmeiaId)
      const all = await paymentsApi.list(month, colmeiaId)
      const filtered = isProdutor ? all.filter((p) => p.producerName === user?.name) : all
      filtered.sort((a, b) =>
  a.userName.localeCompare(b.userName, 'pt-BR') ||
  a.producerName.localeCompare(b.producerName, 'pt-BR')
)
      setPayments(filtered)
    } finally {
      setLoading(false)
    }
  }, [month, colmeiaId, isProdutor, user?.name])

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
        <h1 className="text-2xl font-bold">Verificar Pagamentos</h1>
        <MonthNavigator month={month} onChange={setMonth} />
      </div>

      {payments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum pagamento registrado para este mês.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block">
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
                            <a href={p.proofUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Ver</a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!p.verified && p.proofUrl && (
                            <Button size="sm" variant="secondary" disabled={verifying === p.id} onClick={() => handleVerify(p)}>
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
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {payments.map((p) => (
              <Card key={p.id}>
                <CardContent className="py-3 px-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{p.userName}</span>
                    <Badge variant={statusVariant(p)}>{statusLabel(p)}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">{p.producerName}</div>
                  <div className="text-sm font-semibold">R$ {p.amount.toFixed(2)}</div>
                  <div className="flex items-center gap-3 pt-1">
                    {p.proofUrl && (
                      <a href={p.proofUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                        Ver comprovante
                      </a>
                    )}
                    {!p.verified && p.proofUrl && (
                      <Button size="sm" variant="secondary" disabled={verifying === p.id} onClick={() => handleVerify(p)}>
                        {verifying === p.id ? '...' : 'Verificar'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
