import { Router, type Request, type Response } from 'express'
import { normalizePhone } from '../phone.js'
import type { AppConfig } from '../../config.js'
import type { Repo, AuthGateway, WhatsAppGateway } from '../repo.js'
import type { UserDoc } from '../../types.js'

// Login por OTP no WhatsApp (rota PÚBLICA — montada antes do authMiddleware).
// O doc de OTP é chaveado pelo número JÁ normalizado; o gateway normaliza de novo ao enviar,
// o que é idempotente para números reais (>= 10 dígitos).

export interface WhatsappAuthDeps {
  repo: Repo
  auth: AuthGateway
  whatsapp: WhatsAppGateway
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

export function createWhatsappAuthRouter({ repo, auth, whatsapp }: WhatsappAuthDeps, config: AppConfig): Router {
  const router = Router()

  async function findUserByPhone(normalized: string): Promise<{ uid: string; contact: string } | null> {
    const users = await repo.listDocs<UserDoc>('users')
    for (const u of users) {
      if (u.contact && normalizePhone(u.contact) === normalized) {
        return { uid: u.id, contact: u.contact }
      }
    }
    return null
  }

  async function findUserByEmail(email: string): Promise<(UserDoc & { id: string }) | null> {
    const users = await repo.listDocs<UserDoc>('users', [['email', '==', email.toLowerCase().trim()]])
    return users[0] ?? null
  }

  // Nome da organização na mensagem de OTP; sem tenant, cai no nome do app da config
  // (fim do "Pedidos CSA" hardcoded).
  async function getTenantName(uid: string): Promise<string> {
    const user = await repo.getDoc<UserDoc>('users', uid)
    if (!user?.tenantId) return config.vocabulary.otpAppName
    const tenant = await repo.getDoc<{ name?: string }>('tenants', user.tenantId)
    return tenant?.name ?? config.vocabulary.otpAppName
  }

  // POST /request-otp — Body: { identifier: string } (email ou telefone)
  router.post('/request-otp', async (req: Request, res: Response) => {
    try {
      const { identifier } = req.body as { identifier?: string }
      if (!identifier?.trim()) {
        res.status(400).json({ message: 'Identificador obrigatório' })
        return
      }

      let uid: string
      let whatsappNumber: string

      if (identifier.includes('@')) {
        const user = await findUserByEmail(identifier)
        // Não revelar se usuário existe
        if (!user?.contact) { res.json({ success: true }); return }
        uid = user.id
        whatsappNumber = normalizePhone(user.contact)
      } else {
        whatsappNumber = normalizePhone(identifier)
        const found = await findUserByPhone(whatsappNumber)
        if (!found) { res.json({ success: true }); return }
        uid = found.uid
      }

      const existing = await repo.getDoc<OtpDoc>('otp_codes', whatsappNumber)
      if (existing) {
        const secondsSinceLastRequest = (Date.now() - new Date(existing.lastRequestAt).getTime()) / 1000
        if (secondsSinceLastRequest < 60) {
          // Rate limit: não envia novo código, mas retorna sucesso
          res.json({ success: true })
          return
        }
      }

      const code = generateOtp()
      const now = new Date().toISOString()
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      await repo.setDoc<OtpDoc>('otp_codes', whatsappNumber, { uid, code, expiresAt, lastRequestAt: now })

      const tenantName = await getTenantName(uid)
      await whatsapp.sendMessage(
        whatsappNumber,
        `Seu código de acesso${tenantName ? ` ao ${tenantName}` : ''} é: *${code}*\n\nEle expira em 5 minutos.`,
      )

      res.json({ success: true })
    } catch (err) {
      console.error('request-otp error:', err)
      res.status(500).json({ message: String(err) })
    }
  })

  // POST /verify-otp — Body: { identifier: string, code: string }
  router.post('/verify-otp', async (req: Request, res: Response) => {
    try {
      const { identifier, code } = req.body as { identifier?: string; code?: string }
      if (!identifier?.trim() || !code?.trim()) {
        res.status(400).json({ message: 'Identificador e código obrigatórios' })
        return
      }

      let whatsappNumber: string
      if (identifier.includes('@')) {
        const user = await findUserByEmail(identifier)
        if (!user?.contact) { res.status(400).json({ message: 'Código inválido ou expirado' }); return }
        whatsappNumber = normalizePhone(user.contact)
      } else {
        whatsappNumber = normalizePhone(identifier)
      }

      const otpData = await repo.getDoc<OtpDoc>('otp_codes', whatsappNumber)
      if (!otpData || otpData.code !== code.trim()) {
        res.status(400).json({ message: 'Código inválido ou expirado' })
        return
      }
      if (new Date(otpData.expiresAt) < new Date()) {
        await repo.deleteDoc('otp_codes', whatsappNumber)
        res.status(400).json({ message: 'Código inválido ou expirado' })
        return
      }

      await repo.deleteDoc('otp_codes', whatsappNumber)
      const customToken = await auth.createCustomToken(otpData.uid)
      res.json({ customToken })
    } catch (err) {
      console.error('verify-otp error:', err)
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
