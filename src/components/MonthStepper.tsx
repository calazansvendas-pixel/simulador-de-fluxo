import React, { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';

interface MonthStepperProps {
  total: number;
  onChange: (novoTotal: number) => void;
  colorClass?: string;
  // Piso/teto do stepper — o botão correspondente fica desabilitado ao
  // alcançar o limite (em vez de deixar o clique estourar e depender de um
  // toast de erro). `min` default 0; `max` opcional (sem teto quando omitido).
  min?: number;
  max?: number;
  // Texto usado nos tooltips e no aria-label dos botões, ex.: "mês"/"parcela".
  unitLabel?: string;
  disabled?: boolean;
  // Visual "solto": sem cápsula externa; botões −/+ compactos (w-6 h-7) e o número centralizado entre eles.
  solto?: boolean;
  tituloMaximo?: string; // tooltip do + quando o limite máximo foi atingido
  tituloMinimo?: string; // tooltip do − quando o limite mínimo foi atingido
}

// Stepper interativo `[ - Nx + ]` — componente padrão do app para qualquer
// controle de quantidade de parcelas (Obra, Pós-Obra, ITBI, Comissão
// Apartada, Parcelamento Morar, Qtd. Mensais). Clicar em "+"/"-" já dispara
// onChange, que por sua vez aciona o recálculo do fluxo no componente pai —
// nenhuma lógica de cálculo mora aqui, só a interação.
export const MonthStepper: React.FC<MonthStepperProps> = ({
  total,
  onChange,
  colorClass = 'bg-morar-50 border-morar-200 text-morar-700',
  min = 0,
  max,
  unitLabel = 'mês',
  disabled = false,
  solto = false,
  tituloMaximo,
  tituloMinimo
}) => {
  const atMin = disabled || total <= min;
  const atMax = disabled || (max !== undefined && total >= max);

  // Estado de edição do valor central — o mesmo padrão de digitação livre +
  // confirmação no blur/Enter usado nos demais campos numéricos do app,
  // adaptado a um inteiro em vez de moeda.
  const [isEditing, setIsEditing] = useState(false);
  const [inputText, setInputText] = useState(String(total));

  useEffect(() => {
    if (!isEditing) setInputText(String(total));
  }, [total, isEditing]);

  const clamp = (valor: number): number => {
    let v = Math.max(min, Math.round(valor));
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  const handleFinishEdit = (rawText: string) => {
    setIsEditing(false);
    const parsed = parseInt(rawText, 10);
    // Digitação inválida ou vazia: volta para o valor vigente, sem disparar
    // recálculo nenhum.
    const novoTotal = isNaN(parsed) ? total : clamp(parsed);
    setInputText(String(novoTotal));
    if (novoTotal !== total) onChange(novoTotal);
  };

  return (
    <div className={solto ? `flex items-center gap-0.5 ${colorClass.replace(/\bbg-\S+|\bborder-\S+/g, '')}` : `flex items-center gap-1 border rounded-lg px-1 py-0.5 ${colorClass}`}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, total - 1))}
        disabled={atMin}
        className={`${solto ? 'w-6 h-7 rounded-lg border border-slate-200 shrink-0' : 'w-5 h-5 rounded border border-current/30'} flex items-center justify-center bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/5 cursor-pointer`}
        title={atMin && !disabled && tituloMinimo ? tituloMinimo : `Diminuir 1 ${unitLabel}`}
      >
        <Minus className={solto ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      </button>
      <span className={solto ? 'inline-flex items-center justify-center gap-0.5 min-w-[36px] text-center tabular-nums' : 'flex items-center justify-center w-9'}>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          disabled={disabled}
          value={isEditing ? inputText : total}
          onFocus={(e) => {
            setIsEditing(true);
            setInputText(String(total));
            e.target.select();
          }}
          onChange={(e) => setInputText(e.target.value)}
          onBlur={(e) => handleFinishEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleFinishEdit(inputText);
              (e.target as HTMLInputElement).blur();
            }
          }}
          title="Digitar a quantidade diretamente"
          style={solto ? { width: String(isEditing ? inputText : total).length + 'ch' } : undefined}
          className={`min-w-0 ${solto ? '' : 'flex-1 '}bg-transparent border-none p-0 text-[11px] font-extrabold text-center tabular-nums focus:outline-none disabled:cursor-not-allowed appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0`}
        />
        <span className="text-[11px] font-extrabold shrink-0">X</span>
      </span>
      <button
        type="button"
        onClick={() => onChange(max !== undefined ? Math.min(max, total + 1) : total + 1)}
        disabled={atMax}
        className={`${solto ? 'w-6 h-7 rounded-lg border border-slate-200 shrink-0' : 'w-5 h-5 rounded border border-current/30'} flex items-center justify-center bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/5 cursor-pointer`}
        title={atMax && !disabled && tituloMaximo ? tituloMaximo : `Aumentar 1 ${unitLabel}`}
      >
        <Plus className={solto ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      </button>
    </div>
  );
};
