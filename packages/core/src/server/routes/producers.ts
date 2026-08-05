import { Router, type Request, type Response } from 'express'
import type { EngineDeps } from '../repo.js'
import '../types.js'

export interface ProducerDoc {
  name: string
  contact: string
  tenantId: string
  pixKey?: string
}

export function createProducersRouter({ repo }: EngineDeps): Router {
  const router = Router()

  router.get('/', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string | undefined) || req.tenantId
      if (!tenantId) { res.status(400).json({ message: 'tenantId obrigatório' }); return }
      const producers = await repo.listDocs<ProducerDoc>('producers', [['tenantId', '==', tenantId]])
      res.json(producers)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.post('/', async (req: Request, res: Response) => {
    try {
      const data = req.body as ProducerDoc
      const producer = await repo.createDoc<ProducerDoc>('producers', data)
      res.status(201).json(producer)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const updates = req.body as Partial<ProducerDoc>
      await repo.updateDoc<ProducerDoc>('producers', req.params.id as string, updates)
      res.json({ id: req.params.id, ...updates })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await repo.deleteDoc('producers', req.params['id'] as string)
      res.status(204).send()
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
