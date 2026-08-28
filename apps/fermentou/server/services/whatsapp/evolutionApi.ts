import type { WhatsAppGateway } from './types.js'

// Falhar no boot, não no uso. Antes, instância ausente virava o literal 'default' e o erro só
// aparecia quando alguém tentava logar — a Evolution respondia 404 "The 'default' instance does
// not exist", que não diz a ninguém que o problema é variável de ambiente faltando. Mesmo
// princípio do env.ts: se falta configuração, o processo não sobe e diz o que falta.
const apiUrl = process.env.EVOLUTION_API_URL ?? 'http://localhost:8080'
const apiKey = process.env.EVOLUTION_API_KEY ?? ''
const instanceName = process.env.EVOLUTION_INSTANCE_NAME ?? ''

const faltando = [
  !instanceName && 'EVOLUTION_INSTANCE_NAME',
  !apiKey && 'EVOLUTION_API_KEY',
].filter(Boolean)

if (faltando.length > 0) {
  throw new Error(
    `Evolution API: ${faltando.join(' e ')} não definida(s) no ambiente. ` +
      `Sem isso o envio de WhatsApp (OTP do login) não funciona.`
  )
}

export const evolutionApiGateway: WhatsAppGateway = {
  async sendMessage(to: string, text: string): Promise<void> {
    const res = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({ number: to, text }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Evolution API: ${res.status} — ${body}`)
    }
  },
}
