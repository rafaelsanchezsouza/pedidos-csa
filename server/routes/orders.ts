import { Router, Request, Response } from 'express'
import { listDocs, createDoc, updateDoc, getDoc, db } from '../repositories/firestore.js'
import { upsertPaymentsForOrder } from '../services/paymentService.js'
import { sendWhatsAppMessage } from '../services/whatsapp/index.js'
import { buildConsolidatedText, normalizePhone } from '../services/ordersService.js'

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
  doacao?: boolean
  recebido?: boolean
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
    const text = await buildConsolidatedText(colmeiaId, weekId, producerId)
    res.json({ text })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// GET /api/orders/week-lock?weekId=&colmeiaId=
router.get('/week-lock', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.query.colmeiaId as string) || req.colmeiaId
    const weekId = req.query.weekId as string
    if (!colmeiaId || !weekId) { res.status(400).json({ message: 'colmeiaId e weekId obrigatórios' }); return }
    const snap = await db.collection('week_locks').doc(`${colmeiaId}_${weekId}`).get()
    res.json({ locked: snap.exists })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// POST /api/orders/send-consolidated-whatsapp
router.post('/send-consolidated-whatsapp', async (req: Request, res: Response) => {
  try {
    const { colmeiaId: bodyColmeiaId, weekId, producerId } = req.body as { colmeiaId?: string; weekId: string; producerId: string }
    const colmeiaId = bodyColmeiaId || req.colmeiaId
    if (!colmeiaId || !weekId || !producerId) {
      res.status(400).json({ message: 'colmeiaId, weekId e producerId obrigatórios' }); return
    }

    const producers = await listDocs<{ name: string; contact: string }>('producers', [
      ['colmeiaId', '==', colmeiaId],
    ])
    const producer = producers.find((p) => p.id === producerId)
    if (!producer?.contact) {
      res.status(400).json({ message: 'Produtor sem número de contato cadastrado' }); return
    }

    const text = await buildConsolidatedText(colmeiaId, weekId, producerId)
    if (!text) { res.status(400).json({ message: 'Nenhum pedido enviado para este produtor na semana' }); return }
    await sendWhatsAppMessage(normalizePhone(producer.contact), text)

    const lockId = `${colmeiaId}_${weekId}`
    await db.collection('week_locks').doc(lockId).set({
      colmeiaId,
      weekId,
      lockedAt: new Date().toISOString(),
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// PATCH /api/orders/recebido — admin marca recebido para um membro na semana
router.patch('/recebido', async (req: Request, res: Response) => {
  try {
    const { userId, userName, weekId, colmeiaId: bodyColmeiaId, recebido } = req.body as {
      userId: string; userName: string; weekId: string; colmeiaId: string; recebido: boolean
    }
    const colmeiaId = bodyColmeiaId || req.colmeiaId
    if (!userId || !weekId || !colmeiaId) {
      res.status(400).json({ message: 'userId, weekId e colmeiaId obrigatórios' }); return
    }
    const existing = await listDocs<OrderDoc>('orders', [
      ['userId', '==', userId],
      ['colmeiaId', '==', colmeiaId],
      ['weekId', '==', weekId],
    ])
    const now = new Date().toISOString()
    if (existing[0]) {
      await updateDoc<OrderDoc>('orders', existing[0].id, { recebido, dateUpdated: now })
      res.json({ id: existing[0].id, recebido })
    } else {
      const created = await createDoc<OrderDoc>('orders', {
        userId, userName: userName ?? '', colmeiaId, weekId,
        items: [], status: 'rascunho', recebido, dateCreated: now, dateUpdated: now,
      })
      res.json(created)
    }
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

// GET /api/orders/monthly?month=YYYY-MM&colmeiaId= (pedidos enviados do mês do usuário autenticado)
router.get('/monthly', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.query.colmeiaId as string) || req.colmeiaId
    const month = req.query.month as string
    if (!colmeiaId || !month) { res.status(400).json({ message: 'colmeiaId e month obrigatórios' }); return }
    const orders = await listDocs<OrderDoc>('orders', [
      ['userId', '==', req.user!.uid],
      ['colmeiaId', '==', colmeiaId],
    ])
    const result = orders
      .filter((o) => o.status === 'enviado' && o.weekId.startsWith(month))
      .sort((a, b) => a.weekId.localeCompare(b.weekId))
    res.json(result)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as Omit<OrderDoc, 'dateCreated' | 'dateUpdated'>
    const lockSnap = await db.collection('week_locks').doc(`${data.colmeiaId}_${data.weekId}`).get()
    if (lockSnap.exists) {
      const userSnap = await db.collection('users').doc(req.user!.uid).get()
      const acesso = (userSnap.data() as { acesso?: string } | undefined)?.acesso
      const isAdmin = acesso === 'admin' || acesso === 'superadmin'
      if (!isAdmin) { res.status(403).json({ message: 'Pedido bloqueado após envio ao produtor' }); return }
    }
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
    const existing = await getDoc<OrderDoc>('orders', req.params['id'] as string)
    if (existing) {
      const snap = await db.collection('week_locks').doc(`${existing.colmeiaId}_${existing.weekId}`).get()
      if (snap.exists) {
        const userSnap = await db.collection('users').doc(req.user!.uid).get()
        const userData = userSnap.data() as { acesso?: string } | undefined
        const isAdmin = userData?.acesso === 'admin' || userData?.acesso === 'superadmin'
        if (!isAdmin) {
          res.status(403).json({ message: 'Pedido bloqueado após envio ao produtor' }); return
        }
      }
    }
    const updates = { ...req.body as Partial<OrderDoc>, dateUpdated: new Date().toISOString() }
    await updateDoc<OrderDoc>('orders', req.params['id'] as string, updates)
    const updatedStatus = (req.body as Partial<OrderDoc>).status
    if ((updatedStatus === 'enviado' || updatedStatus === 'rascunho') && existing) {
      await upsertPaymentsForOrder(existing.userId, existing.userName, existing.colmeiaId, existing.weekId.slice(0, 7))
    }
    res.json({ id: req.params['id'], ...updates })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
