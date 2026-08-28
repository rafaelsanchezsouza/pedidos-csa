import { describe, it, expect, vi, afterEach } from 'vitest'
import { createWhatsappWebhookRouter, issueDaMensagem } from './whatsappWebhook'
import { normalizePhone } from '../phone'
import { withRouter, json } from '../testutil'

const GRUPO = '120363111222333@g.us'
const github = { owner: 'o', repo: 'r', token: 't' }
const config = { groupJid: GRUPO, prefixo: '/issue' }

const evento = (over: Record<string, unknown> = {}, key: Record<string, unknown> = {}) => ({
  event: 'messages.upsert',
  data: {
    key: { remoteJid: GRUPO, fromMe: false, id: 'MSG1', ...key },
    pushName: 'Rafael',
    message: { conversation: '/issue login quebrado' },
    ...over,
  },
})

const post = (get: (p: string, i?: RequestInit) => Promise<Response>, body: unknown) =>
  get('/api/webhooks/whatsapp', { method: 'POST', body: JSON.stringify(body), ...json })

// A criação da issue é um fetch para api.github.com — o que interessa testar é o que o engine
// decide antes e depois dela. Só as chamadas ao GitHub são interceptadas: o próprio withRouter
// usa fetch para falar com o servidor de teste, e um mock cego responderia por ele também.
function mockGithub(resposta: { number: number; html_url: string } | null, status = 201) {
  const real = globalThis.fetch
  const chamadas: RequestInit[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes('api.github.com')) return real(input, init)
    chamadas.push(init ?? {})
    return Promise.resolve(
      new Response(JSON.stringify(resposta ?? { message: 'Bad credentials' }), { status }),
    )
  })
  return chamadas
}

afterEach(() => vi.restoreAllMocks())

describe('createWhatsappWebhookRouter', () => {
  it('mensagem com prefixo no grupo vira issue e o bot responde no grupo', async () => {
    const chamadas = mockGithub({ number: 42, html_url: 'https://gh/42' })
    const enviadas: Array<[string, string]> = []
    const whatsapp = { sendMessage: async (to: string, m: string) => { enviadas.push([to, m]) } }
    const router = createWhatsappWebhookRouter({ github, whatsapp }, config)

    await withRouter('/api/webhooks/whatsapp', router, async (get) => {
      const r = await post(get, evento())
      expect(await r.json()).toEqual({ criada: 42, url: 'https://gh/42' })
    })

    const corpo = JSON.parse(String(chamadas[0].body))
    expect(corpo.title).toBe('login quebrado')       // prefixo não entra no título
    expect(corpo.body).toContain('Rafael')           // autor no rodapé
    expect(enviadas[0][0]).toBe(GRUPO)               // resposta vai para o grupo
    expect(enviadas[0][1]).toContain('https://gh/42')
  })

  it('ignora (200) mensagem sem prefixo, de outro chat e do próprio bot', async () => {
    const chamadas = mockGithub({ number: 1, html_url: 'x' })
    const router = createWhatsappWebhookRouter({ github }, config)
    await withRouter('/api/webhooks/whatsapp', router, async (get) => {
      const semPrefixo = await post(get, evento({ message: { conversation: 'bom dia' } }))
      expect(semPrefixo.status).toBe(200)
      expect(await semPrefixo.json()).toEqual({ ignorado: 'sem prefixo' })

      const outroChat = await post(get, evento({}, { remoteJid: '5583999@s.whatsapp.net' }))
      expect(await outroChat.json()).toEqual({ ignorado: 'outro chat' })

      const doBot = await post(get, evento({}, { fromMe: true }))
      expect(await doBot.json()).toEqual({ ignorado: 'mensagem do próprio bot' })
    })
    expect(chamadas).toHaveLength(0)
  })

  it('reenvio do mesmo evento não abre uma segunda issue', async () => {
    const chamadas = mockGithub({ number: 7, html_url: 'https://gh/7' })
    const router = createWhatsappWebhookRouter({ github }, config)
    await withRouter('/api/webhooks/whatsapp', router, async (get) => {
      await post(get, evento())
      const repetido = await post(get, evento())
      expect(await repetido.json()).toEqual({ ignorado: 'duplicado' })
    })
    expect(chamadas).toHaveLength(1)
  })

  it('falha do GitHub é avisada no grupo e o evento continua reprocessável', async () => {
    const chamadas = mockGithub(null, 401)
    const enviadas: string[] = []
    const whatsapp = { sendMessage: async (_to: string, m: string) => { enviadas.push(m) } }
    const router = createWhatsappWebhookRouter({ github, whatsapp }, config)
    await withRouter('/api/webhooks/whatsapp', router, async (get) => {
      const r = await post(get, evento())
      expect(await r.json()).toEqual({ erro: 'Bad credentials' })
      await post(get, evento())            // reenvio: tenta de novo, não é tratado como duplicado
    })
    expect(enviadas[0]).toContain('Não consegui abrir a issue')
    expect(chamadas).toHaveLength(2)
  })

  it('secret configurado é exigido no header', async () => {
    const router = createWhatsappWebhookRouter({ github }, { ...config, secret: 's3cr3t' })
    await withRouter('/api/webhooks/whatsapp', router, async (get) => {
      expect((await post(get, evento())).status).toBe(401)
      const ok = await get('/api/webhooks/whatsapp', {
        method: 'POST',
        body: JSON.stringify(evento({ message: { conversation: 'oi' } })),
        headers: { 'content-type': 'application/json', 'x-webhook-secret': 's3cr3t' },
      })
      expect(ok.status).toBe(200)
    })
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
