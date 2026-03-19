# Visão Geral

App web para gestão de pedidos de uma CSA (Comunidade que Sustenta a Agricultura). Produtores enviam mensagens de WhatsApp com produtos disponíveis; admin faz parsing; usuários fazem pedidos semanais.

---

# Fases de Implementação

## Fase 1 — Base ✅
- Auth (Firebase email/senha)
- Multi-tenancy por colmeia
- Catálogo de produtos + produtores
- Parsing de mensagem de produtor via OpenAI
- Ofertas semanais (fixo + extra)
- Pedidos semanais por usuário (rascunho/enviado)

## Fase 2 — Consolidação e Pagamentos ✅
- Pedido consolidado para envio ao produtor (WhatsApp)
- Relatório de pagamentos mensal (individual + consolidado)
- Upload de comprovante de pagamento
- Verificação de pagamento pelo admin

## Fase 3 — Operação e Histórico ⬜
- Visão de entregas semanal com extras por usuário
- Histórico de pedidos por usuário
- Frequência quinzenal (mostrar/ocultar itens conforme frequência do usuário)

## Fase 4 — Futuro ⬜
- Integração com WhatsApp (envio automático)
- Role `produtor` com acesso específico

---

# Funcionalidades

## Produtos e Catálogo
- Produto: nome, unidade, preço, agricultor
- Preço atualizado quando produtor informar novo valor
- Deduplicação via OpenAI (variações de escrita)

## Ofertas Semanais
- Geradas a partir de mensagem de WhatsApp do produtor
- Parsing via OpenAI → admin revisa → salva
- Fallback: se produtor não enviou, usar semana anterior
- Geraldo: só extras com preço
- Edilson Jucy: fixo sem preço + extras sem preço

## Pedidos
- Usuário preenche pedido com base nas ofertas
- Editável mesmo após enviado

## Pagamentos
- Relatório mensal individual e consolidado (admin)
- Upload de comprovante pelo usuário
- Verificação pelo gestor

## Acesso
- Apenas com login válido
- Roles: admin, usuário comum, superadmin, produtor

---

# Usuários

- Admin ou comum ou superadmin ou produtor
- Admins: acesso aos menus de Administração
- Dados do usuário: nome, endereço, contato, frequência (semanal/quinzenal), tipo de retirada (na colmeia / entrega)

---

# Colmeia

Usuários, pedidos e admins agregados em colmeias — grupos independentes com admin próprio, sem acesso cruzado.

---

# Frontend

- React + TypeScript
- Tailwind CSS + shadcn/ui
- Simples e limpo

# Backend

- Node.js + Express, arquitetura em camadas
- Firebase (Auth + Firestore)
- Sem testes unitários/e2e

# Filosofia

Tudo minimalista e robusto.
