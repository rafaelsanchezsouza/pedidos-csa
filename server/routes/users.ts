import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import crypto from 'crypto'
import { db, listDocs, updateDoc } from '../repositories/firestore.js'
import { sendWhatsAppMessage } from '../services/whatsapp/index.js'
import { normalizePhone } from '../services/ordersService.js'

const router = Router()

interface UserDoc {
  name: string
  email: string
  address: string
  contact: string
  frequency: 'semanal' | 'quinzenal'
  deliveryType: 'colmeia' | 'entrega'
  colmeiaId: string
  acesso: 'admin' | 'user' | 'superadmin' | 'produtor'
  role?: string
  isentoCotas?: boolean
  disabled?: boolean
  deleted?: boolean
  quota?: 'Cota inteira' | 'Meia cota'
}

function gerarSenha() {
  return crypto.randomBytes(5).toString('hex') + 'Csa1!'
}

async function enviarBoasVindas(contact: string, name: string, email: string, password: string, colmeiaName: string) {
  const msg = `Olá, ${name}! Bem-vinde à ${colmeiaName} 🌿\n\nSeu acesso ao app de pedidos foi criado:\nE-mail: ${email}\nSenha: ${password}\n\nAcesse: http://csaparahyba.com.br/\n\nNa primeira entrada, defina uma nova senha.`
  await sendWhatsAppMessage(normalizePhone(contact), msg)
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
    const { email, password: rawPassword, ...profile } = req.body as UserDoc & { password?: string }
    if (!email) { res.status(400).json({ message: 'email obrigatório' }); return }
    const password = rawPassword?.trim() || gerarSenha()
    const authUser = await admin.auth().createUser({ email, password })
    const data: UserDoc = { email, ...profile, mustChangePassword: true } as UserDoc & { mustChangePassword: boolean }
    await db.collection('users').doc(authUser.uid).set(data)
    if (profile.contact) {
      const colmeiaSnap = await db.collection('colmeias').doc(profile.colmeiaId).get()
      const colmeiaName = (colmeiaSnap.data()?.name as string | undefined) ?? 'CSA'
      enviarBoasVindas(profile.contact, profile.name, email, password, colmeiaName).catch(() => {/* não bloquear */})
    }
    res.status(201).json({ id: authUser.uid, ...data, password })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// Admin cria múltiplos membros via CSV (batch)
router.post('/create-member-batch', async (req: Request, res: Response) => {
  try {
    const { members } = req.body as { members: Array<UserDoc & { password?: string }> }
    if (!Array.isArray(members) || members.length === 0) {
      res.status(400).json({ message: 'members deve ser array não-vazio' }); return
    }
    const colmeiaId = members[0].colmeiaId
    const colmeiaSnap = await db.collection('colmeias').doc(colmeiaId).get()
    const colmeiaName = (colmeiaSnap.data()?.name as string | undefined) ?? 'CSA'
    const results: Array<{ name: string; email: string; success: boolean; error?: string; password?: string }> = []
    for (const { password: rawPassword, email, ...profile } of members) {
      if (!email) { results.push({ name: profile.name, email: '', success: false, error: 'e-mail ausente' }); continue }
      const password = rawPassword?.trim() || gerarSenha()
      try {
        const authUser = await admin.auth().createUser({ email, password })
        const data = { email, ...profile, mustChangePassword: true }
        await db.collection('users').doc(authUser.uid).set(data)
        if (profile.contact) {
          try { await enviarBoasVindas(profile.contact, profile.name, email, password, colmeiaName) } catch { /* não bloquear */ }
        }
        results.push({ name: profile.name, email, success: true, password })
      } catch (err) {
        results.push({ name: profile.name, email, success: false, error: String(err) })
      }
    }
    res.status(200).json({ results })
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

// Admin gera link de redefinição de senha e envia por WhatsApp
router.post('/:uid/reset-password', async (req: Request, res: Response) => {
  try {
    const uid = req.params['uid'] as string
    const [authUser, userSnap] = await Promise.all([
      admin.auth().getUser(uid),
      db.collection('users').doc(uid).get(),
    ])
    const link = await admin.auth().generatePasswordResetLink(authUser.email!)
    const userData = userSnap.data()
    let whatsappSent = false
    if (userData?.contact) {
      const name = (userData.name as string | undefined) ?? 'membro'
      const msg = `Olá, ${name}! Para redefinir sua senha no App da CSA, acesse o link abaixo (válido por 24 horas):\n\n${link}`
      try { await sendWhatsAppMessage(normalizePhone(userData.contact as string), msg); whatsappSent = true } catch { /* não bloquear */ }
    }
    res.json({ link, whatsappSent })
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
