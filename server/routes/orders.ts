import { Router, Request, Response } from 'express'
import { listDocs, createDoc, updateDoc } from '../repositories/firestore.js'

const router = Router()

interface OrderItem {
  productId: string
  productName: string
  unit: string
  price: number
  qty: number
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

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as Omit<OrderDoc, 'dateCreated' | 'dateUpdated'>
    const now = new Date().toISOString()
    const order = await createDoc<OrderDoc>('orders', { ...data, dateCreated: now, dateUpdated: now })
    res.status(201).json(order)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates = { ...req.body as Partial<OrderDoc>, dateUpdated: new Date().toISOString() }
    await updateDoc<OrderDoc>('orders', req.params['id'] as string, updates)
    res.json({ id: req.params['id'], ...updates })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
