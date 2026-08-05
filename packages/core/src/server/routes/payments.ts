import { Router, type Request, type Response } from 'express'
import type { EngineDeps } from '../repo.js'
import type { PaymentService, PaymentDoc } from '../services/payments.js'
import '../types.js'

export interface PaymentsDeps extends EngineDeps {
  payments: PaymentService
}

export function createPaymentsRouter({ repo, payments }: PaymentsDeps): Router {
  const router = Router()

  // POST /quota — cria/atualiza pagamento de cota do mês do próprio usuário
  router.post('/quota', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.body.tenantId as string) || req.tenantId
      const month = req.body.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      const result = await payments.generateQuotaForUser(req.user!.uid, tenantId, month)
      res.json(result)
    } catch (err) {
      const msg = String(err)
      if (msg.includes('sem cota definida')) { res.status(400).json({ message: msg }); return }
      res.status(500).json({ message: msg })
    }
  })

  // POST /quota/all — garante doc de cota para todos os membros elegíveis (admin)
  router.post('/quota/all', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.body.tenantId as string) || req.tenantId
      const month = req.body.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      res.json(await payments.generateQuotaForAll(tenantId, month))
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // POST /frete — cria/atualiza a fatura de frete do mês do próprio usuário
  router.post('/frete', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.body.tenantId as string) || req.tenantId
      const month = req.body.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      res.json(await payments.generateFreteForUser(req.user!.uid, tenantId, month))
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // POST /frete/all — gera fatura de frete para todos os membros de entrega (admin)
  router.post('/frete/all', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.body.tenantId as string) || req.tenantId
      const month = req.body.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      res.json(await payments.generateFreteForAll(tenantId, month))
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // GET /my?month=YYYY-MM&tenantId=
  router.get('/my', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || req.tenantId
      const month = req.query.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      const list = await repo.listDocs<PaymentDoc>('payments', [
        ['userId', '==', req.user!.uid],
        ['tenantId', '==', tenantId],
        ['month', '==', month],
      ])
      res.json(list)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // GET /?month=YYYY-MM&tenantId= (admin)
  router.get('/', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || req.tenantId
      const month = req.query.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      const list = await repo.listDocs<PaymentDoc>('payments', [
        ['tenantId', '==', tenantId],
        ['month', '==', month],
      ])
      res.json(list)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // PUT /:id — atualiza proofUrl (usuário) ou verified (admin)
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const updates = { ...req.body as Partial<PaymentDoc>, dateUpdated: new Date().toISOString() }
      await repo.updateDoc<PaymentDoc>('payments', req.params['id'] as string, updates)
      res.json({ id: req.params['id'], ...updates })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
