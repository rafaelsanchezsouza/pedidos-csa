import { Router, Request, Response } from 'express'
import { listDocs, createDoc, updateDoc, deleteDoc } from '../repositories/firestore.js'

const router = Router()

interface ProductDoc {
  name: string
  unit: string
  price: number
  producerId: string
  colmeiaId: string
  dateUpdated: string
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.query.colmeiaId as string | undefined) || req.colmeiaId
    if (!colmeiaId) { res.status(400).json({ message: 'colmeiaId obrigatório' }); return }
    const products = await listDocs<ProductDoc>('products', [['colmeiaId', '==', colmeiaId]])
    res.json(products)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as Omit<ProductDoc, 'dateUpdated'>
    const product = await createDoc<ProductDoc>('products', { ...data, dateUpdated: new Date().toISOString() })
    res.status(201).json(product)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates = { ...req.body as Partial<ProductDoc>, dateUpdated: new Date().toISOString() }
    await updateDoc<ProductDoc>('products', req.params['id'] as string, updates)
    res.json({ id: req.params['id'], ...updates })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteDoc('products', req.params['id'] as string)
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
