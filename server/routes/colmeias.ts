import { Router, Request, Response } from 'express'
import { listDocs, createDoc, getDoc, updateDoc } from '../repositories/firestore.js'

const router = Router()

interface ColmeiaDoc {
  name: string
  adminId: string
  dateCreated: string
  quotaInteira?: number
  quotaMeia?: number
  dueDay?: number
  orderSendDay?: number
  orderSendHour?: number
  weekChangeDay?: number
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid
    const userSnap = await import('../repositories/firestore.js').then(m => m.db.collection('users').doc(uid).get())
    const userData = userSnap.data() as { colmeiaId?: string; acesso?: string; role?: string } | undefined

    if (userData?.acesso === 'superadmin' || userData?.role === 'superadmin') {
      const colmeias = await listDocs<ColmeiaDoc>('colmeias')
      res.json(colmeias)
    } else if (userData?.colmeiaId) {
      const colmeia = await getDoc<ColmeiaDoc>('colmeias', userData.colmeiaId)
      res.json(colmeia ? [colmeia] : [])
    } else {
      res.json([])
    }
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const colmeia = await getDoc<ColmeiaDoc>('colmeias', req.params['id'] as string)
    if (!colmeia) { res.status(404).json({ message: 'Não encontrado' }); return }
    res.json(colmeia)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name: string }
    const colmeia = await createDoc<ColmeiaDoc>('colmeias', {
      name,
      adminId: req.user!.uid,
      dateCreated: new Date().toISOString(),
      quotaInteira: 65,
      quotaMeia: 40,
      dueDay: 10,
    })
    res.status(201).json(colmeia)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { quotaInteira, quotaMeia, dueDay, orderSendDay, orderSendHour, weekChangeDay } = req.body as {
      quotaInteira?: number; quotaMeia?: number; dueDay?: number
      orderSendDay?: number; orderSendHour?: number; weekChangeDay?: number
    }
    const updates: Partial<ColmeiaDoc> = {}
    if (quotaInteira !== undefined) updates.quotaInteira = quotaInteira
    if (quotaMeia !== undefined) updates.quotaMeia = quotaMeia
    if (dueDay !== undefined) updates.dueDay = dueDay
    if (orderSendDay !== undefined) updates.orderSendDay = orderSendDay
    if (orderSendHour !== undefined) updates.orderSendHour = orderSendHour
    if (weekChangeDay !== undefined) updates.weekChangeDay = weekChangeDay
    await updateDoc<ColmeiaDoc>('colmeias', req.params['id'] as string, updates)
    const colmeia = await getDoc<ColmeiaDoc>('colmeias', req.params['id'] as string)
    res.json(colmeia)
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

export default router
