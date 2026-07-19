import { listDocs, getDoc } from '../repositories/firestore.js'

interface OrderItem {
  productId: string
  qty: number
  unit: string
  productName: string
  [key: string]: unknown
}

interface OrderDoc {
  userId: string
  userName: string
  tenantId: string
  weekId: string
  items: OrderItem[]
  status: 'rascunho' | 'enviado'
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  return '55' + digits
}

// Retorna null se não houver pedidos do produtor na semana
export async function buildConsolidatedText(
  tenantId: string, weekId: string, producerId: string
): Promise<string | null> {
  const [orders, offering, tenant] = await Promise.all([
    listDocs<OrderDoc>('orders', [
      ['tenantId', '==', tenantId],
      ['weekId', '==', weekId],
      ['status', '==', 'enviado'],
    ]),
    listDocs<{ producerName: string; items: Array<{ productId: string; productName: string; unit: string }> }>(
      'weekly_offerings',
      [['tenantId', '==', tenantId], ['weekStart', '==', weekId], ['producerId', '==', producerId]]
    ),
    getDoc<{ name: string }>('tenants', tenantId),
  ])

  const tenantName = tenant?.name ?? 'CSA'
  const producerItemIds = new Set((offering[0]?.items ?? []).map((i) => i.productId))
  const relevantOrders = orders.filter((o) => o.items.some((i) => producerItemIds.has(i.productId)))

  if (relevantOrders.length === 0) return null

  const lines: string[] = [`*${tenantName} — Semana de ${weekId}*`, '']
  for (const order of relevantOrders) {
    lines.push(order.userName)
    order.items
      .filter((i) => producerItemIds.has(i.productId))
      .forEach((i) => lines.push(`  ${i.qty} ${i.unit} ${i.productName}`))
  }
  return lines.join('\n')
}

// Retorna mensagens para todos os produtores com pedidos na semana
export async function getProducerMessages(
  tenantId: string, weekId: string
): Promise<Array<{ producerId: string; contact: string; text: string }>> {
  const producers = await listDocs<{ name: string; contact?: string }>('producers', [
    ['tenantId', '==', tenantId],
  ])

  const results: Array<{ producerId: string; contact: string; text: string }> = []
  for (const producer of producers) {
    if (!producer.contact) continue
    const text = await buildConsolidatedText(tenantId, weekId, producer.id)
    if (text) results.push({ producerId: producer.id, contact: normalizePhone(producer.contact), text })
  }
  return results
}
