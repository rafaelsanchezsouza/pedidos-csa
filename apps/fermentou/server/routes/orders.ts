import { Router, Request, Response } from 'express'
import { listDocs, createDoc, updateDoc, getDoc, db } from '../repositories/firestore.js'
import { upsertPaymentsForOrder } from '../services/paymentService.js'
import { sendWhatsAppMessage } from '../services/whatsapp/index.js'
import { buildConsolidatedText, normalizePhone } from '../services/ordersService.js'
import { isAdmin as checkAdmin } from '@pedidos/core'

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
  tenantId: string
  weekId: string
  items: OrderItem[]
  status: 'rascunho' | 'enviado'
  doacao?: boolean
  recebido?: boolean
  weeklyNote?: string
  weeklyAddress?: string
  suspensa?: boolean
  dateCreated: string
  dateUpdated: string
}

router.get('/my', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || req.tenantId
    const weekId = req.query.weekId as string
    if (!tenantId || !weekId) { res.status(400).json({ message: 'tenantId e weekId obrigatórios' }); return }
    const orders = await listDocs<OrderDoc>('orders', [
      ['userId', '==', req.user!.uid],
      ['tenantId', '==', tenantId],
      ['weekId', '==', weekId],
    ])
    res.json(orders[0] ?? null)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.get('/consolidated', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || req.tenantId
    const weekId = req.query.weekId as string
    if (!tenantId || !weekId) { res.status(400).json({ message: 'tenantId e weekId obrigatórios' }); return }
    const orders = await listDocs<OrderDoc>('orders', [
      ['tenantId', '==', tenantId],
      ['weekId', '==', weekId],
    ])
    res.json(orders)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// GET /api/orders/consolidated-text?weekId=&tenantId=&producerId=
router.get('/consolidated-text', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || req.tenantId
    const weekId = req.query.weekId as string
    const producerId = req.query.producerId as string
    if (!tenantId || !weekId || !producerId) {
      res.status(400).json({ message: 'tenantId, weekId e producerId obrigatórios' }); return
    }
    const text = await buildConsolidatedText(tenantId, weekId, producerId)
    res.json({ text })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// GET /api/orders/week-lock?weekId=&tenantId=
router.get('/week-lock', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || req.tenantId
    const weekId = req.query.weekId as string
    if (!tenantId || !weekId) { res.status(400).json({ message: 'tenantId e weekId obrigatórios' }); return }
    const snap = await db.collection('week_locks').doc(`${tenantId}_${weekId}`).get()
    res.json({ locked: snap.exists })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// POST /api/orders/send-consolidated-whatsapp
router.post('/send-consolidated-whatsapp', async (req: Request, res: Response) => {
  try {
    const { tenantId: bodyTenantId, weekId, producerId } = req.body as { tenantId?: string; weekId: string; producerId: string }
    const tenantId = bodyTenantId || req.tenantId
    if (!tenantId || !weekId || !producerId) {
      res.status(400).json({ message: 'tenantId, weekId e producerId obrigatórios' }); return
    }

    const producers = await listDocs<{ name: string; contact: string }>('producers', [
      ['tenantId', '==', tenantId],
    ])
    const producer = producers.find((p) => p.id === producerId)
    if (!producer?.contact) {
      res.status(400).json({ message: 'Produtor sem número de contato cadastrado' }); return
    }

    const text = await buildConsolidatedText(tenantId, weekId, producerId)
    if (!text) { res.status(400).json({ message: 'Nenhum pedido enviado para este produtor na semana' }); return }
    await sendWhatsAppMessage(normalizePhone(producer.contact), text)

    const lockId = `${tenantId}_${weekId}`
    const lockedAt = new Date().toISOString()
    // week_lock e extrasAberto são independentes — falha em um não cancela o outro
    await db.collection('week_locks').doc(lockId).set({ tenantId, weekId, lockedAt })
      .catch((err) => console.error('[send-consolidated] week_lock falhou:', err))
    await db.collection('tenants').doc(tenantId).update({ extrasAberto: false })
      .catch((err) => console.error('[send-consolidated] extrasAberto falhou:', err))

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// PATCH /api/orders/recebido — admin marca recebido para um membro na semana
router.patch('/recebido', async (req: Request, res: Response) => {
  try {
    const { userId, userName, weekId, tenantId: bodyTenantId, recebido } = req.body as {
      userId: string; userName: string; weekId: string; tenantId: string; recebido: boolean
    }
    const tenantId = bodyTenantId || req.tenantId
    if (!userId || !weekId || !tenantId) {
      res.status(400).json({ message: 'userId, weekId e tenantId obrigatórios' }); return
    }
    const existing = await listDocs<OrderDoc>('orders', [
      ['userId', '==', userId],
      ['tenantId', '==', tenantId],
      ['weekId', '==', weekId],
    ])
    const now = new Date().toISOString()
    if (existing[0]) {
      await updateDoc<OrderDoc>('orders', existing[0].id, { recebido, dateUpdated: now })
      res.json({ id: existing[0].id, recebido })
    } else {
      const created = await createDoc<OrderDoc>('orders', {
        userId, userName: userName ?? '', tenantId, weekId,
        items: [], status: 'rascunho', recebido, dateCreated: now, dateUpdated: now,
      })
      res.json(created)
    }
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// GET /api/orders/history?tenantId=&userId= (userId opcional, apenas admin)
router.get('/history', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || req.tenantId
    if (!tenantId) { res.status(400).json({ message: 'tenantId obrigatório' }); return }
    const userId = (req.query.userId as string) || req.user!.uid
    const orders = await listDocs<OrderDoc>('orders', [
      ['userId', '==', userId],
      ['tenantId', '==', tenantId],
    ])
    orders.sort((a, b) => b.weekId.localeCompare(a.weekId))
    res.json(orders)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// GET /api/orders/monthly?month=YYYY-MM&tenantId= (pedidos enviados do mês do usuário autenticado)
router.get('/monthly', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || req.tenantId
    const month = req.query.month as string
    if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
    const orders = await listDocs<OrderDoc>('orders', [
      ['userId', '==', req.user!.uid],
      ['tenantId', '==', tenantId],
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
    const [userSnap, tenantSnap] = await Promise.all([
      db.collection('users').doc(req.user!.uid).get(),
      db.collection('tenants').doc(data.tenantId).get(),
    ])
    const acesso = (userSnap.data() as { acesso?: unknown } | undefined)?.acesso
    const isAdmin = checkAdmin(acesso)
    const extrasAberto = (tenantSnap.data() as { extrasAberto?: boolean } | undefined)?.extrasAberto ?? true
    if (!extrasAberto && !isAdmin) {
      res.status(403).json({ message: 'Pedidos de extras estão encerrados no momento' }); return
    }
    const now = new Date().toISOString()
    const order = await createDoc<OrderDoc>('orders', { ...data, dateCreated: now, dateUpdated: now })
    if (order.status === 'enviado') {
      await upsertPaymentsForOrder(order.userId, order.userName, order.tenantId, order.weekId.slice(0, 7))
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
      const [userSnap, tenantSnap] = await Promise.all([
        db.collection('users').doc(req.user!.uid).get(),
        db.collection('tenants').doc(existing.tenantId).get(),
      ])
      const userData = userSnap.data() as { acesso?: unknown } | undefined
      const isAdmin = checkAdmin(userData?.acesso)
      const extrasAberto = (tenantSnap.data() as { extrasAberto?: boolean } | undefined)?.extrasAberto ?? true
      if (!extrasAberto && !isAdmin) {
        res.status(403).json({ message: 'Pedidos de extras estão encerrados no momento' }); return
      }
    }
    const updates = { ...req.body as Partial<OrderDoc>, dateUpdated: new Date().toISOString() }
    await updateDoc<OrderDoc>('orders', req.params['id'] as string, updates)
    const updatedStatus = (req.body as Partial<OrderDoc>).status
    if ((updatedStatus === 'enviado' || updatedStatus === 'rascunho') && existing) {
      await upsertPaymentsForOrder(existing.userId, existing.userName, existing.tenantId, existing.weekId.slice(0, 7))
    }
    res.json({ id: req.params['id'], ...updates })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
