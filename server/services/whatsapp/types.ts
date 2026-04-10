export interface WhatsAppGateway {
  sendMessage(to: string, text: string): Promise<void>
}
