import { Request, Response, NextFunction } from 'express'
import admin from 'firebase-admin'

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.split('Bearer ')[1]
  if (!token) {
    res.status(401).json({ message: 'Token não fornecido' })
    return
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.user = { uid: decoded.uid, email: decoded.email ?? '' }
    next()
  } catch {
    res.status(401).json({ message: 'Token inválido' })
  }
}
