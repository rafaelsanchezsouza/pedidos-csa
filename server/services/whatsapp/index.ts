export type { WhatsAppGateway } from './types.js'

// Implementação ativa: Evolution API
// Para trocar: substituir o import abaixo
import { evolutionApiGateway } from './evolutionApi.js'

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  return evolutionApiGateway.sendMessage(to, text)
}
