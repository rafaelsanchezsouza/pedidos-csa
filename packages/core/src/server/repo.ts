// Porta de persistência do engine (DIP): o motor fala só com este contrato; cada app injeta
// o adapter concreto (hoje o repositório Firestore que já existe nos apps — a assinatura é a
// mesma de propósito, para a adoção ser só montar o objeto).

export type WithId<T> = T & { id: string }

// Subconjunto dos operadores do Firestore que o motor usa. Manter enxuto: cada operador novo
// aqui é uma exigência a mais sobre qualquer adapter futuro.
export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains'
export type WhereFilter = [field: string, op: WhereOp, value: unknown]

export interface Repo {
  getDoc<T>(collection: string, id: string): Promise<WithId<T> | null>
  listDocs<T>(collection: string, filters?: WhereFilter[]): Promise<WithId<T>[]>
  createDoc<T extends object>(collection: string, data: T): Promise<WithId<T>>
  setDoc<T extends object>(collection: string, id: string, data: T): Promise<void>
  updateDoc<T extends object>(collection: string, id: string, data: Partial<T>): Promise<void>
  updateMany(collection: string, updates: Array<[id: string, data: object]>): Promise<void>
  deleteDoc(collection: string, id: string): Promise<void>
}

// Porta de contas de login (adapter concreto: Firebase Auth). Só o que o engine precisa.
export interface AuthGateway {
  createUser(email: string, password: string): Promise<{ uid: string }>
  updateUser(uid: string, updates: { disabled?: boolean }): Promise<void>
  getUserEmail(uid: string): Promise<string | null>
  generatePasswordResetLink(email: string): Promise<string>
  createCustomToken(uid: string): Promise<string>
  deleteUser(uid: string): Promise<void>
}

// Porta de mensagem ao membro (adapter concreto: WhatsApp/Evolution). O adapter normaliza o
// telefone — o engine passa o contato como está no doc.
export interface WhatsAppGateway {
  sendMessage(phone: string, message: string): Promise<void>
}

export interface EngineDeps {
  repo: Repo
}
