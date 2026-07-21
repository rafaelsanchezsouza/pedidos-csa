// ─────────────────────────────────────────────────────────────────────────────
// CAMADA DE BRAND — fonte única da identidade visual do tenant.
// Para trocar de cliente, edite SÓ este arquivo: nome, tagline, ícone e paleta.
// As cores são aplicadas às CSS variables do tema (shadcn) por applyBrand(), que
// roda no boot (main.tsx) antes do render. Formato HSL do shadcn: "H S% L%".
// ─────────────────────────────────────────────────────────────────────────────

type ThemeVars = Record<string, string>

export interface Brand {
  name: string
  tagline: string
  icon: string            // caminho em /public
  colors: { light: ThemeVars; dark: ThemeVars }
}

// Paleta Fermentou: preto #000, creme #EFCAAF, marrom escuro #421C06, branco.
const cream = '25 67% 81%'      // #EFCAAF
const brown = '22 83% 14%'      // #421C06

export const BRAND: Brand = {
  name: 'Fermentou!',
  tagline: 'Pães Artesanais',
  icon: '/fermentou_icon.png',
  colors: {
    light: {
      background: '0 0% 100%',           // branco
      foreground: '0 0% 0%',             // preto
      card: '0 0% 100%',
      'card-foreground': '0 0% 0%',
      popover: '0 0% 100%',
      'popover-foreground': '0 0% 0%',
      primary: brown,                    // marrom escuro
      'primary-foreground': '25 67% 90%',// creme claro (texto legível no botão)
      secondary: cream,
      'secondary-foreground': brown,
      muted: '28 50% 94%',               // creme bem claro
      'muted-foreground': '22 25% 35%',
      accent: cream,
      'accent-foreground': brown,
      destructive: '0 72% 45%',
      'destructive-foreground': '0 0% 100%',
      border: '26 40% 84%',
      input: '26 40% 84%',
      ring: brown,
    },
    dark: {
      background: '22 40% 7%',           // quase-preto quente
      foreground: '25 67% 90%',          // creme
      card: '22 40% 9%',
      'card-foreground': '25 67% 90%',
      popover: '22 40% 9%',
      'popover-foreground': '25 67% 90%',
      primary: cream,                    // creme vira o primário no escuro
      'primary-foreground': brown,
      secondary: '22 30% 18%',
      'secondary-foreground': '25 67% 90%',
      muted: '22 30% 16%',
      'muted-foreground': '25 30% 65%',
      accent: '22 30% 20%',
      'accent-foreground': '25 67% 90%',
      destructive: '0 62% 40%',
      'destructive-foreground': '0 0% 100%',
      border: '22 30% 20%',
      input: '22 30% 20%',
      ring: cream,
    },
  },
}

// Compat: código antigo importa APP_NAME.
export const APP_NAME = BRAND.name

// Aplica a paleta do brand nas CSS variables do :root, o título e o favicon.
// Chamada no boot (main.tsx), antes do primeiro render.
export function applyBrand(brand: Brand = BRAND): void {
  const root = document.documentElement
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const vars = dark ? brand.colors.dark : brand.colors.light
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(`--${name}`, value)
  }
  document.title = brand.name
  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (favicon) favicon.href = brand.icon
}
