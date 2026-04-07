import { Router, Request, Response } from 'express'
import { listDocs, updateDoc } from '../repositories/firestore.js'
import { generateQuotaForUser, generateQuotaForAll } from '../services/paymentService.js'

export { upsertPaymentsForOrder } from '../services/paymentService.js'

const router = Router()

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

// POST /api/payments/quota — cria/atualiza pagamento de cota do mês
router.post('/quota', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.body.colmeiaId as string) || req.colmeiaId
    const month = req.body.month as string
    const uid = req.user!.uid
    if (!colmeiaId || !month) { res.status(400).json({ message: 'colmeiaId e month obrigatórios' }); return }
    const result = await generateQuotaForUser(uid, colmeiaId, month)
    res.json(result)
  } catch (err) {
    const msg = String(err)
    if (msg.includes('sem cota definida')) { res.status(400).json({ message: msg }); return }
    res.status(500).json({ message: msg })
  }
})

// POST /api/payments/quota/all — garante doc de cota para todos os membros elegíveis (admin)
router.post('/quota/all', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.body.colmeiaId as string) || req.colmeiaId
    const month = req.body.month as string
    if (!colmeiaId || !month) { res.status(400).json({ message: 'colmeiaId e month obrigatórios' }); return }
    const result = await generateQuotaForAll(colmeiaId, month)
    res.json(result)
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
