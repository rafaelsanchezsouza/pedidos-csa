import { Router, Request, Response } from 'express'
import admin from 'firebase-admin'
import { db } from '../repositories/firestore.js'
import { sendWhatsAppMessage } from '../services/whatsapp/index.js'

const router = Router()

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  return '55' + digits
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

interface OtpDoc {
  uid: string
  code: string
  expiresAt: string
  lastRequestAt: string
}

interface UserDoc {
  email?: string
  contact?: string
}

async function findUserByPhone(normalized: string): Promise<{ uid: string; contact: string } | null> {
  const snap = await db.collection('users').get()
  for (const doc of snap.docs) {
    const data = doc.data() as UserDoc
    if (data.contact && normalizePhone(data.contact) === normalized) {
      return { uid: doc.id, contact: data.contact }
    }
  }
  return null
}

// POST /api/auth/whatsapp/request-otp
// Body: { identifier: string } — email ou telefone
router.post('/request-otp', async (req: Request, res: Response) => {
  try {
    const { identifier } = req.body as { identifier?: string }
    if (!identifier?.trim()) {
      res.status(400).json({ message: 'Identificador obrigatório' })
      return
    }

    const isEmail = identifier.includes('@')
    let uid: string
    let whatsappNumber: string

    if (isEmail) {
      const snap = await db
        .collection('users')
        .where('email', '==', identifier.toLowerCase().trim())
        .limit(1)
        .get()
      if (snap.empty) {
        // Não revelar se usuário existe
        res.json({ success: true })
        return
      }
      const data = snap.docs[0].data() as UserDoc
      uid = snap.docs[0].id
      if (!data.contact) {
        res.json({ success: true })
        return
      }
      whatsappNumber = normalizePhone(data.contact)
    } else {
      whatsappNumber = normalizePhone(identifier)
      const found = await findUserByPhone(whatsappNumber)
      if (!found) {
        res.json({ success: true })
        return
      }
      uid = found.uid
    }

    const otpDocRef = db.collection('otp_codes').doc(whatsappNumber)
    const existing = await otpDocRef.get()

    if (existing.exists) {
      const data = existing.data() as OtpDoc
      const secondsSinceLastRequest =
        (Date.now() - new Date(data.lastRequestAt).getTime()) / 1000
      if (secondsSinceLastRequest < 60) {
        // Rate limit: não envia novo código, mas retorna sucesso
        res.json({ success: true })
        return
      }
    }

    const code = generateOtp()
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    await otpDocRef.set({ uid, code, expiresAt, lastRequestAt: now } satisfies OtpDoc)

    await sendWhatsAppMessage(
      whatsappNumber,
      `Seu código de acesso ao Pedidos CSA é: *${code}*\n\nEle expira em 5 minutos.`,
    )

    res.json({ success: true })
  } catch (err) {
    console.error('request-otp error:', err)
    res.status(500).json({ message: String(err) })
  }
})

// POST /api/auth/whatsapp/verify-otp
// Body: { identifier: string, code: string }
router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { identifier, code } = req.body as { identifier?: string; code?: string }
    if (!identifier?.trim() || !code?.trim()) {
      res.status(400).json({ message: 'Identificador e código obrigatórios' })
      return
    }

    let whatsappNumber: string

    if (identifier.includes('@')) {
      const snap = await db
        .collection('users')
        .where('email', '==', identifier.toLowerCase().trim())
        .limit(1)
        .get()
      if (snap.empty) {
        res.status(400).json({ message: 'Código inválido ou expirado' })
        return
      }
      const data = snap.docs[0].data() as UserDoc
      if (!data.contact) {
        res.status(400).json({ message: 'Código inválido ou expirado' })
        return
      }
      whatsappNumber = normalizePhone(data.contact)
    } else {
      whatsappNumber = normalizePhone(identifier)
    }

    const otpDocRef = db.collection('otp_codes').doc(whatsappNumber)
    const otpDoc = await otpDocRef.get()

    if (!otpDoc.exists) {
      res.status(400).json({ message: 'Código inválido ou expirado' })
      return
    }

    const otpData = otpDoc.data() as OtpDoc

    if (otpData.code !== code.trim()) {
      res.status(400).json({ message: 'Código inválido ou expirado' })
      return
    }

    if (new Date(otpData.expiresAt) < new Date()) {
      await otpDocRef.delete()
      res.status(400).json({ message: 'Código inválido ou expirado' })
      return
    }

    await otpDocRef.delete()

    const customToken = await admin.auth().createCustomToken(otpData.uid)
    res.json({ customToken })
  } catch (err) {
    console.error('verify-otp error:', err)
    res.status(500).json({ message: String(err) })
  }
})

export default router
