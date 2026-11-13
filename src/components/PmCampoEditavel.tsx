import React, { useState, useEffect } from 'react';
import { Plus, Minus, Lock, Unlock } from 'lucide-react';
import { proximoValorComPasso } from './FluxoEntradaConstrutora';
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
  passo?: number; // > 0: mostra os botões − / + (tipo "moeda") com esse incremento
  travado?: boolean; // cadeado fechado: o bloco não entra na redistribuição automática
  onToggleTrava?: () => void; // quando informado, mostra o cadeado ao lado do campo
  alerta?: boolean; // valor acima do limite da política: destaca em vermelho (não trava o cálculo)
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
  colorClass = 'text-slate-900',
  passo = 0,
  travado = false,
  onToggleTrava,
  alerta = false
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

  // −/+ : respeita o piso (valores abaixo dele voltam ao piso) e nunca trava o teto — o alerta vermelho avisa.
  const ajustar = (direcao: 1 | -1) => {
    setIsEditing(false);
    const novo = Math.max(0, Math.round(proximoValorComPasso(value, passo, direcao) * 100) / 100);
    if (direcao < 0 && novo < minimo - 0.005) {
      onShowToast?.(`O valor mínimo configurado é ${formatCurrency(minimo)}.`);
      onCommit(Math.max(minimo, 0) > 0 ? minimo : null);
      return;
    }
    onCommit(novo);
  };
  const botao = `w-6 h-6 flex items-center justify-center rounded-md border shrink-0 cursor-pointer disabled:opacity-50 ${alerta ? 'border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`;

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
      <label className="block text-center text-[10px] font-bold text-slate-500 uppercase mb-1 whitespace-nowrap">
        {label}
      </label>
      <div className="relative flex items-center gap-1">
        {passo > 0 && (
          <button type="button" disabled={disabled} aria-label={`Diminuir ${label}`} onClick={() => ajustar(-1)} className={botao}>
            <Minus className="w-3 h-3" />
          </button>
        )}
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
          className={`w-full min-w-0 px-2 py-1.5 rounded-md border font-bold text-center focus:outline-none text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed ${alerta ? 'bg-rose-50 border-rose-300 text-rose-700 focus:border-rose-500' : `bg-white border-slate-200 ${colorClass} focus:border-morar-600`}`}
        />
        {passo > 0 && (
          <button type="button" disabled={disabled} aria-label={`Aumentar ${label}`} onClick={() => ajustar(1)} className={botao}>
            <Plus className="w-3 h-3" />
          </button>
        )}
        {onToggleTrava && (
          <button
            type="button"
            onClick={onToggleTrava}
            aria-pressed={travado}
            title={travado ? 'Destravar: este valor volta a participar da redistribuição' : 'Travar este valor'}
            className={`w-6 h-6 flex items-center justify-center rounded-md shrink-0 cursor-pointer ${travado ? 'text-[#006B3F]' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {travado ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
};
