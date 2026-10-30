import React from 'react';
import { formatCurrency } from '../utils/formatters';

interface FichaMorarProdutoGridProps {
  selectedTorre: string;
  selectedUnidade: string;
  availableTorres: string[];
  filteredUnits: string[];
  onTorreChange: (torre: string) => void;
  onUnidadeChange: (unidade: string) => void;

  fase: string;
  tipologia: string;
  areaPriv: string;
  areaQuintal: string;
  precoTabelaOriginal: number;
  evaluation: number;
}

// Grid do Imóvel (Torre/Unidade + Fase/Tipologia + Área/Quintal/Preço/
// Avaliação) — ÚNICO componente para TODAS as variantes da Ficha Morar
// (editor completo e telas simplificadas), junto com FichaMorarTopBar e
// FichaMorarActionBar, que juntos formam o "bloco superior" da página.
export const FichaMorarProdutoGrid: React.FC<FichaMorarProdutoGridProps> = ({
  selectedTorre,
  selectedUnidade,
  availableTorres,
  filteredUnits,
  onTorreChange,
  onUnidadeChange,
  fase,
  tipologia,
  areaPriv,
  areaQuintal,
  precoTabelaOriginal,
  evaluation
}) => (
  <>
    {/* LINHA 1: TORRE, UNIDADE, FASE, TIPOLOGIA — abaixo de sm (640px) vira grid de
        2 colunas (pares empilhados), igual ao mesmo ajuste feito em DetailsView.tsx. */}
    <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 text-xs w-full">
      <div className="col-span-1 sm:col-span-2 bg-morar-50/60 p-2 rounded-lg border border-morar-100 flex flex-col items-center justify-center text-center min-w-0">
        <label className="block text-[10px] text-morar-600 font-bold uppercase mb-0.5 text-center whitespace-nowrap">
          TORRE *
        </label>
        <select
          value={selectedTorre}
          onChange={(e) => onTorreChange(e.target.value)}
          className="w-full bg-white font-bold text-slate-900 border border-slate-200 rounded-md py-1 px-1 focus:outline-none focus:border-morar-600 text-xs cursor-pointer text-center"
        >
          <option value="">--</option>
          {availableTorres.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="col-span-1 sm:col-span-2 bg-morar-50/60 p-2 rounded-lg border border-morar-100 flex flex-col items-center justify-center text-center min-w-0">
        <label className="block text-[10px] text-morar-600 font-bold uppercase mb-0.5 text-center whitespace-nowrap">
          UNIDADE *
        </label>
        <select
          value={selectedUnidade}
          onChange={(e) => onUnidadeChange(e.target.value)}
          disabled={!selectedTorre}
          className="w-full bg-white font-bold text-slate-900 border border-slate-200 rounded-md py-1 px-1 focus:outline-none focus:border-morar-600 text-xs cursor-pointer text-center disabled:opacity-50"
        >
          <option value="">--</option>
          {filteredUnits.map(u => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>

      <div className="col-span-1 sm:col-span-2 bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex flex-col items-center justify-center text-center min-w-0">
        <span className="block text-[10px] text-slate-400 font-medium text-center mb-0.5 whitespace-nowrap">Fase</span>
        <input
          id="campo-fase-morar"
          type="text"
          value={fase}
          readOnly
          className="w-full bg-transparent font-bold text-slate-700 text-center focus:outline-none cursor-not-allowed text-xs"
        />
      </div>

      <div className="col-span-1 sm:col-span-6 bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex flex-col items-center justify-center text-center min-w-0">
        <span className="block text-[10px] text-slate-400 font-medium text-center mb-0.5 whitespace-nowrap">Tipologia</span>
        <input
          type="text"
          value={tipologia}
          readOnly
          className="w-full bg-transparent font-bold text-slate-700 text-center focus:outline-none cursor-not-allowed truncate text-xs"
          title={tipologia}
        />
      </div>
    </div>

    {/* LINHA 2: ÁREA PRIVATIVA, QUINTAL, PREÇO DE TABELA, AVALIAÇÃO BANCÁRIA — mesma adaptação. */}
    <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 text-xs w-full">
      <div className="col-span-1 sm:col-span-2 bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex flex-col items-center justify-center text-center min-w-0">
        <span className="block text-[10px] text-slate-400 font-medium text-center mb-0.5 whitespace-nowrap">Área Privativa</span>
        <input
          type="text"
          value={areaPriv}
          readOnly
          className="w-full bg-transparent font-bold text-slate-700 text-center focus:outline-none cursor-not-allowed text-xs whitespace-nowrap"
        />
      </div>

      <div className="col-span-1 sm:col-span-2 bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex flex-col items-center justify-center text-center min-w-0">
        <span className="block text-[10px] text-slate-400 font-medium text-center mb-0.5 whitespace-nowrap">Quintal</span>
        <input
          type="text"
          value={areaQuintal}
          readOnly
          className="w-full bg-transparent font-bold text-slate-700 text-center focus:outline-none cursor-not-allowed text-xs whitespace-nowrap"
        />
      </div>

      <div className="col-span-1 sm:col-span-4 bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex flex-col items-center justify-center text-center min-w-0">
        <span className="block text-[10px] text-slate-400 font-medium text-center mb-0.5 whitespace-nowrap">Preço de Tabela</span>
        <input
          type="text"
          value={formatCurrency(precoTabelaOriginal)}
          readOnly
          className="w-full bg-transparent font-bold text-slate-900 text-center focus:outline-none cursor-not-allowed text-xs whitespace-nowrap"
        />
      </div>

      <div className="col-span-1 sm:col-span-4 bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex flex-col items-center justify-center text-center min-w-0">
        <span className="block text-[10px] text-slate-400 font-medium text-center mb-0.5 whitespace-nowrap">Avaliação Bancária</span>
        <input
          type="text"
          value={formatCurrency(evaluation)}
          readOnly
          className="w-full bg-transparent font-bold text-emerald-600 text-center focus:outline-none cursor-not-allowed text-xs whitespace-nowrap"
        />
      </div>
    </div>
  </>
);
