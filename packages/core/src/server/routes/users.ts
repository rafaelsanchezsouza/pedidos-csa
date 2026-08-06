import { Router, type Request, type Response } from 'express'
import crypto from 'node:crypto'
import type { AppConfig } from '../../config.js'
import type { Repo, AuthGateway, WhatsAppGateway } from '../repo.js'
import type { UserDoc } from '../../types.js'
import '../types.js'

export type { UserDoc }

export interface UsersDeps {
  repo: Repo
  auth: AuthGateway
  whatsapp: WhatsAppGateway
  appUrl?: string // URL pública do app na msg de boas-vindas — injetada no boot (o engine não lê env)
}

// Sufixo fixo garante as classes de caractere exigidas pela política de senha do Firebase.
function gerarSenha() {
  return crypto.randomBytes(5).toString('hex') + 'Csa1!'
}

export function createUsersRouter({ repo, auth, whatsapp, appUrl }: UsersDeps, config: AppConfig): Router {
  const router = Router()

  // Nome do tenant no texto de boas-vindas; sem doc, cai no nome do app (fim do ?? 'CSA').
  const tenantName = async (tenantId: string): Promise<string> => {
    const tenant = await repo.getDoc<{ name?: string }>('tenants', tenantId)
    return tenant?.name ?? config.brand.name
  }

  async function enviarBoasVindas(contact: string, name: string, email: string, password: string, tenant: string) {
    const acesso = appUrl ? `\n\nAcesse: ${appUrl}` : ''
    const msg = `Olá, ${name}! Bem-vinde à ${tenant}\n\nSeu acesso ao app de pedidos foi criado:\nE-mail: ${email}\nSenha: ${password}${acesso}\n\nNa primeira entrada, defina uma nova senha.`
    await whatsapp.sendMessage(contact, msg)
  }

  router.get('/me', async (req: Request, res: Response) => {
    try {
      const user = await repo.getDoc<UserDoc>('users', req.user!.uid)
      if (!user) { res.status(404).json({ message: 'Usuário não encontrado' }); return }
      res.json(user)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.put('/me', async (req: Request, res: Response) => {
    try {
      const updates = req.body as Partial<UserDoc>
      await repo.updateDoc<UserDoc>('users', req.user!.uid, updates)
      const user = await repo.getDoc<UserDoc>('users', req.user!.uid)
      res.json(user)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  router.get('/', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || req.tenantId
      if (!tenantId) { res.status(400).json({ message: 'tenantId obrigatório' }); return }
      const users = await repo.listDocs<UserDoc>('users', [['tenantId', '==', tenantId]])
      res.json(users)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // Auto-registro: cria doc para o usuário já autenticado
  router.post('/', async (req: Request, res: Response) => {
    try {
      const data = req.body as UserDoc
      const uid = req.user!.uid
      await repo.setDoc('users', uid, data)
      res.status(201).json({ id: uid, ...data })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // Admin cria novo membro: conta de login + doc
  router.post('/create-member', async (req: Request, res: Response) => {
    try {
      const { email, password: rawPassword, ...profile } = req.body as UserDoc & { password?: string }
      if (!email) { res.status(400).json({ message: 'email obrigatório' }); return }
      const password = rawPassword?.trim() || gerarSenha()
      const authUser = await auth.createUser(email, password)
      const data: UserDoc = { email, ...profile, mustChangePassword: true } as UserDoc & { mustChangePassword: boolean }
      await repo.setDoc('users', authUser.uid, data)
      if (profile.contact) {
        const tenant = await tenantName(profile.tenantId)
        enviarBoasVindas(profile.contact, profile.name, email, password, tenant).catch(() => {/* não bloquear */})
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
      const tenant = await tenantName(members[0]!.tenantId)
      const results: Array<{ name: string; email: string; success: boolean; error?: string; password?: string }> = []
      for (const { password: rawPassword, email, ...profile } of members) {
        if (!email) { results.push({ name: profile.name, email: '', success: false, error: 'e-mail ausente' }); continue }
        const password = rawPassword?.trim() || gerarSenha()
        try {
          const authUser = await auth.createUser(email, password)
          await repo.setDoc('users', authUser.uid, { email, ...profile, mustChangePassword: true })
          if (profile.contact) {
            try { await enviarBoasVindas(profile.contact, profile.name, email, password, tenant) } catch { /* não bloquear */ }
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

  // Admin persiste a ordem manual da lista de entrega. Recebe a lista COMPLETA de ids de
  // entrega já na ordem desejada (o merge com quem não aparece na semana é feito no front) e
  // grava deliveryOrder = posição. Registrada antes de /:uid, senão /:uid captura a rota.
  router.put('/reorder-delivery', async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId
      if (!tenantId) { res.status(400).json({ message: 'tenantId obrigatório' }); return }
      const { orderedIds } = req.body as { orderedIds: string[] }
      if (!Array.isArray(orderedIds)) { res.status(400).json({ message: 'orderedIds deve ser um array' }); return }

      // Cada id tem que ser um usuário desta tenant — não deixar reordenar de fora.
      const membros = await repo.listDocs<UserDoc>('users', [['tenantId', '==', tenantId]])
      const idsDaTenant = new Set(membros.map((u) => u.id))
      const invalidos = orderedIds.filter((id) => !idsDaTenant.has(id))
      if (invalidos.length > 0) {
        res.status(400).json({ message: `ids fora da tenant: ${invalidos.join(', ')}` }); return
      }

      await repo.updateMany('users', orderedIds.map((id, i) => [id, { deliveryOrder: i }]))
      res.json({ updated: orderedIds.length })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // Cascata ao renomear um tier de cota: atualiza todos os usuários da tenant que apontam ao
  // nome antigo para o novo. Registrada antes de /:uid. Escopo por tenant.
  router.put('/rename-quota', async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId
      if (!tenantId) { res.status(400).json({ message: 'tenantId obrigatório' }); return }
      const { from, to } = req.body as { from?: string; to?: string }
      if (!from || !to) { res.status(400).json({ message: 'from e to obrigatórios' }); return }
      if (from === to) { res.json({ updated: 0 }); return }
      const membros = await repo.listDocs<UserDoc>('users', [['tenantId', '==', tenantId]])
      const alvos = membros.filter((u) => u.quota === from)
      await repo.updateMany('users', alvos.map((u) => [u.id, { quota: to }]))
      res.json({ updated: alvos.length })
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
        await auth.updateUser(uid, { disabled: !!updates.disabled })
      }
      await repo.updateDoc<UserDoc>('users', uid, updates)
      res.json({ id: uid, ...updates })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // Admin gera link de redefinição de senha e envia por WhatsApp. O nome do app na mensagem
  // vem da config (fim do "App da CSA" hardcoded — no fork ele estava até errado).
  router.post('/:uid/reset-password', async (req: Request, res: Response) => {
    try {
      const uid = req.params['uid'] as string
      const [email, user] = await Promise.all([
        auth.getUserEmail(uid),
        repo.getDoc<UserDoc>('users', uid),
      ])
      if (!email) { res.status(404).json({ message: 'Usuário sem e-mail de login' }); return }
      const link = await auth.generatePasswordResetLink(email)
      let whatsappSent = false
      if (user?.contact) {
        const name = user.name ?? 'membro'
        const msg = `Olá, ${name}! Para redefinir sua senha no ${config.vocabulary.otpAppName}, acesse o link abaixo (válido por 24 horas):\n\n${link}`
        try { await whatsapp.sendMessage(user.contact, msg); whatsappSent = true } catch { /* não bloquear */ }
      }
      res.json({ link, whatsappSent })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // Admin exclui usuário (soft-delete no doc + remove a conta de login)
  router.delete('/:uid', async (req: Request, res: Response) => {
    try {
      const uid = req.params['uid'] as string
      await auth.deleteUser(uid)
      await repo.updateDoc<UserDoc>('users', uid, { deleted: true, disabled: true })
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
