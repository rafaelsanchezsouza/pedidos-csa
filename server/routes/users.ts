import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { db, listDocs, updateDoc } from '../repositories/firestore.js'

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
  disabled?: boolean
  deleted?: boolean
  quota?: 'Cota inteira' | 'Meia cota'
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

// Auto-registro: cria doc Firestore para o usuário já autenticado
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

// Admin cria novo membro: cria conta no Firebase Auth + doc no Firestore
router.post('/create-member', async (req: Request, res: Response) => {
  try {
    const { email, password, ...profile } = req.body as UserDoc & { password: string }
    if (!email || !password) {
      res.status(400).json({ message: 'email e password obrigatórios' }); return
    }
    const authUser = await admin.auth().createUser({ email, password })
    const data: UserDoc = { email, ...profile }
    await db.collection('users').doc(authUser.uid).set(data)
    res.status(201).json({ id: authUser.uid, ...data })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// Admin atualiza dados de qualquer usuário (inclui disable/enable via campo disabled)
router.put('/:uid', async (req: Request, res: Response) => {
  try {
    const uid = req.params['uid'] as string
    const updates = req.body as Partial<UserDoc>
    if ('disabled' in updates) {
      await admin.auth().updateUser(uid, { disabled: !!updates.disabled })
    }
    await updateDoc<UserDoc>('users', uid, updates)
    res.json({ id: uid, ...updates })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// Admin exclui usuário (soft-delete no Firestore + remove do Firebase Auth)
router.delete('/:uid', async (req: Request, res: Response) => {
  try {
    const uid = req.params['uid'] as string
    await admin.auth().deleteUser(uid)
    await updateDoc<UserDoc>('users', uid, { deleted: true, disabled: true })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
