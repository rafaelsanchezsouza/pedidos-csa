import { useState } from 'react'
import { formatDeliveryDate } from '../domain/index.js'

// Forma mínima: só o que o componente lê. Não depende de PaymentDoc nem do tipo do app —
// qualquer fatura com comprovante serve, que é a fronteira do kit.
export interface ComprovanteDaSemana {
  weekId: string
  url: string
  dateUploaded?: string
}

export interface FaturaComComprovantes {
  proofUrl?: string
  proofs?: ComprovanteDaSemana[]
}

/**
 * Comprovantes de uma fatura.
 *
 * Quem paga por mês manda um só e o link direto basta — é o caso de quase todo mundo, e
 * trocar isso por um seletor de um item seria piorar a tela pela exceção. Quem está em
 * acolhida manda um por semana: aí vem o seletor, com a data de entrega da semana, para a
 * conferência saber qual pagamento cada arquivo quita.
 */
export function Comprovantes({
  payment,
  compacto = false,
}: {
  payment: FaturaComComprovantes
  compacto?: boolean
}) {
  const proofs = payment.proofs ?? []
  const [escolhido, setEscolhido] = useState(0)

  if (proofs.length === 0) {
    if (!payment.proofUrl) return <span className="text-muted-foreground">—</span>
    return (
      <a href={payment.proofUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
        {compacto ? 'Ver' : 'Ver comprovante'}
      </a>
    )
  }

  const atual = proofs[Math.min(escolhido, proofs.length - 1)]!
  return (
    <span className="inline-flex items-center gap-2">
      {proofs.length > 1 && (
        <select
          aria-label="Semana do comprovante"
          className="border rounded px-1 py-0.5 text-xs bg-background"
          value={escolhido}
          onChange={(e) => setEscolhido(Number(e.target.value))}
        >
          {proofs.map((pr, i) => (
            <option key={pr.weekId} value={i}>
              Semana {i + 1} · {formatDeliveryDate(pr.weekId)}
            </option>
          ))}
        </select>
      )}
      <a href={atual.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
        Ver{proofs.length === 1 ? ` (${formatDeliveryDate(atual.weekId)})` : ''}
      </a>
    </span>
  )
}
