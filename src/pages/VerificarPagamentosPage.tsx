import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { paymentsApi, producersApi } from '@/services/api'
import type { Payment } from '@/types'
import { statusLabel, statusVariant } from '@/lib/statusPagamento'
import { isAdmin, isFornecedor } from '@/lib/acesso'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MonthNavigator } from '@/components/MonthNavigator'
import { PageHeader } from '@/components/PageHeader'
import { EstadoLista } from '@/components/EstadoLista'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export function VerificarPagamentosPage() {
  const { user, tenant } = useAuth()
  const tenantId = tenant?.id ?? ''
  const [month, setMonth] = useState(currentMonth())
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState<string | null>(null)

  const isAllowed = isAdmin(user) || isFornecedor(user)
  if (user && !isAllowed) return <Navigate to="/pedidos" replace />

  // Fornecedor que NÃO é admin vê só o que é dele; admin vê tudo.
  const soFornecedor = isFornecedor(user) && !isAdmin(user)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await paymentsApi.list(month, tenantId)
      let filtered = all
      if (soFornecedor) {
        // Faturas do próprio fornecedor: producerName == nome da entidade vinculada (producerId).
        const producers = await producersApi.list(tenantId)
        const meuNome = producers.find((p) => p.id === user?.producerId)?.name
        filtered = all.filter((p) => p.producerName === meuNome)
      }
      filtered.sort((a, b) =>
  a.userName.localeCompare(b.userName, 'pt-BR') ||
  a.producerName.localeCompare(b.producerName, 'pt-BR')
)
      setPayments(filtered)
    } finally {
      setLoading(false)
    }
  }, [month, tenantId, soFornecedor, user?.name])

  useEffect(() => { load() }, [load])

  async function handleVerify(p: Payment) {
    setVerifying(p.id)
    try {
      await paymentsApi.update(p.id, { verified: true }, tenantId)
      await load()
    } finally {
      setVerifying(null)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Verificar Pagamentos"
        dateNav={<MonthNavigator month={month} onChange={setMonth} />}
      />

      <EstadoLista
        loading={loading}
        vazio={payments.length === 0}
        mensagemVazia="Nenhum pagamento registrado para este mês."
      >
        <>
          {/* Desktop */}
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left px-4 py-3">Cliente</th>
                      <th className="text-left px-4 py-3">Fornecedor</th>
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
      </EstadoLista>
    </div>
  )
}
