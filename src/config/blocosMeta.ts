import { FileCheck2, Coins, Sparkles, HandCoins } from 'lucide-react';
import { PdfConditionKind } from '../types';

export interface BlocoMeta {
  title: string;
  description: string;
}

export interface KindMeta {
  kind: PdfConditionKind;
  label: string;
  icon: typeof FileCheck2;
  bloco1: BlocoMeta;
  bloco2: BlocoMeta;
  bloco3: BlocoMeta;
  bloco4: BlocoMeta;
}

// Descrição dos 4 blocos de conteúdo de cada condição comercial — usada tanto
// na configuração de exportação de PDF quanto na de visibilidade na tela,
// já que são as mesmas seções visuais nos dois contextos.
export const KIND_META: KindMeta[] = [
  {
    kind: 'banco-direto',
    label: 'Sinal c/ Banco Direto',
    icon: FileCheck2,
    bloco1: { title: 'Bloco 1 — Dados da Aprovação de Crédito', description: 'Renda, subsídio, FGTS, financiamento e sinal.' },
    bloco2: { title: 'Bloco 2 — Fluxo de Entrada c/ Construtora', description: 'Ato do imóvel, ITBI no ato, ato premiado e mensais.' },
    bloco3: { title: 'Bloco 3 — Parcelamento Pró-Soluto / Banco Direto', description: 'Quantidade e valor das parcelas, taxa e despesas cartorárias.' },
    bloco4: { title: 'Bloco 4 — Indicadores de Risco / Comprometimento', description: 'Gráficos de risco parcela/renda e risco pró-soluto total.' },
  },
  {
    kind: 'sinal-morar',
    label: 'Sinal c/ Morar',
    icon: FileCheck2,
    bloco1: { title: 'Bloco 1 — Dados da Aprovação de Crédito', description: 'Renda, subsídio, FGTS, ato premiado, financiamento e sinal distribuído.' },
    bloco2: { title: 'Bloco 2 — Comprometimento por Série', description: 'Gráfico de barras do comprometimento (parcela/renda) por série.' },
    bloco3: { title: 'Bloco 3 — Período de Pagamentos', description: 'Ato, correção INCC (obra), correção IPCA (pós) e ITBI/registro.' },
    bloco4: { title: 'Bloco 4 — Indicadores de Risco / Comprometimento', description: 'Gráficos de risco por fase e volume financeiro por fase.' },
  },
  {
    kind: 'parcelamento-morar',
    label: 'Parcelamento Morar',
    icon: Coins,
    bloco1: { title: 'Bloco 1 — Dados da Aprovação de Crédito', description: 'Renda, subsídio, FGTS, desconto do ato, financiamento e sinal.' },
    bloco2: { title: 'Bloco 2 — Fluxo de Entrada c/ Construtora', description: 'Ato do imóvel, ITBI no ato, ato premiado e mensais.' },
    bloco3: { title: 'Bloco 3 — Parcelamento Morar', description: 'Mensal de obra, intermediárias semestrais, parcela chaves e pós-obra.' },
    bloco4: { title: 'Bloco 4 — Percentuais de Comprometimento', description: 'Gráfico com o percentual de cada componente sobre o imóvel/renda.' },
  },
  {
    kind: 'banco-direto-comissao-apartada',
    label: 'Sinal c/ Banco Direto (Comissão Apartada)',
    icon: FileCheck2,
    bloco1: { title: 'Bloco 1 — Dados da Aprovação de Crédito', description: 'Renda, subsídio, FGTS, financiamento e sinal.' },
    bloco2: { title: 'Bloco 2 — Fluxo de Entrada c/ Construtora', description: 'Ato do imóvel, ITBI no ato, ato premiado e mensais.' },
    bloco3: { title: 'Bloco 3 — Parcelamento Pró-Soluto & Comissão', description: 'Parcelas da construtora, taxa contratual e card de comissão a pagar.' },
    bloco4: { title: 'Bloco 4 — Indicadores de Risco / Comprometimento', description: 'Gráficos de risco parcela/renda e risco pró-soluto total.' },
  },
  {
    kind: 'sinal-morar-comissao-apartada',
    label: 'Sinal c/ Morar (Comissão Apartada)',
    icon: FileCheck2,
    bloco1: { title: 'Bloco 1 — Dados da Aprovação de Crédito', description: 'Renda, subsídio, FGTS, ato premiado, financiamento e sinal distribuído.' },
    bloco2: { title: 'Bloco 2 — Comprometimento por Série & Comissão', description: 'Gráfico de comprometimento por série e card de comissão a pagar.' },
    bloco3: { title: 'Bloco 3 — Período de Pagamentos', description: 'Ato, correção INCC (obra), correção IPCA (pós) e ITBI/registro.' },
    bloco4: { title: 'Bloco 4 — Indicadores de Risco / Comprometimento', description: 'Gráficos de risco por fase e volume financeiro por fase.' },
  },
  // As duas entradas abaixo são das telas SIMPLIFICADAS (NovatoSimuladorView.tsx,
  // rótulos "Sinal c/ Morar**"/"...Com. Apartada)**" no menu — ver telasApp.ts),
  // configuráveis pelo Administrador de forma independente das telas completas
  // acima, mesmo usando a mesma condição comercial por trás (getConditionKind
  // não distingue completa de simplificada). A tela simplificada não tem uma
  // seção equivalente ao Bloco 2 (Comprometimento por Série) das telas
  // completas — o switch existe pela mesma estrutura de 4 blocos usada em toda
  // configuração de tela/PDF, mas hoje não tem nenhum conteúdo para ocultar.
  {
    kind: 'simulador-simplificado',
    label: 'Sinal c/ Morar**',
    icon: Sparkles,
    bloco1: { title: 'Bloco 1 — Dados da Aprovação de Crédito', description: 'Renda, subsídio, FGTS, ato premiado, financiamento e sinal distribuído.' },
    bloco2: { title: 'Bloco 2 — Comprometimento por Série', description: 'Não exibido na versão simplificada — este switch hoje não tem efeito visual.' },
    bloco3: { title: 'Bloco 3 — Período de Pagamentos', description: 'Ato (editável), correção INCC (obra), correção IPCA (pós) e ITBI/registro.' },
    bloco4: { title: 'Bloco 4 — Indicadores de Risco / Comprometimento', description: 'Gráficos de risco por fase e volume financeiro por fase.' },
  },
  {
    kind: 'simulador-simplificado-comissao-apartada',
    label: 'Sinal c/ Morar (Com. Apartada)**',
    icon: HandCoins,
    bloco1: { title: 'Bloco 1 — Dados da Aprovação de Crédito', description: 'Renda, subsídio, FGTS, ato premiado, financiamento e sinal distribuído.' },
    bloco2: { title: 'Bloco 2 — Comprometimento por Série', description: 'Não exibido na versão simplificada — este switch hoje não tem efeito visual.' },
    bloco3: { title: 'Bloco 3 — Período de Pagamentos & Comissão', description: 'Ato (editável, líquido de comissão), card de Comissão Apartada, correção INCC/IPCA e ITBI/registro.' },
    bloco4: { title: 'Bloco 4 — Indicadores de Risco / Comprometimento', description: 'Gráficos de risco por fase e volume financeiro por fase.' },
  },
];
