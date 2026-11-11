import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

interface PainelFinanciamentoProps {
  finPercent: number; // 0.8 ou 0.9 (SimulationData.finPercent)
  isFirstHome: boolean;
  onFinPercentChange: (finPercent: 0.8 | 0.9) => void;
  onFirstHomeChange: (isFirstHome: boolean) => void;
  // "Carta na Manga": valor digitado, teto da política para a unidade e callback (opcional).
  cartaNaManga?: number;
  cartaNaMangaMax?: number;
  onCartaNaMangaChange?: (valor: number) => void;
}

const ativo = 'bg-white text-slate-900 shadow-sm';
const inativo = 'text-slate-500 hover:text-slate-800';

// Card "% financiado" + "1º imóvel" da coluna lateral das fichas de cálculo (FichaMorar e
// DetailsView). Só apresenta e dispara os callbacks; o recálculo vem do estado das fichas.
export const PainelFinanciamento: React.FC<PainelFinanciamentoProps> = ({
  finPercent,
  isFirstHome,
  onFinPercentChange,
  onFirstHomeChange,
  cartaNaManga = 0,
  cartaNaMangaMax = 0,
  onCartaNaMangaChange
}) => {
  const [travou, setTravou] = useState(false);
  const desabilitada = !(cartaNaMangaMax > 0);
  const aoDigitar = (txt: string) => {
    const centavos = parseInt(txt.replace(/\D/g, '') || '0', 10);
    let v = Math.round(centavos) / 100;
    if (v > cartaNaMangaMax) { v = cartaNaMangaMax; setTravou(true); } else { setTravou(false); }
    onCartaNaMangaChange?.(v);
  };
  return (
  <div className="space-y-3">
    {/* QUADRO SUPERIOR: parâmetros de crédito (% aprovação + 1º imóvel) */}
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
      <span className="text-[11px] sm:text-xs font-semibold text-slate-700 leading-snug pr-2 min-w-0">É o primeiro imóvel do cliente?</span>
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

    {/* QUADRO INFERIOR: Carta na Manga (valor limitado ao teto da política para a unidade) */}
    {onCartaNaMangaChange && (
      // Elegível (teto da política > 0): mesmo verde-claro dos quadros TORRE/UNIDADE, com borda suave.
      <div className={`p-3.5 rounded-xl border shadow-sm space-y-1 transition-colors ${desabilitada ? "bg-white border-slate-200" : "bg-morar-50/60 border-morar-100"}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`whitespace-nowrap text-[11px] sm:text-xs font-semibold ${desabilitada ? "text-slate-700" : "text-morar-700"}`}>Carta na Manga para o Cliente</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setTravou(false); onCartaNaMangaChange?.(0); }}
              disabled={!(cartaNaManga > 0) || desabilitada}
              title="Zerar valor"
              aria-label="Zerar valor da Carta na Manga"
              className="p-1 rounded text-slate-400 hover:text-emerald-700 hover:bg-emerald-100/50 transition-colors cursor-pointer disabled:text-slate-200 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          <input
            type="text"
            inputMode="numeric"
            disabled={desabilitada}
            value={cartaNaManga > 0 ? formatCurrency(cartaNaManga) : ''}
            placeholder="R$ 0,00"
            onChange={(e) => aoDigitar(e.target.value)}
            onBlur={() => setTravou(false)}
            title={desabilitada ? 'Nenhuma Carta na Manga permitida para esta unidade' : undefined}
            className="w-32 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 text-right focus:outline-none focus:border-morar-400 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          </div>
        </div>
        <p className={`text-[10px] font-medium text-right ${travou ? 'text-rose-600' : 'text-slate-400'}`}>
          {desabilitada ? 'Sem Carta na Manga para esta unidade' : `Máx: ${formatCurrency(cartaNaMangaMax)}`}
        </p>
      </div>
    )}
  </div>
  );
};
