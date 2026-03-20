import { Router, Request, Response } from 'express'
import { listDocs, createDoc, updateDoc, getDoc } from '../repositories/firestore.js'
import { upsertPaymentsForOrder } from './payments.js'

const router = Router()

interface OrderItem {
  productId: string
  productName: string
  unit: string
  price: number
  qty: number
  offeringId: string
  producerName: string
}

interface OrderDoc {
  userId: string
  userName: string
  colmeiaId: string
  weekId: string
  items: OrderItem[]
  status: 'rascunho' | 'enviado'
  dateCreated: string
  dateUpdated: string
}

router.get('/my', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.query.colmeiaId as string) || req.colmeiaId
    const weekId = req.query.weekId as string
    if (!colmeiaId || !weekId) { res.status(400).json({ message: 'colmeiaId e weekId obrigatórios' }); return }
    const orders = await listDocs<OrderDoc>('orders', [
      ['userId', '==', req.user!.uid],
      ['colmeiaId', '==', colmeiaId],
      ['weekId', '==', weekId],
    ])
    res.json(orders[0] ?? null)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.get('/consolidated', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.query.colmeiaId as string) || req.colmeiaId
    const weekId = req.query.weekId as string
    if (!colmeiaId || !weekId) { res.status(400).json({ message: 'colmeiaId e weekId obrigatórios' }); return }
    const orders = await listDocs<OrderDoc>('orders', [
      ['colmeiaId', '==', colmeiaId],
      ['weekId', '==', weekId],
    ])
    res.json(orders)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// GET /api/orders/consolidated-text?weekId=&colmeiaId=&producerId=
router.get('/consolidated-text', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.query.colmeiaId as string) || req.colmeiaId
    const weekId = req.query.weekId as string
    const producerId = req.query.producerId as string
    if (!colmeiaId || !weekId || !producerId) {
      res.status(400).json({ message: 'colmeiaId, weekId e producerId obrigatórios' }); return
    }

    const [orders, offering] = await Promise.all([
      listDocs<OrderDoc>('orders', [
        ['colmeiaId', '==', colmeiaId],
        ['weekId', '==', weekId],
        ['status', '==', 'enviado'],
      ]),
      listDocs<{ producerName: string; items: Array<{ productId: string; productName: string; unit: string; type: string }> }>(
        'weekly_offerings',
        [['colmeiaId', '==', colmeiaId], ['weekStart', '==', weekId], ['producerId', '==', producerId]]
      ),
    ])

    const producerName = offering[0]?.producerName ?? 'Produtor'
    const producerItemIds = new Set((offering[0]?.items ?? []).map((i) => i.productId))

    const relevantOrders = orders.filter((o) =>
      o.items.some((i) => producerItemIds.has(i.productId))
    )

    const lines: string[] = [
      `*Pedido CSA — Semana de ${weekId}*`,
      `*${producerName}*`,
      '',
    ]

    for (const order of relevantOrders) {
      const memberItems = order.items
        .filter((i) => producerItemIds.has(i.productId))
        .map((i) => `${i.qty} ${i.productName}`)
        .join(', ')
      lines.push(`${order.userName}: ${memberItems}`)
    }

    lines.push('')
    lines.push(`Total de membros: ${relevantOrders.length}`)

    res.json({ text: lines.join('\n') })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// GET /api/orders/history?colmeiaId=&userId= (userId opcional, apenas admin)
router.get('/history', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.query.colmeiaId as string) || req.colmeiaId
    if (!colmeiaId) { res.status(400).json({ message: 'colmeiaId obrigatório' }); return }
    const userId = (req.query.userId as string) || req.user!.uid
    const orders = await listDocs<OrderDoc>('orders', [
      ['userId', '==', userId],
      ['colmeiaId', '==', colmeiaId],
    ])
    orders.sort((a, b) => b.weekId.localeCompare(a.weekId))
    res.json(orders)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as Omit<OrderDoc, 'dateCreated' | 'dateUpdated'>
    const now = new Date().toISOString()
    const order = await createDoc<OrderDoc>('orders', { ...data, dateCreated: now, dateUpdated: now })
    if (order.status === 'enviado') {
      await upsertPaymentsForOrder(order.userId, order.userName, order.colmeiaId, order.weekId.slice(0, 7))
    }
    res.status(201).json(order)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates = { ...req.body as Partial<OrderDoc>, dateUpdated: new Date().toISOString() }
    await updateDoc<OrderDoc>('orders', req.params['id'] as string, updates)
    const updated = updates as OrderDoc & { weekId?: string }
    if (updated.status === 'enviado' || updated.status === 'rascunho') {
      // Precisamos do weekId e dados do usuário — buscar do doc existente
      const existing = await getDoc<OrderDoc>('orders', req.params['id'] as string)
      if (existing) {
        await upsertPaymentsForOrder(existing.userId, existing.userName, existing.colmeiaId, existing.weekId.slice(0, 7))
      }
    }
    res.json({ id: req.params['id'], ...updates })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
