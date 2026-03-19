import { Request, Response, NextFunction } from 'express'
import { db } from '../repositories/firestore.js'

export async function colmeiaMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const headerColmeiaId = req.headers['x-colmeia-id'] as string | undefined
  if (headerColmeiaId) {
    req.colmeiaId = headerColmeiaId
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
      const data = snap.data() as { colmeiaId?: string }
      req.colmeiaId = data.colmeiaId
    }
  } catch {
    // ignore, colmeiaId stays undefined
  }
  next()
}
