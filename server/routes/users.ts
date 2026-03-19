import { Router, Request, Response } from 'express'
import { db, listDocs, createDoc, updateDoc } from '../repositories/firestore.js'

const router = Router()

interface UserDoc {
  name: string
  email: string
  address: string
  contact: string
  frequency: 'semanal' | 'quinzenal'
  deliveryType: 'colmeia' | 'entrega'
  colmeiaId: string
  role: 'admin' | 'user' | 'superadmin' | 'produtor'
}

router.get('/me', async (req: Request, res: Response) => {
  try {
    const snap = await db.collection('users').doc(req.user!.uid).get()
    if (!snap.exists) { res.status(404).json({ message: 'Usuário não encontrado' }); return }
    res.json({ id: snap.id, ...snap.data() })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.put('/me', async (req: Request, res: Response) => {
  try {
    const updates = req.body as Partial<UserDoc>
    await updateDoc<UserDoc>('users', req.user!.uid, updates)
    const snap = await db.collection('users').doc(req.user!.uid).get()
    res.json({ id: snap.id, ...snap.data() })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.get('/', async (req: Request, res: Response) => {
  try {
    const colmeiaId = (req.query.colmeiaId as string) || req.colmeiaId
    if (!colmeiaId) { res.status(400).json({ message: 'colmeiaId obrigatório' }); return }
    const users = await listDocs<UserDoc>('users', [['colmeiaId', '==', colmeiaId]])
    res.json(users)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as UserDoc
    const uid = req.user!.uid
    await db.collection('users').doc(uid).set(data)
    res.status(201).json({ id: uid, ...data })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
