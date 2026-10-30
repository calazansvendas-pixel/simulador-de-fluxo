import React, { useState } from 'react';
import { X, Calendar, Download, Loader2, AlertCircle } from 'lucide-react';
import logoMorar from '../assets/brand';
import { CommercialCondition, PdfExportSettings, Product, SimulationData } from '../types';
import { formatCurrency, formatDateBr } from '../utils/formatters';
import { waitForStyledPaint, captureStyledCanvas, inlineLiveStylesheets } from '../utils/pdfExport';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Bar, LabelList } from 'recharts';

export interface MorarPieDatum {
  name: string;
  value: number;
  fill: string;
  label: string;
}

export interface MorarBarDatum {
  name: string;
  percRendaRaw: number;
  labelFormatado: string;
}

export interface MorarFaixa {
  qtd: number;
  valor: number;
}

interface PdfExportModalMorarProps {
  isOpen: boolean;
  onClose: () => void;
  pdfSettings: PdfExportSettings;
  product: Product;
  condition: CommercialCondition;
  simulationData: SimulationData;
  selectedTorre: string;
  selectedUnidade: string;
  fase: string;
  tipologia: string;
  areaPriv: string;
  areaQuintal: string;
  price: number;
  // Preço de Tabela original, importado da tabela de vendas — usado só no
  // display "Preço de Tabela" do PDF, que nunca deve refletir o desconto à
  // vista (aplicado sobre `price`, usado no restante dos cálculos).
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
  dataAto: string;
  valorAto: number;
  // Comissão Apartada — só > 0 na condição "Sinal c/ Morar (Comissão Apartada)".
  comissaoApartadaValor?: number;
  comissaoApartadaParcelasQtd?: number;
  comissaoApartadaParcelaValor?: number;
  dataObra: string;
  totalParcObra: number;
  faixasObra: MorarFaixa[];
  dataPos: string;
  totalParcPos: number;
  faixasPos: MorarFaixa[];
  dataITBI: string;
  valorITBI: number;
  itbiObraQtd: number;
  itbiObraValor: number;
  itbiPosQtd: number;
  itbiPosValor: number;
  isAtoPremiadoEnabled: boolean;
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
}

export const PdfExportModalMorar: React.FC<PdfExportModalMorarProps> = ({
  isOpen,
  onClose,
  pdfSettings,
  product,
  condition,
  simulationData,
  selectedTorre,
  selectedUnidade,
  fase,
  tipologia,
  areaPriv,
  areaQuintal,
  price,
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
  dataAto,
  valorAto,
  comissaoApartadaValor = 0,
  comissaoApartadaParcelasQtd = 0,
  comissaoApartadaParcelaValor = 0,
  dataObra,
  totalParcObra,
  faixasObra,
  dataPos,
  totalParcPos,
  faixasPos,
  dataITBI,
  valorITBI,
  itbiObraQtd,
  itbiObraValor,
  itbiPosQtd,
  itbiPosValor,
  isAtoPremiadoEnabled,
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
}) => {
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const fmt = (val: number) => (pdfSettings.mostrarValores ? formatCurrency(val) : '—');

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

  const sanitizeFileName = (str: string) => {
    return (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');
  };

  const getFileName = () => {
    const prodName = sanitizeFileName(product?.name || 'Empreendimento');
    const unitStr = selectedUnidade ? `_Unid_${sanitizeFileName(selectedUnidade)}` : '';
    const clientStr = simulationData.clientName ? `_${sanitizeFileName(simulationData.clientName)}` : '';
    return `Ficha_Morar_${prodName}${unitStr}${clientStr}.pdf`;
  };

  const handleDownloadPdf = async () => {
    const element = document.getElementById('pdf-content-area-morar');
    if (!element) {
      alert('Erro: Conteúdo da Ficha de Análise Morar não encontrado.');
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);

    try {
      const filename = getFileName();

      // Garante que as fontes web (Inter) já terminaram de carregar antes de
      // capturar — do contrário o html2canvas pode capturar com a fonte de
      // fallback do sistema ou, em navegadores mais lentos, falhar a
      // renderizar o layout a tempo, o que aciona o fallback de impressão
      // nativa (sem os estilos/cores do Tailwind) mais abaixo.
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      // Espera pelo menos dois frames de animação e confirma que o CSS já
      // está de fato aplicado antes de capturar (ver waitForStyledPaint) —
      // em conexões lentas, um atraso fixo não era suficiente e o
      // html2canvas podia capturar o conteúdo sem nenhuma formatação, sem
      // lançar erro.
      await waitForStyledPaint(element);

      // foreignObjectRendering fica explicitamente desligado: o modo baseado
      // em SVG <foreignObject> é bem menos compatível entre navegadores e,
      // quando falha, costuma falhar silenciosamente com um canvas em
      // branco/incompleto em vez de lançar um erro — o clone-e-desenha
      // (padrão quando desligado) é o caminho mais testado da biblioteca.
      const canvas = await captureStyledCanvas(element, () => html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 1200,
        foreignObjectRendering: false,
        onclone: inlineLiveStylesheets,
      }));

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 8;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = (canvas.height * contentWidth) / canvas.width;

      if (contentHeight <= pageHeight - margin * 2) {
        pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, contentHeight);
      } else {
        const maxContentHeight = pageHeight - margin * 2;
        const scaleFactor = maxContentHeight / contentHeight;
        const finalWidth = contentWidth * scaleFactor;
        const finalHeight = contentHeight * scaleFactor;
        const offsetX = (pageWidth - finalWidth) / 2;
        pdf.addImage(imgData, 'JPEG', offsetX, margin, finalWidth, finalHeight);
      }

      pdf.save(filename);
    } catch (err: any) {
      console.error('Erro ao gerar PDF Morar:', err);
      const detalhe = err?.message ? ` (${err.message})` : '';
      setErrorMessage(`Ocorreu um problema ao gerar o download direto${detalhe}. Tentando abrir caixa de impressão...`);
      setTimeout(() => {
        window.print();
      }, 300);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(15,23,42,0.6)] backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[96vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* CABEÇALHO DO MODAL */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-morar-50 rounded-xl border border-morar-100 shadow-2xs">
              <img src={logoMorar} alt="Morar" className="w-5 h-5 object-contain" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                Exportar Ficha de Análise - Padrão Morar (PDF)
              </h2>
              <p className="text-xs text-slate-500">
                Pré-visualização da folha A4 com os blocos comerciais Morar
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="px-4 py-2 bg-morar-600 hover:bg-morar-700 disabled:bg-morar-400 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gerando PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Baixar PDF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MENSAGEM DE AVISO / ERRO SE HOUVER */}
        {errorMessage && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ÁREA DE PRÉ-VISUALIZAÇÃO / CAPTURA — o "papel" não encolhe abaixo de
            min-w (mesma razão do PdfExportModal.tsx: preservar a fidelidade da
            pré-visualização do PDF exportado); em telas de celular a área rola
            na horizontal em vez de espremer o grid interno. */}
        <div className="p-4 sm:p-6 overflow-auto bg-slate-100 flex justify-center items-start flex-1">

          <div
            id="pdf-content-area-morar"
            className="bg-white p-6 sm:p-7 rounded-xl shadow-md border border-slate-200 w-full min-w-[520px] max-w-[820px] text-slate-900 space-y-3.5 print:p-0 print:shadow-none print:border-none print:max-w-none"
            style={{ minHeight: '1080px' }}
          >
            {/* 1. TOPO: LOGO / CABEÇALHO DA CONSTRUTORA & EMPREENDIMENTO */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-morar-50 border border-morar-200 flex items-center justify-center shrink-0">
                  <img src={logoMorar} alt="Morar" className="w-5 h-5 object-contain" />
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight uppercase">
                    Simulação Comercial
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-medium">
                    <span>Empreendimento: <strong className="text-slate-900 font-bold">{product.name}</strong></span>
                    <span>•</span>
                    <span>Condição: <strong className="text-slate-900 font-bold">{condition.name}</strong></span>
                    {deliveryText && (
                      <>
                        <span>•</span>
                        <span className="text-amber-700 font-bold">Chaves: {deliveryText}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* DATA DA SIMULAÇÃO */}
              {pdfSettings.mostrarDataSimulacao && (
                <div className="bg-morar-50 text-morar-700 border border-morar-200 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shadow-2xs shrink-0 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-morar-600 shrink-0" />
                  <span>Data da Simulação: {formatDateBr()}</span>
                </div>
              )}
            </div>

            {/* BARRA DE CLIENTE E IMOBILIÁRIA */}
            {(pdfSettings.mostrarCliente || pdfSettings.mostrarImobiliaria) && (
              <div className="bg-[rgba(248,250,252,0.9)] px-3.5 py-2 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between text-xs gap-2">
                <div className="flex items-center justify-between w-full flex-wrap gap-2">
                  {pdfSettings.mostrarCliente && (
                    <span className="text-slate-600 font-medium">
                      Cliente: <strong className="text-slate-900 font-bold">{simulationData.clientName || 'Cliente Não Informado'}</strong>
                    </span>
                  )}
                  {pdfSettings.mostrarImobiliaria && (
                    <span className="text-slate-600 font-medium">
                      Imobiliária: <strong className="text-slate-900 font-bold">{simulationData.agency?.trim() || 'Imobiliária Não Informada'}</strong>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 2. RESUMO DA UNIDADE */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 overflow-hidden w-full">
              
              {/* LINHA 1 (Torre, Unidade, Fase, Tipologia) */}
              <div className="grid grid-cols-12 gap-2 text-xs w-full">
                <div className="col-span-2 bg-[rgba(240,249,255,0.6)] p-2 rounded-lg border border-morar-100 flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-morar-700 font-bold uppercase mb-0.5 whitespace-nowrap">
                    Torre
                  </span>
                  <strong className="text-slate-900 font-bold text-xs whitespace-nowrap truncate w-full">
                    {selectedTorre || '-'}
                  </strong>
                </div>

                <div className="col-span-2 bg-[rgba(240,249,255,0.6)] p-2 rounded-lg border border-morar-100 flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-morar-700 font-bold uppercase mb-0.5 whitespace-nowrap">
                    Unidade
                  </span>
                  <strong className="text-slate-900 font-bold text-xs whitespace-nowrap truncate w-full">
                    {selectedUnidade || '-'}
                  </strong>
                </div>

                <div className="col-span-2 bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.6)] flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-slate-400 font-medium mb-0.5 whitespace-nowrap">
                    Fase
                  </span>
                  <strong className="text-slate-700 font-bold text-xs whitespace-nowrap truncate w-full">
                    {fase || '-'}
                  </strong>
                </div>

                <div className="col-span-6 bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.6)] flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-slate-400 font-medium mb-0.5 whitespace-nowrap">
                    Tipologia
                  </span>
                  <strong className="text-slate-700 font-bold text-xs whitespace-nowrap truncate w-full" title={tipologia}>
                    {tipologia || '-'}
                  </strong>
                </div>
              </div>

              {/* LINHA 2 (Área Priv, Quintal, Preço Tab, Avaliação) */}
              <div className="grid grid-cols-12 gap-2 text-xs w-full">
                <div className="col-span-2 bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.6)] flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-slate-400 font-medium mb-0.5 whitespace-nowrap">
                    Área Privativa
                  </span>
                  <strong className="text-slate-700 font-bold text-xs whitespace-nowrap truncate w-full">
                    {areaPriv}
                  </strong>
                </div>

                <div className="col-span-2 bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.6)] flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-slate-400 font-medium mb-0.5 whitespace-nowrap">
                    Quintal
                  </span>
                  <strong className="text-slate-700 font-bold text-xs whitespace-nowrap truncate w-full">
                    {areaQuintal}
                  </strong>
                </div>

                <div className="col-span-4 bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.6)] flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-slate-400 font-medium mb-0.5 whitespace-nowrap">
                    Preço de Tabela
                  </span>
                  <strong className="text-slate-900 font-bold text-xs whitespace-nowrap truncate w-full">
                    {fmt(precoTabelaOriginal)}
                  </strong>
                </div>

                <div className="col-span-4 bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.6)] flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-slate-400 font-medium mb-0.5 whitespace-nowrap">
                    Avaliação Bancária
                  </span>
                  <strong className="text-emerald-600 font-bold text-xs whitespace-nowrap truncate w-full">
                    {fmt(evaluation)}
                  </strong>
                </div>
              </div>
            </div>

            {/* GRID PRINCIPAL MORAR: 2 COLUNAS */}
            <div className="grid grid-cols-2 gap-3.5 items-start">
              
              {/* ================= COLUNA DA ESQUERDA: DADOS DA APROVAÇÃO DE CRÉDITO ================= */}
              <div className="space-y-3">
                {pdfSettings.mostrarBloco1 && (
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

                    <div className="flex justify-between items-center py-1 border-b border-slate-100 px-1">
                      <span className="text-slate-600 font-medium">
                        Ato Premiado: <strong className={isAtoPremiadoEnabled ? 'text-emerald-700' : 'text-slate-500'}>{isAtoPremiadoEnabled ? 'Ativo' : 'Não Utilizado'}</strong>
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

                    {/* DESTAQUE TOTAL DISTRIBUÍDO */}
                    <div className="flex justify-between items-center py-1.5 bg-morar-50 px-2.5 rounded-lg border border-morar-100 mt-2">
                      <span className="text-xs font-bold text-slate-800">Distribuído:</span>
                      <strong className="text-xs sm:text-sm font-black text-morar-700">{fmt(distribuido)}</strong>
                    </div>
                  </div>
                </div>
                )}

                {/* CORREÇÃO IGPM+1% (TAXAS E REGISTRO / ITBI) — layout exclusivo
                    do "Sinal c/ Morar" (e da variante Comissão Apartada, únicas
                    condições que usam este template): posicionado logo abaixo
                    dos Dados da Aprovação de Crédito, na mesma coluna, em vez de
                    junto aos demais blocos de pagamento (coluna da direita).
                    Mesmo card/dados de antes, só a posição — continua
                    respeitando a visibilidade de "Bloco 3" (mesma seção lógica
                    de antes em Configurar Exportação de PDF). */}
                {pdfSettings.mostrarBloco3 && (
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

                {/* GRÁFICO: COMPROMETIMENTO POR SÉRIE (PARCELA / RENDA) */}
                {pdfSettings.mostrarBloco2 && (
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    Comprometimento por Série (Parcela / Renda)
                  </h3>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={45} tick={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} />
                        <Bar dataKey="percRendaRaw" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
                          {barData.map((entry, idx) => (
                            <Cell key={`bar-${idx}`} fill={['#312e81', '#3730a3', '#4338ca', '#4f46e5', '#6366f1', '#818cf8'][idx % 6]} />
                          ))}
                          <LabelList dataKey="labelFormatado" fill="#FFFFFF" fontSize={9} fontWeight="bold" position="insideRight" offset={8} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                )}
              </div>

              {/* ================= COLUNA DA DIREITA: BLOCOS DE PAGAMENTO MORAR ================= */}
              <div className="space-y-3">
                {pdfSettings.mostrarBloco3 && (<>
                {/* CARD 1: PERÍODO DE PAGAMENTOS (ATO) */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-morar-600" />
                      Período de Pagamentos
                    </h3>
                    <span className="text-[10px] font-semibold text-slate-500">
                      A partir de: <strong className="text-slate-800">{dataAto}</strong>
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-[rgba(226,232,240,0.7)] text-xs">
                    <span className="font-bold text-slate-700">Ato:</span>
                    <strong className="text-slate-900 font-black text-xs sm:text-sm">{fmt(valorAto)}</strong>
                  </div>

                  {/* COMISSÃO APARTADA — só na condição "Sinal c/ Morar (Comissão Apartada)" */}
                  {comissaoApartadaValor > 0 && (
                    <div className="flex items-center justify-between bg-fuchsia-50 px-3 py-2 rounded-lg border border-fuchsia-100 text-xs">
                      <span className="font-bold text-fuchsia-700">Comissão Apartada ({comissaoApartadaParcelasQtd}x):</span>
                      <strong className="text-fuchsia-800 font-black text-xs sm:text-sm">
                        {fmt(comissaoApartadaValor)} <span className="font-semibold">({fmt(comissaoApartadaParcelaValor)}/mês)</span>
                      </strong>
                    </div>
                  )}
                </div>

                {/* CARD 2: CORREÇÃO INCC - OBRA */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Correção INCC - Obra
                      </h3>
                      <span className="px-1.5 py-0.5 bg-morar-50 text-morar-700 rounded text-[10px] font-extrabold border border-morar-100">
                        {totalParcObra}X
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500">
                      A partir de: <strong className="text-slate-800">{dataObra}</strong>
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {faixasObra.filter(f => (f.qtd > 0 && ((f.valor || 0) > 0 || (itbiObraValor || 0) > 0))).map((f, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-[rgba(248,250,252,0.8)] px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <span className="text-slate-600 font-semibold text-[11px]">{f.qtd}X de:</span>
                        <strong className="text-slate-900 font-bold text-xs">{fmt(f.valor)}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CARD 3: CORREÇÃO IPCA+1% - PÓS */}
                {totalParcPos > 0 && (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Correção IPCA+1% - Pós
                        </h3>
                        <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-extrabold border border-indigo-100">
                          {totalParcPos}X
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500">
                        A partir de: <strong className="text-slate-800">{dataPos}</strong>
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      {faixasPos.filter(f => (f.qtd > 0 && ((f.valor || 0) > 0 || (itbiPosValor || 0) > 0))).map((f, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-[rgba(248,250,252,0.8)] px-2.5 py-1.5 rounded-lg border border-slate-100">
                          <span className="text-slate-600 font-semibold text-[11px]">{f.qtd}X de:</span>
                          <strong className="text-slate-900 font-bold text-xs">{fmt(f.valor)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                </>)}

              </div>

            </div>

            {/* 3. INDICADORES DE RISCO / COMPROMETIMENTO (GRÁFICOS) */}
            {pdfSettings.mostrarBloco4 && (
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

      </div>
    </div>
  );
};
