// Normalização de telefone BR para envio (DDI 55). NÃO é idempotente para números curtos —
// normalizar UMA vez, no adapter que envia (os serviços do engine repassam o contato cru).
export function normalizePhone(raw: string): string {
  // JID já resolvido (grupo `...@g.us`, contato `...@s.whatsapp.net`) passa intacto: aplicar a
  // regra de telefone num JID de grupo produziria '55120363...' e o envio iria para o vazio.
  if (raw.includes('@')) return raw
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  return '55' + digits
}
