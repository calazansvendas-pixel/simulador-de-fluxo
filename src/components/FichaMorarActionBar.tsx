import React from 'react';
import { Loader2, Printer, RotateCcw, Save } from 'lucide-react';

interface FichaMorarActionBarProps {
  clientName?: string;
  agency?: string;
  onLimpar: () => void;
  onSaveSimulation: () => void;
  isSavingSimulation: boolean;
  onOpenPdfExport: () => void;
}

// Mesma altura/padding para os três botões (Salvar, PDF, Limpar) — só a cor
// muda entre eles. Ver FichaMorarTopBar para o cabeçalho de navegação.
const actionButtonClass = 'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0';

// Barra de Cliente/Imobiliária + ações (Salvar, PDF, Limpar), compartilhada
// por TODAS as variantes da Ficha Morar (completa e simplificada), agrupando
// os três botões à direita, lado a lado com o mesmo tamanho.
export const FichaMorarActionBar: React.FC<FichaMorarActionBarProps> = ({
  clientName,
  agency,
  onLimpar,
  onSaveSimulation,
  isSavingSimulation,
  onOpenPdfExport
}) => (
  <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs flex-wrap gap-2">
    <div className="flex items-center gap-3 flex-wrap min-w-0">
      <span className="text-slate-500 font-medium">
        Cliente: <strong className="text-slate-900">{clientName || 'Cliente Não Informado'}</strong>
      </span>
      <span className="text-slate-300">|</span>
      <span className="text-slate-500 font-medium">
        Imobiliária: <strong className="text-slate-900">{agency?.trim() || 'Imobiliária Não Informada'}</strong>
      </span>
    </div>
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={onSaveSimulation}
        disabled={isSavingSimulation}
        className={`${actionButtonClass} bg-emerald-50 hover:bg-emerald-100 text-emerald-700`}
        title="Salvar proposta/simulação no banco Supabase"
      >
        {isSavingSimulation ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
        <span>{isSavingSimulation ? 'Salvando...' : 'Salvar'}</span>
      </button>
      <button
        type="button"
        onClick={onOpenPdfExport}
        className={`${actionButtonClass} bg-morar-50 hover:bg-morar-100 text-morar-700`}
        title="Exportar Ficha Morar em PDF / Imprimir"
      >
        <Printer className="w-3 h-3" />
        <span>PDF</span>
      </button>
      <button
        type="button"
        onClick={onLimpar}
        className={`${actionButtonClass} bg-slate-100 hover:bg-slate-200 text-slate-600`}
        title="Limpar Ficha Morar"
      >
        <RotateCcw className="w-3 h-3 text-morar-600" />
        <span>Limpar</span>
      </button>
    </div>
  </div>
);
