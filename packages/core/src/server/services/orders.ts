import type { AppConfig } from '../../config.js'
import type { EngineDeps } from '../repo.js'

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

export type OrdersService = ReturnType<typeof createOrdersService>

export function createOrdersService({ repo }: EngineDeps, config: AppConfig) {
  // Texto consolidado dos pedidos da semana de UM produtor. Null se não houver pedidos.
  async function buildConsolidatedText(
    tenantId: string, weekId: string, producerId: string,
  ): Promise<string | null> {
    const [orders, offering, tenant] = await Promise.all([
      repo.listDocs<OrderDoc>('orders', [
        ['tenantId', '==', tenantId],
        ['weekId', '==', weekId],
        ['status', '==', 'enviado'],
      ]),
      repo.listDocs<{ producerName: string; items: Array<{ productId: string; productName: string; unit: string }> }>(
        'weekly_offerings',
        [['tenantId', '==', tenantId], ['weekStart', '==', weekId], ['producerId', '==', producerId]],
      ),
      repo.getDoc<{ name: string }>('tenants', tenantId),
    ])

    const tenantName = tenant?.name ?? config.brand.name
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

  // Mensagens para todos os produtores com pedidos na semana. Contato CRU — quem envia
  // (gateway/adapter) normaliza o telefone, e só uma vez.
  async function getProducerMessages(
    tenantId: string, weekId: string,
  ): Promise<Array<{ producerId: string; contact: string; text: string }>> {
    const producers = await repo.listDocs<{ name: string; contact?: string }>('producers', [
      ['tenantId', '==', tenantId],
    ])
    const results: Array<{ producerId: string; contact: string; text: string }> = []
    for (const producer of producers) {
      if (!producer.contact) continue
      const text = await buildConsolidatedText(tenantId, weekId, producer.id)
      if (text) results.push({ producerId: producer.id, contact: producer.contact, text })
    }
    return results
  }

  const isWeekLocked = async (tenantId: string, weekId: string): Promise<boolean> =>
    (await repo.getDoc('week_locks', `${tenantId}_${weekId}`)) !== null

  // Fecha a semana: grava o lock e encerra os extras. Independentes — falha em um não
  // cancela o outro (comportamento do envio consolidado).
  async function lockWeek(tenantId: string, weekId: string): Promise<void> {
    const lockedAt = new Date().toISOString()
    await repo.setDoc('week_locks', `${tenantId}_${weekId}`, { tenantId, weekId, lockedAt })
      .catch((err) => console.error('[lockWeek] week_lock falhou:', err))
    await repo.updateDoc('tenants', tenantId, { extrasAberto: false })
      .catch((err) => console.error('[lockWeek] extrasAberto falhou:', err))
  }

  return { buildConsolidatedText, getProducerMessages, isWeekLocked, lockWeek }
}
