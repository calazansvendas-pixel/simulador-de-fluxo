import React from 'react';
import { ArrowLeft, ChevronDown, KeyRound } from 'lucide-react';
import { ActiveTab, CommercialCondition, Product } from '../types';
import { getConditionKind } from '../utils/calculations';
import { CONDICOES_APP } from '../config/telasApp';

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
  isSimplificado = false
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
