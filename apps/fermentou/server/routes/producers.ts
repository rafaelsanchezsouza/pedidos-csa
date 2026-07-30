import { Router, Request, Response } from 'express'
import { listDocs, createDoc, updateDoc, deleteDoc } from '../repositories/firestore.js'

const router = Router()

interface ProducerDoc {
  name: string
  contact: string
  tenantId: string
  pixKey?: string
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string | undefined) || req.tenantId
    if (!tenantId) { res.status(400).json({ message: 'tenantId obrigatório' }); return }
    const producers = await listDocs<ProducerDoc>('producers', [['tenantId', '==', tenantId]])
    res.json(producers)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as ProducerDoc
    const producer = await createDoc<ProducerDoc>('producers', data)
    res.status(201).json(producer)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body as Partial<ProducerDoc>
    await updateDoc<ProducerDoc>('producers', req.params.id as string, updates)
    res.json({ id: req.params.id, ...updates })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteDoc('producers', req.params['id'] as string)
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
