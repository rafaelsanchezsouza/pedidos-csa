import { Router, type Request, type Response } from 'express'
import { criarIssueNoGithub, type GithubIssuesIntegration } from '../services/issues.js'
import type { WhatsAppGateway } from '../repo.js'

// Mensagem num grupo de WhatsApp vira issue no GitHub.
//
// A entrada é o envelope **zap-in/1** (spec `~/repos/ZAP-PROTOCOL.md` §2.1), entregue pelo
// zap-hub — não o payload bruto do evolution-api. Isso não é preciosismo: a evolution aceita um
// webhook por instância e o note-app já ocupava o slot, então quem distribui é o hub, que já
// aplicou secret, anti-loop (`fromMe`), LID e dedupe uma vez por todos (§2.3). Depender do
// envelope mantém o adaptador confinado num lugar só, do lado de lá.
export interface ZapInboundMessage {
  protocol: 'zap-in/1'
  messageId: string
  chatJid: string
  senderJid: string
  senderNumber: string
  isGroup: boolean
  senderName?: string
  text: string
  isAudio?: boolean
  timestamp: number
}

export interface WhatsappWebhookDeps {
  github?: GithubIssuesIntegration
  whatsapp?: WhatsAppGateway
}

export interface WhatsappWebhookConfig {
  /** JID do grupo autorizado (`...@g.us`). Mensagem de qualquer outro chat é descartada. */
  groupJid: string
  /** Prefixo que marca "isto é uma issue" (case-insensitive). Sem ele, é só conversa. */
  prefixo: string
  /** Secret compartilhado, esperado em `x-zap-secret` (§2.3). Ausente = 503. */
  secret?: string
}

const LIMITE_TITULO = 120
const LIMITE_DEDUPE = 500

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
  // O hub já deduplica, mas ele pode ser reiniciado (ou trocado) sem que a issue duplicada
  // deixe de ser cara: repetir a guarda aqui custa um Set e evita issue em dobro.
  const jaProcessados = new Set<string>()

  const lembrar = (id: string) => {
    jaProcessados.add(id)
    if (jaProcessados.size > LIMITE_DEDUPE) {
      jaProcessados.delete(jaProcessados.values().next().value as string)
    }
  }

  router.post('/', async (req: Request, res: Response) => {
    try {
      // Secret ausente é erro de configuração, não de quem chamou — 503, como manda a spec.
      if (!config.secret) { res.status(503).json({ message: 'webhook não configurado' }); return }
      if (req.get('x-zap-secret') !== config.secret) { res.status(401).json({ message: 'secret inválido' }); return }

      const msg = (req.body ?? {}) as Partial<ZapInboundMessage>
      if (msg.protocol !== 'zap-in/1') { res.status(400).json({ message: 'envelope zap-in/1 esperado' }); return }

      // Daqui para baixo, descarte é 204: não é erro, e um 4xx faria a evolution (via hub)
      // reenviar o mesmo evento para sempre.
      if (msg.chatJid !== config.groupJid) { res.status(204).send(); return }

      const texto = (msg.text ?? '').trim()
      if (!texto.toLowerCase().startsWith(config.prefixo.toLowerCase())) { res.status(204).send(); return }
      if (msg.messageId && jaProcessados.has(msg.messageId)) { res.status(204).send(); return }

      const semPrefixo = texto.slice(config.prefixo.length).trim()
      if (!semPrefixo) { res.status(204).send(); return }
      if (!deps.github) { res.status(204).send(); return }

      if (msg.messageId) lembrar(msg.messageId)
      const { title, body } = issueDaMensagem(semPrefixo, msg.senderName ?? '')
      const r = await criarIssueNoGithub(deps.github, { title, body })

      // Sem resposta no grupo ninguém sabe se funcionou — é o único retorno que o autor tem.
      // Best-effort: falha de envio não derruba o processamento (§2.2).
      const aviso = r.ok
        ? `✅ Issue #${r.issue.number} aberta: ${r.issue.url}`
        : `⚠️ Não consegui abrir a issue: ${r.message}`
      await deps.whatsapp?.sendMessage(config.groupJid, aviso).catch(() => {})

      if (!r.ok) {
        // Não virou issue: esquecer o id para que um reenvio possa tentar de novo.
        if (msg.messageId) jaProcessados.delete(msg.messageId)
        res.json({ erro: r.message })
        return
      }
      res.json({ criada: r.issue.number, url: r.issue.url })
    } catch (err) {
      // Erro de processamento responde 200 com log: retry não conserta e vira tempestade (§2.3).
      console.error('[whatsappWebhook]', err)
      res.json({ erro: String(err) })
    }
  })

  return router
}
