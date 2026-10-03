import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { paymentsApi } from '@/services/api'
import type { Payment } from '@/types'
import { statusLabel, statusVariant, isAdmin, isFornecedor, PRODUCER_FRETE } from '@pedidos/core'
import { Button, Card, CardContent, Badge, EstadoLista, MonthNavigator, Comprovantes } from '@pedidos/core/ui'
import { PageHeader } from '@pedidos/core/ui'
import { DialogEdicaoFatura } from '@/components/DialogEdicaoFatura'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export function VerificarPagamentosPage() {
  const { user, colmeia } = useAuth()
  const tenantId = colmeia?.id ?? ''
  const [month, setMonth] = useState(currentMonth())
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [editando, setEditando] = useState<Payment | null>(null)

  const isAllowed = isAdmin(user) || isFornecedor(user)
  if (user && !isAllowed) return <Navigate to="/pedidos" replace />

  const isProdutor = isFornecedor(user)
  const ehAdmin = isAdmin(user)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await paymentsApi.list(month, tenantId)
      // O delivery tem tela própria (/verificar-delivery), com frete por entrega, correção de
      // valor e resumo do mês. Deixá-lo aqui também duplicaria a conferência.
      const semDelivery = all.filter((p) => p.producerName !== PRODUCER_FRETE)
      const filtered = isProdutor ? semDelivery.filter((p) => p.producerName === user?.name) : semDelivery
      filtered.sort((a, b) =>
  a.userName.localeCompare(b.userName, 'pt-BR') ||
  a.producerName.localeCompare(b.producerName, 'pt-BR')
)
      setPayments(filtered)
    } finally {
      setLoading(false)
    }
  }, [month, tenantId, isProdutor, user?.name])

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
                        <td className="px-4 py-3 font-medium">
                          {p.userName}
                          {p.corrigido && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              Corrigido · R$ {(p.amountOriginal ?? p.amount).toFixed(2)} → R$ {p.amount.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{p.producerName}</td>
                        <td className="px-4 py-3 text-right">R$ {p.amount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={statusVariant(p)}>{statusLabel(p)}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Comprovantes payment={p} compacto />
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {/* Correção é do admin: o servidor recusa fornecedor (ehAdmin). */}
                          {ehAdmin && (
                            <Button size="sm" variant="ghost" onClick={() => setEditando(p)}>Editar</Button>
                          )}
                          {!p.verified && (p.proofUrl || p.proofs?.length) && (
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
                    <Comprovantes payment={p} />
                    {ehAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => setEditando(p)}>Editar</Button>
                    )}
                    {!p.verified && (p.proofUrl || p.proofs?.length) && (
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

      {editando && (
        <DialogEdicaoFatura
          payment={editando}
          tenantId={tenantId}
          month={month}
          onFechar={() => setEditando(null)}
          onSalvo={load}
        />
      )}
    </div>
  )
}
