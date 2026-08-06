import { Router, type Request, type Response } from 'express'
import type { AppConfig } from '../../config.js'
import type { EngineDeps, Repo, WhereFilter } from '../repo.js'
import type { MessageParser } from '../parseMessage.js'
import { fuzzyMessageParser } from '../fuzzyParser.js'
import type { OfferingDoc, OfferingItem, OrderDoc, ProductDoc } from '../../types.js'
import '../types.js'

export type { OfferingDoc, OfferingItem }

export interface OfferingsDeps extends EngineDeps {
  // Obrigatório sse capabilities.messageParser='openai' (o adapter vive no app;
  // 'fuzzy' é servido pelo próprio core).
  parseMessage?: MessageParser
}

// Publica a oferta da semana de um produtor: normaliza os itens pelo catálogo,
// substitui a oferta anterior da mesma semana e reabre os extras se fechados.
async function upsertOffering(repo: Repo, data: Omit<OfferingDoc, 'dateCreated'>) {
  const existingProducts = await repo.listDocs<ProductDoc>('products', [
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
        await repo.updateDoc<ProductDoc>('products', item.productId, { price: item.price, unit: item.unit, dateUpdated })
        return { ...item, productName: cat.name }
      }
      const created = await repo.createDoc<ProductDoc>('products', {
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
  const existing = await repo.listDocs<OfferingDoc>('weekly_offerings', [
    ['tenantId', '==', data.tenantId],
    ['producerId', '==', data.producerId],
    ['weekStart', '==', data.weekStart],
  ])

  let offering
  const anterior = existing[0]
  if (anterior) {
    const updates: Partial<OfferingDoc> = {
      items: deduped,
      ...(data.rawMessage !== undefined ? { rawMessage: data.rawMessage } : {}),
    }
    await repo.updateDoc<OfferingDoc>('weekly_offerings', anterior.id, updates)
    offering = { ...anterior, ...updates }

    // Produtos removidos da oferta → descartar dos pedidos da semana
    const prevIds = new Set(anterior.items.map((i) => i.productId))
    const newIds = new Set(deduped.map((i) => i.productId))
    const removidos = [...prevIds].filter((id) => !newIds.has(id))
    if (removidos.length > 0) {
      const orders = await repo.listDocs<OrderDoc>('orders', [
        ['tenantId', '==', data.tenantId],
        ['weekId', '==', data.weekStart],
      ])
      const affected = orders.filter((o) =>
        o.items.some((item) => item.offeringId === anterior.id && removidos.includes(item.productId))
      )
      const now = new Date().toISOString()
      await Promise.all(affected.map((o) =>
        repo.updateDoc<OrderDoc>('orders', o.id, {
          items: o.items.filter(
            (item) => !(item.offeringId === anterior.id && removidos.includes(item.productId))
          ),
          dateUpdated: now,
        })
      ))
    }
  } else {
    offering = await repo.createDoc<OfferingDoc>('weekly_offerings', {
      ...data,
      items: deduped,
      dateCreated: new Date().toISOString(),
    })
  }

  // Auto-desbloqueio: nova oferta publicada → reabrir pedidos se estiverem fechados
  const tenant = await repo.getDoc<{ extrasAberto?: boolean }>('tenants', data.tenantId)
  if (tenant && tenant.extrasAberto === false) {
    await repo.updateDoc('tenants', data.tenantId, { extrasAberto: true })
      .catch((err) => console.error('[offerings] auto-unlock falhou:', err))
  }

  return offering
}

export function createOfferingsRouter(deps: OfferingsDeps, config: AppConfig): Router {
  const { repo } = deps
  const router = Router()

  router.get('/', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string | undefined) || req.tenantId
      const weekId = req.query.weekId as string | undefined
      if (!tenantId) { res.status(400).json({ message: 'tenantId obrigatório' }); return }
      const filters: WhereFilter[] = [['tenantId', '==', tenantId]]
      if (weekId) filters.push(['weekStart', '==', weekId])
      const offerings = await repo.listDocs<OfferingDoc>('weekly_offerings', filters)
      res.json(offerings)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // POST /parse — só na capacidade parse-message: extrai a oferta do texto do produtor.
  if (config.capabilities.offeringSource === 'parse-message') {
    const parse = deps.parseMessage
      ?? (config.capabilities.messageParser === 'fuzzy' ? fuzzyMessageParser : undefined)
    if (!parse) {
      throw new Error("messageParser='openai' exige deps.parseMessage (adapter do app, chave no boot)")
    }
    router.post('/parse', async (req: Request, res: Response) => {
      try {
        const { rawMessage, tenantId: bodyTenantId, producerId } = req.body as {
          rawMessage: string; tenantId?: string; producerId?: string
        }
        const tenantId = bodyTenantId || req.tenantId
        if (!tenantId) { res.status(400).json({ message: 'tenantId obrigatório' }); return }

        const productFilters: WhereFilter[] = [['tenantId', '==', tenantId]]
        if (producerId) productFilters.push(['producerId', '==', producerId])
        const existingProducts = await repo.listDocs<ProductDoc>('products', productFilters)
        const catalog = existingProducts.map((p) => ({ id: p.id, name: p.name, unit: p.unit, price: p.price }))
        const parsed = await parse(rawMessage, catalog)

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
  }

  // POST /from-catalog — só na capacidade from-catalog: a oferta é o catálogo ativo do produtor.
  if (config.capabilities.offeringSource === 'from-catalog') {
    router.post('/from-catalog', async (req: Request, res: Response) => {
      try {
        const { weekStart, tenantId: bodyTenantId, producerId } = req.body as {
          weekStart: string; tenantId?: string; producerId?: string
        }
        const tenantId = bodyTenantId || req.tenantId
        if (!tenantId || !weekStart) {
          res.status(400).json({ message: 'weekStart e tenantId obrigatórios' }); return
        }

        const productFilters: WhereFilter[] = [['tenantId', '==', tenantId]]
        if (producerId) productFilters.push(['producerId', '==', producerId])
        const produtos = (await repo.listDocs<ProductDoc>('products', productFilters))
          .filter((p) => p.ativo !== false)

        if (produtos.length === 0) {
          res.status(201).json([]); return
        }

        const producers = await repo.listDocs<{ name: string }>('producers', [['tenantId', '==', tenantId]])
        const producerNames = new Map(producers.map((p) => [p.id, p.name]))

        // Um produto pertence a um produtor; a oferta é publicada por produtor
        const porProdutor = new Map<string, Array<ProductDoc & { id: string }>>()
        for (const p of produtos) {
          const lista = porProdutor.get(p.producerId) ?? []
          lista.push(p)
          porProdutor.set(p.producerId, lista)
        }

        const created = []
        for (const [pid, lista] of porProdutor) {
          const offering = await upsertOffering(repo, {
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
  }

  // POST /fallback — copia a última oferta de produtores sem oferta na semana
  router.post('/fallback', async (req: Request, res: Response) => {
    try {
      const { weekStart, tenantId: bodyTenantId, producerId } = req.body as {
        weekStart: string; tenantId?: string; producerId?: string
      }
      const tenantId = bodyTenantId || req.tenantId
      if (!tenantId || !weekStart) {
        res.status(400).json({ message: 'weekStart e tenantId obrigatórios' }); return
      }

      // Ofertas já existentes nesta semana
      const thisWeek = await repo.listDocs<OfferingDoc>('weekly_offerings', [
        ['tenantId', '==', tenantId],
        ['weekStart', '==', weekStart],
        ...(producerId ? [['producerId', '==', producerId] as WhereFilter] : []),
      ])
      const alreadyHas = new Set(thisWeek.map((o) => o.producerId))

      // Todas as ofertas anteriores do tenant
      const allOfferings = await repo.listDocs<OfferingDoc>('weekly_offerings', [
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
        const { id: _id, rawMessage: _raw, ...prevData } = previous[0]
        const fallback = await repo.createDoc<OfferingDoc>('weekly_offerings', {
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
      const offering = await upsertOffering(repo, req.body as Omit<OfferingDoc, 'dateCreated'>)
      res.status(201).json(offering)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const updates = req.body as Partial<OfferingDoc>
      await repo.updateDoc<OfferingDoc>('weekly_offerings', req.params['id'] as string, updates)
      res.json({ id: req.params['id'], ...updates })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
