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
  dateUpdated: string
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
    const { rawMessage, colmeiaId, producerId } = req.body as { rawMessage: string; colmeiaId: string; producerId?: string }
    const id = colmeiaId || req.colmeiaId
    if (!id) { res.status(400).json({ message: 'colmeiaId obrigatório' }); return }

    const productFilters: Array<[string, FirebaseFirestore.WhereFilterOp, unknown]> = [['colmeiaId', '==', id]]
    if (producerId) productFilters.push(['producerId', '==', producerId])
    const existingProducts = await listDocs<ProductDoc>('products', productFilters)
    const catalog = existingProducts.map((p) => ({ id: p.id, name: p.name, unit: p.unit, price: p.price }))
    const parsed = await parseProducerMessage(rawMessage, catalog)

    // Enriquece com preço do catálogo quando não discriminado na mensagem
    const priceMap = new Map(catalog.map((p) => [p.id, p.price]))
    const enriched = parsed.map((item) => ({
      ...item,
      price: item.matchedProductId ? (priceMap.get(item.matchedProductId) ?? item.price) : item.price,
    }))
    res.json(enriched)
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
      const { id: _id, rawMessage: _raw, ...prevData } = previous[0]
      const fallback = await createDoc<OfferingDoc>('weekly_offerings', {
        ...prevData,
        weekStart,
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
    const existingProducts = await listDocs<ProductDoc>('products', [
      ['colmeiaId', '==', data.colmeiaId],
      ['producerId', '==', data.producerId],
    ])
    const catalogMap = new Map(existingProducts.map((p) => [p.id, { name: p.name }]))
    const dateUpdated = new Date().toISOString()

    // Resolve itens: normaliza nome pelo catálogo e atualiza preço/unidade; cria produto novo quando não existir
    const resolvedItems: OfferingItem[] = await Promise.all(
      data.items.map(async (item) => {
        const cat = catalogMap.get(item.productId)
        if (cat) {
          await updateDoc<ProductDoc>('products', item.productId, { price: item.price, unit: item.unit, dateUpdated })
          return { ...item, productName: cat.name }
        }
        const created = await createDoc<ProductDoc>('products', {
          name: item.productName,
          unit: item.unit,
          price: item.price,
          producerId: data.producerId,
          colmeiaId: data.colmeiaId,
          dateUpdated,
        })
        return { ...item, productId: created.id }
      })
    )

    // Deduplica por productId (mesmo produto pode vir com nomes diferentes na mensagem)
    const seen = new Set<string>()
    const deduped = resolvedItems.filter((i) => {
      if (seen.has(i.productId)) return false
      seen.add(i.productId)
      return true
    })

    // Substitui se já existir oferta do mesmo produtor na mesma semana
    const existing = await listDocs<OfferingDoc>('weekly_offerings', [
      ['colmeiaId', '==', data.colmeiaId],
      ['producerId', '==', data.producerId],
      ['weekStart', '==', data.weekStart],
    ])

    let offering
    if (existing[0]) {
      await updateDoc<OfferingDoc>('weekly_offerings', existing[0].id, {
        items: deduped,
        rawMessage: data.rawMessage,
      })
      offering = { ...existing[0], items: deduped, rawMessage: data.rawMessage }
    } else {
      offering = await createDoc<OfferingDoc>('weekly_offerings', {
        ...data,
        items: deduped,
        dateCreated: new Date().toISOString(),
      })
    }
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
