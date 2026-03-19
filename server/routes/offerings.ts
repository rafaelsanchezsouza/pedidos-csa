import { Router, Request, Response } from 'express'
import { listDocs, createDoc, updateDoc } from '../repositories/firestore.js'
import { parseProducerMessage } from '../services/parseMessage/index.js'

const router = Router()

interface OfferingItem {
  productId: string
  productName: string
  unit: string
  price: number
  type: 'fixo' | 'extra'
}

interface OfferingDoc {
  producerId: string
  producerName: string
  colmeiaId: string
  items: OfferingItem[]
  weekStart: string
  rawMessage?: string
  dateCreated: string
}

interface ProductDoc {
  name: string
  unit: string
  price: number
  producerId: string
  colmeiaId: string
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.query.colmeiaId as string) || req.colmeiaId
    const weekId = req.query.weekId as string
    if (!colmeiaId) { res.status(400).json({ message: 'colmeiaId obrigatório' }); return }
    const filters: Array<[string, FirebaseFirestore.WhereFilterOp, unknown]> = [
      ['colmeiaId', '==', colmeiaId],
    ]
    if (weekId) filters.push(['weekStart', '==', weekId])
    const offerings = await listDocs<OfferingDoc>('weekly_offerings', filters)
    res.json(offerings)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.post('/parse', async (req: Request, res: Response) => {
  try {
    const { rawMessage, colmeiaId } = req.body as { rawMessage: string; colmeiaId: string }
    const id = colmeiaId || req.colmeiaId
    if (!id) { res.status(400).json({ message: 'colmeiaId obrigatório' }); return }

    const existingProducts = await listDocs<ProductDoc>('products', [['colmeiaId', '==', id]])
    const parsed = await parseProducerMessage(rawMessage, existingProducts.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      price: p.price,
    })))
    res.json(parsed)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as Omit<OfferingDoc, 'dateCreated'>
    const offering = await createDoc<OfferingDoc>('weekly_offerings', {
      ...data,
      dateCreated: new Date().toISOString(),
    })
    res.status(201).json(offering)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body as Partial<OfferingDoc>
    await updateDoc<OfferingDoc>('weekly_offerings', req.params['id'] as string, updates)
    res.json({ id: req.params['id'], ...updates })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
