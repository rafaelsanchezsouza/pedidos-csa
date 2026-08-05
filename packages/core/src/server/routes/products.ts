import { Router, type Request, type Response } from 'express'
import type { EngineDeps } from '../repo.js'
import '../types.js'

export interface ProductDoc {
  name: string
  unit: string
  price: number
  producerId: string
  tenantId: string
  dateUpdated: string
  type?: 'fixo' | 'extra'
  ativo?: boolean
}

export function createProductsRouter({ repo }: EngineDeps): Router {
  const router = Router()

  router.get('/', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string | undefined) || req.tenantId
      if (!tenantId) { res.status(400).json({ message: 'tenantId obrigatório' }); return }
      const products = await repo.listDocs<ProductDoc>('products', [['tenantId', '==', tenantId]])
      res.json(products)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.post('/', async (req: Request, res: Response) => {
    try {
      const data = req.body as Omit<ProductDoc, 'dateUpdated'>
      const product = await repo.createDoc<ProductDoc>('products', { ...data, dateUpdated: new Date().toISOString() })
      res.status(201).json(product)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // Importação em lote via CSV: cria vários produtos de uma vez, um resultado por linha.
  router.post('/import-batch', async (req: Request, res: Response) => {
    try {
      const { products } = req.body as { products: Array<Omit<ProductDoc, 'dateUpdated'>> }
      if (!Array.isArray(products) || products.length === 0) {
        res.status(400).json({ message: 'products deve ser array não-vazio' }); return
      }
      const now = new Date().toISOString()
      const results: Array<{ name: string; success: boolean; error?: string }> = []
      for (const p of products) {
        try {
          if (!p.name || !p.producerId || !p.tenantId) throw new Error('nome, fornecedor e tenant obrigatórios')
          await repo.createDoc<ProductDoc>('products', {
            ...p,
            type: p.type ?? 'extra',
            ativo: p.ativo ?? true,
            dateUpdated: now,
          })
          results.push({ name: p.name, success: true })
        } catch (err) {
          results.push({ name: p?.name ?? '', success: false, error: String(err) })
        }
      }
      res.status(200).json({ results })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const updates = { ...req.body as Partial<ProductDoc>, dateUpdated: new Date().toISOString() }
      await repo.updateDoc<ProductDoc>('products', req.params['id'] as string, updates)
      res.json({ id: req.params['id'], ...updates })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      await repo.deleteDoc('products', req.params['id'] as string)
      res.status(204).send()
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
