# pedidos-csa

Solução web para facilitar pedidos na Rede CSA Parahyba.

## Pré-requisitos

- Node.js 20+
- Projeto no [Firebase](https://console.firebase.google.com) com **Authentication** (email/senha) e **Firestore** habilitados
- Conta na [OpenAI](https://platform.openai.com) com acesso à API

## Configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Variáveis de ambiente

Copie o arquivo de exemplo e preencha os valores:

```bash
cp .env.example .env
```

**`.env`:**

```env
# Firebase — Client SDK (obtido em Configurações do projeto > Seus apps)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Firebase — Admin SDK (obtido em Configurações do projeto > Contas de serviço > Gerar nova chave privada)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# OpenAI
OPENAI_API_KEY=

# Servidor
PORT=3001
```

> **Atenção:** o `FIREBASE_PRIVATE_KEY` deve estar entre aspas duplas e com `\n` representando as quebras de linha.

### 3. Criar usuário admin no Firebase

No [Firebase Console](https://console.firebase.google.com), acesse **Authentication > Users** e crie o primeiro usuário manualmente. Anote o UID gerado.

### 4. Criar a primeira colmeia

Com os servidores rodando (passo 5), execute uma vez:

```bash
curl -X POST http://localhost:3001/api/setup \
  -H "Content-Type: application/json" \
  -d '{"adminUid": "SEU_UID_AQUI"}'
```

## Rodando em desenvolvimento

```bash
# Frontend + backend simultaneamente
npm run dev:all

# Ou separadamente:
npm run dev         # Frontend → http://localhost:5173
npm run dev:server  # Backend  → http://localhost:3001
```

Acesse [http://localhost:5173](http://localhost:5173) e faça login com o usuário criado no Firebase.

## Build para produção

```bash
npm run build          # Compila frontend (TypeScript + Vite)
npm run build:backend  # Compila backend
```

## Outros comandos

```bash
npm run lint   # Verificar erros de lint
```
