import type { Brand } from '../config.js'

// 'auto' segue o prefers-color-scheme do sistema; 'light'/'dark' fixam o tema.
export type ThemeChoice = 'auto' | 'light' | 'dark'

// Aplica a paleta do brand nas CSS variables do :root, o título e o favicon.
// Chamada no boot do app (main.tsx), antes do primeiro render.
//
// O tema é ESCOLHA EXPLÍCITA do app e não tem default por um motivo: o Tailwind dos dois
// apps usa `darkMode: ['class']` e ninguém adiciona a classe `.dark` — ou seja, o bloco
// `.dark` do index.css nunca ativa e as telas são sempre claras. Um default 'auto' aqui
// ligaria o tema escuro para quem tem o SO em dark mode, mudando a aparência de um app em
// produção sem que ninguém tivesse pedido. Quando um app quiser dark mode de verdade,
// passa 'auto' (ou 'dark') aqui e ajusta o Tailwind junto.
//
// O contrato `Brand` mora em config.ts porque o AppConfig o carrega; aqui fica só o efeito
// no DOM.
export function applyBrand(brand: Brand, theme: ThemeChoice): void {
  const root = document.documentElement
  const dark = theme === 'auto'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
    : theme === 'dark'
  const vars = dark ? brand.colors.dark : brand.colors.light
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(`--${name}`, value)
  }
  document.title = brand.name
  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (favicon) favicon.href = brand.icon
}
