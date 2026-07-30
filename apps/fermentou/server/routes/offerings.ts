import { Router, Request, Response } from 'express'
import { listDocs, createDoc, updateDoc, db } from '../repositories/firestore.js'

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
  tenantId: string
  items: OfferingItem[]
  weekStart: string
  dateCreated: string
}

interface ProductDoc {
  name: string
  unit: string
  price: number
  producerId: string
  tenantId: string
  dateUpdated: string
  type?: 'fixo' | 'extra'
  ativo?: boolean
}

interface OrderDoc {
  userId: string
  userName: string
  tenantId: string
  weekId: string
  items: Array<{ productId: string; offeringId: string; [key: string]: unknown }>
  dateUpdated: string
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || req.tenantId
    const weekId = req.query.weekId as string
    if (!tenantId) { res.status(400).json({ message: 'tenantId obrigatório' }); return }
    const filters: Array<[string, FirebaseFirestore.WhereFilterOp, unknown]> = [
      ['tenantId', '==', tenantId],
    ]
    if (weekId) filters.push(['weekStart', '==', weekId])
    const offerings = await listDocs<OfferingDoc>('weekly_offerings', filters)
    res.json(offerings)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// POST /api/offerings/fallback — copia última oferta de produtores sem oferta na semana
router.post('/fallback', async (req: Request, res: Response) => {
  try {
    const { weekStart, tenantId: bodyTenantId, producerId } = req.body as {
      weekStart: string; tenantId: string; producerId?: string
    }
    const tenantId = bodyTenantId || req.tenantId
    if (!tenantId || !weekStart) {
      res.status(400).json({ message: 'weekStart e tenantId obrigatórios' }); return
    }

    // Produtores a processar
    const producerFilter: Array<[string, FirebaseFirestore.WhereFilterOp, unknown]> = [
      ['tenantId', '==', tenantId],
    ]
    if (producerId) producerFilter.push(['id', '==', producerId])

    // Ofertas já existentes nesta semana
    const thisWeek = await listDocs<OfferingDoc>('weekly_offerings', [
      ['tenantId', '==', tenantId],
      ['weekStart', '==', weekStart],
      ...(producerId ? [['producerId', '==', producerId] as [string, FirebaseFirestore.WhereFilterOp, unknown]] : []),
    ])
    const alreadyHas = new Set(thisWeek.map((o) => o.producerId))

    // Todas as ofertas anteriores da tenant
    const allOfferings = await listDocs<OfferingDoc>('weekly_offerings', [
      ['tenantId', '==', tenantId],
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
      const { id: _id, ...prevData } = previous[0]
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

// Publica a oferta da semana de um produtor: normaliza os itens pelo catálogo,
// substitui a oferta anterior da mesma semana e reabre os extras se fechados.
async function upsertOffering(data: Omit<OfferingDoc, 'dateCreated'>) {
  const existingProducts = await listDocs<ProductDoc>('products', [
    ['tenantId', '==', data.tenantId],
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
        tenantId: data.tenantId,
        dateUpdated,
      })
      return { ...item, productId: created.id }
    })
  )

  // Deduplica por productId (o mesmo produto pode entrar duas vezes na oferta)
  const seen = new Set<string>()
  const deduped = resolvedItems.filter((i) => {
    if (seen.has(i.productId)) return false
    seen.add(i.productId)
    return true
  })

  // Substitui se já existir oferta do mesmo produtor na mesma semana
  const existing = await listDocs<OfferingDoc>('weekly_offerings', [
    ['tenantId', '==', data.tenantId],
    ['producerId', '==', data.producerId],
    ['weekStart', '==', data.weekStart],
  ])

  let offering
  const anterior = existing[0]
  if (anterior) {
    await updateDoc<OfferingDoc>('weekly_offerings', anterior.id, { items: deduped })
    offering = { ...anterior, items: deduped }

    // Produtos removidos da oferta → descartar dos pedidos da semana
    const prevIds = new Set(anterior.items.map((i) => i.productId))
    const newIds = new Set(deduped.map((i) => i.productId))
    const removidos = [...prevIds].filter((id) => !newIds.has(id))
    if (removidos.length > 0) {
      const orders = await listDocs<OrderDoc>('orders', [
        ['tenantId', '==', data.tenantId],
        ['weekId', '==', data.weekStart],
      ])
      const affected = orders.filter((o) =>
        o.items.some((item) => item.offeringId === anterior.id && removidos.includes(item.productId))
      )
      const now = new Date().toISOString()
      await Promise.all(affected.map((o) =>
        updateDoc<OrderDoc>('orders', o.id, {
          items: o.items.filter(
            (item) => !(item.offeringId === anterior.id && removidos.includes(item.productId))
          ),
          dateUpdated: now,
        })
      ))
    }
  } else {
    offering = await createDoc<OfferingDoc>('weekly_offerings', {
      ...data,
      items: deduped,
      dateCreated: new Date().toISOString(),
    })
  }

  // Auto-desbloqueio: nova oferta publicada → reabrir pedidos se estiverem fechados
  const tenantSnap = await db.collection('tenants').doc(data.tenantId).get()
  const extrasAtual = (tenantSnap.data() as { extrasAberto?: boolean } | undefined)?.extrasAberto ?? true
  if (!extrasAtual) {
    await db.collection('tenants').doc(data.tenantId).update({ extrasAberto: true })
      .catch((err) => console.error('[offerings] auto-unlock falhou:', err))
  }

  return offering
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const offering = await upsertOffering(req.body as Omit<OfferingDoc, 'dateCreated'>)
    res.status(201).json(offering)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// POST /api/offerings/from-catalog — gera a oferta da semana a partir do catálogo ativo.
// Substitui o parsing de mensagem de produtor da CSA: aqui o cardápio é estável e a
// oferta é o próprio catálogo do produtor, opcionalmente ajustado depois pelo admin.
router.post('/from-catalog', async (req: Request, res: Response) => {
  try {
    const { weekStart, tenantId: bodyTenantId, producerId } = req.body as {
      weekStart: string; tenantId?: string; producerId?: string
    }
    const tenantId = bodyTenantId || req.tenantId
    if (!tenantId || !weekStart) {
      res.status(400).json({ message: 'weekStart e tenantId obrigatórios' }); return
    }

    const productFilters: Array<[string, FirebaseFirestore.WhereFilterOp, unknown]> = [
      ['tenantId', '==', tenantId],
    ]
    if (producerId) productFilters.push(['producerId', '==', producerId])
    const produtos = (await listDocs<ProductDoc>('products', productFilters))
      .filter((p) => p.ativo !== false)

    if (produtos.length === 0) {
      res.status(201).json([]); return
    }

    const producers = await listDocs<{ name: string }>('producers', [['tenantId', '==', tenantId]])
    const producerNames = new Map(producers.map((p) => [p.id, p.name]))

    // Um produto pertence a um produtor; a oferta é publicada por produtor
    const porProdutor = new Map<string, (ProductDoc & { id: string })[]>()
    for (const p of produtos) {
      const lista = porProdutor.get(p.producerId) ?? []
      lista.push(p)
      porProdutor.set(p.producerId, lista)
    }

    const created = []
    for (const [pid, lista] of porProdutor) {
      const offering = await upsertOffering({
        producerId: pid,
        producerName: producerNames.get(pid) ?? '',
        tenantId,
        weekStart,
        items: lista.map((p) => ({
          productId: p.id,
          productName: p.name,
          unit: p.unit,
          price: p.price,
          type: p.type ?? 'extra',
        })),
      })
      created.push(offering)
    }

    res.status(201).json(created)
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
