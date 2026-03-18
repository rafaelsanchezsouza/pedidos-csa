import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface ExistingProduct {
  id: string
  name: string
  unit: string
  price: number
}

interface ParsedProduct {
  name: string
  unit: string
  price: number
  type: 'fixo' | 'extra'
  matchedProductId?: string
}

export async function parseProducerMessage(
  rawMessage: string,
  existingProducts: ExistingProduct[]
): Promise<ParsedProduct[]> {
  const systemPrompt = `Você é um assistente especializado em extrair informações de mensagens de produtores de CSA (Comunidade que Sustenta a Agricultura) em português brasileiro.

Dado o texto de uma mensagem de WhatsApp de um produtor, extraia os produtos disponíveis.

Regras de classificação:
- Se a mensagem mencionar "alimentos disponível", "cota", "fixo" ou similar → tipo "fixo"
- Se a mensagem mencionar "extra", "estra", "disponível extra" → tipo "extra"
- Se a mensagem começar com "Boa tarde Extra" ou similar → todos os itens são "extra"
- Itens listados após uma seção "extra" são "extra", após seção "fixo"/"disponível" são "fixo"

Para cada produto identifique:
- name: nome do produto (normalizado, com capitalização adequada)
- unit: unidade (unid, kg, maço, palma, bandeja, etc)
- price: preço em reais (número decimal)
- type: "fixo" ou "extra"

Se o preço não estiver informado, use 0.
Se a unidade não estiver clara, use "unid".

Lista de produtos existentes no catálogo (para correspondência):
${JSON.stringify(existingProducts)}

Para cada produto extraído, verifique se corresponde a algum produto do catálogo (considerando variações ortográficas, abreviações, etc.) e inclua o campo matchedProductId com o id do produto correspondente, ou omita o campo se não houver correspondência.

Retorne APENAS um array JSON válido, sem markdown, sem explicações.`

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: rawMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  })

  const content = response.choices[0].message.content ?? '{}'
  const parsed = JSON.parse(content) as { products?: ParsedProduct[] } | ParsedProduct[]

  if (Array.isArray(parsed)) return parsed
  if (parsed.products && Array.isArray(parsed.products)) return parsed.products
  return []
}
