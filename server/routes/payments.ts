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
  dueDate?: string
  proofUrl?: string
  verified: boolean
  dateCreated: string
  dateUpdated: string
}

interface UserDoc {
  name: string
  quota?: string
  frequency?: 'semanal' | 'quinzenal'
  quinzenalParity?: 'par' | 'impar'
}

interface ColmeiaSettings {
  quotaInteira?: number
  quotaMeia?: number
  dueDay?: number
}

// --- Utilitários de data ---

function buildDueDate(month: string, type: 'cota' | 'extras', dueDay: number): string {
  const [year, m] = month.split('-').map(Number)
  let targetYear = year
  let targetMonth: number
  if (type === 'cota') {
    targetMonth = m - 1
    if (targetMonth === 0) { targetMonth = 12; targetYear-- }
  } else {
    targetMonth = m + 1
    if (targetMonth === 13) { targetMonth = 1; targetYear++ }
  }
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
}

function getISOWeekFromDate(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function countDeliveryWeeks(
  month: string,
  frequency: 'semanal' | 'quinzenal',
  quinzenalParity?: 'par' | 'impar',
): number {
  const [year, monthNum] = month.split('-').map(Number)
  let count = 0
  const firstDay = new Date(year, monthNum - 1, 1)
  const dayOfWeek = firstDay.getDay()
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const cur = new Date(year, monthNum - 1, 1 + daysToMonday)
  while (true) {
    const wednesday = new Date(cur)
    wednesday.setDate(cur.getDate() + 2)
    if (wednesday.getFullYear() > year || (wednesday.getFullYear() === year && wednesday.getMonth() + 1 > monthNum)) break
    if (wednesday.getMonth() + 1 === monthNum) {
      if (frequency === 'semanal') {
        count++
      } else {
        const isoWeek = getISOWeekFromDate(cur)
        const isOdd = isoWeek % 2 === 1
        if (quinzenalParity === 'impar' && isOdd) count++
        else if (quinzenalParity === 'par' && !isOdd) count++
        else if (!quinzenalParity && isOdd) count++ // fallback: semanas ímpares
      }
    }
    cur.setDate(cur.getDate() + 7)
  }
  return count
}

// Recalcula e faz upsert dos PaymentDocs por produtor para o usuário/mês
export async function upsertPaymentsForOrder(
  userId: string,
  userName: string,
  colmeiaId: string,
  month: string,
) {
  const [orders, colmeiaDoc] = await Promise.all([
    listDocs<OrderDoc>('orders', [
      ['userId', '==', userId],
      ['colmeiaId', '==', colmeiaId],
    ]),
    getDoc<ColmeiaSettings>('colmeias', colmeiaId),
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
  // Nunca tocar em pagamentos de 'Cota' — são gerenciados separadamente
  const existingByProducer = new Map(
    existing.filter((p) => p.producerName !== 'Cota').map((p) => [p.producerName, p])
  )

  const now = new Date().toISOString()
  const dueDay = colmeiaDoc?.dueDay ?? 10
  const dueDate = buildDueDate(month, 'extras', dueDay)

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
          dueDate,
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

    const weeklyRate = userDoc.quota === 'Meia cota'
      ? (colmeiaDoc?.quotaMeia ?? 40)
      : (colmeiaDoc?.quotaInteira ?? 65)

    const weeks = countDeliveryWeeks(
      month,
      userDoc.frequency ?? 'semanal',
      userDoc.quinzenalParity,
    )
    const amount = weeklyRate * weeks

    const dueDay = colmeiaDoc?.dueDay ?? 10
    const dueDate = buildDueDate(month, 'cota', dueDay)

    const existing = await listDocs<PaymentDoc>('payments', [
      ['userId', '==', uid],
      ['colmeiaId', '==', colmeiaId],
      ['month', '==', month],
      ['producerName', '==', 'Cota'],
    ])

    const now = new Date().toISOString()
    if (existing.length > 0) {
      const prev = existing[0]
      await updateDoc<PaymentDoc>('payments', prev.id, { amount, dueDate, dateUpdated: now })
      res.json({ ...prev, amount, dueDate, dateUpdated: now })
    } else {
      const created = await createDoc<PaymentDoc>('payments', {
        userId: uid,
        userName: userDoc.name,
        colmeiaId,
        month,
        producerName: 'Cota',
        amount,
        dueDate,
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
