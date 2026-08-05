import type { Request, Response, NextFunction } from 'express'
import type { EngineDeps } from '../repo.js'
import '../types.js'

// Resolve o tenant da requisição: header x-tenant-id vence (admin navegando entre tenants);
// sem header, cai no tenantId do doc do usuário autenticado.
export function createTenantMiddleware({ repo }: EngineDeps) {
  return async function tenantMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined
    if (headerTenantId) {
      req.tenantId = headerTenantId
      next()
      return
    }
    if (!req.user) {
      next()
      return
    }
    try {
      const user = await repo.getDoc<{ tenantId?: string }>('users', req.user.uid)
      req.tenantId = user?.tenantId
    } catch {
      // ignore, tenantId fica undefined
    }
    next()
  }
}
