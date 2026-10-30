import React, { useMemo, useState } from 'react';
import { 
  UserCheck, 
  Wallet, 
  Building, 
  Edit3, 
  ChevronRight, 
  KeyRound,
  Coins,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import { ActiveTab, Product, SimulationData } from '../types';
import { formatCurrency, formatDeliveryText, parseCurrency, formatForEdit } from '../utils/formatters';
import { ensureProductConditions, getConditionKind } from '../utils/calculations';
import { CONDICOES_APP } from '../config/telasApp';

interface SimulatorViewProps {
  simulationData: SimulationData;
  onSimulationDataChange: (data: SimulationData) => void;
  products: Product[];
  selectedConditions: Record<string, string>;
  onSelectCondition: (productId: string, conditionId: string) => void;
  onAdvanceToDetails: (product: Product, conditionId: string, targetTab?: ActiveTab) => void;
  onNavigateToPolicies: () => void;
  onResetAll?: () => void;
  // Chaves de CONDICOES_APP liberadas para o usuário logado — controla, à
  // parte do menu lateral, o que aparece no dropdown "Selecionar Condição"
  // abaixo (ver types.ts). undefined = sem restrição (Administrador).
  condicoesLiberadas?: string[];
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({
  simulationData,
  onSimulationDataChange,
  products = [],
  selectedConditions = {},
  onSelectCondition,
  onAdvanceToDetails,
  onNavigateToPolicies,
  onResetAll,
  condicoesLiberadas
}) => {
  // Fallback seguro caso simulationData venha undefined
  const safeSimulationData: SimulationData = simulationData || {
    clientName: '',
    agency: '',
    income: null,
    subsidy: null,
    fgts: null,
    financing: null,
    finPercent: 0.8,
    isFirstHome: true
  };

  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldTexts, setFieldTexts] = useState<Record<string, string>>({});
  // Empreendimento selecionado no dropdown único do Bloco 3 — substitui a
  // lista com um card por empreendimento por uma escolha única, que revela
  // a condição comercial (e o "Avançar") apenas do empreendimento escolhido.
  const [selectedProdId, setSelectedProdId] = useState<string>('');

  const handleFieldFocus = (field: keyof SimulationData, e: React.FocusEvent<HTMLInputElement>) => {
    setEditingField(field);
    const currentVal = safeSimulationData[field];
    const initialText = (currentVal !== null && currentVal !== undefined && !isNaN(Number(currentVal)))
      ? formatForEdit(Number(currentVal))
      : '';
    setFieldTexts(prev => ({ ...prev, [field]: initialText }));
    e.target.select();
  };

  const handleFieldChange = (field: keyof SimulationData, text: string) => {
    setFieldTexts(prev => ({ ...prev, [field]: text }));
    if (!text || text.trim() === '') {
      onSimulationDataChange({
        ...safeSimulationData,
        [field]: null
      });
      return;
    }
    const parsed = parseCurrency(text);
    onSimulationDataChange({
      ...safeSimulationData,
      [field]: parsed >= 0 ? parsed : null
    });
  };

  const handleFieldBlur = (field: keyof SimulationData) => {
    setEditingField(null);
    const text = fieldTexts[field];
    if (text !== undefined) {
      if (!text || text.trim() === '') {
        onSimulationDataChange({
          ...safeSimulationData,
          [field]: null
        });
      } else {
        const parsed = parseCurrency(text);
        onSimulationDataChange({
          ...safeSimulationData,
          [field]: parsed >= 0 ? parsed : null
        });
      }
    }
  };

  const getFieldDisplayValue = (field: 'income' | 'subsidy' | 'fgts' | 'financing'): string => {
    if (editingField === field) {
      return fieldTexts[field] ?? '';
    }
    const val = safeSimulationData[field];
    if (val === null || val === undefined || isNaN(Number(val)) || Number(val) <= 0) {
      return '';
    }
    return formatCurrency(Number(val));
  };

  const totalRecursosAprovados = (safeSimulationData.financing || 0) + 
    (safeSimulationData.subsidy || 0) + 
    (safeSimulationData.fgts || 0);

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* COLUNA ESQUERDA: DADOS DO CLIENTE E RECURSOS (7 COLS) */}
          <div className="lg:col-span-7 space-y-5 w-full">
            
            {/* 1. IDENTIFICAÇÃO GERAL */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-morar-50 text-morar-600">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                    1. Identificação Geral
                  </h2>
                </div>
                {onResetAll && (
                  <button
                    type="button"
                    onClick={onResetAll}
                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                    title="Limpar formulário"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Limpar</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Imobiliária Parcial / Parceira
                  </label>
                  <input
                    type="text"
                    value={safeSimulationData.agency || ''}
                    onChange={(e) => onSimulationDataChange({ ...safeSimulationData, agency: e.target.value })}
                    placeholder="Nome da imobiliária (opcional)"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-morar-600 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nome do Cliente *
                  </label>
                  <input
                    type="text"
                    value={safeSimulationData.clientName || ''}
                    onChange={(e) => onSimulationDataChange({ ...safeSimulationData, clientName: e.target.value })}
                    placeholder="Digite o nome do cliente"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-morar-600 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* 2. RECURSOS E CAPACIDADE FINANCEIRA */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-morar-50 text-morar-600">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                    2. Recursos e Capacidade Financeira
                  </h2>
                </div>
                {totalRecursosAprovados > 0 && (
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Total Aprovado Estimado
                    </span>
                    <strong className="text-xs font-extrabold text-morar-700">
                      {formatCurrency(totalRecursosAprovados || 0)}
                    </strong>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Renda Familiar Comprovada (R$)
                  </label>
                  <input
                    type="text"
                    value={getFieldDisplayValue('income')}
                    onFocus={(e) => handleFieldFocus('income', e)}
                    onChange={(e) => handleFieldChange('income', e.target.value)}
                    onBlur={() => handleFieldBlur('income')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="R$ 0,00"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-morar-600 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Subsídio Concedido (R$)
                  </label>
                  <input
                    type="text"
                    value={getFieldDisplayValue('subsidy')}
                    onFocus={(e) => handleFieldFocus('subsidy', e)}
                    onChange={(e) => handleFieldChange('subsidy', e.target.value)}
                    onBlur={() => handleFieldBlur('subsidy')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="R$ 0,00"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-600 focus:bg-white focus:outline-none focus:border-morar-600 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Saldo do FGTS Utilizável (R$)
                  </label>
                  <input
                    type="text"
                    value={getFieldDisplayValue('fgts')}
                    onFocus={(e) => handleFieldFocus('fgts', e)}
                    onChange={(e) => handleFieldChange('fgts', e.target.value)}
                    onBlur={() => handleFieldBlur('fgts')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="R$ 0,00"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-morar-600 focus:bg-white focus:outline-none focus:border-morar-600 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Valor de Financiamento Estimado (R$)
                  </label>
                  <input
                    type="text"
                    value={getFieldDisplayValue('financing')}
                    onFocus={(e) => handleFieldFocus('financing', e)}
                    onChange={(e) => handleFieldChange('financing', e.target.value)}
                    onBlur={() => handleFieldBlur('financing')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="R$ 0,00"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-morar-600 transition-all"
                  />
                </div>
              </div>

              {/* OPERAÇÃO E OPÇÕES */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                  <span className="block text-xs font-semibold text-slate-700 mb-2">
                    Percentual de Financiamento
                  </span>
                  <div className="flex items-center gap-4 text-xs font-medium text-slate-700">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="finPercent"
                        value="90"
                        checked={safeSimulationData.finPercent === 0.9}
                        onChange={() => onSimulationDataChange({ ...safeSimulationData, finPercent: 0.9 })}
                        className="text-morar-600 focus:ring-morar-600 cursor-pointer"
                      />
                      <span>90% (Máximo)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="finPercent"
                        value="80"
                        checked={safeSimulationData.finPercent === 0.8}
                        onChange={() => onSimulationDataChange({ ...safeSimulationData, finPercent: 0.8 })}
                        className="text-morar-600 focus:ring-morar-600 cursor-pointer"
                      />
                      <span>80% (Padrão)</span>
                    </label>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                  <span className="block text-xs font-semibold text-slate-700 mb-2">
                    1º Imóvel do Cliente?
                  </span>
                  <div className="flex items-center gap-4 text-xs font-medium text-slate-700">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="firstHome"
                        value="SIM"
                        checked={safeSimulationData.isFirstHome !== false}
                        onChange={() => onSimulationDataChange({ ...safeSimulationData, isFirstHome: true })}
                        className="text-morar-600 focus:ring-morar-600 cursor-pointer"
                      />
                      <span>SIM</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="firstHome"
                        value="NAO"
                        checked={safeSimulationData.isFirstHome === false}
                        onChange={() => onSimulationDataChange({ ...safeSimulationData, isFirstHome: false })}
                        className="text-morar-600 focus:ring-morar-600 cursor-pointer"
                      />
                      <span>NÃO</span>
                    </label>
                  </div>
                </div>
              </div>

            </div>

          </div>

          {/* COLUNA DIREITA: EMPREENDIMENTOS E CONDIÇÕES COMERCIAIS (5 COLS) */}
          <div className="lg:col-span-5 w-full">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs w-full space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-morar-50 text-morar-600">
                    <Building className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                    3. Empreendimentos
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onNavigateToPolicies}
                  className="text-[11px] font-semibold text-morar-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" /> Editar Políticas
                </button>
              </div>

              {/* DROPDOWN ÚNICO DE EMPREENDIMENTO — substitui a lista com um
                  card por empreendimento: escolhe-se o empreendimento aqui,
                  e só então aparece o card com sua condição comercial e o
                  "Avançar". */}
              <div>
                <select
                  value={selectedProdId}
                  onChange={(e) => setSelectedProdId(e.target.value)}
                  className="w-full py-2.5 px-3 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-morar-600 cursor-pointer font-semibold shadow-2xs"
                >
                  <option value="">-- Selecionar Empreendimento --</option>
                  {(products || []).filter(Boolean).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || 'Empreendimento'}
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const p = (products || []).find(prod => prod && prod.id === selectedProdId);
                if (!p) {
                  return (
                    <p className="text-xs text-slate-400 font-medium text-center py-2">
                      Selecione um empreendimento acima para ver as condições comerciais disponíveis.
                    </p>
                  );
                }

                const prodWithConds = ensureProductConditions({ ...p });
                const selectedCondValue = (selectedConditions || {})[p.id] || '';

                // Opções do dropdown: cada condição comercial real do produto
                // (ensureProductConditions) cruzada com as entradas de
                // CONDICOES_APP liberadas para o usuário logado cujo `variant`
                // bate com o kind daquela condição (getConditionKind) — uma
                // mesma condição pode gerar duas opções (ex.: "Sinal c/ Morar"
                // e "Sinal c/ Morar**"), cada uma levando a um `targetTab`
                // diferente. O valor do <option> combina id da condição real +
                // chave do item (separados por "__") para decodificar os dois
                // de volta no onClick de "Avançar", sem precisar de um estado à parte.
                const condicoesPermitidas = CONDICOES_APP.filter(
                  item => !condicoesLiberadas || condicoesLiberadas.includes(item.key)
                );
                const opcoesCondicao = condicoesPermitidas.flatMap(item =>
                  prodWithConds.conditions
                    .filter(c => getConditionKind(c.name) === item.variant)
                    .map(c => ({
                      value: `${c.id}__${item.key}`,
                      label: item.tab === 'ficha-morar-simplificada' ? item.label : c.name,
                      condicaoId: c.id,
                      targetTab: item.tab
                    }))
                );
                const opcaoSelecionada = opcoesCondicao.find(o => o.value === selectedCondValue);

                const borderBg = p.isFeatured ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white';
                const badgeDot = p.isFeatured ? 'bg-amber-500' : 'bg-morar-600';
                const titleClass = p.isFeatured ? 'text-amber-900' : 'text-slate-900';

                const deliveryText = formatDeliveryText(p.deliveryDatePhase1, p.deliveryDatePhase2, p.deliveryDate);

                return (
                  <div
                    key={p.id}
                    className={`p-4 rounded-xl border ${borderBg} shadow-2xs w-full space-y-3`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className={`text-sm font-bold ${titleClass} uppercase flex items-center gap-1.5`}>
                        <span className={`w-2 h-2 rounded-full ${badgeDot}`}></span> {p.name || 'Empreendimento'}
                      </span>
                      {deliveryText && (
                        <span className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                          <KeyRound className="w-3.5 h-3.5 text-morar-600 shrink-0" /> Chaves: {deliveryText}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2 w-full">
                      <select
                        value={selectedCondValue}
                        onChange={(e) => onSelectCondition(p.id, e.target.value)}
                        className="flex-1 min-w-0 py-2 px-3 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-morar-600 cursor-pointer font-medium shadow-2xs"
                      >
                        <option value="">-- Selecionar Condição --</option>
                        {opcoesCondicao.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={!opcaoSelecionada}
                        onClick={() => opcaoSelecionada && onAdvanceToDetails(prodWithConds, opcaoSelecionada.condicaoId, opcaoSelecionada.targetTab)}
                        className={`shrink-0 px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 border ${
                          opcaoSelecionada
                            ? 'bg-morar-600 hover:bg-morar-700 text-white border-morar-600 cursor-pointer shadow-md'
                            : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <span>Avançar</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

        </div>
      </form>
    </div>
  );
};
