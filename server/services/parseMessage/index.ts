export type { ExistingProduct, ParsedProduct, MessageParser } from './types.js'

// Active implementation: fuzzy (no external API dependency)
// To switch to OpenAI: replace the import below with './openai.js'
export { parseProducerMessage } from './fuzzy.js'
