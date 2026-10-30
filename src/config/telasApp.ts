import { Calculator, FileCheck2, Building2, FileSpreadsheet, ClipboardList, Coins, FileOutput, LayoutGrid, ShieldCheck, Sparkles, HandCoins } from 'lucide-react';
import { ActiveTab, Cargo } from '../types';
import { ConditionKind } from '../utils/calculations';

export interface TelaApp {
  // Chave estável gravada em PerfilUsuario.telasLiberadas — nunca renomear uma
  // chave existente (perfis já aprovados referenciam essas chaves no banco).
  key: string;
  label: string;
  icon: typeof Calculator;
  tab: ActiveTab;
  variant?: ConditionKind;
}

// Fonte única das telas do sistema. O menu de Navegação (Sidebar) e o painel
// "Editar cargo e permissões" (AdminPanelView) leem esta mesma lista — uma aba
// nova só precisa ser adicionada aqui para aparecer automaticamente nos dois
// lugares, liberável para qualquer cargo pelo Administrador.
export const TELAS_APP: TelaApp[] = [
  { key: 'policies', label: 'Políticas & Empreendimentos', icon: Building2, tab: 'policies' },
  { key: 'simulator', label: 'Simulador de Crédito', icon: Calculator, tab: 'simulator' },
  { key: 'sinal-morar', label: 'Sinal c/ Morar', icon: FileCheck2, tab: 'ficha-morar', variant: 'sinal-morar' },
  // Versão simplificada (visual de Ficha Exportada, com um subconjunto restrito
  // de campos editáveis) da Ficha Morar — pensada para corretores iniciantes,
  // mas liberável pelo Administrador para QUALQUER cargo (não é hardcoded para
  // "Corretor Parceiro"). Aba própria ('ficha-morar-simplificada'), separada de
  // 'ficha-morar', para que a liberação desta tela seja independente da tela
  // "Sinal c/ Morar" tradicional — ver FichaMorar.tsx (prop isNovato). O rótulo
  // "Sinal c/ Morar**" (com os dois asteriscos) é proposital: sinaliza ao
  // corretor que esta é uma variante (a versão guiada) da condição comercial
  // "Sinal c/ Morar", não uma tela totalmente à parte — chave interna
  // ('simulador-simplificado') mantida estável independente do rótulo exibido.
  { key: 'simulador-simplificado', label: 'Sinal c/ Morar**', icon: Sparkles, tab: 'ficha-morar-simplificada', variant: 'sinal-morar' },
  { key: 'sinal-morar-comissao-apartada', label: 'Sinal c/ Morar (Comissão Apartada)', icon: FileCheck2, tab: 'ficha-morar', variant: 'sinal-morar-comissao-apartada' },
  // Segunda versão da tela simplificada, para a condição comercial "Sinal c/
  // Morar (Comissão Apartada)" — mesma aba ('ficha-morar-simplificada') da
  // versão acima, diferenciada pelo variant (como já ocorre entre 'sinal-morar'
  // e 'sinal-morar-comissao-apartada' na versão completa). Liberável pelo
  // Administrador de forma independente da versão sem comissão apartada.
  { key: 'simulador-simplificado-comissao-apartada', label: 'Sinal c/ Morar (Com. Apartada)**', icon: HandCoins, tab: 'ficha-morar-simplificada', variant: 'sinal-morar-comissao-apartada' },
  { key: 'banco-direto', label: 'Sinal c/ Banco Direto', icon: FileCheck2, tab: 'details', variant: 'banco-direto' },
  { key: 'banco-direto-comissao-apartada', label: 'Sinal c/ Banco Direto (Comissão Apartada)', icon: FileCheck2, tab: 'details', variant: 'banco-direto-comissao-apartada' },
  { key: 'parcelamento-morar', label: 'Parcelamento Morar', icon: Coins, tab: 'details', variant: 'parcelamento-morar' },
  { key: 'pdf-settings', label: 'Configurar Exportação PDF', icon: FileOutput, tab: 'pdf-settings' },
  { key: 'tela-settings', label: 'Configurar Visibilidade dos Quadros', icon: LayoutGrid, tab: 'tela-settings' },
  { key: 'import-table', label: 'Importar Tabela (Excel)', icon: FileSpreadsheet, tab: 'import-table' },
  { key: 'saved-simulations', label: 'Simulações Salvas', icon: ClipboardList, tab: 'saved-simulations' },
  { key: 'admin-panel', label: 'Painel do Administrador', icon: ShieldCheck, tab: 'admin-panel' }
];

// Campos do cadastro de um usuário que o Administrador pode autorizar um
// Diretor/Gerente a editar nos cadastros de quem está abaixo dele na
// hierarquia (ver PerfilUsuario.camposEditaveisEquipe). Chave estável — nunca
// renomear uma já existente.
export interface CampoEditavelEquipe {
  key: string;
  label: string;
}

export const CAMPOS_EDITAVEIS_EQUIPE: CampoEditavelEquipe[] = [
  { key: 'nome', label: 'Nome completo' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'cpf', label: 'CPF' },
  { key: 'imobiliaria', label: 'Imobiliária' },
  { key: 'creci', label: 'CRECI' },
  { key: 'cargo', label: 'Cargo' },
  { key: 'superior', label: 'Superior hierárquico' },
  { key: 'telas', label: 'Telas liberadas' },
  { key: 'empreendimentos', label: 'Empreendimentos liberados' }
];

export const CARGOS: Cargo[] = [
  'Administrador',
  'Diretor',
  'Gerente',
  'Coordenador de Vendas',
  'Analista de Vendas',
  'Analista de Crédito',
  'Assistente de Vendas',
  'Assistente de Crédito',
  'Corretor',
  'Corretor Parceiro'
];

// Sugestão inicial de telas liberadas por cargo, usada só para pré-preencher a
// tela de aprovação de cadastros pendentes — o Administrador sempre pode
// ajustar livremente antes (ou depois) de aprovar.
// Pacote básico igual para todo mundo: as 4 fichas de simulação + o histórico
// de propostas. Telas mais sensíveis (Políticas & Empreendimentos, Configurar
// Exportação PDF, Importar Tabela, Painel do Administrador) ficam de fora do
// padrão — o Administrador libera na mão, pessoa por pessoa, quando fizer
// sentido, seja na aprovação do cadastro ou depois em "Editar".
const TELAS_PADRAO_BASE = ['simulator', 'banco-direto', 'sinal-morar', 'parcelamento-morar', 'banco-direto-comissao-apartada', 'sinal-morar-comissao-apartada', 'saved-simulations'];

export const TELAS_PADRAO_POR_CARGO: Record<Cargo, string[]> = {
  'Administrador': TELAS_PADRAO_BASE,
  'Diretor': TELAS_PADRAO_BASE,
  'Gerente': TELAS_PADRAO_BASE,
  'Coordenador de Vendas': TELAS_PADRAO_BASE,
  'Analista de Vendas': TELAS_PADRAO_BASE,
  'Analista de Crédito': TELAS_PADRAO_BASE,
  'Assistente de Vendas': TELAS_PADRAO_BASE,
  'Assistente de Crédito': TELAS_PADRAO_BASE,
  'Corretor': TELAS_PADRAO_BASE,
  'Corretor Parceiro': TELAS_PADRAO_BASE
};

export interface CondicaoApp {
  // Mesma chave estável de TELAS_APP (gravada em PerfilUsuario.condicoesLiberadas
  // — controle independente de telasLiberadas, ver authService.ts).
  key: string;
  label: string;
  variant: ConditionKind;
  tab: ActiveTab;
}

// Condições comerciais selecionáveis no dropdown "Selecionar Condição" (quadro
// "3. Empreendimentos" do Simulador de Crédito, ver SimulatorView.tsx) —
// derivada de TELAS_APP (todo item com `variant` é uma condição comercial),
// então uma condição nova cadastrada em TELAS_APP já aparece aqui sem precisar
// duplicar a lista. Inclui as duas variantes simplificadas ("Sinal c/ Morar**"
// e "...Com. Apartada)**"), cada uma com seu próprio `tab` de destino.
export const CONDICOES_APP: CondicaoApp[] = TELAS_APP
  .filter((t): t is TelaApp & { variant: ConditionKind } => !!t.variant)
  .map(t => ({ key: t.key, label: t.label, variant: t.variant, tab: t.tab }));
