import { Request, Response, NextFunction } from 'express'
import { db } from '../repositories/firestore.js'

export async function tenantMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
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
    const snap = await db.collection('users').doc(req.user.uid).get()
    if (snap.exists) {
      const data = snap.data() as { tenantId?: string }
      req.tenantId = data.tenantId
    }
  } catch {
    // ignore, tenantId stays undefined
  }
  next()
}
