import { Router, Request, Response } from 'express'
import { listDocs, createDoc, getDoc, updateDoc, db } from '../repositories/firestore.js'
import { isSuperadmin, isAdmin } from '../services/acesso.js'

const router = Router()

interface QuotaTier { name: string; price: number }
interface TenantDoc {
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

// Valida/normaliza a lista de tiers recebida do cliente.
function sanitizeQuotas(raw: unknown): QuotaTier[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw
    .filter((q): q is { name: unknown; price: unknown } => !!q && typeof q === 'object')
    .map((q) => ({ name: String((q as { name: unknown }).name ?? '').trim(), price: Number((q as { price: unknown }).price) || 0 }))
    .filter((q) => q.name)
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid
    const userSnap = await import('../repositories/firestore.js').then(m => m.db.collection('users').doc(uid).get())
    const userData = userSnap.data() as { tenantId?: string; acesso?: unknown; role?: string } | undefined

    if (isSuperadmin(userData?.acesso) || userData?.role === 'superadmin') {
      const tenants = await listDocs<TenantDoc>('tenants')
      res.json(tenants)
    } else if (userData?.tenantId) {
      const tenant = await getDoc<TenantDoc>('tenants', userData.tenantId)
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
    const tenant = await getDoc<TenantDoc>('tenants', req.params['id'] as string)
    if (!tenant) { res.status(404).json({ message: 'Não encontrado' }); return }
    res.json(tenant)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name: string }
    const tenant = await createDoc<TenantDoc>('tenants', {
      name,
      adminId: req.user!.uid,
      dateCreated: new Date().toISOString(),
      quotaTerm: 'Fornada',
      quotas: [{ name: 'Fornada Completa', price: 65 }, { name: 'Fornada Leve', price: 40 }],
      quotaInteira: 65,
      quotaMeia: 40,
      dueDay: 10,
    })
    // Fornecedor padrão = a própria loja (colapsado na UI enquanto for o único).
    await createDoc('producers', { name, contact: '', tenantId: tenant.id })
    res.status(201).json(tenant)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userSnap = await db.collection('users').doc(req.user!.uid).get()
    const userData = userSnap.data() as { acesso?: unknown; tenantId?: string } | undefined
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
    await updateDoc<TenantDoc>('tenants', req.params['id'] as string, updates)
    const tenant = await getDoc<TenantDoc>('tenants', req.params['id'] as string)
    res.json(tenant)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
