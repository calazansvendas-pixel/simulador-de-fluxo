import React, { useState, useEffect } from 'react';
import { formatCurrency, parseCurrency, formatForEdit } from '../utils/formatters';
import { MonthStepper } from './MonthStepper';

interface PmCampoEditavelProps {
  label: string;
  value: number; // valor efetivo atual (override manual, ou sugestão automática)
  onCommit: (novoValor: number | null) => void; // null = limpa o override e volta pra sugestão
  tipo?: 'moeda' | 'inteiro';
  minimo?: number; // piso — só se aplica a campos do tipo "moeda"
  maximo?: number; // teto — só se aplica a campos do tipo "inteiro" (stepper)
  disabled?: boolean;
  onShowToast?: (msg: string) => void;
  colorClass?: string;
}

/**
 * Campo controlado, reutilizado nos 4 grupos editáveis da condição
 * "Parcelamento Morar" (mensal de obra, semestral, chaves e pós-obra): tipo
 * "inteiro" (quantidade de parcelas) renderiza o stepper `[ - X + ]` padrão
 * do app; tipo "moeda" continua um campo de texto, respeitando um piso —
 * abaixo dele o app restaura o valor sugerido, mesmo padrão já usado no Ato.
 */
export const PmCampoEditavel: React.FC<PmCampoEditavelProps> = ({
  label,
  value,
  onCommit,
  tipo = 'moeda',
  minimo = 0,
  maximo,
  disabled = false,
  onShowToast,
  colorClass = 'text-slate-900'
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    if (!isEditing) {
      setInputText(value > 0 ? formatCurrency(value) : '');
    }
  }, [value, isEditing]);

  const handleFinish = (raw: string) => {
    setIsEditing(false);
    if (raw.trim() === '') {
      onCommit(null);
      return;
    }
    const parsed = parseCurrency(raw);
    if (isNaN(parsed) || parsed <= 0) {
      onCommit(null);
      return;
    }
    if (parsed < minimo - 0.005) {
      onCommit(minimo);
      setInputText(formatCurrency(minimo));
      onShowToast?.(`O valor informado é inferior à parcela mínima configurada (${formatCurrency(minimo)}). Valor ajustado.`);
      return;
    }
    onCommit(Math.round(parsed * 100) / 100);
  };

  if (tipo === 'inteiro') {
    return (
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 whitespace-nowrap">
          {label}
        </label>
        <div className="flex items-center justify-center">
          <MonthStepper
            total={value}
            onChange={onCommit}
            max={maximo}
            disabled={disabled}
            colorClass={`bg-white border-slate-200 ${colorClass}`}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 whitespace-nowrap">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={isEditing ? inputText : (value > 0 ? formatCurrency(value) : '')}
          onFocus={(e) => {
            setIsEditing(true);
            setInputText(value > 0 ? formatForEdit(value) : '');
            e.target.select();
          }}
          onChange={(e) => setInputText(e.target.value)}
          onBlur={(e) => handleFinish(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleFinish(inputText);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="R$ 0,00"
          className={`w-full bg-white px-2 py-1.5 rounded-md border border-slate-200 font-bold ${colorClass} text-center focus:outline-none focus:border-morar-600 text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
        />
      </div>
    </div>
  );
};
