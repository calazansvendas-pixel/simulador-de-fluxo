import React, { useState, useEffect } from 'react';
import { Building, Lock, Minus, Plus, RotateCcw, Sliders, Unlock, Wallet } from 'lucide-react';
import { formatCurrency, parseCurrency, formatForEdit } from '../utils/formatters';

// Passo padrão (R$) dos botões +/- de "Ato (Imóvel)" e "ITBI no Ato" quando a política não define outro.
export const STEP_AJUSTE_PADRAO = 100;

// Primeiro clique alinha ao múltiplo do passo (para cima no +, para baixo no -); se o valor já é
// múltiplo exato, soma/subtrai o passo. Trabalha em centavos para não acumular erro de ponto
// flutuante e nunca devolve menos que 0.
export function proximoValorComPasso(valor: number, passo: number, direcao: 1 | -1): number {
  const v = Math.round((Number.isFinite(valor) ? valor : 0) * 100);
  const s = Math.round((Number.isFinite(passo) && passo > 0 ? passo : STEP_AJUSTE_PADRAO) * 100); // sem teto máximo
  const resto = ((v % s) + s) % s;
  const proximo = resto === 0 ? v + direcao * s : (direcao > 0 ? v - resto + s : v - resto);
  return Math.max(0, proximo) / 100;
}

interface AjusteRapidoProps {
  children: React.ReactNode;
  onRestaurar: () => void;
  onMais: () => void;
  onMenos: () => void;
  tituloRestaurar: string;
  desabilitarMaisMenos?: boolean;
  restaurarAtivo?: boolean; // true: valor diferente do sugerido (↺ em destaque); false: já no sugerido (↺ discreto)
}

// Moldura do campo em UMA linha (altura compacta): [↺ restaurar sugerido] [campo] [+ / − empilhados].
const AjusteRapido: React.FC<AjusteRapidoProps> = ({ children, onRestaurar, onMais, onMenos, tituloRestaurar, restaurarAtivo, desabilitarMaisMenos }) => (
  <div className="flex items-center gap-1 mt-1.5 w-full min-w-0">
    <button
      type="button"
      onClick={onRestaurar}
      title={tituloRestaurar}
      aria-label={tituloRestaurar}
      disabled={restaurarAtivo === false}
      className={`p-0.5 shrink-0 rounded transition-colors ${
        restaurarAtivo === undefined
          ? 'text-slate-400 hover:text-emerald-700 cursor-pointer'
          : restaurarAtivo
            ? 'text-[#006B3F] bg-emerald-50 hover:bg-emerald-100 cursor-pointer'
            : 'text-slate-300 opacity-60 cursor-default'
      }`}
    >
      <RotateCcw size={11} />
    </button>
    {children}
    <div className="flex flex-col w-4 h-7 shrink-0 border border-slate-200 rounded overflow-hidden bg-white">
      <button
        type="button"
        onClick={onMais}
        disabled={desabilitarMaisMenos}
        title="Aumentar"
        aria-label="Aumentar"
        className="flex-1 flex items-center justify-center hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus size={9} />
      </button>
      <button
        type="button"
        onClick={onMenos}
        disabled={desabilitarMaisMenos}
        title="Diminuir"
        aria-label="Diminuir"
        className="flex-1 flex items-center justify-center border-t border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Minus size={9} />
      </button>
    </div>
  </div>
);

export interface FluxoEntradaConstrutoraProps {
  title?: string;
  onLimpar: () => void;
  policyAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };

  // Card 1: Ato (Imóvel)
  valorAto: number;
  valorAtoMinimo: number;
  valorAtoMaximo?: number;
  onAtoChange: (novoValor: number | null, porPasso?: boolean) => void; // porPasso = clique em − / +
  // Passo (R$) dos botões +/- do Ato (Imóvel) e do ITBI no Ato (Política de Crédito; padrão 100).
  stepAto?: number;
  stepItbi?: number;
  // Cadeado do Ato (Parcelamento Morar): travado = fora da redistribuição automática.
  travadoAto?: boolean;
  // true: com o Ato travado, +/− e a digitação ficam desabilitados (condições sem redistribuição por cadeados).
  atoTravadoBloqueiaEdicao?: boolean;
  atoNoSugerido?: boolean; // Ato já está no valor sugerido padrão (↺ fica discreto/desabilitado)
  onRestaurarAto?: () => void; // ↺ do Ato: restaura o valor sugerido padrão (padrão: onAtoChange(null))
  onToggleTravaAto?: () => void;
  onShowToast?: (msg: string) => void;
  // Alternância Parcelado / À Vista (opcional — só usada no fluxo Sinal c/ Morar,
  // onde existe Pró-Soluto parcelado a ser trazido inteiro para o Ato).
  isAVistaActive?: boolean;
  onToggleAVista?: (ativo: boolean) => void;

  // Card 2: ITBI no Ato (opcional — condições sem ITBI/registro, como o
  // Parcelamento Morar, escondem este card e usam grade de 2 colunas)
  hideITBI?: boolean;
  valAtoITBI?: number;
  valorTotalITBI?: number;
  isFirstHome?: boolean;
  onToggleFirstHome?: () => void;
  onITBIChange?: (novoValor: number) => void;

  // Card 3: Ato Premiado (Desconto Comercial)
  descontoAto: number;
  isAtoPremiadoActive: boolean;
  onToggleAtoPremiado: (ativo: boolean) => void;

  // Botão de cabeçalho "Pgtº à vista" (opcional — só usado no fluxo Sinal c/
  // Morar, onde existe uma política de Desconto à Vista configurável)
  isPagamentoAVistaActive?: boolean;
  onTogglePagamentoAVista?: (ativo: boolean) => void;

  // Conteúdo adicional (ex: linhas de mensais específicas)
  children?: React.ReactNode;
}

export const FluxoEntradaConstrutora: React.FC<FluxoEntradaConstrutoraProps> = ({
  title = '2. FLUXO DE ENTRADA C/ CONSTRUTORA',
  onLimpar,
  policyAction,
  valorAto,
  valorAtoMinimo,
  valorAtoMaximo = 0,
  onAtoChange,
  stepAto = STEP_AJUSTE_PADRAO,
  travadoAto = false,
  atoTravadoBloqueiaEdicao = false,
  atoNoSugerido,
  onRestaurarAto,
  onToggleTravaAto,
  stepItbi = STEP_AJUSTE_PADRAO,
  onShowToast,
  isAVistaActive = false,
  onToggleAVista,
  hideITBI = false,
  valAtoITBI = 0,
  valorTotalITBI = 0,
  isFirstHome = true,
  onToggleFirstHome,
  onITBIChange,
  descontoAto,
  isAtoPremiadoActive,
  onToggleAtoPremiado,
  isPagamentoAVistaActive = false,
  onTogglePagamentoAVista,
  children
}) => {
  // Estado de edição do Ato (Imóvel)
  const [isEditingAto, setIsEditingAto] = useState<boolean>(false);
  const [atoInputText, setAtoInputText] = useState<string>('');

  // Estado de edição do ITBI no Ato
  const [isEditingITBI, setIsEditingITBI] = useState<boolean>(false);
  const [itbiInputText, setItbiInputText] = useState<string>('');

  // Sincroniza o texto do input quando valorAto mudar externamente (e não estiver editando)
  useEffect(() => {
    if (!isEditingAto) {
      setAtoInputText(valorAto > 0 ? formatCurrency(valorAto) : '');
    }
  }, [valorAto, isEditingAto]);

  // Sincroniza o texto do input quando valAtoITBI mudar externamente
  useEffect(() => {
    if (!isEditingITBI) {
      setItbiInputText(valAtoITBI > 0 ? formatCurrency(valAtoITBI) : '');
    }
  }, [valAtoITBI, isEditingITBI]);

  // Função auxiliar para parsing tolerante
  const parseFlexible = (raw: string): number => {
    if (!raw || raw.trim() === '') return 0;
    const parsed = parseCurrency(raw);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Finalização da edição do Ato (Imóvel) com validação de piso e teto
  const handleFinishAtoEdit = (rawText: string) => {
    setIsEditingAto(false);
    const parsed = parseFlexible(rawText);

    // Se o usuário apagou tudo ou deixou 0
    if (rawText.trim() === '' || parsed === 0) {
      // Se há um piso obrigatório sugerido, restabelece o piso
      if (valorAtoMinimo > 0) {
        onAtoChange(null);
        setAtoInputText(formatCurrency(valorAtoMinimo));
        if (onShowToast) {
          onShowToast(`Ato (Imóvel) ajustado para o piso sugerido de ${formatCurrency(valorAtoMinimo)}.`);
        }
      } else {
        onAtoChange(null);
        setAtoInputText('');
      }
      return;
    }

    // Validação obrigatória: não permite valor inferior ao mínimo estipulado na política
    if (valorAtoMinimo > 0 && parsed < valorAtoMinimo - 0.01) {
      onAtoChange(valorAtoMinimo);
      setAtoInputText(formatCurrency(valorAtoMinimo));
      if (onShowToast) {
        onShowToast(`O valor informado (${formatCurrency(parsed)}) é inferior ao piso mínimo (${formatCurrency(valorAtoMinimo)}). Valor ajustado.`);
      }
      return;
    }

    // Validação de teto máximo permitido (se aplicável)
    if (valorAtoMaximo > 0 && parsed > valorAtoMaximo + 0.01) {
      onAtoChange(valorAtoMaximo);
      setAtoInputText(formatCurrency(valorAtoMaximo));
      if (onShowToast) {
        onShowToast(`O valor informado excede o saldo total. O Ato foi ajustado para ${formatCurrency(valorAtoMaximo)}.`);
      }
      return;
    }

    // Valor válido aceito
    onAtoChange(parsed);
    setAtoInputText(formatCurrency(parsed));
  };

  // Finalização da edição do ITBI no Ato
  const handleFinishITBIEdit = (rawText: string) => {
    setIsEditingITBI(false);
    const parsed = parseFlexible(rawText);

    if (rawText.trim() === '' || parsed <= 0) {
      onITBIChange?.(0);
      setItbiInputText('');
      return;
    }

    if (valorTotalITBI > 0 && parsed > valorTotalITBI + 0.01) {
      onITBIChange?.(valorTotalITBI);
      setItbiInputText(formatCurrency(valorTotalITBI));
      if (onShowToast) {
        onShowToast(`O pagamento de ITBI no Ato não pode exceder o total de ${formatCurrency(valorTotalITBI)}.`);
      }
      return;
    }

    onITBIChange?.(parsed);
    setItbiInputText(formatCurrency(parsed));
  };

  // Ajuste rápido (+/-) do Ato (Imóvel): respeita piso (mínimo da política) e teto, e reaproveita o
  // mesmo onAtoChange da digitação manual — então o fluxo, o saldo e o sinal líquido recalculam igual.
  const atoCongelado = travadoAto && atoTravadoBloqueiaEdicao;
  const ajustarAto = (direcao: 1 | -1) => {
    if (atoCongelado) return;
    if (stepAto <= 0) { onShowToast?.('O passo do Ato (Imóvel) está em R$ 0,00 nas Políticas — ajuste lá para usar os botões + e −.'); return; }
    let novo = proximoValorComPasso(valorAto, stepAto, direcao);
    if (valorAtoMinimo > 0 && novo < valorAtoMinimo) novo = valorAtoMinimo;
    if (valorAtoMaximo > 0 && novo > valorAtoMaximo) novo = valorAtoMaximo;
    novo = Math.round(novo * 100) / 100;
    setIsEditingAto(false);
    if (Math.abs(novo - valorAto) < 0.005) return;
    // O campo exibe o valor que o pai realmente aplicar (ex.: encostado no limite quebrado) via useEffect.
    onAtoChange(novo, true);
  };

  // Idem para o ITBI no Ato (0 = sem piso manual; teto = ITBI total).
  const ajustarITBI = (direcao: 1 | -1) => {
    if (stepItbi <= 0) { onShowToast?.('O passo do ITBI no Ato está em R$ 0,00 nas Políticas — ajuste lá para usar os botões + e −.'); return; }
    let novo = proximoValorComPasso(valAtoITBI, stepItbi, direcao);
    if (valorTotalITBI > 0 && novo > valorTotalITBI) novo = valorTotalITBI;
    novo = Math.round(novo * 100) / 100;
    setIsEditingITBI(false);
    if (Math.abs(novo - valAtoITBI) < 0.005) return;
    onITBIChange?.(novo);
    setItbiInputText(novo > 0 ? formatCurrency(novo) : '');
  };

  return (
    <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3.5">
      {/* CABEÇALHO PADRONIZADO */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-morar-50 text-morar-600">
            <Building className="w-4 h-4" />
          </div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            {title}
          </h3>
        </div>

        {/* BOTÕES DE AÇÃO: PGTº À VISTA + POLÍTICA + LIMPAR */}
        <div className="flex items-center gap-1.5">
          {onTogglePagamentoAVista && (
            <button
              type="button"
              onClick={() => onTogglePagamentoAVista(!isPagamentoAVistaActive)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                isPagamentoAVistaActive
                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200/80'
              }`}
              title={isPagamentoAVistaActive ? 'Desativar o pagamento à vista e voltar ao fluxo parcelado' : 'Aplicar o desconto à vista da política, zerar o ITBI e quitar o Pró-Soluto no Ato'}
            >
              <Wallet className="w-3 h-3" />
              <span>{isPagamentoAVistaActive ? 'À Vista Ativo' : 'Pgtº à vista'}</span>
            </button>
          )}

          {policyAction && (
            <button
              type="button"
              onClick={policyAction.onClick}
              className="px-2.5 py-1 bg-morar-50 hover:bg-morar-100 text-morar-700 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer border border-morar-200/80"
              title={policyAction.label}
            >
              {policyAction.icon || <Sliders className="w-3 h-3 text-morar-600" />}
              <span>{policyAction.label}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onLimpar}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer border border-slate-200/80"
            title="Redefinir Fluxo de Entrada"
          >
            <RotateCcw className="w-3 h-3 text-slate-500" />
            <span>Limpar</span>
          </button>
        </div>
      </div>

      {/* GRADE DOS CARDS PADRONIZADOS (3, OU 2 QUANDO O ITBI NÃO SE APLICA) */}
      <div className="space-y-2.5 text-xs">
        <div className={`grid grid-cols-1 ${hideITBI ? 'sm:grid-cols-[minmax(0,1.12fr)_minmax(0,0.76fr)]' : 'sm:grid-cols-[minmax(0,1.15fr)_minmax(0,0.98fr)_minmax(0,0.87fr)]'} gap-2 w-full max-w-full`}>
          {/* CARD 1: ATO (IMÓVEL) */}
          <div className="bg-slate-50 px-2 py-2 rounded-lg border border-slate-200/80 flex flex-col justify-between min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-1 min-w-0 mb-1">
              <label className="block text-[10px] font-bold tracking-tight text-slate-600 uppercase truncate">
                Ato (Imóvel)
              </label>
              {onToggleTravaAto && (
                <button
                  type="button"
                  onClick={onToggleTravaAto}
                  aria-pressed={travadoAto}
                  title={travadoAto ? 'Destravar valor do Ato (Imóvel)' : 'Travar valor do Ato (Imóvel)'}
                  className={`ml-auto mr-1 w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer ${travadoAto ? 'text-[#006B3F]' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {travadoAto ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>
              )}
              {onToggleAVista && (
                <button
                  type="button"
                  onClick={() => onToggleAVista(!isAVistaActive)}
                  className={`text-[9px] font-bold px-1.5 py-0.5 shrink-0 rounded border transition-colors cursor-pointer ${
                    isAVistaActive
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                  title={isAVistaActive ? 'Voltar para o fluxo parcelado' : 'Quitar o Pró-Soluto à vista, trazendo o saldo para o Ato (Imóvel)'}
                >
                  {isAVistaActive ? 'À Vista' : 'Parcelado'}
                </button>
              )}
            </div>
            <AjusteRapido
              onRestaurar={() => { setIsEditingAto(false); if (onRestaurarAto) onRestaurarAto(); else onAtoChange(null); }}
              onMais={() => ajustarAto(1)}
              onMenos={() => ajustarAto(-1)}
              desabilitarMaisMenos={atoCongelado}
              tituloRestaurar={atoNoSugerido ? 'O Ato já está no valor sugerido' : 'Restaurar Ato para o valor sugerido'}
              restaurarAtivo={atoNoSugerido === undefined ? undefined : !atoNoSugerido}
            >
              <input
                id="input-fluxo-ato-imovel"
                type="text"
                value={isEditingAto ? atoInputText : (valorAto > 0 ? formatCurrency(valorAto) : '')}
                onFocus={(e) => {
                  setIsEditingAto(true);
                  setAtoInputText(valorAto > 0 ? formatForEdit(valorAto) : '');
                  e.target.select();
                }}
                onChange={(e) => setAtoInputText(e.target.value)}
                readOnly={atoCongelado}
                onBlur={(e) => { if (!atoCongelado) handleFinishAtoEdit(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleFinishAtoEdit(atoInputText);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder={valorAtoMinimo > 0 ? formatCurrency(valorAtoMinimo) : 'R$ 0,00'}
                className="w-full min-w-0 flex-1 h-7 px-1 bg-white rounded-md border border-slate-200 text-center text-[11px] font-bold text-slate-800 focus:outline-none focus:border-morar-600 transition-all whitespace-nowrap"
              />
            </AjusteRapido>
          </div>

          {/* CARD 2: ITBI NO ATO (oculto quando esta condição não usa ITBI/registro) */}
          {!hideITBI && (
            <div className="bg-slate-50 px-2 py-2 rounded-lg border border-slate-200/80 flex flex-col justify-between min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-1 min-w-0 mb-1">
                <label className="block text-[10px] font-bold tracking-tight text-morar-800 uppercase truncate">
                  ITBI no Ato
                </label>
                <button
                  type="button"
                  onClick={onToggleFirstHome}
                  className={`text-[9px] font-bold px-1.5 py-0.5 shrink-0 rounded border transition-colors cursor-pointer ${
                    isFirstHome
                      ? 'bg-morar-50 text-morar-700 border-morar-100 hover:bg-morar-100'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                  title="Alternar entre Com Desconto e Sem Desconto no ITBI"
                >
                  {isFirstHome ? 'Com Desc.' : 'Sem Desc.'}
                </button>
              </div>
              <AjusteRapido
                onRestaurar={() => { setIsEditingITBI(false); onITBIChange?.(0); }}
                onMais={() => ajustarITBI(1)}
                onMenos={() => ajustarITBI(-1)}
                tituloRestaurar="Restaurar o ITBI sugerido pelo sistema"
              >
                <input
                  id="input-fluxo-itbi-ato"
                  type="text"
                  value={isEditingITBI ? itbiInputText : (valAtoITBI > 0 ? formatCurrency(valAtoITBI) : '')}
                  onFocus={(e) => {
                    setIsEditingITBI(true);
                    setItbiInputText(valAtoITBI > 0 ? formatForEdit(valAtoITBI) : '');
                    e.target.select();
                  }}
                  onChange={(e) => setItbiInputText(e.target.value)}
                  onBlur={(e) => handleFinishITBIEdit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleFinishITBIEdit(itbiInputText);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="R$ 0,00"
                  className="w-full min-w-0 flex-1 h-7 px-1 bg-white rounded-md border border-slate-200 text-center text-[11px] font-bold text-morar-900 focus:outline-none focus:border-morar-600 transition-all whitespace-nowrap"
                />
              </AjusteRapido>
            </div>
          )}

          {/* CARD 3: ATO PREMIADO (DESTAQUE EM AMARELO SUAVE) */}
          <div className="bg-amber-50/50 px-2 py-2 rounded-lg border border-amber-200/80 flex flex-col justify-start min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-1 min-w-0 mb-1">
              <label className="block text-[10px] font-bold tracking-tight text-amber-800 uppercase whitespace-nowrap">
                Ato Premiado
              </label>
              <button
                type="button"
                disabled={isPagamentoAVistaActive}
                onClick={() => onToggleAtoPremiado(!isAtoPremiadoActive)}
                className={`text-[9px] font-bold px-1.5 py-0.5 shrink-0 rounded transition-colors ${
                  isPagamentoAVistaActive
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : isAtoPremiadoActive
                      ? 'bg-amber-200 text-amber-900 hover:bg-amber-300 cursor-pointer'
                      : 'bg-slate-200 text-slate-600 hover:bg-slate-300 cursor-pointer'
                }`}
                title={isPagamentoAVistaActive ? 'Indisponível durante o Pgtº à vista' : (isAtoPremiadoActive ? 'Zerar o Desconto do Ato Premiado' : 'Aplicar o Desconto do Ato Premiado')}
              >
                {isAtoPremiadoActive ? 'Zerar' : 'Aplicar'}
              </button>
            </div>
            <div className="flex items-center justify-center h-7 mt-1.5">
              <span className="font-bold text-amber-800 text-xs whitespace-nowrap">
                {isAtoPremiadoActive && descontoAto > 0 ? formatCurrency(descontoAto) : 'R$ 0,00'}
              </span>
            </div>
          </div>
        </div>

        {/* LINHAS COMPLEMENTARES OPCIONAIS (EX: MENSAIS 30D / 60D) */}
        {children}
      </div>
    </div>
  );
};
