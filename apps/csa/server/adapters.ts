import admin from 'firebase-admin'
import { normalizePhone, type AuthGateway, type WhatsAppGateway } from '@pedidos/core/server'
import { sendWhatsAppMessage } from './services/whatsapp/index.js'

// Adapters concretos das portas do engine. O engine fala com os contratos; as tecnologias
// (Firebase Auth, Evolution API) ficam confinadas aqui.

export const firebaseAuth: AuthGateway = {
  async createUser(email, password) {
    const user = await admin.auth().createUser({ email, password })
    return { uid: user.uid }
  },
  async updateUser(uid, updates) {
    await admin.auth().updateUser(uid, updates)
  },
  async getUserEmail(uid) {
    return (await admin.auth().getUser(uid)).email ?? null
  },
  generatePasswordResetLink(email) {
    return admin.auth().generatePasswordResetLink(email)
  },
  createCustomToken(uid) {
    return admin.auth().createCustomToken(uid)
  },
  async deleteUser(uid) {
    await admin.auth().deleteUser(uid)
  },
}

// A porta recebe o contato como está no doc; normalizar telefone é papel do adapter.
export const whatsapp: WhatsAppGateway = {
  sendMessage(phone, message) {
    return sendWhatsAppMessage(normalizePhone(phone), message)
  },
}
