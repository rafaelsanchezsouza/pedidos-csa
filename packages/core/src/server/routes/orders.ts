import { Router, type Request, type Response } from 'express'
import { isAdmin } from '../../acesso.js'
import type { EngineDeps, WhatsAppGateway } from '../repo.js'
import type { PaymentService } from '../services/payments.js'
import type { OrdersService } from '../services/orders.js'
import type { OrderDoc, OrderItem } from '../../types.js'
import '../types.js'

export type { OrderDoc, OrderItem }

export interface OrdersDeps extends EngineDeps {
  payments: PaymentService
  orders: OrdersService
  whatsapp: WhatsAppGateway
}

export function createOrdersRouter({ repo, payments, orders, whatsapp }: OrdersDeps): Router {
  const router = Router()

  router.get('/my', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || req.tenantId
      const weekId = req.query.weekId as string
      if (!tenantId || !weekId) { res.status(400).json({ message: 'tenantId e weekId obrigatórios' }); return }
      const list = await repo.listDocs<OrderDoc>('orders', [
        ['userId', '==', req.user!.uid],
        ['tenantId', '==', tenantId],
        ['weekId', '==', weekId],
      ])
      res.json(list[0] ?? null)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.get('/consolidated', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || req.tenantId
      const weekId = req.query.weekId as string
      if (!tenantId || !weekId) { res.status(400).json({ message: 'tenantId e weekId obrigatórios' }); return }
      res.json(await repo.listDocs<OrderDoc>('orders', [
        ['tenantId', '==', tenantId],
        ['weekId', '==', weekId],
      ]))
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // GET /consolidated-text?weekId=&tenantId=&producerId=
  router.get('/consolidated-text', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || req.tenantId
      const weekId = req.query.weekId as string
      const producerId = req.query.producerId as string
      if (!tenantId || !weekId || !producerId) {
        res.status(400).json({ message: 'tenantId, weekId e producerId obrigatórios' }); return
      }
      const text = await orders.buildConsolidatedText(tenantId, weekId, producerId)
      res.json({ text })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // GET /week-lock?weekId=&tenantId=
  router.get('/week-lock', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || req.tenantId
      const weekId = req.query.weekId as string
      if (!tenantId || !weekId) { res.status(400).json({ message: 'tenantId e weekId obrigatórios' }); return }
      res.json({ locked: await orders.isWeekLocked(tenantId, weekId) })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // POST /send-consolidated-whatsapp
  router.post('/send-consolidated-whatsapp', async (req: Request, res: Response) => {
    try {
      const { tenantId: bodyTenantId, weekId, producerId } = req.body as { tenantId?: string; weekId: string; producerId: string }
      const tenantId = bodyTenantId || req.tenantId
      if (!tenantId || !weekId || !producerId) {
        res.status(400).json({ message: 'tenantId, weekId e producerId obrigatórios' }); return
      }

      const producers = await repo.listDocs<{ name: string; contact: string }>('producers', [
        ['tenantId', '==', tenantId],
      ])
      const producer = producers.find((p) => p.id === producerId)
      if (!producer?.contact) {
        res.status(400).json({ message: 'Produtor sem número de contato cadastrado' }); return
      }

      const text = await orders.buildConsolidatedText(tenantId, weekId, producerId)
      if (!text) { res.status(400).json({ message: 'Nenhum pedido enviado para este produtor na semana' }); return }
      await whatsapp.sendMessage(producer.contact, text)
      await orders.lockWeek(tenantId, weekId)

      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // PATCH /recebido — admin marca recebido para um membro na semana
  router.patch('/recebido', async (req: Request, res: Response) => {
    try {
      const { userId, userName, weekId, tenantId: bodyTenantId, recebido } = req.body as {
        userId: string; userName: string; weekId: string; tenantId: string; recebido: boolean
      }
      const tenantId = bodyTenantId || req.tenantId
      if (!userId || !weekId || !tenantId) {
        res.status(400).json({ message: 'userId, weekId e tenantId obrigatórios' }); return
      }
      const existing = await repo.listDocs<OrderDoc>('orders', [
        ['userId', '==', userId],
        ['tenantId', '==', tenantId],
        ['weekId', '==', weekId],
      ])
      const now = new Date().toISOString()
      if (existing[0]) {
        await repo.updateDoc<OrderDoc>('orders', existing[0].id, { recebido, dateUpdated: now })
        res.json({ id: existing[0].id, recebido })
      } else {
        const created = await repo.createDoc<OrderDoc>('orders', {
          userId, userName: userName ?? '', tenantId, weekId,
          items: [], status: 'rascunho', recebido, dateCreated: now, dateUpdated: now,
        })
        res.json(created)
      }
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // GET /history?tenantId=&userId= (userId opcional, apenas admin)
  router.get('/history', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || req.tenantId
      if (!tenantId) { res.status(400).json({ message: 'tenantId obrigatório' }); return }
      const userId = (req.query.userId as string) || req.user!.uid
      const list = await repo.listDocs<OrderDoc>('orders', [
        ['userId', '==', userId],
        ['tenantId', '==', tenantId],
      ])
      list.sort((a, b) => b.weekId.localeCompare(a.weekId))
      res.json(list)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // GET /monthly?month=YYYY-MM&tenantId= (pedidos enviados do mês do usuário autenticado)
  router.get('/monthly', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || req.tenantId
      const month = req.query.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      const list = await repo.listDocs<OrderDoc>('orders', [
        ['userId', '==', req.user!.uid],
        ['tenantId', '==', tenantId],
      ])
      res.json(list
        .filter((o) => o.status === 'enviado' && o.weekId.startsWith(month))
        .sort((a, b) => a.weekId.localeCompare(b.weekId)))
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // Gate de extras: com extrasAberto=false só admin cria/edita pedido.
  const extrasFechadosPara = async (uid: string, tenantId: string): Promise<boolean> => {
    const [user, tenant] = await Promise.all([
      repo.getDoc<{ acesso?: unknown }>('users', uid),
      repo.getDoc<{ extrasAberto?: boolean }>('tenants', tenantId),
    ])
    const extrasAberto = tenant?.extrasAberto ?? true
    return !extrasAberto && !isAdmin(user?.acesso)
  }

  router.post('/', async (req: Request, res: Response) => {
    try {
      const data = req.body as Omit<OrderDoc, 'dateCreated' | 'dateUpdated'>
      if (await extrasFechadosPara(req.user!.uid, data.tenantId)) {
        res.status(403).json({ message: 'Pedidos de extras estão encerrados no momento' }); return
      }
      const now = new Date().toISOString()
      const order = await repo.createDoc<OrderDoc>('orders', { ...data, dateCreated: now, dateUpdated: now })
      if (order.status === 'enviado') {
        await payments.upsertPaymentsForOrder(order.userId, order.userName, order.tenantId, order.weekId.slice(0, 7))
      }
      res.status(201).json(order)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const existing = await repo.getDoc<OrderDoc>('orders', req.params['id'] as string)
      if (existing && await extrasFechadosPara(req.user!.uid, existing.tenantId)) {
        res.status(403).json({ message: 'Pedidos de extras estão encerrados no momento' }); return
      }
      const updates = { ...req.body as Partial<OrderDoc>, dateUpdated: new Date().toISOString() }
      await repo.updateDoc<OrderDoc>('orders', req.params['id'] as string, updates)
      const updatedStatus = (req.body as Partial<OrderDoc>).status
      if ((updatedStatus === 'enviado' || updatedStatus === 'rascunho') && existing) {
        await payments.upsertPaymentsForOrder(existing.userId, existing.userName, existing.tenantId, existing.weekId.slice(0, 7))
      }
      res.json({ id: req.params['id'], ...updates })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
