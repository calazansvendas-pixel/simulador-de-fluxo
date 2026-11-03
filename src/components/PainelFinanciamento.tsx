import React from 'react';

interface PainelFinanciamentoProps {
  finPercent: number; // 0.8 ou 0.9 (SimulationData.finPercent)
  isFirstHome: boolean;
  onFinPercentChange: (finPercent: 0.8 | 0.9) => void;
  onFirstHomeChange: (isFirstHome: boolean) => void;
}

const ativo = 'bg-white text-slate-900 shadow-sm';
const inativo = 'text-slate-500 hover:text-slate-800';

// Card "% financiado" + "1º imóvel" da coluna lateral das fichas de cálculo (FichaMorar e
// DetailsView). Só apresenta e dispara os callbacks; o recálculo vem do estado das fichas.
export const PainelFinanciamento: React.FC<PainelFinanciamentoProps> = ({
  finPercent,
  isFirstHome,
  onFinPercentChange,
  onFirstHomeChange
}) => (
  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-3">
    {/* SELETOR 1: % máximo utilizado na aprovação */}
    <div className="flex items-center justify-between gap-1 w-full">
      <span className="whitespace-nowrap text-[11px] sm:text-xs font-semibold text-slate-700">% máximo utilizado na aprovação</span>
      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shrink-0">
        <button
          type="button"
          onClick={() => onFinPercentChange(0.8)}
          aria-pressed={finPercent !== 0.9}
          className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${finPercent !== 0.9 ? ativo : inativo}`}
        >
          80%
        </button>
        <button
          type="button"
          onClick={() => onFinPercentChange(0.9)}
          aria-pressed={finPercent === 0.9}
          className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${finPercent === 0.9 ? ativo : inativo}`}
        >
          90%
        </button>
      </div>
    </div>

    {/* SELETOR 2: 1º Imóvel */}
    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
      <span className="text-xs text-slate-700 leading-snug font-medium pr-2 min-w-0">É o primeiro imóvel do cliente?</span>
      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shrink-0">
        <button
          type="button"
          onClick={() => onFirstHomeChange(true)}
          aria-pressed={isFirstHome}
          className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${isFirstHome ? ativo : inativo}`}
        >
          Sim
        </button>
        <button
          type="button"
          onClick={() => onFirstHomeChange(false)}
          aria-pressed={!isFirstHome}
          className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${!isFirstHome ? ativo : inativo}`}
        >
          Não
        </button>
      </div>
    </div>
  </div>
);
