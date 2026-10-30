import React, { useState, useEffect } from 'react';
import { Building, RotateCcw, Sliders, Wallet } from 'lucide-react';
import { formatCurrency, parseCurrency, formatForEdit } from '../utils/formatters';

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
  onAtoChange: (novoValor: number | null) => void;
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
        <div className={`grid grid-cols-1 ${hideITBI ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-2.5`}>
          {/* CARD 1: ATO (IMÓVEL) */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold text-slate-600 uppercase whitespace-nowrap">
                Ato (Imóvel)
              </label>
              {onToggleAVista && (
                <button
                  type="button"
                  onClick={() => onToggleAVista(!isAVistaActive)}
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
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
              onBlur={(e) => handleFinishAtoEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFinishAtoEdit(atoInputText);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder={valorAtoMinimo > 0 ? formatCurrency(valorAtoMinimo) : 'R$ 0,00'}
              className="w-full bg-white px-2 py-1 rounded-md border border-slate-200 font-bold text-slate-800 text-center focus:outline-none focus:border-morar-600 text-xs transition-all whitespace-nowrap"
            />
          </div>

          {/* CARD 2: ITBI NO ATO (oculto quando esta condição não usa ITBI/registro) */}
          {!hideITBI && (
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-bold text-morar-800 uppercase whitespace-nowrap">
                  ITBI no Ato
                </label>
                <button
                  type="button"
                  onClick={onToggleFirstHome}
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                    isFirstHome
                      ? 'bg-morar-50 text-morar-700 border-morar-100 hover:bg-morar-100'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                  title="Alternar entre Com Desconto e Sem Desconto no ITBI"
                >
                  {isFirstHome ? 'Com Desc.' : 'Sem Desc.'}
                </button>
              </div>
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
                className="w-full bg-white px-2 py-1 rounded-md border border-slate-200 font-bold text-morar-900 text-center focus:outline-none focus:border-morar-600 text-xs transition-all whitespace-nowrap"
              />
            </div>
          )}

          {/* CARD 3: ATO PREMIADO (DESTAQUE EM AMARELO SUAVE) */}
          <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold text-amber-800 uppercase whitespace-nowrap">
                Ato Premiado
              </label>
              <button
                type="button"
                disabled={isPagamentoAVistaActive}
                onClick={() => onToggleAtoPremiado(!isAtoPremiadoActive)}
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${
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
            <div className="mt-auto pt-1 text-center">
              <span className="font-extrabold text-amber-800 text-xs whitespace-nowrap">
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
