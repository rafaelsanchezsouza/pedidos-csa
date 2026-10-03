import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { paymentsApi, usersApi } from '@/services/api'
import type { Payment, User } from '@/types'
import {
  statusLabel, statusVariant, resolveFrete, formatDeliveryDate, PRODUCER_FRETE,
  freteDoMembro, isEntrega,
} from '@pedidos/core'
import {
  Button, Card, CardContent, Badge, EstadoLista, MonthNavigator, PageHeader, Comprovantes,
} from '@pedidos/core/ui'
import { config } from '@/config'
import { DialogEdicaoFatura } from '@/components/DialogEdicaoFatura'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

const temComprovante = (p: Payment) => !!(p.proofUrl || p.proofs?.length)
const brl = (v: number) => `R$ ${v.toFixed(2)}`

// Quantas entregas entraram na conta. Derivado da própria fatura em vez de recalcular
// `countDeliveryWeeks` aqui: a contagem tem quinzenal e acolhida dentro, e uma segunda conta
// divergiria do valor cobrado. Fatura corrigida não tem conta que feche — devolve null.
function entregasDe(p: Payment, frete: number): number | null {
  if (p.corrigido || frete <= 0) return null
  return Math.round(p.amount / frete)
}

// --- Resumo do mês ---

function Resumo({ payments }: { payments: Payment[] }) {
  const soma = (l: Payment[]) => l.reduce((s, p) => s + p.amount, 0)
  const verificados = payments.filter((p) => p.verified)
  const aguardando = payments.filter((p) => !p.verified && temComprovante(p))
  const pendentes = payments.filter((p) => !p.verified && !temComprovante(p))
  const blocos = [
    { rotulo: 'Faturado', lista: payments },
    { rotulo: 'Verificado', lista: verificados },
    { rotulo: 'A conferir', lista: aguardando },
    { rotulo: 'Sem comprovante', lista: pendentes },
  ]
  return (
    <section aria-label="Resumo do mês" className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {blocos.map(({ rotulo, lista }) => (
        <Card key={rotulo}>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{rotulo}</p>
            <p className="text-lg font-semibold">{brl(soma(lista))}</p>
            <p className="text-xs text-muted-foreground">
              {lista.length} {lista.length === 1 ? 'membro' : 'membros'}
            </p>
          </CardContent>
        </Card>
      ))}
    </section>
  )
}


// --- Tela ---

export function VerificarDeliveryPage() {
  const { colmeia } = useAuth()
  const tenantId = colmeia?.id ?? ''
  const [month, setMonth] = useState(currentMonth())
  const [payments, setPayments] = useState<Payment[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [editando, setEditando] = useState<Payment | null>(null)
  const [aviso, setAviso] = useState('')

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const [todas, us] = await Promise.all([
        paymentsApi.list(month, tenantId),
        usersApi.list(tenantId),
      ])
      const fretes = todas.filter((p) => p.producerName === PRODUCER_FRETE)
      fretes.sort((a, b) => a.userName.localeCompare(b.userName, 'pt-BR'))
      setPayments(fretes)
      setUsers(us)
    } finally {
      setLoading(false)
    }
  }, [month, tenantId])

  useEffect(() => { void load() }, [load])

  const porId = new Map(users.map((u) => [u.id, u]))
  const freteDe = (p: Payment) => {
    const u = porId.get(p.userId)
    return u ? resolveFrete(u, colmeia ?? null) : 0
  }

  // Como o valor automático foi composto — o dialog mostra isso ao lado do campo.
  const geradoDe = (p: Payment): string => {
    const frete = freteDe(p)
    return frete > 0
      ? `Gerado: ${brl(frete)} por entrega × ${entregasDe(p, frete)}`
      : 'Sem frete configurado para este membro.'
  }

  // Quem recebe em casa e não tem preço resolvível NÃO gera fatura — logo, não aparece na
  // tabela acima. Sem este bloco, some da tela e ninguém cobra, que é o pior dos mundos.
  const semFrete = users.filter(
    (u) => isEntrega(u) && !u.disabled && !u.deleted
      && freteDoMembro(u, colmeia ?? null).origem === 'indefinido',
  )

  async function verificar(p: Payment) {
    setVerifying(p.id)
    try {
      await paymentsApi.update(p.id, { verified: true }, tenantId)
      await load()
    } finally {
      setVerifying(null)
    }
  }

  async function gerarFaturas() {
    setGerando(true)
    setAviso('')
    try {
      const { generated } = await paymentsApi.gerarFretes(month, tenantId)
      setAviso(generated === 0 ? 'Nenhuma fatura nova — todas já existiam.' : `${generated} fatura(s) criada(s).`)
      await load()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não consegui gerar as faturas')
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={`Conferir ${config.vocabulary.deliveryFeeLabel}`}
        secondaryAction={
          <Button variant="outline" size="sm" disabled={gerando || loading} onClick={() => void gerarFaturas()}>
            {gerando ? 'Gerando...' : 'Gerar faturas do mês'}
          </Button>
        }
        dateNav={<MonthNavigator month={month} onChange={setMonth} />}
      />

      {aviso && <p className="text-sm text-muted-foreground">{aviso}</p>}

      {!loading && semFrete.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="py-3 px-4 space-y-1">
            <p className="text-sm font-medium text-yellow-900">
              {semFrete.length} membro(s) de entrega sem frete definido — nenhuma fatura foi gerada
            </p>
            <ul className="text-sm text-yellow-900">
              {semFrete.map((u) => (
                <li key={u.id}>
                  {u.name} — {u.neighborhood?.trim() || 'sem bairro cadastrado'}
                </li>
              ))}
            </ul>
            <p className="text-xs text-yellow-800">
              Defina o preço do bairro em Administração → Configurações → Entregas, ou um frete
              próprio no cadastro do membro. Depois use "Gerar faturas do mês".
            </p>
          </CardContent>
        </Card>
      )}

      <EstadoLista
        loading={loading}
        vazio={payments.length === 0 && semFrete.length === 0}
        mensagemVazia="Nenhuma fatura de entrega neste mês."
      >
        <div className="space-y-4">
          <Resumo payments={payments} />

          {/* Desktop */}
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left px-4 py-3">Membro</th>
                      <th className="text-right px-4 py-3">Frete</th>
                      <th className="text-center px-4 py-3">Entregas</th>
                      <th className="text-right px-4 py-3">Valor</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Comprovante</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const frete = freteDe(p)
                      const entregas = entregasDe(p, frete)
                      return (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="px-4 py-3 font-medium">
                            {p.userName}
                            {p.corrigido && (
                              <span className="block text-xs font-normal text-muted-foreground">
                                Corrigido · {brl(p.amountOriginal ?? p.amount)} → {brl(p.amount)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {frete > 0 ? brl(frete) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center text-muted-foreground">{entregas ?? '—'}</td>
                          <td className="px-4 py-3 text-right">{brl(p.amount)}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={statusVariant(p)}>{statusLabel(p)}</Badge>
                          </td>
                          <td className="px-4 py-3 text-center"><Comprovantes payment={p} compacto /></td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <Button size="sm" variant="ghost" onClick={() => setEditando(p)}>Editar</Button>
                            {!p.verified && temComprovante(p) && (
                              <Button size="sm" variant="secondary" disabled={verifying === p.id} onClick={() => void verificar(p)}>
                                {verifying === p.id ? '...' : 'Verificar'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {payments.map((p) => {
              const frete = freteDe(p)
              const entregas = entregasDe(p, frete)
              return (
                <Card key={p.id}>
                  <CardContent className="py-3 px-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{p.userName}</span>
                      <Badge variant={statusVariant(p)}>{statusLabel(p)}</Badge>
                    </div>
                    <div className="text-sm font-semibold">{brl(p.amount)}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.corrigido
                        ? `Corrigido · ${brl(p.amountOriginal ?? p.amount)} → ${brl(p.amount)}`
                        : frete > 0 ? `${brl(frete)} por entrega · ${entregas} entregas` : 'Sem frete configurado'}
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <Comprovantes payment={p} />
                      <Button size="sm" variant="ghost" onClick={() => setEditando(p)}>Editar</Button>
                      {!p.verified && temComprovante(p) && (
                        <Button size="sm" variant="secondary" disabled={verifying === p.id} onClick={() => void verificar(p)}>
                          {verifying === p.id ? '...' : 'Verificar'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </EstadoLista>

      {editando && (
        <DialogEdicaoFatura
          payment={editando}
          gerado={geradoDe(editando)}
          tenantId={tenantId}
          month={month}
          onFechar={() => setEditando(null)}
          onSalvo={load}
        />
      )}
    </div>
  )
}
