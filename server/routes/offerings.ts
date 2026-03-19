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

// POST /api/offerings/fallback — copia última oferta de produtores sem oferta na semana
router.post('/fallback', async (req: Request, res: Response) => {
  try {
    const { weekStart, colmeiaId: bodyColmeiaId, producerId } = req.body as {
      weekStart: string; colmeiaId: string; producerId?: string
    }
    const colmeiaId = bodyColmeiaId || req.colmeiaId
    if (!colmeiaId || !weekStart) {
      res.status(400).json({ message: 'weekStart e colmeiaId obrigatórios' }); return
    }

    // Produtores a processar
    const producerFilter: Array<[string, FirebaseFirestore.WhereFilterOp, unknown]> = [
      ['colmeiaId', '==', colmeiaId],
    ]
    if (producerId) producerFilter.push(['id', '==', producerId])

    // Ofertas já existentes nesta semana
    const thisWeek = await listDocs<OfferingDoc>('weekly_offerings', [
      ['colmeiaId', '==', colmeiaId],
      ['weekStart', '==', weekStart],
      ...(producerId ? [['producerId', '==', producerId] as [string, FirebaseFirestore.WhereFilterOp, unknown]] : []),
    ])
    const alreadyHas = new Set(thisWeek.map((o) => o.producerId))

    // Todas as ofertas anteriores da colmeia
    const allOfferings = await listDocs<OfferingDoc>('weekly_offerings', [
      ['colmeiaId', '==', colmeiaId],
    ])

    // Para cada produtor sem oferta esta semana, buscar a mais recente
    const producerIds = producerId
      ? [producerId]
      : [...new Set(allOfferings.map((o) => o.producerId))].filter((pid) => !alreadyHas.has(pid))

    const created: OfferingDoc[] = []
    for (const pid of producerIds) {
      if (alreadyHas.has(pid)) continue
      const previous = allOfferings
        .filter((o) => o.producerId === pid && o.weekStart < weekStart)
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      if (!previous[0]) continue
      const fallback = await createDoc<OfferingDoc>('weekly_offerings', {
        ...previous[0],
        weekStart,
        rawMessage: undefined,
        dateCreated: new Date().toISOString(),
      })
      created.push(fallback)
    }

    res.status(201).json(created)
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
