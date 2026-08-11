// Kit de UI do motor (@pedidos/core/ui) — componentes que os dois apps compartilham.
// Export SEPARADO do barrel raiz: o server importa '@pedidos/core' e não pode arrastar React.
//
// Fronteira: aqui entra só o que não conhece o app — nada de useAuth, services/api ou
// vocabulário de cliente. Componentes que dependem do contexto do app (ex.: ReportarProblema)
// ficam no app, mesmo quando o código é quase idêntico entre os dois.
//
// Este subpacote NÃO é compilado pelo tsc do server (tsconfig.build.json exclui src/ui);
// ele tem build próprio (tsconfig.ui.json, jsx react-jsx). React, radix, lucide, cva, clsx e
// tailwind-merge são peerDependencies — quem instala é o app.
//
// ⚠️ As classes Tailwind daqui só são geradas se o app tiver
// `../../packages/core/src/ui/**/*.tsx` no `content` do tailwind.config — sem isso o build
// passa e o layout quebra em silêncio.

export { cn } from './cn.js'
export { PageHeader } from './PageHeader.js'

// Primitives shadcn — eram cópia byte a byte nos dois apps.
export { Badge, badgeVariants, type BadgeProps } from './primitives/badge.js'
export { Button, buttonVariants, type ButtonProps } from './primitives/button.js'
export {
  Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent,
} from './primitives/card.js'
export {
  Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from './primitives/dialog.js'
export { Input, type InputProps } from './primitives/input.js'
export { Label } from './primitives/label.js'
export {
  Select, SelectGroup, SelectValue, SelectTrigger, SelectContent,
  SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton,
} from './primitives/select.js'
export {
  Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption,
} from './primitives/table.js'
export { Tabs, TabsList, TabsTrigger, TabsContent } from './primitives/tabs.js'
export { Textarea, type TextareaProps } from './primitives/textarea.js'
