// Kit de UI do motor (@pedidos/core/ui) — componentes que os dois apps compartilham.
// Export SEPARADO do barrel raiz: o server importa '@pedidos/core' e não pode arrastar React.
//
// Fronteira: aqui entra só o que não conhece o app — nada de useAuth, services/api ou
// vocabulário de cliente. Componentes que dependem do contexto do app (ex.: ReportarProblema)
// ficam no app, mesmo quando o código é quase idêntico entre os dois.
//
// Este subpacote NÃO é compilado pelo tsc do server (tsconfig.build.json exclui src/ui);
// ele tem build próprio (tsconfig.ui.json, jsx react-jsx). React/radix/lucide são
// peerDependencies — quem instala é o app.
export { PageHeader } from './PageHeader.js'
