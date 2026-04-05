import { Router, Request, Response } from 'express'
import { listDocs, createDoc, updateDoc, getDoc } from '../repositories/firestore.js'

const router = Router()

interface OrderItem {
  price: number
  qty: number
  producerName: string
}

interface OrderDoc {
  userId: string
  userName: string
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
  producerName: string
  amount: number
  proofUrl?: string
  verified: boolean
  dateCreated: string
  dateUpdated: string
}

// Recalcula e faz upsert dos PaymentDocs por produtor para o usuário/mês
export async function upsertPaymentsForOrder(
  userId: string,
  userName: string,
  colmeiaId: string,
  month: string,
) {
  const orders = await listDocs<OrderDoc>('orders', [
    ['userId', '==', userId],
    ['colmeiaId', '==', colmeiaId],
  ])
  const monthOrders = orders.filter((o) => o.status === 'enviado' && o.weekId.startsWith(month))

  // Agrupar por producerName
  const byProducer = new Map<string, number>()
  for (const order of monthOrders) {
    for (const item of order.items) {
      const producer = item.producerName
      byProducer.set(producer, (byProducer.get(producer) ?? 0) + item.price * item.qty)
    }
  }

  const existing = await listDocs<PaymentDoc>('payments', [
    ['userId', '==', userId],
    ['colmeiaId', '==', colmeiaId],
    ['month', '==', month],
  ])
  const existingByProducer = new Map(existing.map((p) => [p.producerName, p]))

  const now = new Date().toISOString()

  // Upsert produtores com saldo > 0
  await Promise.all(
    [...byProducer.entries()].map(async ([producerName, amount]) => {
      const prev = existingByProducer.get(producerName)
      if (prev) {
        await updateDoc<PaymentDoc>('payments', prev.id, { amount, dateUpdated: now })
      } else {
        await createDoc<PaymentDoc>('payments', {
          userId,
          userName,
          colmeiaId,
          month,
          producerName,
          amount,
          verified: false,
          dateCreated: now,
          dateUpdated: now,
        })
      }
    }),
  )

  // Zerar docs de produtores que não aparecem mais nos pedidos enviados
  await Promise.all(
    [...existingByProducer.entries()]
      .filter(([producerName]) => !byProducer.has(producerName))
      .map(([, doc]) => updateDoc<PaymentDoc>('payments', doc.id, { amount: 0, dateUpdated: now })),
  )
}

interface UserDoc {
  name: string
  quota?: string
}

interface ColmeiaSettings {
  quotaInteira?: number
  quotaMeia?: number
}

// POST /api/payments/quota — cria/atualiza pagamento de cota do mês
router.post('/quota', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.body.colmeiaId as string) || req.colmeiaId
    const month = req.body.month as string
    const uid = req.user!.uid
    if (!colmeiaId || !month) { res.status(400).json({ message: 'colmeiaId e month obrigatórios' }); return }

    const [userDoc, colmeiaDoc] = await Promise.all([
      getDoc<UserDoc>('users', uid),
      getDoc<ColmeiaSettings>('colmeias', colmeiaId),
    ])
    if (!userDoc?.quota) { res.status(400).json({ message: 'Usuário sem cota definida' }); return }

    const amount = userDoc.quota === 'Meia cota'
      ? (colmeiaDoc?.quotaMeia ?? 0)
      : (colmeiaDoc?.quotaInteira ?? 0)

    const existing = await listDocs<PaymentDoc>('payments', [
      ['userId', '==', uid],
      ['colmeiaId', '==', colmeiaId],
      ['month', '==', month],
      ['producerName', '==', 'Cota'],
    ])

    const now = new Date().toISOString()
    if (existing.length > 0) {
      const prev = existing[0]
      await updateDoc<PaymentDoc>('payments', prev.id, { amount, dateUpdated: now })
      res.json({ ...prev, amount, dateUpdated: now })
    } else {
      const created = await createDoc<PaymentDoc>('payments', {
        userId: uid,
        userName: userDoc.name,
        colmeiaId,
        month,
        producerName: 'Cota',
        amount,
        verified: false,
        dateCreated: now,
        dateUpdated: now,
      })
      res.status(201).json(created)
    }
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

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
    res.json(payments)
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
