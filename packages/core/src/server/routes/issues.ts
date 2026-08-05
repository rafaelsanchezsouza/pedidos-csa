import { Router, type Request, type Response } from 'express'

// Report de bug vira issue no GitHub do app. A integração (owner/repo/token) é injetada no
// boot — o engine não lê process.env (segredo é runtime do server de cada app).
export interface GithubIssuesIntegration {
  owner: string
  repo: string
  token: string
}

export function createIssuesRouter(github?: GithubIssuesIntegration): Router {
  const router = Router()

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { title, body } = req.body as { title: string; body: string }
      if (!title?.trim()) { res.status(400).json({ message: 'Título é obrigatório' }); return }

      if (!github) { res.status(500).json({ message: 'Configuração GitHub ausente no servidor' }); return }

      const ghRes = await fetch(`https://api.github.com/repos/${github.owner}/${github.repo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${github.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body, labels: ['bug'] }),
      })

      if (!ghRes.ok) {
        const err = await ghRes.json().catch(() => ({}))
        res.status(502).json({ message: (err as { message?: string }).message || 'Erro ao criar issue no GitHub' })
        return
      }

      const issue = await ghRes.json() as { html_url: string; number: number }
      res.status(201).json({ url: issue.html_url, number: issue.number })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
