import React from 'react';
import { Calculator, ArrowRight, UserCheck, DollarSign, PiggyBank, Gift } from 'lucide-react';

interface EmptySimulationNoticeProps {
  onNavigateToSimulator: () => void;
  missingItems?: {
    income?: boolean;
    financing?: boolean;
    subsidy?: boolean;
    fgts?: boolean;
  };
}

export const EmptySimulationNotice: React.FC<EmptySimulationNoticeProps> = ({
  onNavigateToSimulator,
  missingItems
}) => {
  return (
    <div className="w-full max-w-xl mx-auto py-12 px-4 animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-10 text-center space-y-6">
        
        {/* Ícone Informativo Suave */}
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 shadow-2xs">
          <Calculator className="w-8 h-8 stroke-[1.75]" />
        </div>

        {/* Título e Mensagem */}
        <div className="space-y-2.5 max-w-md mx-auto">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Simulação Incompleta
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Para visualizar o fluxo de pagamento, preencha todos os campos financeiros no simulador (Renda, Financiamento, Subsídio e FGTS — informe 0 quando não houver).
          </p>
        </div>

        {/* Checklist de Status dos Dados da Proposta (Exclusivamente os 4 campos financeiros) */}
        {missingItems && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 max-w-md mx-auto grid grid-cols-2 gap-2 text-xs">
            <div
              className={`p-2.5 rounded-lg flex items-center gap-2 transition-colors ${
                missingItems.income
                  ? 'bg-amber-50/90 text-amber-800 border border-amber-200/70 font-medium'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200/70 font-semibold'
              }`}
            >
              <UserCheck className="w-4 h-4 shrink-0" />
              <span className="truncate">{missingItems.income ? 'Renda pendente' : 'Renda ok'}</span>
            </div>

            <div
              className={`p-2.5 rounded-lg flex items-center gap-2 transition-colors ${
                missingItems.financing
                  ? 'bg-amber-50/90 text-amber-800 border border-amber-200/70 font-medium'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200/70 font-semibold'
              }`}
            >
              <DollarSign className="w-4 h-4 shrink-0" />
              <span className="truncate">{missingItems.financing ? 'Financ. pendente' : 'Financ. ok'}</span>
            </div>

            <div
              className={`p-2.5 rounded-lg flex items-center gap-2 transition-colors ${
                missingItems.subsidy
                  ? 'bg-amber-50/90 text-amber-800 border border-amber-200/70 font-medium'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200/70 font-semibold'
              }`}
            >
              <Gift className="w-4 h-4 shrink-0" />
              <span className="truncate">{missingItems.subsidy ? 'Subsídio pendente' : 'Subsídio ok'}</span>
            </div>

            <div
              className={`p-2.5 rounded-lg flex items-center gap-2 transition-colors ${
                missingItems.fgts
                  ? 'bg-amber-50/90 text-amber-800 border border-amber-200/70 font-medium'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200/70 font-semibold'
              }`}
            >
              <PiggyBank className="w-4 h-4 shrink-0" />
              <span className="truncate">{missingItems.fgts ? 'FGTS pendente' : 'FGTS ok'}</span>
            </div>
          </div>
        )}

        {/* Botão de Ação em Destaque */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onNavigateToSimulator}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-morar-600 hover:bg-morar-700 active:bg-morar-800 text-white rounded-xl text-sm font-semibold shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <span>Ir para o Simulador de Crédito</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
