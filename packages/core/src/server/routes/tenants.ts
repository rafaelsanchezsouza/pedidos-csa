import { Router, type Request, type Response } from 'express'
import { isSuperadmin, isAdmin } from '../../acesso.js'
import type { AppConfig } from '../../config.js'
import type { QuotaTier, TenantDoc } from '../../types.js'
import type { PrecoBairro } from '../../domain/frete.js'
import { relogioDoTenant } from '../../domain/week.js'
import { UTC_OFFSET_PADRAO } from '../../domain/acolhida.js'
import type { EngineDeps } from '../repo.js'
import '../types.js'

export type { TenantDoc }

interface UserAccessDoc {
  tenantId?: string
  acesso?: unknown
  role?: string
}

// Valida/normaliza a lista de tiers recebida do cliente.
// Mesmo saneamento das cotas. Bairro sem nome é descartado; preço vira número (0 = grátis
// de propósito, que é diferente de bairro ausente da tabela).
function sanitizeBairros(raw: unknown): PrecoBairro[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw
    .filter((b): b is { bairro: unknown; price: unknown } => !!b && typeof b === 'object')
    .map((b) => ({
      bairro: String((b as { bairro: unknown }).bairro ?? '').trim(),
      price: Number((b as { price: unknown }).price) || 0,
    }))
    .filter((b) => b.bairro)
}

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
      const {
        quotas, quotaTerm, quotaInteira, quotaMeia, dueDay, orderSendDay, orderSendHour,
        weekChangeDay, extrasAberto, freteDelivery, fretePorBairro, responsavelEntregasId,
      } = req.body as {
        quotas?: unknown; quotaTerm?: string
        quotaInteira?: number; quotaMeia?: number; dueDay?: number
        orderSendDay?: number; orderSendHour?: number; weekChangeDay?: number
        extrasAberto?: boolean
        freteDelivery?: number; fretePorBairro?: unknown; responsavelEntregasId?: string
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
      // `freteDelivery` ficou FORA desta lista desde sempre: a tela mandava, o servidor
      // descartava calado e respondia "Salvo!". É por isso que o frete da CSA é 0 — não foi
      // config esquecida, foi salvamento que nunca funcionou.
      if (freteDelivery !== undefined) updates.freteDelivery = Number(freteDelivery) || 0
      if (responsavelEntregasId !== undefined) updates.responsavelEntregasId = String(responsavelEntregasId)
      const bairros = sanitizeBairros(fretePorBairro)
      if (bairros !== undefined) updates.fretePorBairro = bairros

      // Carimba a vigência quando o frete passa a EXISTIR — por tabela ou pelo padrão. Vale
      // para os dois porque qualquer um deles sozinho já torna um mês cobrável, e `ensureFrete`
      // dispara para o mês que o membro estiver navegando: sem o carimbo, abrir setembro
      // criaria a fatura de setembro. Esquecer o campo é exatamente o erro que cobra o passado.
      const passaAcobrar = (bairros?.length ?? 0) > 0 || (updates.freteDelivery ?? 0) > 0
      if (passaAcobrar) {
        const atual = await repo.getDoc<TenantDoc>('tenants', req.params['id'] as string)
        if (!atual?.freteVigenteDesde) {
          const utcOffset = config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO
          updates.freteVigenteDesde = relogioDoTenant(new Date(), utcOffset).data.slice(0, 7)
        }
      }
      await repo.updateDoc<TenantDoc>('tenants', req.params['id'] as string, updates)
      const tenant = await repo.getDoc<TenantDoc>('tenants', req.params['id'] as string)
      res.json(tenant)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
