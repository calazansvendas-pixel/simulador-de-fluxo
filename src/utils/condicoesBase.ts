import { ConditionKind } from './calculations';

// As 3 condições "base" exibidas no dropdown do painel lateral. As variantes
// "Comissão Apartada" não aparecem como opção própria: são alternadas pelo botão
// "Apartar Comissão" (ver FichaMorarTopBar e DetailsView).
export const CONDICOES_BASE: ConditionKind[] = ['sinal-morar', 'banco-direto', 'parcelamento-morar'];

export const ROTULO_CONDICAO_BASE: Record<string, string> = {
  'sinal-morar': 'Sinal c/ Morar',
  'banco-direto': 'Sinal c/ Banco Direto',
  'parcelamento-morar': 'Parcelamento Morar'
};

export function condicaoBaseDe(kind: ConditionKind): ConditionKind {
  if (kind === 'sinal-morar-comissao-apartada') return 'sinal-morar';
  if (kind === 'banco-direto-comissao-apartada') return 'banco-direto';
  return kind;
}

export function isComissaoApartadaKind(kind: ConditionKind): boolean {
  return kind === 'sinal-morar-comissao-apartada' || kind === 'banco-direto-comissao-apartada';
}

// Condição para a qual o botão "Apartar Comissão" alterna (ativa <-> desativa).
// null = não se aplica (Parcelamento Morar).
export function condicaoAlternadaComissao(kind: ConditionKind): ConditionKind | null {
  switch (kind) {
    case 'sinal-morar': return 'sinal-morar-comissao-apartada';
    case 'sinal-morar-comissao-apartada': return 'sinal-morar';
    case 'banco-direto': return 'banco-direto-comissao-apartada';
    case 'banco-direto-comissao-apartada': return 'banco-direto';
    default: return null;
  }
}

export const CLASSE_BOTAO_APARTAR_ATIVO = 'bg-amber-50 text-amber-800 border-amber-300 font-bold hover:bg-amber-100';
export const CLASSE_BOTAO_APARTAR_INATIVO = 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100';

// Tela de destino das condições base e de suas variantes "Comissão Apartada". Sinal c/ Morar vai
// SEMPRE para a ficha completa ('ficha-morar') — nunca para 'ficha-morar-simplificada' ("**"),
// seja qual for o cargo; as demais usam 'details'.
export function telaDaCondicao(kind: ConditionKind): 'ficha-morar' | 'details' {
  return kind === 'sinal-morar' || kind === 'sinal-morar-comissao-apartada' ? 'ficha-morar' : 'details';
}
