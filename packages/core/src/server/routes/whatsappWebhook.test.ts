import { describe, it, expect, vi, afterEach } from 'vitest'
import { createWhatsappWebhookRouter, issueDaMensagem, type ZapInboundMessage } from './whatsappWebhook'
import { normalizePhone } from '../phone'
import { withRouter, json } from '../testutil'

const GRUPO = '120363427262412803@g.us'
const SECRET = 'zap-secret'
const github = { owner: 'o', repo: 'r', token: 't' }
const config = { groupJid: GRUPO, prefixo: '/issue', secret: SECRET }

// Entrada é o envelope zap-in/1 entregue pelo zap-hub, não o payload do evolution.
const envelope = (over: Partial<ZapInboundMessage> = {}): ZapInboundMessage => ({
  protocol: 'zap-in/1',
  messageId: 'MSG1',
  chatJid: GRUPO,
  senderJid: '5583999998888@s.whatsapp.net',
  senderNumber: '5583999998888',
  isGroup: true,
  senderName: 'Rafael',
  text: '/issue login quebrado',
  timestamp: 1756400000000,
  ...over,
})

const post = (get: (p: string, i?: RequestInit) => Promise<Response>, body: unknown, secret = SECRET) =>
  get('/api/whatsapp/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-zap-secret': secret },
  })

// A criação da issue é um fetch para api.github.com — só ele é interceptado: o withRouter
// também usa fetch para falar com o servidor de teste.
function mockGithub(resposta: { number: number; html_url: string } | null, status = 201) {
  const real = globalThis.fetch
  const chamadas: RequestInit[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes('api.github.com')) return real(input, init)
    chamadas.push(init ?? {})
    return Promise.resolve(new Response(JSON.stringify(resposta ?? { message: 'Bad credentials' }), { status }))
  })
  return chamadas
}

afterEach(() => vi.restoreAllMocks())

describe('createWhatsappWebhookRouter', () => {
  it('envelope com prefixo no grupo vira issue e o bot responde no grupo', async () => {
    const chamadas = mockGithub({ number: 42, html_url: 'https://gh/42' })
    const enviadas: Array<[string, string]> = []
    const whatsapp = { sendMessage: async (to: string, m: string) => { enviadas.push([to, m]) } }

    await withRouter('/api/whatsapp/webhook', createWhatsappWebhookRouter({ github, whatsapp }, config), async (get) => {
      const r = await post(get, envelope())
      expect(await r.json()).toEqual({ criada: 42, url: 'https://gh/42' })
    })

    const corpo = JSON.parse(String(chamadas[0].body))
    expect(corpo.title).toBe('login quebrado')       // prefixo fora do título
    expect(corpo.body).toContain('Rafael')           // senderName no rodapé
    expect(enviadas[0][0]).toBe(GRUPO)               // resposta vai para o grupo
    expect(enviadas[0][1]).toContain('https://gh/42')
  })

  it('descarta com 204: outro chat, sem prefixo, prefixo sozinho', async () => {
    const chamadas = mockGithub({ number: 1, html_url: 'x' })
    await withRouter('/api/whatsapp/webhook', createWhatsappWebhookRouter({ github }, config), async (get) => {
      expect((await post(get, envelope({ chatJid: '120363000@g.us' }))).status).toBe(204)
      expect((await post(get, envelope({ text: 'bom dia' }))).status).toBe(204)
      expect((await post(get, envelope({ text: '/issue   ' }))).status).toBe(204)
    })
    expect(chamadas).toHaveLength(0)
  })

  it('exige o envelope: payload cru do evolution é 400', async () => {
    await withRouter('/api/whatsapp/webhook', createWhatsappWebhookRouter({ github }, config), async (get) => {
      const cru = { event: 'messages.upsert', data: { key: { remoteJid: GRUPO }, message: { conversation: '/issue x' } } }
      expect((await post(get, cru)).status).toBe(400)
    })
  })

  it('secret: errado é 401; não configurado é 503', async () => {
    await withRouter('/api/whatsapp/webhook', createWhatsappWebhookRouter({ github }, config), async (get) => {
      expect((await post(get, envelope(), 'errado')).status).toBe(401)
    })
    await withRouter('/api/whatsapp/webhook', createWhatsappWebhookRouter({ github }, { ...config, secret: undefined }), async (get) => {
      expect((await post(get, envelope())).status).toBe(503)
    })
  })

  it('reenvio do mesmo messageId não abre uma segunda issue', async () => {
    const chamadas = mockGithub({ number: 7, html_url: 'https://gh/7' })
    await withRouter('/api/whatsapp/webhook', createWhatsappWebhookRouter({ github }, config), async (get) => {
      await post(get, envelope())
      expect((await post(get, envelope())).status).toBe(204)
    })
    expect(chamadas).toHaveLength(1)
  })

  it('falha do GitHub é avisada no grupo e o evento continua reprocessável', async () => {
    const chamadas = mockGithub(null, 401)
    const enviadas: string[] = []
    const whatsapp = { sendMessage: async (_to: string, m: string) => { enviadas.push(m) } }
    await withRouter('/api/whatsapp/webhook', createWhatsappWebhookRouter({ github, whatsapp }, config), async (get) => {
      expect(await (await post(get, envelope())).json()).toEqual({ erro: 'Bad credentials' })
      await post(get, envelope())          // reenvio tenta de novo, não é tratado como duplicado
    })
    expect(enviadas[0]).toContain('Não consegui abrir a issue')
    expect(chamadas).toHaveLength(2)
  })
})

describe('issueDaMensagem', () => {
  it('primeira linha é o título; o texto inteiro vai no corpo', () => {
    const { title, body } = issueDaMensagem('OTP não chega\n\nacontece só no iPhone', 'Rafael')
    expect(title).toBe('OTP não chega')
    expect(body).toContain('acontece só no iPhone')
    expect(body).toContain('Rafael')
  })

  it('título longo é truncado', () => {
    const { title } = issueDaMensagem('x'.repeat(200), 'R')
    expect(title).toHaveLength(120)
    expect(title.endsWith('…')).toBe(true)
  })
})

describe('normalizePhone', () => {
  it('não mexe em JID de grupo (a resposta do webhook vai para o grupo)', () => {
    expect(normalizePhone(GRUPO)).toBe(GRUPO)
    expect(normalizePhone('5583999998888@s.whatsapp.net')).toBe('5583999998888@s.whatsapp.net')
  })

  it('continua normalizando telefone cru', () => {
    expect(normalizePhone('(83) 99999-8888')).toBe('5583999998888')
  })
})
