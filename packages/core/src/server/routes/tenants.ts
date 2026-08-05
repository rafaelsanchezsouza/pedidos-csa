import { Router, type Request, type Response } from 'express'
import { isSuperadmin, isAdmin } from '../../acesso.js'
import type { AppConfig } from '../../config.js'
import type { QuotaTier } from '../../types.js'
import type { EngineDeps } from '../repo.js'
import '../types.js'

// Doc do tenant como está no banco. Vai para o modelo canônico completo na task de types.
export interface TenantDoc {
  name: string
  adminId: string
  dateCreated: string
  quotas?: QuotaTier[]
  quotaTerm?: string
  quotaInteira?: number
  quotaMeia?: number
  dueDay?: number
  orderSendDay?: number
  orderSendHour?: number
  weekChangeDay?: number
  extrasAberto?: boolean
}

interface UserAccessDoc {
  tenantId?: string
  acesso?: unknown
  role?: string
}

// Valida/normaliza a lista de tiers recebida do cliente.
function sanitizeQuotas(raw: unknown): QuotaTier[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw
    .filter((q): q is { name: unknown; price: unknown } => !!q && typeof q === 'object')
    .map((q) => ({ name: String((q as { name: unknown }).name ?? '').trim(), price: Number((q as { price: unknown }).price) || 0 }))
    .filter((q) => q.name)
}

export function createTenantsRouter({ repo }: EngineDeps, config: AppConfig): Router {
  const router = Router()

  router.get('/', async (req: Request, res: Response) => {
    try {
      const uid = req.user!.uid
      const userData = await repo.getDoc<UserAccessDoc>('users', uid)

      if (isSuperadmin(userData?.acesso) || userData?.role === 'superadmin') {
        const tenants = await repo.listDocs<TenantDoc>('tenants')
        res.json(tenants)
      } else if (userData?.tenantId) {
        const tenant = await repo.getDoc<TenantDoc>('tenants', userData.tenantId)
        res.json(tenant ? [tenant] : [])
      } else {
        res.json([])
      }
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const tenant = await repo.getDoc<TenantDoc>('tenants', req.params['id'] as string)
      if (!tenant) { res.status(404).json({ message: 'Não encontrado' }); return }
      res.json(tenant)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { name } = req.body as { name: string }
      const d = config.tenantDefaults
      const tenant = await repo.createDoc<TenantDoc>('tenants', {
        name,
        adminId: req.user!.uid,
        dateCreated: new Date().toISOString(),
        quotaTerm: d.quotaTerm,
        quotas: d.quotas,
        quotaInteira: d.quotaInteira,
        quotaMeia: d.quotaMeia,
        dueDay: d.dueDay,
      })
      // No modelo catálogo a própria loja é o fornecedor único (colapsado na UI); no modelo
      // parse-message os fornecedores são cadastrados de verdade — nada a semear.
      if (config.capabilities.offeringSource === 'from-catalog') {
        await repo.createDoc('producers', { name, contact: '', tenantId: tenant.id })
      }
      res.status(201).json(tenant)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const userData = await repo.getDoc<UserAccessDoc>('users', req.user!.uid)
      const isSuperAdmin = isSuperadmin(userData?.acesso)
      const isTenantAdmin = isAdmin(userData?.acesso) && userData?.tenantId === req.params['id']
      if (!isSuperAdmin && !isTenantAdmin) {
        res.status(403).json({ message: 'Sem permissão' }); return
      }
      const { quotas, quotaTerm, quotaInteira, quotaMeia, dueDay, orderSendDay, orderSendHour, weekChangeDay, extrasAberto } = req.body as {
        quotas?: unknown; quotaTerm?: string
        quotaInteira?: number; quotaMeia?: number; dueDay?: number
        orderSendDay?: number; orderSendHour?: number; weekChangeDay?: number
        extrasAberto?: boolean
      }
      const updates: Partial<TenantDoc> = {}
      const tiers = sanitizeQuotas(quotas)
      if (tiers !== undefined) updates.quotas = tiers
      if (quotaTerm !== undefined) updates.quotaTerm = String(quotaTerm).trim()
      if (quotaInteira !== undefined) updates.quotaInteira = quotaInteira
      if (quotaMeia !== undefined) updates.quotaMeia = quotaMeia
      if (dueDay !== undefined) updates.dueDay = dueDay
      if (orderSendDay !== undefined) updates.orderSendDay = orderSendDay
      if (orderSendHour !== undefined) updates.orderSendHour = orderSendHour
      if (weekChangeDay !== undefined) updates.weekChangeDay = weekChangeDay
      if (extrasAberto !== undefined) updates.extrasAberto = extrasAberto
      await repo.updateDoc<TenantDoc>('tenants', req.params['id'] as string, updates)
      const tenant = await repo.getDoc<TenantDoc>('tenants', req.params['id'] as string)
      res.json(tenant)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
