import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ordersApi, usersApi } from '@/services/api'
import type { Order, User } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getWeekStart, getWeekDelivery, isFixoWeek, isUserDeliveryWeek } from '@/lib/weekUtils'
import { WeekNavigator } from '@/components/WeekNavigator'

export function EntregasPage() {
  const { colmeia } = useAuth()
  const [weekId, setWeekId] = useState(getWeekStart())
  const [orders, setOrders] = useState<Order[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [reportOpen, setReportOpen] = useState(false)
  const [copied, setCopied] = useState(false)

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

  // Mapear pedidos por usuário
  const orderByUser = new Map<string, Order>()
  orders.forEach((o) => orderByUser.set(o.userId, o))

  // Usuários que devem receber esta semana (exclui doações)
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
        const lines = [u.name, '--------------------------', u.quota, u.neighborhood, u.address, u.contact]
        if (order?.status === 'enviado' && order.items.length > 0) {
          order.items.forEach((i) => lines.push(`- ${i.qty} ${i.unit} ${i.productName}`))
        }
        return lines.join('\n')
      }).join('\n\n')
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

  function DeliveryGroup({ title, userList }: { title: string; userList: User[] }) {
    if (userList.length === 0) return null
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>{title}</span>
            <span className="text-sm font-normal text-muted-foreground">{userList.length} membros</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left px-4 py-2">Membro</th>
                <th className="text-left px-4 py-2">Extras</th>
              </tr>
            </thead>
            <tbody className="px-4">
              {userList.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">
                    <div>{u.name}</div>
                    {u.quota && (
                      <div className="text-xs text-muted-foreground">{u.quota}</div>
                    )}
                    {u.contact && (
                      <div className="text-xs text-muted-foreground">{u.contact}</div>
                    )}
                    {u.frequency === 'quinzenal' && (
                      <span className="text-xs text-muted-foreground">quinzenal</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {orderByUser.get(u.id) ? (
                      <div className="space-y-0.5">
                        {orderByUser.get(u.id)!.items.map((item, i) => (
                          <div key={`${item.offeringId}_${item.productId}_${i}`}>
                            {item.productName} × {item.qty} {item.unit}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Entregas da Semana</h1>
          <p className="text-muted-foreground text-sm">
            {fixoThisWeek ? 'Semana de fixo (quinzenais recebem)' : 'Semana sem fixo (quinzenais não recebem)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setReportOpen(true); setCopied(false) }} disabled={loading || activeUsers.length === 0}>
            Relatório
          </Button>
          <WeekNavigator weekId={weekId} onChange={setWeekId} />
        </div>
      </div>

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

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Carregando...</div>
      ) : activeUsers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum membro ativo para esta semana.
          </CardContent>
        </Card>
      ) : (
        <DeliveryGroup title="Entrega em Domicílio" userList={porEntrega} />
      )}
    </div>
  )
}
