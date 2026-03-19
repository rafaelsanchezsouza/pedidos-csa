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
