import React, { useEffect, useState } from 'react';
import { Pencil, RotateCcw } from 'lucide-react';
import { ActiveTab, CommercialCondition, PdfExportSettings, Product, SimulationData, TelaVisibilitySettings } from '../types';
import { formatCurrency, formatForEdit, parseCurrency } from '../utils/formatters';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Bar, LabelList } from 'recharts';
import { MorarBarDatum, MorarFaixa, MorarPieDatum } from './PdfExportModalMorar';
import { MonthStepper } from './MonthStepper';
import { FichaMorarTopBar } from './FichaMorarTopBar';
import { FichaMorarActionBar } from './FichaMorarActionBar';
import { FichaMorarProdutoGrid } from './FichaMorarProdutoGrid';

// Visão simplificada da Ficha Morar (tela "Sinal c/ Morar**" no menu lateral
// — ver config/telasApp.ts e App.tsx). Mesmo "papel" (visual de folha A4) e
// os mesmos dados já calculados pelo motor em FichaMorar.tsx — só uma
// apresentação mais guiada, com um subconjunto restrito de campos tornados
// interativos (Torre/Unidade, Ato Premiado, Ato e as parcelas de
// Obra/Pós-Obra). Nenhuma conta é refeita aqui: cada affordance chama de
// volta os mesmos handlers já usados pelo editor completo.
interface NovatoSimuladorViewProps {
  // O que este cargo pode ver no PDF exportado (Configurar Exportação de
  // PDF) — usado aqui só para mascarar valores (fmt/mostrarValores), já que
  // esta tela É a própria ficha visual, e para a config repassada ao abrir
  // o modal de exportação. NÃO decide o que aparece NA TELA — isso é
  // `telaSettings`, abaixo.
  pdfSettings: PdfExportSettings;
  // O que este cargo pode ver NA TELA (Configurar Visibilidade dos Quadros),
  // independente do PDF — mesmo papel que telaSettings tem no editor
  // completo (FichaMorar.tsx), aqui aplicado aos 3 blocos desta versão
  // simplificada (não há Bloco 2 nesta tela).
  telaSettings: TelaVisibilitySettings;
  product: Product;
  condition: CommercialCondition;
  simulationData: SimulationData;
  // Condições comerciais liberadas para o dropdown do cabeçalho (ver
  // CONDICOES_APP em config/telasApp.ts) — repassado direto ao
  // FichaMorarTopBar. `undefined` = sem restrição (Administrador).
  condicoesLiberadas?: string[];

  // Cabeçalho de navegação (FichaMorarTopBar) — mesmos props do editor
  // completo, para o dropdown de Empreendimento/Condição funcionar aqui
  // também e o cabeçalho ficar estritamente idêntico entre as duas telas.
  products?: Product[];
  onSelectProduct?: (product: Product, conditionId: string) => void;
  onProductChange: (prodId: string) => void;
  onSelectCondition?: (condition: CommercialCondition, targetTab?: ActiveTab) => void;
  onConditionChange: (condId: string, targetTab?: ActiveTab) => void;

  // Barra de ação (FichaMorarActionBar) — Salvar/PDF/Limpar.
  onLimpar: () => void;
  onSaveSimulation: () => void;
  isSavingSimulation: boolean;

  selectedTorre: string;
  selectedUnidade: string;
  availableTorres: string[];
  filteredUnits: string[];
  onTorreChange: (torre: string) => void;
  onUnidadeChange: (unidade: string) => void;

  fase: string;
  tipologia: string;
  areaPriv: string;
  areaQuintal: string;
  price: number;
  precoTabelaOriginal: number;
  evaluation: number;
  deliveryText: string;

  income: number;
  subsidy: number;
  fgts: number;
  desconto: number;
  maxFinanc: number;
  totalNegoc: number;
  sinalTotal: number;
  comITBI: number;
  distribuido: number;

  isAtoPremiadoEnabled: boolean;
  onToggleAtoPremiado: (ativo: boolean) => void;

  dataAto: string;
  valorAto: number;
  valorAtoMinimo: number;
  valorAtoMaximo: number;
  onAtoChange: (novoValor: number | null) => void;
  // ITBI no Ato — mesmo bloco/comportamento do editor completo (ver
  // FluxoEntradaConstrutora.tsx, Card 2): valor já pago do ITBI/Registro
  // adiantado no Ato, com alternador "Com Desc./Sem Desc." (1º x 2º imóvel)
  // e teto no total de ITBI da unidade. Estado global (valAtoITBI em
  // FichaMorar.tsx), a mesma trava de piso/teto do editor completo.
  valAtoITBI: number;
  valorTotalITBI: number;
  isFirstHome: boolean;
  onToggleFirstHome: () => void;
  onITBIChange: (novoValor: number) => void;
  comissaoApartadaValor?: number;
  comissaoApartadaParcelasQtd?: number;
  comissaoApartadaParcelaValor?: number;
  // Teto/piso de parcelas da Comissão Apartada, configuráveis por política em
  // Políticas & Empreendimentos (currentCond.comissaoApartadaParcelasMin/Max)
  // — o stepper do card "Comissão Apartada" respeita esses limites, com o "+"
  // desabilitado ao alcançar o teto.
  minComissaoParcelas?: number;
  maxComissaoParcelas?: number;
  onComissaoParcelasChange?: (novoTotal: number) => void;

  dataObra: string;
  totalParcObra: number;
  faixasObra: MorarFaixa[];
  onObraTotalChange: (newTotal: number) => void;
  // Teto de meses de Obra/Pós-Obra previsto pela política de crédito
  // (currentCond.mesesObra/mesesPos) — o "+" do stepper desabilita ao
  // alcançar o teto, mesmo limite já aplicado no editor completo.
  maxParcObra?: number;
  // Totalizador final da Fase Obra já calculado pelo motor em
  // FichaMorar.tsx (somaTotalObra) — exibido abaixo da lista de parcelas,
  // sem recriar a lógica de soma aqui. Só as parcelas do imóvel: SEM o
  // rateio de ITBI/Registro (diferente do "Total com ITBI" do editor
  // completo — nesta tela simplificada o totalizador é sempre líquido de
  // ITBI, por pedido explícito).
  totalFaseObraSemITBI: number;

  dataPos: string;
  totalParcPos: number;
  faixasPos: MorarFaixa[];
  onPosTotalChange: (newTotal: number) => void;
  maxParcPos?: number;
  totalFasePosSemITBI: number;
  // Saldo do Pró-Soluto ainda não coberto pelo Ato (Imóvel) — mesmo cálculo
  // do editor completo (ver FichaMorar.tsx). `faixasObra`/`faixasPos` podem
  // carregar um resíduo do motor que não chega a ser exatamente zero; o
  // editor completo nunca exibe esse resíduo bruto, ele sempre reconfere
  // contra este saldo antes de mostrar a parcela (saldoProSolutoRestante
  // <= 0 → exibe R$ 0,00). Essa tela precisa da mesma trava.
  saldoProSolutoRestante: number;
  // "Limpar Fluxo" (reset parcial) — mesma função já usada pelo botão
  // "Limpar" do card "Fluxo de Entrada c/ Construtora" no editor completo
  // (limparFluxoPagamento em FichaMorar.tsx): restaura Ato, ITBI no Ato,
  // Ato Premiado e overrides manuais de Obra/Pós para a sugestão original
  // da unidade, SEM tocar em Torre/Unidade (isso é o botão "Limpar" de
  // cima, onLimpar/handleResetFicha).
  onLimparFluxo: () => void;

  dataITBI: string;
  valorITBI: number;
  itbiObraQtd: number;
  itbiObraValor: number;
  itbiPosQtd: number;
  itbiPosValor: number;

  baseLiquidaComITBI: number;
  baseRendaInformada: number;
  limiteMaximoRiscoRenda: number;
  limiteMaximoProSoluto: number;
  pctRiscoParcelaRenda: number;
  valorRiscoParcela: number;
  pctRiscoProSoluto: number;
  valorRiscoProSoluto: number;
  pieDataPct: MorarPieDatum[];
  pieDataValor: MorarPieDatum[];
  barData: MorarBarDatum[];

  onShowToast: (msg: string) => void;
  onBackToSimulator: () => void;
  onOpenPdfExport: () => void;
}

export const NovatoSimuladorView: React.FC<NovatoSimuladorViewProps> = ({
  pdfSettings,
  telaSettings,
  condicoesLiberadas,
  product,
  condition,
  simulationData,
  products,
  onSelectProduct,
  onProductChange,
  onSelectCondition,
  onConditionChange,
  onLimpar,
  onSaveSimulation,
  isSavingSimulation,
  selectedTorre,
  selectedUnidade,
  availableTorres,
  filteredUnits,
  onTorreChange,
  onUnidadeChange,
  fase,
  tipologia,
  areaPriv,
  areaQuintal,
  precoTabelaOriginal,
  evaluation,
  deliveryText,
  income,
  subsidy,
  fgts,
  desconto,
  maxFinanc,
  totalNegoc,
  sinalTotal,
  comITBI,
  distribuido,
  isAtoPremiadoEnabled,
  onToggleAtoPremiado,
  dataAto,
  valorAto,
  valorAtoMinimo,
  valorAtoMaximo,
  onAtoChange,
  valAtoITBI,
  valorTotalITBI,
  isFirstHome,
  onToggleFirstHome,
  onITBIChange,
  comissaoApartadaValor = 0,
  comissaoApartadaParcelasQtd = 0,
  comissaoApartadaParcelaValor = 0,
  minComissaoParcelas = 1,
  maxComissaoParcelas,
  onComissaoParcelasChange,
  dataObra,
  totalParcObra,
  faixasObra,
  onObraTotalChange,
  maxParcObra,
  totalFaseObraSemITBI,
  dataPos,
  totalParcPos,
  faixasPos,
  onPosTotalChange,
  maxParcPos,
  totalFasePosSemITBI,
  saldoProSolutoRestante,
  onLimparFluxo,
  dataITBI,
  valorITBI,
  itbiObraQtd,
  itbiObraValor,
  itbiPosQtd,
  itbiPosValor,
  baseLiquidaComITBI,
  baseRendaInformada,
  limiteMaximoRiscoRenda,
  limiteMaximoProSoluto,
  pctRiscoParcelaRenda,
  valorRiscoParcela,
  pctRiscoProSoluto,
  valorRiscoProSoluto,
  pieDataPct,
  pieDataValor,
  barData,
  onShowToast,
  onBackToSimulator,
  onOpenPdfExport
}) => {
  const fmt = (val: number) => (pdfSettings.mostrarValores ? formatCurrency(val) : '—');

  // Edição do Ato (Imóvel): mesma trava de piso/teto do editor completo
  // (ver FluxoEntradaConstrutora.handleFinishAtoEdit), só que replicada aqui
  // em cima do valor JÁ CONVERTIDO (bruto/líquido de comissão apartada) que a
  // FichaMorar passa via `valorAto`/`onAtoChange`.
  const [isEditingAto, setIsEditingAto] = useState<boolean>(false);
  const [atoInputText, setAtoInputText] = useState<string>('');

  useEffect(() => {
    if (!isEditingAto) {
      setAtoInputText(valorAto > 0 ? formatCurrency(valorAto) : '');
    }
  }, [valorAto, isEditingAto]);

  const parseFlexible = (raw: string): number => {
    if (!raw || raw.trim() === '') return 0;
    const parsed = parseCurrency(raw);
    return isNaN(parsed) ? 0 : parsed;
  };

  const handleFinishAtoEdit = (rawText: string) => {
    setIsEditingAto(false);
    const parsed = parseFlexible(rawText);

    if (rawText.trim() === '' || parsed === 0) {
      if (valorAtoMinimo > 0) {
        onAtoChange(null);
        setAtoInputText(formatCurrency(valorAtoMinimo));
        onShowToast(`Ato (Imóvel) ajustado para o Sinal Mínimo Sugerido de ${formatCurrency(valorAtoMinimo)}.`);
      } else {
        onAtoChange(null);
        setAtoInputText('');
      }
      return;
    }

    if (valorAtoMinimo > 0 && parsed < valorAtoMinimo - 0.01) {
      onAtoChange(valorAtoMinimo);
      setAtoInputText(formatCurrency(valorAtoMinimo));
      onShowToast(`O valor informado (${formatCurrency(parsed)}) é inferior ao Sinal Mínimo Sugerido (${formatCurrency(valorAtoMinimo)}). Valor ajustado.`);
      return;
    }

    if (valorAtoMaximo > 0 && parsed > valorAtoMaximo + 0.01) {
      onAtoChange(valorAtoMaximo);
      setAtoInputText(formatCurrency(valorAtoMaximo));
      onShowToast(`O valor informado excede o saldo total. O Ato foi ajustado para ${formatCurrency(valorAtoMaximo)}.`);
      return;
    }

    onAtoChange(parsed);
    setAtoInputText(formatCurrency(parsed));
  };

  // Edição do ITBI no Ato: mesma trava do editor completo (ver
  // FluxoEntradaConstrutora.handleFinishITBIEdit) — nunca deixa exceder o
  // total de ITBI/Registro da unidade.
  const [isEditingITBI, setIsEditingITBI] = useState<boolean>(false);
  const [itbiInputText, setItbiInputText] = useState<string>('');

  useEffect(() => {
    if (!isEditingITBI) {
      setItbiInputText(valAtoITBI > 0 ? formatCurrency(valAtoITBI) : '');
    }
  }, [valAtoITBI, isEditingITBI]);

  const handleFinishITBIEdit = (rawText: string) => {
    setIsEditingITBI(false);
    const parsed = parseFlexible(rawText);

    if (rawText.trim() === '' || parsed <= 0) {
      onITBIChange(0);
      setItbiInputText('');
      return;
    }

    if (valorTotalITBI > 0 && parsed > valorTotalITBI + 0.01) {
      onITBIChange(valorTotalITBI);
      setItbiInputText(formatCurrency(valorTotalITBI));
      onShowToast(`O pagamento de ITBI no Ato não pode exceder o total de ${formatCurrency(valorTotalITBI)}.`);
      return;
    }

    onITBIChange(parsed);
    setItbiInputText(formatCurrency(parsed));
  };

  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, payload }: any) => {
    if (payload.value <= 0) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="normal">
        {payload.label}
      </text>
    );
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-12">

      {/* BARRA SUPERIOR DE NAVEGAÇÃO — mesmo componente do editor completo
          (FichaMorarTopBar), estritamente idêntico entre as duas telas. */}
      <FichaMorarTopBar
        onBackToSimulator={onBackToSimulator}
        products={products}
        currentProd={product}
        onSelectProduct={onSelectProduct}
        onProductChange={onProductChange}
        currentCond={condition}
        onSelectCondition={onSelectCondition}
        onConditionChange={onConditionChange}
        deliveryText={deliveryText}
        condicoesLiberadas={condicoesLiberadas}
        isSimplificado={true}
      />

      {/* CARD DO IMÓVEL E CLIENTE — mesmos componentes do editor completo
          (FichaMorarActionBar + FichaMorarProdutoGrid), estritamente
          idêntico entre as duas telas. */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm space-y-2.5 w-full overflow-hidden">
        <FichaMorarActionBar
          clientName={simulationData.clientName}
          agency={simulationData.agency}
          onLimpar={onLimpar}
          onSaveSimulation={onSaveSimulation}
          isSavingSimulation={isSavingSimulation}
          onOpenPdfExport={onOpenPdfExport}
        />

        <FichaMorarProdutoGrid
          selectedTorre={selectedTorre}
          selectedUnidade={selectedUnidade}
          availableTorres={availableTorres}
          filteredUnits={filteredUnits}
          onTorreChange={onTorreChange}
          onUnidadeChange={onUnidadeChange}
          fase={fase}
          tipologia={tipologia}
          areaPriv={areaPriv}
          areaQuintal={areaQuintal}
          precoTabelaOriginal={precoTabelaOriginal}
          evaluation={evaluation}
        />
      </div>

      {/* "FOLHA" — mesmo visual da Ficha de Exportação, com o restante do
          conteúdo (fora do escopo do cabeçalho unificado acima). */}
      <div className="bg-white p-6 sm:p-7 rounded-xl shadow-md border border-slate-200 w-full text-slate-900 space-y-3.5">

        {/* GRID PRINCIPAL: 2 COLUNAS */}
        <div className="grid grid-cols-2 gap-3.5 items-start">

          {/* ================= COLUNA DA ESQUERDA ================= */}
          <div className="space-y-3">
            {telaSettings.mostrarBloco1 && (
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-morar-600" />
                  Dados da Aprovação de Crédito
                </h3>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 px-1">
                    <span className="text-slate-600 font-medium">Renda:</span>
                    <strong className="text-slate-900 font-semibold">{fmt(income)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 px-1">
                    <span className="text-slate-600 font-medium">Subsídio:</span>
                    <strong className="text-emerald-600 font-semibold">{fmt(subsidy)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 px-1">
                    <span className="text-slate-600 font-medium">FGTS:</span>
                    <strong className="text-morar-600 font-semibold">{fmt(fgts)}</strong>
                  </div>

                  {/* ATO PREMIADO — toggle clicável */}
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 px-1">
                    <span className="text-slate-600 font-medium flex items-center gap-1.5">
                      Ato Premiado:
                      <button
                        type="button"
                        onClick={() => onToggleAtoPremiado(!isAtoPremiadoEnabled)}
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                          isAtoPremiadoEnabled
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                        title="Clique para ativar ou desativar o Ato Premiado"
                      >
                        {isAtoPremiadoEnabled ? 'Ativo' : 'Inativo'}
                      </button>
                    </span>
                    <strong className="text-emerald-600 font-semibold">{fmt(desconto)}</strong>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-100 px-1">
                    <span className="text-slate-600 font-medium">Max Financ:</span>
                    <strong className="text-morar-700 font-bold">{fmt(maxFinanc)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 px-1">
                    <span className="text-slate-600 font-medium">Total Negoc:</span>
                    <strong className="text-slate-900 font-bold">{fmt(totalNegoc)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 px-1">
                    <span className="text-slate-600 font-medium">Sinal Total (s/ ITBI):</span>
                    <strong className="text-amber-700 font-bold">{fmt(sinalTotal)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 px-1">
                    <span className="text-slate-600 font-medium">Com ITBI:</span>
                    <strong className="text-emerald-700 font-bold">{fmt(comITBI)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1.5 bg-morar-50 px-2.5 rounded-lg border border-morar-100 mt-2">
                    <span className="text-xs font-bold text-slate-800">Distribuído:</span>
                    <strong className="text-xs sm:text-sm font-black text-morar-700">{fmt(distribuido)}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* CORREÇÃO IGPM+1% (TAXAS E REGISTRO / ITBI) */}
            {telaSettings.mostrarBloco3 && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    Correção IGPM+1% (Taxas e Registro)
                  </h3>
                  <span className="text-[10px] font-semibold text-slate-500">
                    A partir de: <strong className="text-slate-800">{dataITBI}</strong>
                  </span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center bg-[rgba(236,253,245,0.5)] px-2.5 py-1 rounded-lg border border-emerald-100">
                    <span className="text-emerald-900 font-semibold text-[11px]">ITBI / Registro Total:</span>
                    <strong className="text-emerald-800 font-bold">{fmt(valorITBI)}</strong>
                  </div>
                  <div className={`grid ${itbiPosQtd > 0 ? 'grid-cols-2' : 'grid-cols-1'} gap-2 text-[11px]`}>
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                      <span className="text-slate-500 font-medium block text-[10px]">Obra ({itbiObraQtd}X)</span>
                      <strong className="text-slate-900 font-bold block">{fmt(itbiObraValor)}</strong>
                    </div>
                    {itbiPosQtd > 0 && (
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                        <span className="text-slate-500 font-medium block text-[10px]">Pós Obra ({itbiPosQtd}X)</span>
                        <strong className="text-slate-900 font-bold block">{fmt(itbiPosValor)}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================= COLUNA DA DIREITA ================= */}
          <div className="space-y-3">
            {telaSettings.mostrarBloco3 && (<>
              {/* CARD: PERÍODO DE PAGAMENTOS (ATO + ITBI NO ATO) — valores editáveis */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-morar-600" />
                    Período de Pagamentos
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-500">
                      A partir de: <strong className="text-slate-800">{dataAto}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={onLimparFluxo}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-600"
                      title="Restaurar Ato, ITBI no Ato e correções para a sugestão original da unidade, mantendo Torre e Unidade"
                    >
                      <RotateCcw className="w-3 h-3 text-morar-600" />
                      <span>Limpar</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 px-2.5 py-2 rounded-lg border border-morar-200 text-xs flex flex-col gap-1">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      Ato: <Pencil className="w-2.5 h-2.5 text-morar-600" />
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={atoInputText}
                      onFocus={() => setIsEditingAto(true)}
                      onChange={(e) => setAtoInputText(e.target.value)}
                      onBlur={(e) => handleFinishAtoEdit(e.target.value)}
                      placeholder={formatCurrency(valorAtoMinimo)}
                      className="w-full bg-white px-2 py-1 rounded-md border border-slate-200 font-bold text-slate-800 text-center focus:outline-none focus:border-morar-600 text-xs transition-all whitespace-nowrap"
                    />
                  </div>

                  <div className="bg-slate-50 px-2.5 py-2 rounded-lg border border-slate-200 text-xs flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-morar-800 flex items-center gap-1">
                        ITBI no Ato: <Pencil className="w-2.5 h-2.5 text-morar-600" />
                      </span>
                      <button
                        type="button"
                        onClick={onToggleFirstHome}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors cursor-pointer shrink-0 ${
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
                      type="text"
                      inputMode="decimal"
                      value={itbiInputText}
                      onFocus={(e) => {
                        setIsEditingITBI(true);
                        setItbiInputText(valAtoITBI > 0 ? formatForEdit(valAtoITBI) : '');
                        e.target.select();
                      }}
                      onChange={(e) => setItbiInputText(e.target.value)}
                      onBlur={(e) => handleFinishITBIEdit(e.target.value)}
                      placeholder="R$ 0,00"
                      className="w-full bg-white px-2 py-1 rounded-md border border-slate-200 font-bold text-morar-900 text-center focus:outline-none focus:border-morar-600 text-xs transition-all whitespace-nowrap"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 px-1">
                  Sinal Mínimo Sugerido: <strong className="text-slate-500">{formatCurrency(valorAtoMinimo)}</strong>
                </p>

                {comissaoApartadaValor > 0 && (
                  <div className="flex items-center justify-between bg-fuchsia-50 px-3 py-2 rounded-lg border border-fuchsia-100 text-xs gap-2">
                    <span className="font-bold text-fuchsia-700 shrink-0">Comissão Apartada:</span>
                    {onComissaoParcelasChange && (
                      <MonthStepper
                        total={comissaoApartadaParcelasQtd}
                        onChange={onComissaoParcelasChange}
                        min={minComissaoParcelas}
                        max={maxComissaoParcelas}
                        unitLabel="parcela"
                        colorClass="bg-white border-fuchsia-200 text-fuchsia-700"
                      />
                    )}
                    <strong className="text-fuchsia-800 font-bold text-xs sm:text-sm text-right">
                      {fmt(comissaoApartadaValor)} <span className="font-semibold">({fmt(comissaoApartadaParcelaValor)}/mês)</span>
                    </strong>
                  </div>
                )}
              </div>

              {/* CARD: CORREÇÃO INCC - OBRA — stepper `[ - Nx + ]` */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Correção INCC - Obra
                    </h3>
                    <MonthStepper
                      total={totalParcObra}
                      onChange={onObraTotalChange}
                      max={maxParcObra}
                      colorClass="bg-morar-50 border-morar-200 text-morar-700"
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500">
                    A partir de: <strong className="text-slate-800">{dataObra}</strong>
                  </span>
                </div>
                <div className="space-y-1.5 text-xs">
                  {faixasObra
                    .map(f => ({ ...f, valor: saldoProSolutoRestante <= 0 ? 0 : (Number(f.valor) || 0) }))
                    .filter(f => (f.qtd > 0 && (f.valor > 0 || (itbiObraValor || 0) > 0)))
                    .map((f, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-[rgba(248,250,252,0.8)] px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <span className="text-slate-600 font-semibold text-[11px]">{f.qtd}X de:</span>
                        <strong className="text-slate-900 font-bold text-xs">{fmt(f.valor)}</strong>
                      </div>
                    ))}
                </div>
                <div className="flex justify-between items-center bg-morar-50 px-2.5 py-1.5 rounded-lg border border-morar-100 mt-1.5">
                  <span className="text-[11px] font-bold text-slate-700">Total Fase Obra:</span>
                  <strong className="text-xs font-black text-morar-700">{fmt(totalFaseObraSemITBI)}</strong>
                </div>
              </div>

              {/* CARD: CORREÇÃO IPCA+1% - PÓS — stepper `[ - Nx + ]` */}
              {totalParcPos > 0 && (
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Correção IPCA+1% - Pós
                      </h3>
                      <MonthStepper
                        total={totalParcPos}
                        onChange={onPosTotalChange}
                        max={maxParcPos}
                        colorClass="bg-indigo-50 border-indigo-200 text-indigo-700"
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500">
                      A partir de: <strong className="text-slate-800">{dataPos}</strong>
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {faixasPos
                      .map(f => ({ ...f, valor: saldoProSolutoRestante <= 0 ? 0 : (Number(f.valor) || 0) }))
                      .filter(f => (f.qtd > 0 && (f.valor > 0 || (itbiPosValor || 0) > 0)))
                      .map((f, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-[rgba(248,250,252,0.8)] px-2.5 py-1.5 rounded-lg border border-slate-100">
                          <span className="text-slate-600 font-semibold text-[11px]">{f.qtd}X de:</span>
                          <strong className="text-slate-900 font-bold text-xs">{fmt(f.valor)}</strong>
                        </div>
                      ))}
                  </div>
                  <div className="flex justify-between items-center bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100 mt-1.5">
                    <span className="text-[11px] font-bold text-slate-700">Total Fase Pós-Obra:</span>
                    <strong className="text-xs font-black text-indigo-700">{fmt(totalFasePosSemITBI)}</strong>
                  </div>
                </div>
              )}
            </>)}
          </div>
        </div>

        {/* 3. INDICADORES DE RISCO / COMPROMETIMENTO (GRÁFICOS NO RODAPÉ) */}
        {telaSettings.mostrarBloco4 && (
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-1.5 gap-1">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-morar-600" />
                Indicadores de Risco / Comprometimento
              </h3>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                <span>Base Líq. c/ ITBI: <strong className="text-slate-800">{fmt(baseLiquidaComITBI)}</strong></span>
                <span>•</span>
                <span>Base Renda: <strong className="text-slate-800">{fmt(baseRendaInformada)}</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase mb-1">Percentual de Risco por Fase</span>
                <div className="w-28 h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie data={pieDataPct} dataKey="value" cx="50%" cy="50%" innerRadius={0} outerRadius={52} stroke="#ffffff" strokeWidth={2} startAngle={270} endAngle={-90} labelLine={false} label={renderPieLabel} isAnimationActive={false}>
                        {pieDataPct.map((entry, idx) => <Cell key={`pct-${idx}`} fill={entry.fill} />)}
                      </Pie>
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase mb-1">Volume Financeiro por Fase (R$)</span>
                <div className="w-28 h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie data={pieDataValor} dataKey="value" cx="50%" cy="50%" innerRadius={0} outerRadius={52} stroke="#ffffff" strokeWidth={2} startAngle={270} endAngle={-90} labelLine={false} label={renderPieLabel} isAnimationActive={false}>
                        {pieDataValor.map((entry, idx) => <Cell key={`valor-${idx}`} fill={entry.fill} />)}
                      </Pie>
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 text-[10px] font-medium text-slate-500 flex-wrap pt-1 border-t border-[rgba(226,232,240,0.6)]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0284C7]" />Total Obra</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#7C3AED]" />Total Pós-Obra</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#059669]" />Total Pró-Soluto</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 space-y-0.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">1ª Parcela:</span>
                  <strong className="text-slate-900 font-bold">{fmt(valorRiscoParcela)}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Comprometimento da Renda:</span>
                  <strong className={`font-bold ${pctRiscoParcelaRenda > limiteMaximoRiscoRenda ? 'text-red-600' : 'text-morar-700'}`}>
                    {pctRiscoParcelaRenda < 10 && pctRiscoParcelaRenda > 0 ? pctRiscoParcelaRenda.toFixed(2) : pctRiscoParcelaRenda.toFixed(1)}%
                  </strong>
                </div>
              </div>
              <div className="bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 space-y-0.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Pró-Soluto Total (R$):</span>
                  <strong className="text-slate-900 font-bold">{fmt(valorRiscoProSoluto)}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Pró-Soluto Total (%):</span>
                  <strong className={`font-bold ${pctRiscoProSoluto > limiteMaximoProSoluto ? 'text-red-600' : 'text-emerald-700'}`}>
                    {pctRiscoProSoluto < 10 && pctRiscoProSoluto > 0 ? pctRiscoProSoluto.toFixed(2) : pctRiscoProSoluto.toFixed(2)}%
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RODAPÉ OFICIAL MORAR / CAIXA */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[10.5px] text-slate-600 leading-relaxed text-justify mt-3 shadow-2xs">
          <strong>Informações importantes:</strong> Os resultados obtidos representam apenas uma simulação e não valem como proposta, pois estão sujeitos a alterações de acordo com a apuração da capacidade de pagamento e a aprovação de crédito a ser efetuada pela CAIXA e MORAR. Poderão haver alterações das taxas e das demais condições, sem aviso prévio. A contratação está condicionada à disponibilidade de recursos para sua região e ao atendimento das exigências do PMCMV.
        </div>
      </div>
    </div>
  );
};
