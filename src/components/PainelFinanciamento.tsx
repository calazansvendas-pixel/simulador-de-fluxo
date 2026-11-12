import React, { useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { proximoValorComPasso, STEP_AJUSTE_PADRAO } from './FluxoEntradaConstrutora';

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
  // Botões − / +: passo de R$ 100,00; valor quebrado vai direto ao múltiplo (acima no +, abaixo no −).
  // Nunca passa do teto da unidade (cartaNaMangaMax) nem fica abaixo de zero.
  const ajustar = (direcao: 1 | -1) => {
    if (desabilitada) return;
    let novo = proximoValorComPasso(cartaNaManga, STEP_AJUSTE_PADRAO, direcao);
    if (novo > cartaNaMangaMax) novo = cartaNaMangaMax;
    novo = Math.round(Math.max(0, novo) * 100) / 100;
    setTravou(false);
    if (Math.abs(novo - cartaNaManga) < 0.005) return;
    onCartaNaMangaChange?.(novo);
  };
  const noMinimo = !(cartaNaManga > 0);
  const noMaximo = cartaNaManga >= cartaNaMangaMax - 0.005;
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
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <span className={`min-w-0 truncate whitespace-nowrap text-[11px] sm:text-xs font-semibold ${desabilitada ? "text-slate-700" : "text-morar-700"}`} title="Carta na Manga para o Cliente">Carta na Manga para o Cliente</span>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => { setTravou(false); onCartaNaMangaChange?.(0); }}
              disabled={noMinimo || desabilitada}
              title="Zerar valor"
              aria-label="Zerar valor da Carta na Manga"
              className="p-1 rounded text-slate-400 hover:text-emerald-700 hover:bg-emerald-100/50 transition-colors cursor-pointer disabled:text-slate-200 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              <RotateCcw size={12} />
            </button>
            <div className="inline-flex items-center gap-0.5 bg-[#E5F3EB]/70 border border-[#006B3F]/20 rounded-md px-1 h-7">
              <button
                type="button"
                onClick={() => ajustar(-1)}
                disabled={desabilitada || noMinimo}
                title="Diminuir R$ 100,00"
                aria-label="Diminuir Carta na Manga"
                className="w-5 h-5 rounded bg-white border border-[#E5E8E6] flex items-center justify-center text-[#006B3F] hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Minus size={10} />
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
                className={`w-24 h-5 px-1.5 rounded bg-white border text-center text-xs font-bold focus:outline-none focus:text-slate-900 focus:border-[#006B3F]/25 focus:shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed ${cartaNaManga > 0 ? 'text-slate-900 border-[#006B3F]/25 shadow-2xs' : 'text-slate-500 border-[#E5E8E6]'}`}
              />
              <button
                type="button"
                onClick={() => ajustar(1)}
                disabled={desabilitada || noMaximo}
                title={noMaximo && !desabilitada ? 'Teto da Carta na Manga atingido' : 'Aumentar R$ 100,00'}
                aria-label="Aumentar Carta na Manga"
                className="w-5 h-5 rounded bg-white/80 border border-[#E5E8E6] flex items-center justify-center text-[#006B3F] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Plus size={10} />
              </button>
            </div>
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
