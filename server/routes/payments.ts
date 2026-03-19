import { Router, Request, Response } from 'express'
import { listDocs, createDoc, updateDoc } from '../repositories/firestore.js'

const router = Router()

interface OrderItem {
  price: number
  qty: number
}

interface OrderDoc {
  userId: string
  colmeiaId: string
  weekId: string
  items: OrderItem[]
  status: 'rascunho' | 'enviado'
}

interface PaymentDoc {
  userId: string
  userName: string
  colmeiaId: string
  month: string
  amount: number
  proofUrl?: string
  verified: boolean
  dateCreated: string
  dateUpdated: string
}

function calcAmount(orders: (OrderDoc & { id: string })[]) {
  return orders
    .filter((o) => o.status === 'enviado')
    .reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.price * i.qty, 0), 0)
}

// GET /api/payments/my?month=YYYY-MM&colmeiaId=
router.get('/my', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.query.colmeiaId as string) || req.colmeiaId
    const month = req.query.month as string
    if (!colmeiaId || !month) { res.status(400).json({ message: 'colmeiaId e month obrigatórios' }); return }
    const payments = await listDocs<PaymentDoc>('payments', [
      ['userId', '==', req.user!.uid],
      ['colmeiaId', '==', colmeiaId],
      ['month', '==', month],
    ])
    res.json(payments[0] ?? null)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// GET /api/payments?month=YYYY-MM&colmeiaId= (admin)
router.get('/', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.query.colmeiaId as string) || req.colmeiaId
    const month = req.query.month as string
    if (!colmeiaId || !month) { res.status(400).json({ message: 'colmeiaId e month obrigatórios' }); return }
    const payments = await listDocs<PaymentDoc>('payments', [
      ['colmeiaId', '==', colmeiaId],
      ['month', '==', month],
    ])
    res.json(payments)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// POST /api/payments — upsert: recalcula amount com base nos pedidos enviados do mês
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, userName, colmeiaId: bodyColmeiaId, month } = req.body as {
      userId: string; userName: string; colmeiaId: string; month: string
    }
    const colmeiaId = bodyColmeiaId || req.colmeiaId
    if (!colmeiaId || !userId || !month) {
      res.status(400).json({ message: 'userId, colmeiaId e month obrigatórios' }); return
    }

    const orders = await listDocs<OrderDoc>('orders', [
      ['userId', '==', userId],
      ['colmeiaId', '==', colmeiaId],
    ])
    const monthOrders = orders.filter((o) => o.weekId.startsWith(month))
    const amount = calcAmount(monthOrders as (OrderDoc & { id: string })[])

    const existing = await listDocs<PaymentDoc>('payments', [
      ['userId', '==', userId],
      ['colmeiaId', '==', colmeiaId],
      ['month', '==', month],
    ])

    const now = new Date().toISOString()

    if (existing[0]) {
      await updateDoc<PaymentDoc>('payments', existing[0].id, { amount, dateUpdated: now })
      res.json({ ...existing[0], amount, dateUpdated: now })
    } else {
      const payment = await createDoc<PaymentDoc>('payments', {
        userId,
        userName,
        colmeiaId,
        month,
        amount,
        verified: false,
        dateCreated: now,
        dateUpdated: now,
      })
      res.status(201).json(payment)
    }
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// PUT /api/payments/:id — atualiza proofUrl (usuário) ou verified (admin)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates = { ...req.body as Partial<PaymentDoc>, dateUpdated: new Date().toISOString() }
    await updateDoc<PaymentDoc>('payments', req.params['id'] as string, updates)
    res.json({ id: req.params['id'], ...updates })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
