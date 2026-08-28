// Criação de issue no GitHub, isolada da rota: o webhook do WhatsApp e o "Reportar problema"
// da tela abrem issue pelo mesmo caminho. A integração (owner/repo/token) é injetada no boot —
// o engine não lê process.env.
export interface GithubIssuesIntegration {
  owner: string
  repo: string
  token: string
}

export interface IssueCriada {
  url: string
  number: number
}

// Resultado explícito em vez de throw: quem chama precisa distinguir "o GitHub recusou" (502,
// upstream) de "quebrou aqui" (500) — sniffar tipo de Error para isso é frágil.
export type ResultadoIssue =
  | { ok: true; issue: IssueCriada }
  | { ok: false; message: string }

export async function criarIssueNoGithub(
  github: GithubIssuesIntegration,
  { title, body, labels = ['bug'] }: { title: string; body: string; labels?: string[] },
): Promise<ResultadoIssue> {
  const res = await fetch(`https://api.github.com/repos/${github.owner}/${github.repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${github.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, labels }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { ok: false, message: (err as { message?: string }).message || 'Erro ao criar issue no GitHub' }
  }

  const issue = await res.json() as { html_url: string; number: number }
  return { ok: true, issue: { url: issue.html_url, number: issue.number } }
}
