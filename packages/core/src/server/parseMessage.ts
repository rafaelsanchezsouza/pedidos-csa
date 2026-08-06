// Porta de parsing de mensagem de produtor (capacidade offeringSource='parse-message'):
// transforma o texto cru do WhatsApp na lista de produtos ofertados, casando com o catálogo.
// Implementações: fuzzy (pura, vive no core — fuzzyParser.ts) e openai (adapter NO APP — a
// dep `openai` e a chave ficam lá, injetadas no boot). A seleção vem de
// config.capabilities.messageParser; não existe mais barrel trocando implementação por import.

export interface ExistingProduct {
  id: string
  name: string
  unit: string
  price: number
}

export interface ParsedProduct {
  name: string
  unit: string
  price: number
  type: 'fixo' | 'extra'
  matchedProductId?: string
}

export type MessageParser = (
  rawMessage: string,
  existingProducts: ExistingProduct[]
) => Promise<ParsedProduct[]>
