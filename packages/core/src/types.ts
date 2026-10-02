// Modelo canônico do motor. Nomes canônicos: tenant/tenantId, deliveryType 'retirada'|'entrega'.
// Os *Doc são a forma ARMAZENADA (sem id — a porta Repo devolve WithId<T>); User/Payment no
// topo são as visões mínimas consumidas pelo cálculo puro do domínio.

import type { PrecoBairro } from './domain/frete.js'

export type Frequency = 'semanal' | 'quinzenal'
export type QuinzenalParity = 'par' | 'impar'
// Canônico. O legado 'colmeia' da CSA (até a migração) não entra no tipo: nenhuma regra lê o
// token de não-entrega — o motor só pergunta isEntrega(u).
export type DeliveryType = 'entrega' | 'retirada'

export interface QuotaTier {
  name: string
  price: number
}

export interface User {
  id: string
  name: string
  neighborhood?: string
  deliveryType?: DeliveryType
  deliveryOrder?: number
  frequency?: Frequency
  quinzenalParity?: QuinzenalParity
  quota?: string
  quotaQty?: number
  freteDelivery?: number
}

export interface Payment {
  verified?: boolean
  proofUrl?: string
}

// --- Docs canônicos (forma armazenada; escritas passam pelo engine) ---

export interface TenantDoc {
  name: string
  adminId: string
  dateCreated: string
  quotas?: QuotaTier[]
  quotaTerm?: string
  quotaInteira?: number
  quotaMeia?: number
  freteDelivery?: number
  /** Tabela bairro × preço por entrega. Vence o `freteDelivery` padrão. */
  fretePorBairro?: PrecoBairro[]
  /**
   * Primeiro mês ('YYYY-MM') em que a fatura de frete pode ser gerada. Existe porque a
   * geração roda retroativa sem querer: `POST /payments/frete` dispara para o mês que o
   * membro estiver NAVEGANDO em Meus Pagamentos, então sem esta trava passear para setembro
   * criaria a fatura de setembro. Ausente = sem trava (comportamento antigo).
   */
  freteVigenteDesde?: string
  /** Admin que recebe o aviso de membro sem frete definido. */
  responsavelEntregasId?: string
  dueDay?: number
  orderSendDay?: number
  orderSendHour?: number
  weekChangeDay?: number
  extrasAberto?: boolean
}

export interface UserDoc {
  name: string
  email: string
  address: string
  /** Bairro — define o preço do frete via `tenant.fretePorBairro`, então só admin edita. */
  neighborhood?: string
  contact: string
  frequency: Frequency
  deliveryType: DeliveryType
  tenantId: string
  acesso: string[]
  producerId?: string
  role?: string
  isentoCotas?: boolean
  disabled?: boolean
  deleted?: boolean
  quota?: string
  quotaQty?: number // multiplicador de cota (CSA #45); ausente = 1
  quinzenalParity?: QuinzenalParity
  acolhidaExpiry?: string
  deliveryOrder?: number
  freteDelivery?: number
}

export interface ProducerDoc {
  name: string
  contact: string
  tenantId: string
  pixKey?: string
}

export interface ProductDoc {
  name: string
  unit: string
  price: number
  producerId: string
  tenantId: string
  dateUpdated: string
  type?: 'fixo' | 'extra'
  ativo?: boolean
}

export interface RoleDoc {
  name: string
  tenantId: string
}

export interface OfferingItem {
  productId: string
  productName: string
  unit: string
  price: number
  type: 'fixo' | 'extra'
}

export interface OfferingDoc {
  producerId: string
  producerName: string
  tenantId: string
  items: OfferingItem[]
  weekStart: string
  rawMessage?: string // só na capacidade parse-message (texto original do produtor)
  dateCreated: string
}

export interface OrderItem {
  productId: string
  productName: string
  unit: string
  price: number
  qty: number
  offeringId: string
  producerName: string
}

export interface OrderDoc {
  userId: string
  userName: string
  tenantId: string
  weekId: string
  items: OrderItem[]
  status: 'rascunho' | 'enviado'
  doacao?: boolean
  recebido?: boolean
  weeklyNote?: string
  weeklyAddress?: string
  suspensa?: boolean
  /**
   * Exceção da semana: entra na lista de entrega mesmo que os filtros semanais (quinzenal,
   * doação, acolhida não confirmada) ou o próprio `deliveryType` o deixem de fora. Fica no
   * pedido da semana, ao lado de `suspensa`, e NÃO no usuário — `deliveryType` é do membro,
   * e mexer nele mudaria todas as semanas e a cobrança do mês.
   */
  incluida?: boolean
  dateCreated: string
  dateUpdated: string
}

// Confirmação semanal de quem está em acolhida. Presença do doc = o membro respondeu;
// `confirmado` distingue "quero receber" de "não quero esta semana" — para o admin, não ter
// respondido e ter dito não são coisas diferentes.
//
// Guarda SÓ a confirmação. `deliveryType` continua sendo do usuário (o membro em acolhida
// troca o dele na tela principal, como qualquer outro): a regra de entrega/frete segue
// perguntando `isEntrega(u)`, e a acolhida muda apenas QUANTAS semanas entram na conta.
export interface AcolhidaWeekDoc {
  userId: string
  tenantId: string
  weekId: string // segunda-feira da semana ('YYYY-MM-DD'), mesmo vocabulário dos pedidos
  confirmado: boolean
  dateCreated: string
  dateUpdated: string
}

// Sentinelas de `producerName` nas faturas que NÃO vêm de pedido. São TOKENS DE DADO
// canônicos, iguais nos dois apps e gravados assim em produção — o rótulo que o membro lê é
// vocabulário de UI (`vocabulary.deliveryFeeLabel`). Ficam aqui, e não no serviço, porque o
// front também precisa distinguir as faturas e não pode importar '@pedidos/core/server'.
export const PRODUCER_COTA = 'Cota'
export const PRODUCER_FRETE = 'Entrega'

// Uma entrada do histórico de correção de fatura. Acumula, nunca é reescrita.
export interface CorrecaoPagamento {
  de: number
  para: number
  por: string // uid de quem corrigiu
  em: string // ISO
  motivo?: string
}

export interface PaymentDoc {
  userId: string
  userName: string
  tenantId: string
  month: string
  producerName: string
  amount: number
  dueDate?: string
  /**
   * Correção manual do admin. TRAVA a geração automática: sem isto o ajuste some sozinho, sem
   * erro e sem log, porque `upsertGenerated` reescreve `amount` a cada passada — e ela roda
   * toda vez que o membro abre Meus Pagamentos (`POST /payments/frete`) e a cada confirmação
   * de semana na acolhida, não só no cron do dia 1.
   */
  corrigido?: boolean
  /** Valor que a GERAÇÃO produziu, congelado na primeira correção — é o "desfazer". */
  amountOriginal?: number
  correcoes?: CorrecaoPagamento[]
  /**
   * Último comprovante enviado. Mantido porque a produção inteira já tem esse campo e as
   * telas antigas leem dele — quem paga por mês continua com um comprovante só.
   */
  proofUrl?: string
  /**
   * Comprovantes por semana (acolhida). Quem paga semana a semana manda vários no mesmo mês,
   * e o admin precisa saber qual semana cada um quita — um campo único não comporta isso.
   */
  proofs?: Array<{ weekId: string; url: string; dateUploaded: string }>
  verified: boolean
  dateCreated: string
  dateUpdated: string
}
