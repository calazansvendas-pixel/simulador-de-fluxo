import React from 'react';

interface MiniSwitchProps {
  ativo: boolean;
  onToggle: () => void;
  disabled?: boolean;
  title?: string;
}

// Mini-interruptor discreto (trilha w-6 h-3.5, bolinha w-2.5 h-2.5): desligado em cinza suave,
// ligado no verde Morar. Usado nas linhas de desconto do quadro "Dados da Aprovação de Crédito".
export const MiniSwitch: React.FC<MiniSwitchProps> = ({ ativo, onToggle, disabled = false, title }) => (
  <button
    type="button"
    role="switch"
    aria-checked={ativo}
    disabled={disabled}
    onClick={onToggle}
    title={title}
    className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors ${ativo ? 'bg-emerald-600' : 'bg-slate-300'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white shadow transition-transform ${ativo ? 'translate-x-3' : 'translate-x-0.5'}`} />
  </button>
);
