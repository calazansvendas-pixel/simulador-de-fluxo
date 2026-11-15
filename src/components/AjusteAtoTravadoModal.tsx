import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

interface AjusteAtoTravadoModalProps {
  /** Valor que passou do limite das parcelas e não tem para onde ir sem mexer no Ato travado. */
  excedente: number;
  /** Texto do contexto (o que o usuário acabou de fazer), ex.: "Ao reduzir a Obra para 24 meses". */
  contexto?: string;
  /** Destrava o cadeado e soma o excedente ao Ato (Imóvel) — a proposta continua 100% fechada. */
  onJogarParaAto: () => void;
  /** Mantém o fluxo anterior, sem perda de saldo. */
  onCancelar: () => void;
}

/**
 * Modal de redistribuição quando o limite das parcelas (teto de comprometimento/risco) não absorve o saldo
 * e o cadeado do Ato (Imóvel) está fechado: o saldo nunca some — ou vai para o Ato (destravando-o) ou a
 * alteração é cancelada. Mesmo padrão visual do modal de redistribuição do Parcelamento Morar.
 */
export const AjusteAtoTravadoModal: React.FC<AjusteAtoTravadoModalProps> = ({ excedente, contexto, onJogarParaAto, onCancelar }) => createPortal(
  <div
    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}
  >
    <div className="bg-white rounded-2xl border border-[#E5E8E6] shadow-xl w-full max-w-md p-5 space-y-4" role="dialog" aria-modal="true">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-slate-700 leading-snug">
          {contexto ? `${contexto}, as` : 'As'} parcelas atingiram o limite da Política de Crédito e o <strong className="text-slate-900">Ato (Imóvel) está travado</strong>.
          Para onde deseja jogar a diferença de{' '}
          <strong className="text-slate-900">{formatCurrency(excedente)}</strong>?
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={onJogarParaAto}
          className="px-4 py-2 text-xs font-bold text-white bg-[#006B3F] hover:bg-[#005a35] rounded-xl cursor-pointer text-left"
        >
          Jogar diferença para o Ato (Imóvel) — destrava o cadeado
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50 rounded-xl cursor-pointer"
        >
          Cancelar — manter a quantidade de parcelas anterior
        </button>
      </div>
    </div>
  </div>,
  document.body
);
