import React, { useEffect, useState } from 'react';
import { Lock, Unlock, Minus, Plus } from 'lucide-react';
import { formatCurrency, parseCurrency } from '../utils/formatters';
import { proximoValorComPasso } from './FluxoEntradaConstrutora';

/** Valores travados pelo corretor: índice da parcela (0-based) → valor. As demais são automáticas. */
export type ComissaoTravadas = Record<number, number>;

const r2 = (n: number) => Math.round(n * 100) / 100;
export const PASSO_COMISSAO = 100;

/**
 * Calcula as parcelas da comissão. Funciona sempre a partir de (total, qtd, travadas), então mudar a
 * quantidade ou o total recalcula sozinho respeitando o que ainda couber:
 * - travadas (índice < qtd) são aplicadas em ordem, limitadas ao saldo (nunca passam do total);
 * - o saldo é dividido igualmente entre as livres; os centavos ficam na última livre;
 * - nunca fica 100% travado: se ocorrer, a última parcela é liberada para fechar o total.
 */
export function calcularParcelasComissao(total: number, qtd: number, travadas: ComissaoTravadas) {
  const n = Math.max(1, Math.floor(qtd));
  const t = Math.max(0, total);
  const idxTrav = Object.keys(travadas).map(Number).filter(i => i >= 0 && i < n).sort((a, b) => a - b);
  if (idxTrav.length >= n) idxTrav.pop(); // sempre sobra uma livre
  const valores: number[] = new Array(n).fill(0);
  const locked: boolean[] = new Array(n).fill(false);
  let somaTrav = 0;
  for (const i of idxTrav) {
    const v = r2(Math.min(Math.max(0, travadas[i]), Math.max(0, t - somaTrav)));
    valores[i] = v; locked[i] = true; somaTrav = r2(somaTrav + v);
  }
  const livres = valores.map((_, i) => i).filter(i => !locked[i]);
  // Divide em centavos: o resto (no máximo 1 centavo por parcela) vai para as últimas livres, de modo que
  // a diferença entre quaisquer duas parcelas automáticas nunca passa de R$ 0,01.
  const saldoCent = Math.round((t - somaTrav) * 100);
  const baseCent = Math.floor(saldoCent / livres.length);
  const resto = saldoCent - baseCent * livres.length;
  livres.forEach((i, k) => {
    valores[i] = (baseCent + (k >= livres.length - resto ? 1 : 0)) / 100;
  });
  return { valores, locked };
}

/** Teto de uma parcela = total − soma das OUTRAS travadas. */
export function tetoParcelaComissao(total: number, qtd: number, travadas: ComissaoTravadas, idx: number) {
  const { valores, locked } = calcularParcelasComissao(total, qtd, travadas);
  const outras = valores.reduce((s, v, i) => (i !== idx && locked[i] ? s + v : s), 0);
  return Math.max(0, r2(total - outras));
}

/** Edita uma parcela: trava e limita ao teto. Se for a única livre, nada muda (ela já é o saldo). */
export function editarParcelaComissao(total: number, qtd: number, travadas: ComissaoTravadas, idx: number, novo: number): ComissaoTravadas {
  const { locked } = calcularParcelasComissao(total, qtd, travadas);
  const livres = locked.filter(l => !l).length;
  if (!locked[idx] && livres <= 1) return travadas;
  const v = r2(Math.min(Math.max(0, novo), tetoParcelaComissao(total, qtd, travadas, idx)));
  return { ...travadas, [idx]: v };
}

export function alternarTravaComissao(total: number, qtd: number, travadas: ComissaoTravadas, idx: number): ComissaoTravadas {
  const { valores, locked } = calcularParcelasComissao(total, qtd, travadas);
  if (locked[idx]) {
    const { [idx]: _, ...resto } = travadas;
    return resto;
  }
  if (locked.filter(l => !l).length <= 1) return travadas; // última livre não trava
  return { ...travadas, [idx]: valores[idx] };
}

/** Resumo compacto ou detalhado (para PDF/gravação): valores efetivos por parcela. */
export function parcelasComissaoDetalhe(total: number, qtd: number, travadas: ComissaoTravadas) {
  const { valores, locked } = calcularParcelasComissao(total, qtd, travadas);
  return valores.map((valor, i) => ({ numero: i + 1, valor, travada: locked[i] }));
}

/** Iguais = maior − menor ≤ R$ 0,01 (só a diferença natural de arredondamento). */
export function parcelasComissaoIguais(valores: number[]) {
  if (valores.length === 0) return true;
  return Math.round((Math.max(...valores) - Math.min(...valores)) * 100) <= 1;
}

interface LinhaProps {
  rotulo: string;
  valor: number;
  travada: boolean;
  podeTravar: boolean;
  onEditar: (v: number) => void;
  onTravar: () => void;
}

const LinhaParcela: React.FC<LinhaProps> = ({ rotulo, valor, travada, podeTravar, onEditar, onTravar }) => {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  useEffect(() => { if (!editando) setTexto(formatCurrency(valor)); }, [valor, editando]);
  const concluir = () => {
    setEditando(false);
    const p = parseCurrency(texto);
    if (!isNaN(p)) onEditar(p);
  };
  const btn = 'w-6 h-6 flex items-center justify-center rounded-md border border-fuchsia-200 bg-white text-fuchsia-700 hover:bg-fuchsia-50 cursor-pointer shrink-0';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-bold text-slate-600 w-20 shrink-0">{rotulo}</span>
      <div className="flex items-center gap-1 min-w-0">
        <button type="button" className={btn} aria-label={`Diminuir ${rotulo}`} onClick={() => onEditar(proximoValorComPasso(valor, PASSO_COMISSAO, -1))}>
          <Minus className="w-3 h-3" />
        </button>
        <input
          type="text"
          inputMode="decimal"
          value={texto}
          onFocus={e => { setEditando(true); setTexto(valor.toFixed(2).replace('.', ',')); e.target.select(); }}
          onChange={e => setTexto(e.target.value)}
          onBlur={concluir}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-28 min-w-0 text-center text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-md py-1 focus:outline-hidden focus:border-fuchsia-400"
        />
        <button type="button" className={btn} aria-label={`Aumentar ${rotulo}`} onClick={() => onEditar(proximoValorComPasso(valor, PASSO_COMISSAO, 1))}>
          <Plus className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={onTravar}
          disabled={!travada && !podeTravar}
          aria-pressed={travada}
          title={travada ? 'Destravar parcela' : podeTravar ? 'Travar este valor' : 'Última parcela livre: assume o saldo e não pode ser travada'}
          className={`w-6 h-6 flex items-center justify-center rounded-md shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${travada ? 'text-[#006B3F]' : 'text-slate-400 hover:text-slate-600'}`}
        >
          {travada ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};

interface ListaProps {
  total: number;
  qtd: number;
  travadas: ComissaoTravadas;
  onChange: (t: ComissaoTravadas) => void;
}

/** Lista de parcelas com valor editável, −/+ e cadeado por parcela. */
export const ComissaoParcelasLista: React.FC<ListaProps> = ({ total, qtd, travadas, onChange }) => {
  if (total <= 0) return null;
  const { valores, locked } = calcularParcelasComissao(total, qtd, travadas);
  const livres = locked.filter(l => !l).length;
  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
      {valores.map((v, i) => (
        <LinhaParcela
          key={i}
          rotulo={`${i + 1}ª Parcela`}
          valor={v}
          travada={locked[i]}
          podeTravar={livres > 1}
          onEditar={novo => onChange(editarParcelaComissao(total, qtd, travadas, i, novo))}
          onTravar={() => onChange(alternarTravaComissao(total, qtd, travadas, i))}
        />
      ))}
    </div>
  );
};
