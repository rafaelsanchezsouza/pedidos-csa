import { Router, type Request, type Response } from 'express'
import { criarIssueNoGithub, type GithubIssuesIntegration } from '../services/issues.js'

export type { GithubIssuesIntegration }

// Report de bug da tela vira issue no GitHub do app. A criação em si mora em
// services/issues.ts — o webhook do WhatsApp usa o mesmo caminho.
export function createIssuesRouter(github?: GithubIssuesIntegration): Router {
  const router = Router()

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { title, body } = req.body as { title: string; body: string }
      if (!title?.trim()) { res.status(400).json({ message: 'Título é obrigatório' }); return }

      if (!github) { res.status(500).json({ message: 'Configuração GitHub ausente no servidor' }); return }

      const r = await criarIssueNoGithub(github, { title, body })
      if (!r.ok) { res.status(502).json({ message: r.message }); return }
      res.status(201).json(r.issue)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
