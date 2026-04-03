import { Router, Request, Response } from 'express'

const router = Router()

router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, body } = req.body as { title: string; body: string }
    if (!title?.trim()) { res.status(400).json({ message: 'Título é obrigatório' }); return }

    const { GITHUB_OWNER: owner, GITHUB_REPO: repo, GITHUB_TOKEN: token } = process.env
    if (!owner || !repo || !token) { res.status(500).json({ message: 'Configuração GitHub ausente no servidor' }); return }

    const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
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

export default router
