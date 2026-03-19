import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ordersApi, usersApi } from '@/services/api'
import type { Order, User } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function OrderCard({ order }: { order: Order }) {
  const total = order.items.reduce((sum, i) => sum + i.price * i.qty, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Semana de {order.weekId}</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-normal text-muted-foreground">R$ {total.toFixed(2)}</span>
            <Badge variant={order.status === 'enviado' ? 'default' : 'secondary'}>
              {order.status === 'enviado' ? 'Enviado' : 'Rascunho'}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {order.items.map((item) => (
              <tr key={item.productId} className="border-b last:border-0">
                <td className="py-1.5 font-medium">{item.productName}</td>
                <td className="py-1.5 text-muted-foreground">{item.unit}</td>
                <td className="py-1.5 text-center">{item.qty}</td>
                <td className="py-1.5 text-right">R$ {(item.price * item.qty).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

export function HistoricoPage() {
  const { user, colmeia } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  const [orders, setOrders] = useState<Order[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!colmeia || !user) return
    setLoading(true)
    try {
      const userId = isAdmin && selectedUserId ? selectedUserId : user.id
      const [ords, us] = await Promise.all([
        ordersApi.getHistory(colmeia.id, isAdmin && selectedUserId ? selectedUserId : undefined),
        isAdmin ? usersApi.list(colmeia.id) : Promise.resolve([]),
      ])
      setOrders(ords)
      if (isAdmin) setUsers(us)
    } finally {
      setLoading(false)
    }
  }, [colmeia, user, isAdmin, selectedUserId])

  useEffect(() => { load() }, [load])

  if (!user || !colmeia) return null

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Histórico de Pedidos</h1>
        {isAdmin && users.length > 0 && (
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos os meus pedidos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Meus pedidos</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum pedido encontrado.
          </CardContent>
        </Card>
      ) : (
        orders.map((order) => <OrderCard key={order.id} order={order} />)
      )}
    </div>
  )
}
