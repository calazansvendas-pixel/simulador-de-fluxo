import React from 'react';
import { ArrowLeft, ChevronDown, HandCoins, KeyRound } from 'lucide-react';
import { ActiveTab, CommercialCondition, Product } from '../types';
import { ConditionKind, getConditionKind } from '../utils/calculations';
import { CONDICOES_APP } from '../config/telasApp';
import { CLASSE_BOTAO_APARTAR_ATIVO, CLASSE_BOTAO_APARTAR_INATIVO, CONDICOES_BASE, ROTULO_CONDICAO_BASE, condicaoAlternadaComissao, condicaoBaseDe, isComissaoApartadaKind, telaDaCondicao } from '../utils/condicoesBase';

interface FichaMorarTopBarProps {
  onBackToSimulator: () => void;
  products?: Product[];
  currentProd: Product;
  onSelectProduct?: (product: Product, conditionId: string) => void;
  onProductChange: (prodId: string) => void;
  currentCond: CommercialCondition;
  // targetTab (opcional) é resolvido a partir da opção do dropdown escolhida
  // (ver opcoesCondicao abaixo) quando ela é uma das variantes "**" — deixa
  // quem recebe o evento (App.tsx/handleSelectConditionWithRouting) navegar
  // direto para a tela certa em vez de inferir pela condição sozinha.
  onSelectCondition?: (condition: CommercialCondition, targetTab?: ActiveTab) => void;
  onConditionChange: (condId: string, targetTab?: ActiveTab) => void;
  deliveryText: string;
  // Condições comerciais liberadas (chaves de CONDICOES_APP, config/telasApp.ts)
  // para o usuário logado — filtra as opções do dropdown de condição, mesma
  // regra já aplicada ao dropdown "Selecionar Condição" do Simulador (ver
  // SimulatorView.tsx). `undefined` = sem restrição (Administrador).
  condicoesLiberadas?: string[];
  // true quando este cabeçalho está renderizado dentro da versão simplificada
  // (NovatoSimuladorView) — usado só para decidir, entre "Sinal c/ Morar" e
  // "Sinal c/ Morar**" (que compartilham a MESMA condição por trás), qual das
  // duas mostrar como selecionada no dropdown.
  isSimplificado?: boolean;
  // Painel lateral: só os seletores (empreendimento, condição, chaves), empilhados em largura
  // total e sem o botão Voltar (que passa para a FichaMorarActionBar).
  vertical?: boolean;
}

// Barra superior de navegação da Ficha Morar — ÚNICO componente de cabeçalho
// para TODAS as variantes da tela (editor completo "Sinal c/ Morar"/"...
// Comissão Apartada" e as telas simplificadas "Sinal c/ Morar**"/"... Com.
// Apartada**"), garantindo que fiquem estritamente idênticas entre si. Os
// botões de ação (Salvar/PDF/Limpar) não ficam aqui — ver FichaMorarActionBar.
export const FichaMorarTopBar: React.FC<FichaMorarTopBarProps> = ({
  onBackToSimulator,
  products,
  currentProd,
  onSelectProduct,
  onProductChange,
  currentCond,
  onSelectCondition,
  onConditionChange,
  deliveryText,
  condicoesLiberadas,
  isSimplificado = false,
  vertical = false
}) => {
  // Opções do dropdown de condição: cruza CONDICOES_APP (config/telasApp.ts)
  // com as condições reais deste produto, filtrando pelas liberadas para o
  // usuário — mesmo padrão já usado no dropdown "Selecionar Condição" do
  // Simulador (ver SimulatorView.tsx). Uma mesma condição real pode gerar
  // duas opções (ex.: "Sinal c/ Morar" e "Sinal c/ Morar**"), cada uma com
  // seu próprio destino de tela — por isso o valor de cada <option> é
  // composto (`${condicaoId}__${itemKey}`), nunca só o id da condição.
  const condicoesPermitidas = CONDICOES_APP.filter(
    item => !condicoesLiberadas || condicoesLiberadas.includes(item.key)
  );
  const opcoesCondicao = condicoesPermitidas.flatMap(item =>
    (currentProd.conditions || [])
      .filter(c => getConditionKind(c.name) === item.variant)
      .map(c => ({
        value: `${c.id}__${item.key}`,
        label: item.tab === 'ficha-morar-simplificada' ? item.label : c.name,
        variant: item.variant,
        condicaoId: c.id,
        targetTab: item.tab
      }))
  );
  // Entre as opções que apontam para a MESMA condição (completa vs
  // simplificada), prioriza a que bate com a tela em que este cabeçalho já
  // está renderizado — sem isso, o select mostraria sempre a primeira opção
  // encontrada (a completa), mesmo dentro da tela simplificada.
  const opcaoAtual = opcoesCondicao.find(o => o.condicaoId === currentCond.id
    && (isSimplificado ? o.targetTab === 'ficha-morar-simplificada' : o.targetTab !== 'ficha-morar-simplificada')
  ) ?? opcoesCondicao.find(o => o.condicaoId === currentCond.id);
  const selectValue = opcaoAtual?.value ?? '';

  const handleConditionSelectChange = (value: string) => {
    const opt = opcoesCondicao.find(o => o.value === value);
    if (opt) onConditionChange(opt.condicaoId, opt.targetTab);
  };

  // --- Modo vertical (painel lateral): as 3 condições base + botão "Apartar Comissão" ---
  // As opções vêm direto das condições do empreendimento (não de CONDICOES_APP), com tela de
  // destino fixa: Sinal c/ Morar -> 'ficha-morar' (nunca a simplificada "**"); as outras -> 'details'.
  // Sempre aparecem as 3; a que o empreendimento não tem cadastrada (ou que o perfil não tem
  // liberada) fica desabilitada em vez de sumir.
  const kindAtual = getConditionKind(currentCond.name);
  const baseAtual = condicaoBaseDe(kindAtual);
  const condicaoLiberada = (kind: ConditionKind) =>
    !condicoesLiberadas || CONDICOES_APP.some(i => i.variant === kind && condicoesLiberadas.includes(i.key));
  // Tela de destino: na simplificada, Sinal c/ Morar (e a variante Comissão Apartada) continua na
  // própria 'ficha-morar-simplificada'; na ficha completa nunca vai para a simplificada.
  const telaDestino = (kind: ConditionKind): ActiveTab =>
    isSimplificado && condicaoBaseDe(kind) === 'sinal-morar' ? 'ficha-morar-simplificada' : telaDaCondicao(kind);
  const opcoesBase = CONDICOES_BASE.map(base => {
    const cond = (currentProd.conditions || []).find(c => getConditionKind(c.name) === base);
    const disponivel = !!cond && (base === baseAtual || condicaoLiberada(base));
    return {
      base,
      value: cond ? cond.id : `indisponivel__${base}`,
      condicaoId: cond?.id,
      targetTab: telaDestino(base),
      disabled: !disponivel,
      label: ROTULO_CONDICAO_BASE[base] + (disponivel ? '' : ' (indisponível)')
    };
  });
  const selectBaseValue = opcoesBase.find(o => o.base === baseAtual)?.value ?? '';
  const handleBaseSelectChange = (value: string) => {
    const opt = opcoesBase.find(o => o.value === value);
    if (opt && opt.condicaoId && !opt.disabled) onConditionChange(opt.condicaoId, opt.targetTab);
  };

  const comissaoAtiva = isComissaoApartadaKind(kindAtual);
  const kindAlvoComissao = condicaoAlternadaComissao(kindAtual);
  const condAlvoComissao = kindAlvoComissao && condicaoLiberada(kindAlvoComissao)
    ? (currentProd.conditions || []).find(c => getConditionKind(c.name) === kindAlvoComissao)
    : undefined;
  const podeApartarComissao = !!condAlvoComissao && !!onSelectCondition;
  const handleApartarComissao = () => {
    if (condAlvoComissao && kindAlvoComissao) onConditionChange(condAlvoComissao.id, telaDestino(kindAlvoComissao));
  };

  if (vertical) {
    return (
      <div className="flex flex-col gap-2 w-full">
        {/* DROPDOWN DE EMPREENDIMENTO */}
        {products && products.length > 1 && onSelectProduct ? (
          <div className="relative block w-full">
            <select
              value={currentProd.id}
              onChange={(e) => onProductChange(e.target.value)}
              className="w-full appearance-none bg-morar-50 hover:bg-morar-100 text-morar-700 font-extrabold text-xs sm:text-sm pl-7 pr-7 py-1.5 text-center [text-align-last:center] rounded-lg border border-morar-200 uppercase tracking-wide cursor-pointer focus:outline-none focus:ring-2 focus:ring-morar-500/20"
            >
              {products.map(p => (
                <option key={p.id} value={p.id} className="text-slate-800 font-semibold bg-white">
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-morar-600 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        ) : (
          <span className="block w-full text-center text-xs sm:text-sm font-extrabold text-morar-600 bg-morar-50 px-3 py-1.5 rounded-lg border border-morar-100 uppercase tracking-wide">
            {currentProd.name}
          </span>
        )}

        {/* DROPDOWN DE CONDIÇÃO COMERCIAL — só as 3 condições base; "Comissão Apartada" é o botão abaixo */}
        {onSelectCondition ? (
          <div className="relative block w-full">
            <select
              value={selectBaseValue}
              onChange={(e) => handleBaseSelectChange(e.target.value)}
              className="w-full appearance-none bg-indigo-50 hover:bg-indigo-100 text-indigo-700 uppercase tracking-wide font-medium text-xs sm:text-sm py-1.5 pl-7 pr-7 text-center [text-align-last:center] rounded-lg border border-indigo-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            >
              {opcoesBase.map(opt => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled} className="text-slate-800 font-medium bg-white">
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-indigo-600 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        ) : (
          <span className="block w-full text-center text-xs sm:text-sm font-medium uppercase tracking-wide text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
            {ROTULO_CONDICAO_BASE[condicaoBaseDe(kindAtual)] ?? currentCond.name}
          </span>
        )}

        {/* BOTÃO APARTAR COMISSÃO — alterna Sinal c/ Morar e Sinal c/ Banco Direto para a variante
            "Comissão Apartada" (e volta), mantendo empreendimento, Torre e Unidade. */}
        <button
          type="button"
          onClick={handleApartarComissao}
          disabled={!podeApartarComissao}
          aria-pressed={comissaoAtiva}
          title={kindAtual === 'parcelamento-morar'
            ? 'Não se aplica ao Parcelamento Morar'
            : !podeApartarComissao ? 'Variante de Comissão Apartada indisponível para este empreendimento/perfil' : comissaoAtiva ? 'Desativar a Comissão Apartada' : 'Apartar a comissão do fluxo'}
          className={`w-full flex items-center justify-center gap-1.5 text-xs py-1.5 px-3 rounded-lg border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${comissaoAtiva ? CLASSE_BOTAO_APARTAR_ATIVO : CLASSE_BOTAO_APARTAR_INATIVO}`}
        >
          <HandCoins className="w-3.5 h-3.5 shrink-0" />
          <span>{comissaoAtiva ? 'Comissão Apartada: Ativa' : 'Apartar Comissão'}</span>
        </button>
      </div>
    );
  }

  return (
  <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={onBackToSimulator}
        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Voltar</span>
      </button>
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* DROPDOWN DE EMPREENDIMENTO */}
        {products && products.length > 1 && onSelectProduct ? (
          <div className="relative inline-block">
            <select
              value={currentProd.id}
              onChange={(e) => onProductChange(e.target.value)}
              className="appearance-none bg-morar-50 hover:bg-morar-100 text-morar-700 font-extrabold text-xs sm:text-sm pl-3 pr-7 py-1.5 rounded-lg border border-morar-200 uppercase tracking-wide cursor-pointer focus:outline-none focus:ring-2 focus:ring-morar-500/20"
            >
              {products.map(p => (
                <option key={p.id} value={p.id} className="text-slate-800 font-semibold bg-white">
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-morar-600 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        ) : (
          <span className="text-xs sm:text-sm font-extrabold text-morar-600 bg-morar-50 px-3 py-1 rounded-lg border border-morar-100 uppercase tracking-wide">
            {currentProd.name}
          </span>
        )}

        {/* DROPDOWN DE CONDIÇÃO COMERCIAL */}
        {opcoesCondicao.length > 0 && onSelectCondition ? (
          <div className="relative inline-block">
            <select
              value={selectValue}
              onChange={(e) => handleConditionSelectChange(e.target.value)}
              className="appearance-none bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs pl-2.5 pr-6 py-1.5 rounded-lg border border-slate-200/80 cursor-pointer focus:outline-none focus:ring-2 focus:ring-morar-500/20"
            >
              {opcoesCondicao.map(opt => (
                <option key={opt.value} value={opt.value} className="text-slate-800 font-medium bg-white">
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-500 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        ) : (
          <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/80">
            {currentCond.name}
          </span>
        )}

        {deliveryText && (
          <span
            id="badge-data-entrega-morar"
            className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200 flex items-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Chaves ➔ {deliveryText}</span>
          </span>
        )}
      </div>
    </div>
  </div>
  );
};
