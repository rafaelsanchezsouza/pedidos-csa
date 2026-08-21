import { Router, type Request, type Response } from 'express'
import type { EngineDeps } from '../repo.js'
import type { ProducerDoc } from '../../types.js'
import '../types.js'
import { carregarAtor, ehAdmin, negar, podeMexerNoProducer } from '../auth.js'

export type { ProducerDoc }

export function createProducersRouter({ repo }: EngineDeps): Router {
  const router = Router()

  // Criar fornecedor é ato de admin; editar/excluir o fornecedor pode ser dele mesmo.
  async function podeMexer(req: Request, res: Response, tenantId?: string, producerId?: string) {
    const ator = await carregarAtor(repo, req.user!.uid)
    if (podeMexerNoProducer(ator, tenantId, producerId)) return true
    negar(res)
    return false
  }

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
      const ator = await carregarAtor(repo, req.user!.uid)
      if (!ehAdmin(ator, data.tenantId)) { negar(res); return }
      const producer = await repo.createDoc<ProducerDoc>('producers', data)
      res.status(201).json(producer)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string
      const atual = await repo.getDoc<ProducerDoc>('producers', id)
      if (!atual) { res.status(404).json({ message: 'Fornecedor não encontrado' }); return }
      if (!(await podeMexer(req, res, atual.tenantId, id))) return
      const updates = req.body as Partial<ProducerDoc>
      await repo.updateDoc<ProducerDoc>('producers', req.params.id as string, updates)
      res.json({ id: req.params.id, ...updates })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string
      const atual = await repo.getDoc<ProducerDoc>('producers', id)
      if (!atual) { res.status(404).json({ message: 'Fornecedor não encontrado' }); return }
      const ator = await carregarAtor(repo, req.user!.uid)
      if (!ehAdmin(ator, atual.tenantId)) { negar(res); return }
      await repo.deleteDoc('producers', req.params['id'] as string)
      res.status(204).send()
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
