import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ordersApi, usersApi } from '@/services/api'
import type { Order, User } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getWeekStart, weekOptions, isFixoWeek } from '@/lib/weekUtils'

export function EntregasPage() {
  const { colmeia } = useAuth()
  const [weekId, setWeekId] = useState(getWeekStart())
  const [orders, setOrders] = useState<Order[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

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

  // Usuários que devem receber esta semana
  const activeUsers = users.filter((u) => {
    if (u.disabled || u.deleted) return false
    if (u.role === 'admin' || u.role === 'superadmin') return false
    if (u.frequency === 'quinzenal' && !fixoThisWeek) return false
    return true
  })

  // Mapear pedidos por usuário
  const orderByUser = new Map<string, Order>()
  orders.forEach((o) => orderByUser.set(o.userId, o))

  // Agrupar por tipo de retirada
  const porColmeia = activeUsers.filter((u) => u.deliveryType === 'colmeia')
  const porEntrega = activeUsers.filter((u) => u.deliveryType === 'entrega')

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
                <th className="text-left px-4 py-2">Itens</th>
                <th className="text-right px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="px-4">
              {userList.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">
                    <div>{u.name}</div>
                    {u.frequency === 'quinzenal' && (
                      <span className="text-xs text-muted-foreground">quinzenal</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {orderByUser.get(u.id) ? (
                      <div className="space-y-0.5">
                        {orderByUser.get(u.id)!.items.map((item) => (
                          <div key={item.productId}>
                            {item.productName} × {item.qty} {item.unit}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Sem pedido</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {orderByUser.get(u.id) && (
                      <Badge variant={orderByUser.get(u.id)!.status === 'enviado' ? 'default' : 'secondary'}>
                        {orderByUser.get(u.id)!.status}
                      </Badge>
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

  if (loading) return <div className="text-muted-foreground">Carregando...</div>

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Entregas da Semana</h1>
          <p className="text-muted-foreground text-sm">
            {fixoThisWeek ? 'Semana de fixo (quinzenais recebem)' : 'Semana sem fixo (quinzenais não recebem)'}
          </p>
        </div>
        <select
          value={weekId}
          onChange={(e) => setWeekId(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          {weekOptions().map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      {activeUsers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum membro ativo para esta semana.
          </CardContent>
        </Card>
      ) : (
        <>
          <DeliveryGroup title="Retirada na Colmeia" userList={porColmeia} />
          <DeliveryGroup title="Entrega em Domicílio" userList={porEntrega} />
        </>
      )}
    </div>
  )
}
