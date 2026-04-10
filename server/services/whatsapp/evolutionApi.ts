import type { WhatsAppGateway } from './types.js'

const apiUrl = process.env.EVOLUTION_API_URL ?? 'http://localhost:8080'
const apiKey = process.env.EVOLUTION_API_KEY ?? ''
const instanceName = process.env.EVOLUTION_INSTANCE_NAME ?? 'default'

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
