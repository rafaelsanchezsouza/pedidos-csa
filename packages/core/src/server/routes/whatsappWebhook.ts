import { Router, type Request, type Response } from 'express'
import { criarIssueNoGithub, type GithubIssuesIntegration } from '../services/issues.js'
import type { WhatsAppGateway } from '../repo.js'

// Mensagem num grupo de WhatsApp vira issue no GitHub. Quem entrega o evento é a Evolution API,
// que roda na MESMA VM: ela posta em 127.0.0.1, então este endpoint nunca precisa ser exposto
// no nginx. O `secret` é defesa em profundidade, não a única tranca.
export interface WhatsappWebhookDeps {
  github?: GithubIssuesIntegration
  whatsapp?: WhatsAppGateway
}

export interface WhatsappWebhookConfig {
  /** JID do grupo autorizado (`...@g.us`). Mensagem de qualquer outro chat é ignorada. */
  groupJid: string
  /** Prefixo que marca "isto é uma issue" (case-insensitive). Sem ele, a mensagem é só conversa. */
  prefixo: string
  /** Se definido, exigido no header `x-webhook-secret`. */
  secret?: string
}

// Só o suficiente do payload da Evolution — o resto do evento não nos interessa.
interface EventoEvolution {
  event?: string
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string; participant?: string }
    pushName?: string
    message?: { conversation?: string; extendedTextMessage?: { text?: string } }
  }
}

const LIMITE_TITULO = 120
const LIMITE_DEDUPE = 500

function textoDaMensagem(data: EventoEvolution['data']): string {
  return data?.message?.conversation ?? data?.message?.extendedTextMessage?.text ?? ''
}

// Primeira linha vira título; o corpo inteiro vai no body, com quem mandou no rodapé.
export function issueDaMensagem(texto: string, autor: string): { title: string; body: string } {
  const linhas = texto.trim().split('\n')
  const primeira = linhas.find((l) => l.trim().length > 0)?.trim() ?? ''
  const title = primeira.length > LIMITE_TITULO ? `${primeira.slice(0, LIMITE_TITULO - 1)}…` : primeira
  const resto = linhas.slice(linhas.indexOf(primeira) + 1).join('\n').trim()
  const corpo = resto.length > 0 ? `${texto.trim()}\n` : ''
  return {
    title,
    body: `${corpo}\n---\nAberta pelo WhatsApp por **${autor || 'desconhecido'}**.`,
  }
}

export function createWhatsappWebhookRouter(
  deps: WhatsappWebhookDeps,
  config: WhatsappWebhookConfig,
): Router {
  const router = Router()
  // A Evolution reenvia o evento se a resposta demorar ou falhar; sem isto, um retry vira uma
  // segunda issue idêntica. Em memória basta: retry acontece em segundos, e um restart no meio
  // custa no máximo uma issue duplicada.
  const jaProcessados = new Set<string>()

  const lembrar = (id: string) => {
    jaProcessados.add(id)
    if (jaProcessados.size > LIMITE_DEDUPE) {
      jaProcessados.delete(jaProcessados.values().next().value as string)
    }
  }

  // A Evolution posta na raiz ou em /messages-upsert, conforme `webhook_by_events`.
  router.post(['/', '/messages-upsert'], async (req: Request, res: Response) => {
    try {
      if (config.secret && req.get('x-webhook-secret') !== config.secret) {
        res.status(401).json({ message: 'secret inválido' })
        return
      }

      const { event, data } = (req.body ?? {}) as EventoEvolution

      // Daqui para baixo tudo responde 200: "ignorei" não é erro, e 4xx/5xx faria a Evolution
      // reenviar o mesmo evento para sempre.
      if (event && event !== 'messages.upsert') { res.json({ ignorado: 'evento' }); return }
      if (data?.key?.fromMe) { res.json({ ignorado: 'mensagem do próprio bot' }); return }
      if (data?.key?.remoteJid !== config.groupJid) { res.json({ ignorado: 'outro chat' }); return }

      const texto = textoDaMensagem(data)
      const prefixo = config.prefixo.toLowerCase()
      if (!texto.trim().toLowerCase().startsWith(prefixo)) { res.json({ ignorado: 'sem prefixo' }); return }

      const id = data?.key?.id
      if (id && jaProcessados.has(id)) { res.json({ ignorado: 'duplicado' }); return }

      const semPrefixo = texto.trim().slice(config.prefixo.length).trim()
      if (!semPrefixo) { res.json({ ignorado: 'mensagem vazia' }); return }

      if (!deps.github) { res.json({ ignorado: 'sem integração GitHub' }); return }

      if (id) lembrar(id)
      const { title, body } = issueDaMensagem(semPrefixo, data?.pushName ?? '')
      const r = await criarIssueNoGithub(deps.github, { title, body })

      // Sem resposta no grupo ninguém sabe se funcionou — e é o único retorno que o autor tem.
      const aviso = r.ok
        ? `✅ Issue #${r.issue.number} aberta: ${r.issue.url}`
        : `⚠️ Não consegui abrir a issue: ${r.message}`
      await deps.whatsapp?.sendMessage(config.groupJid, aviso).catch(() => {})

      if (!r.ok) {
        // O evento não virou issue: esquecer o id para que um reenvio possa tentar de novo.
        if (id) jaProcessados.delete(id)
        res.json({ erro: r.message })
        return
      }
      res.json({ criada: r.issue.number, url: r.issue.url })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
