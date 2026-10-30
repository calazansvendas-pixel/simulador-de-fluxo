import React, { useState } from 'react';
import { X, Calendar, FileText, Download, Loader2, AlertCircle } from 'lucide-react';
import { CommercialCondition, PdfExportSettings, Product, SimulationData } from '../types';
import { formatCurrency, formatDateBr } from '../utils/formatters';
import { waitForStyledPaint, captureStyledCanvas, inlineLiveStylesheets } from '../utils/pdfExport';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Bar, Cell, LabelList } from 'recharts';
import logoMorar from '../assets/brand';

export interface PdfSemestralItem {
  label: string;
  data: string;
  valor: number;
}

export interface PdfComprometimentoDatum {
  name: string;
  value: number;
  base: 'Imóvel' | 'Renda';
}

interface PdfExportModalProps {
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
  subsidyEfetivo: number;
  fgtsEfetivo: number;
  descontoAto: number;
  maxFinanc: number;
  totalNegocEfetivo: number;
  sinalTotal: number;
  despCartoriasEfetivas: number;
  atoAposMensais: number;
  atoITBIValidado: number;
  valParc2: number;
  valParc3: number;
  qtdMensais: number;
  appliedRatePct: number;
  parcela: number;
  valorTotalITBI: number;
  saldoITBI: number;
  proSoluto: number;
  proSolutoTotalPainel: number;
  baseVendaLiquidaComITBI: number;
  baseRendaInformada: number;
  pctRiscoParcelaRenda: number;
  valorRiscoParcela: number;
  pctRiscoProSoluto: number;
  valorRiscoProSoluto: number;
  // Campos exclusivos da condição "Parcelamento Morar" — o Bloco 3 (e o
  // Bloco 4, substituído pelo gráfico de comprometimento) usam um layout
  // próprio quando isParcelamentoMorar é true; nas demais condições esses
  // campos são ignorados.
  isParcelamentoMorar?: boolean;
  pmValorMensalObra?: number;
  pmNMensaisObra?: number;
  pmValorMensalObraTotal?: number;
  pmMensalObraDataInicio?: string;
  pmSemestraisList?: PdfSemestralItem[];
  pmChavesEnabled?: boolean;
  pmValorChaves?: number;
  pmChavesVencimento?: string;
  pmQtdParcelasPosObra?: number;
  pmValorPosObraParcela?: number;
  pmValorPosObraTotal?: number;
  pmPosObraDataInicio?: string;
  pmSubtotalAteChaves?: number;
  pmPctSubtotalAteChaves?: number;
  pmComprometimentoData?: PdfComprometimentoDatum[];
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
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
  subsidyEfetivo,
  fgtsEfetivo,
  descontoAto,
  maxFinanc,
  totalNegocEfetivo,
  sinalTotal,
  despCartoriasEfetivas,
  atoAposMensais,
  atoITBIValidado,
  valParc2,
  valParc3,
  qtdMensais,
  appliedRatePct,
  parcela,
  valorTotalITBI,
  saldoITBI,
  proSoluto,
  proSolutoTotalPainel,
  baseVendaLiquidaComITBI,
  baseRendaInformada,
  pctRiscoParcelaRenda,
  valorRiscoParcela,
  pctRiscoProSoluto,
  valorRiscoProSoluto,
  isParcelamentoMorar = false,
  pmValorMensalObra = 0,
  pmNMensaisObra = 0,
  pmValorMensalObraTotal = 0,
  pmMensalObraDataInicio = '',
  pmSemestraisList = [],
  pmChavesEnabled = false,
  pmValorChaves = 0,
  pmChavesVencimento = '',
  pmQtdParcelasPosObra = 0,
  pmValorPosObraParcela = 0,
  pmValorPosObraTotal = 0,
  pmPosObraDataInicio = '',
  pmSubtotalAteChaves = 0,
  pmPctSubtotalAteChaves = 0,
  pmComprometimentoData = [],
}) => {
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const fmt = (val: number) => (pdfSettings.mostrarValores ? formatCurrency(val) : '—');

  // Sanitizador de nome de arquivo para download
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
    return `Ficha_Analise_${prodName}${unitStr}${clientStr}.pdf`;
  };

  // Download direto do PDF com html2canvas-pro (compatível com cores oklch do Tailwind v4) e jsPDF
  const handleDownloadPdf = async () => {
    const element = document.getElementById('pdf-content-area');
    if (!element) {
      alert('Erro: Conteúdo da Ficha de Análise não encontrado.');
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
      // Espera pelo menos dois frames de animação (garante que o navegador já
      // completou um ciclo de layout/pintura desde que a ficha foi montada) e
      // confirma que o CSS já está de fato aplicado antes de capturar — o
      // elemento sempre recebe fundo branco (bg-white) quando o CSS carregou,
      // contra transparente quando ainda não. Em conexões lentas, um atraso
      // fixo não era suficiente: a folha de estilos podia não ter sido
      // processada a tempo, e o html2canvas capturava o conteúdo "cru", sem
      // nenhuma formatação, mesmo sem lançar erro (o catch abaixo não pegava
      // esse caso).
      await waitForStyledPaint(element);

      // Renderiza com escala nítida e suporte nativo a oklch / CSS Level 4.
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
        // Redimensiona proporcionalmente para manter todo o conteúdo em uma única folha A4
        const maxContentHeight = pageHeight - margin * 2;
        const scaleFactor = maxContentHeight / contentHeight;
        const finalWidth = contentWidth * scaleFactor;
        const finalHeight = contentHeight * scaleFactor;
        const offsetX = (pageWidth - finalWidth) / 2;
        pdf.addImage(imgData, 'JPEG', offsetX, margin, finalWidth, finalHeight);
      }

      pdf.save(filename);
    } catch (err: any) {
      console.error('Erro ao gerar PDF:', err);
      const detalhe = err?.message ? ` (${err.message})` : '';
      setErrorMessage(`Ocorreu um problema ao gerar o download direto${detalhe}. Tentando abrir caixa de impressão...`);
      setTimeout(() => {
        window.print();
      }, 300);
    } finally {
      setIsExporting(false);
    }
  };

  // Renderizador de Gráfico de Pizza SVG 100% estático, nítido e com alta legibilidade para impressão
  const renderPrintPie = (
    pct: number,
    colorPrimary: string,
    colorSecondary: string = '#cbd5e1',
    primaryTextColor: string = '#ffffff',
    secondaryTextColor: string = '#1e293b'
  ) => {
    const cx = 50;
    const cy = 50;
    const r = 40; // Raio proporcional com centro (50,50) e viewBox="-10 -10 120 120" com folga perimetral anti-clipping
    const clampedPct = Math.min(100, Math.max(0, pct));
    const restPct = Math.max(0, 100 - clampedPct);

    const formatPct = (val: number) => {
      return (val < 10 && val > 0) ? val.toFixed(2) : val.toFixed(1);
    };

    // Posição radial do texto da fatia
    const calcCentroidRadius = (sliceAngleDeg: number) => {
      const theta = (sliceAngleDeg * Math.PI) / 180;
      if (theta <= 0.001) return r * 0.58;
      const factor = (2 / 3) * (Math.sin(theta / 2) / (theta / 2));
      return r * Math.min(0.68, Math.max(0.48, factor));
    };

    if (clampedPct >= 100) {
      return (
        <svg
          width="80"
          height="80"
          viewBox="-10 -10 120 120"
          style={{ width: '80px', height: '80px', display: 'block', margin: '0 auto', overflow: 'visible' }}
        >
          <circle cx={cx} cy={cy} r={r} fill={colorPrimary} />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fill={primaryTextColor}
            fontSize="10"
            fontWeight="bold"
          >
            100.0%
          </text>
        </svg>
      );
    }

    if (clampedPct <= 0) {
      return (
        <svg
          width="80"
          height="80"
          viewBox="-10 -10 120 120"
          style={{ width: '80px', height: '80px', display: 'block', margin: '0 auto', overflow: 'visible' }}
        >
          <circle cx={cx} cy={cy} r={r} fill={colorSecondary} />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fill={secondaryTextColor}
            fontSize="10"
            fontWeight="bold"
          >
            0.0%
          </text>
        </svg>
      );
    }

    const angle = (clampedPct / 100) * 360;
    const rad = (angle - 90) * (Math.PI / 180);
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    const largeArcFlag = clampedPct > 50 ? 1 : 0;
    const pathD = `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArcFlag} 1 ${x} ${y} Z`;

    const midAngle1 = angle / 2;
    const rLabel1 = calcCentroidRadius(angle);
    const rad1 = (midAngle1 - 90) * (Math.PI / 180);
    const textX1 = cx + rLabel1 * Math.cos(rad1);
    const textY1 = cy + rLabel1 * Math.sin(rad1);

    const restAngle = 360 - angle;
    const midAngle2 = angle + restAngle / 2;
    const rLabel2 = calcCentroidRadius(restAngle);
    const rad2 = (midAngle2 - 90) * (Math.PI / 180);
    const textX2 = cx + rLabel2 * Math.cos(rad2);
    const textY2 = cy + rLabel2 * Math.sin(rad2);

    return (
      <svg
        width="80"
        height="80"
        viewBox="-12 -12 124 124"
        style={{ width: '80px', height: '80px', display: 'block', margin: '0 auto', overflow: 'visible' }}
      >
        {/* CÍRCULO BASE COMPLETO */}
        <circle cx={cx} cy={cy} r={r} fill={colorSecondary} />
        {/* FATIA PRIMÁRIA */}
        <path d={pathD} fill={colorPrimary} />
        {/* LINHAS DIVISÓRIAS */}
        <line x1={cx} y1={cy} x2={cx} y2={cy - r} stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={x} y2={y} stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        
        {/* PERCENTUAL FATIA PRIMÁRIA (RISCO) */}
        {clampedPct >= 14 ? (
          <text
            x={textX1}
            y={textY1}
            textAnchor="middle"
            dominantBaseline="central"
            fill={primaryTextColor}
            fontSize="10"
            fontWeight="bold"
          >
            {formatPct(clampedPct)}%
          </text>
        ) : (
          <g>
            <rect
              x={textX1 - 16}
              y={textY1 - 6}
              width="32"
              height="12"
              rx="4"
              fill={colorPrimary}
              opacity="0.95"
            />
            <text
              x={textX1}
              y={textY1}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#ffffff"
              fontSize="8"
              fontWeight="bold"
            >
              {formatPct(clampedPct)}%
            </text>
          </g>
        )}
        
        {/* PERCENTUAL FATIA RESTANTE */}
        {restPct >= 18 && (
          <text
            x={textX2}
            y={textY2}
            textAnchor="middle"
            dominantBaseline="central"
            fill={secondaryTextColor}
            fontSize="10"
            fontWeight="bold"
          >
            {restPct.toFixed(1)}%
          </text>
        )}
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(15,23,42,0.6)] backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      {/* DIALOG CONTAINER */}
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[96vh] flex flex-col overflow-hidden animate-fade-in">
        
        {/* BARRA SUPERIOR DO MODAL (NÃO IMPRESSA) */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between no-print shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-morar-100 text-morar-700">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Visualização de Impressão & Exportação PDF</h2>
              <p className="text-[11px] text-slate-500 font-medium">Layout ajustado e otimizado para formato A4</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* BOTÃO: BAIXAR ARQUIVO PDF */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-[rgba(226,232,240,0.8)] disabled:opacity-60"
              title="Baixar arquivo .pdf diretamente no dispositivo"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-morar-600" />
                  <span>Gerando PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>Baixar PDF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ALERTA DE ERRO SE HOUVER */}
        {errorMessage && (
          <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2 no-print">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* CORPO DO DOCUMENTO IMPRESSO — o "papel" simula proporções de A4, então
            em telas de celular ele não encolhe (min-w abaixo): a área rola na
            horizontal (como as tabelas largas do Painel do Administrador) em vez
            de espremer o grid interno e descaracterizar a pré-visualização do
            que realmente sai no PDF exportado. */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-[rgba(241,245,249,0.6)]">
          <div
            id="pdf-content-area"
            className="printable-document bg-white mx-auto border border-slate-200 shadow-md rounded-xl p-5 sm:p-7 space-y-4 min-w-[520px] max-w-[210mm] text-slate-900 text-xs"
          >
            
            {/* 1. CABEÇALHO PRINCIPAL */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-3 gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-morar-50 border border-morar-200 flex items-center justify-center shrink-0">
                  <img src={logoMorar} alt="Morar" className="w-5 h-5 object-contain" />
                </div>
                <div className="space-y-1">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
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

              {/* DATA DA SIMULAÇÃO À DIREITA */}
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
              
              {/* LINHA 1 (col-span-2 / col-span-2 / col-span-2 / col-span-6) */}
              <div className="grid grid-cols-12 gap-2 text-xs w-full">
                {/* TORRE (col-span-2) */}
                <div className="col-span-2 bg-[rgba(240,249,255,0.6)] p-2 rounded-lg border border-morar-100 flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-morar-700 font-bold uppercase mb-0.5 whitespace-nowrap">
                    Torre
                  </span>
                  <strong className="text-slate-900 font-bold text-xs whitespace-nowrap truncate w-full">
                    {selectedTorre || '-'}
                  </strong>
                </div>

                {/* UNIDADE (col-span-2) */}
                <div className="col-span-2 bg-[rgba(240,249,255,0.6)] p-2 rounded-lg border border-morar-100 flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-morar-700 font-bold uppercase mb-0.5 whitespace-nowrap">
                    Unidade
                  </span>
                  <strong className="text-slate-900 font-bold text-xs whitespace-nowrap truncate w-full">
                    {selectedUnidade || '-'}
                  </strong>
                </div>

                {/* FASE (col-span-2) */}
                <div className="col-span-2 bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.6)] flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-slate-400 font-medium mb-0.5 whitespace-nowrap">
                    Fase
                  </span>
                  <strong className="text-slate-700 font-bold text-xs whitespace-nowrap truncate w-full">
                    {fase || '-'}
                  </strong>
                </div>

                {/* TIPOLOGIA (col-span-6) */}
                <div className="col-span-6 bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.6)] flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-slate-400 font-medium mb-0.5 whitespace-nowrap">
                    Tipologia
                  </span>
                  <strong className="text-slate-700 font-bold text-xs whitespace-nowrap truncate w-full" title={tipologia}>
                    {tipologia || '-'}
                  </strong>
                </div>
              </div>

              {/* LINHA 2 (col-span-2 / col-span-2 / col-span-4 / col-span-4) */}
              <div className="grid grid-cols-12 gap-2 text-xs w-full">
                {/* ÁREA PRIVATIVA (col-span-2) */}
                <div className="col-span-2 bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.6)] flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-slate-400 font-medium mb-0.5 whitespace-nowrap">
                    Área Privativa
                  </span>
                  <strong className="text-slate-700 font-bold text-xs whitespace-nowrap truncate w-full">
                    {areaPriv}
                  </strong>
                </div>

                {/* QUINTAL (col-span-2) */}
                <div className="col-span-2 bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.6)] flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-slate-400 font-medium mb-0.5 whitespace-nowrap">
                    Quintal
                  </span>
                  <strong className="text-slate-700 font-bold text-xs whitespace-nowrap truncate w-full">
                    {areaQuintal}
                  </strong>
                </div>

                {/* PREÇO DE TABELA (col-span-4) */}
                <div className="col-span-4 bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.6)] flex flex-col items-center justify-center text-center min-w-0">
                  <span className="block text-[9px] text-slate-400 font-medium mb-0.5 whitespace-nowrap">
                    Preço de Tabela
                  </span>
                  <strong className="text-slate-900 font-bold text-xs whitespace-nowrap truncate w-full">
                    {fmt(precoTabelaOriginal)}
                  </strong>
                </div>

                {/* AVALIAÇÃO BANCÁRIA (col-span-4) */}
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

            {/* GRID PRINCIPAL: 2 COLUNAS DE BLOCOS */}
            <div className="grid grid-cols-2 gap-3.5 items-stretch">
              
              {/* COLUNA ESQUERDA: BLOCO 1 & BLOCO 4 */}
              <div className="flex flex-col justify-between space-y-3">
                
                {/* 1. DADOS DA APROVAÇÃO DE CRÉDITO */}
                {pdfSettings.mostrarBloco1 && (
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-morar-600" />
                    1. Dados da Aprovação de Crédito
                  </h3>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-[rgba(248,250,252,0.7)] p-2.5 rounded-lg border border-slate-100 space-y-1">
                      <span className="text-[9px] font-bold uppercase text-slate-400 block border-b border-[rgba(226,232,240,0.6)] pb-0.5 mb-1 whitespace-nowrap">
                        Recursos Cliente
                      </span>
                      <div className="flex justify-between items-center py-0.5 border-b border-[rgba(226,232,240,0.4)]">
                        <span className="text-slate-600">Renda:</span>
                        <strong className="text-slate-800 font-semibold">{fmt(income)}</strong>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-[rgba(226,232,240,0.4)]">
                        <span className="text-slate-600">Subsídio:</span>
                        <strong className="text-emerald-600 font-semibold">{fmt(subsidyEfetivo)}</strong>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-[rgba(226,232,240,0.4)]">
                        <span className="text-slate-600">FGTS:</span>
                        <strong className="text-morar-600 font-semibold">{fmt(fgtsEfetivo)}</strong>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-slate-600">Desc. Ato:</span>
                        <strong className="text-emerald-600 font-semibold">{fmt(descontoAto)}</strong>
                      </div>
                    </div>

                    <div className="bg-[rgba(248,250,252,0.7)] p-2.5 rounded-lg border border-slate-100 space-y-1">
                      <span className="text-[9px] font-bold uppercase text-slate-400 block border-b border-[rgba(226,232,240,0.6)] pb-0.5 mb-1 whitespace-nowrap">
                        Operação Bancária
                      </span>
                      <div className="flex justify-between items-center py-0.5 border-b border-[rgba(226,232,240,0.4)]">
                        <span className="text-slate-600">Max Financ:</span>
                        <strong className="text-morar-600 font-bold">{fmt(maxFinanc)}</strong>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-[rgba(226,232,240,0.4)]">
                        <span className="text-slate-600">Total Negoc:</span>
                        <strong className="text-slate-800 font-semibold">{fmt(totalNegocEfetivo)}</strong>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-[rgba(226,232,240,0.4)]">
                        <span className="text-slate-600">Sinal Total:</span>
                        <strong className="text-amber-600 font-bold">{fmt(sinalTotal)}</strong>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-slate-600">Sinal + ITBI:</span>
                        <strong className="text-emerald-600 font-bold">{fmt(sinalTotal + saldoITBI)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* 4. INDICADORES DE RISCO / COMPROMETIMENTO — no Parcelamento Morar,
                    substituído pelo gráfico "Percentuais de Comprometimento" (mesma
                    lógica do quadro exibido na tela, que já cobre Mensal de Obra/Renda
                    e Sinal+Mensais+Semestrais+Chaves/Pós-Obra sobre o Imóvel). */}
                {pdfSettings.mostrarBloco4 && (isParcelamentoMorar ? (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 flex-1 flex flex-col justify-between">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                      4. Percentuais de Comprometimento
                    </h3>
                    <div style={{ height: Math.max(140, pmComprometimentoData.length * 22) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={pmComprometimentoData} layout="vertical" margin={{ top: 5, right: 42, left: 5, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" width={48} tick={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={13} isAnimationActive={false}>
                            {pmComprometimentoData.map((entry, idx) => (
                              <Cell key={`pm-comp-pdf-${idx}`} fill={entry.base === 'Renda' ? '#0284c7' : '#7c3aed'} />
                            ))}
                            <LabelList dataKey="value" formatter={(v: number) => `${v.toFixed(2)}%`} fill="#334155" fontSize={9} fontWeight="bold" position="right" offset={5} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center justify-center gap-3 text-[9.5px] font-medium text-slate-500 pt-1 border-t border-[rgba(226,232,240,0.6)]">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#7c3aed]" />% do Imóvel</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0284c7]" />% da Renda</span>
                    </div>
                  </div>
                ) : (
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 flex-1 flex flex-col justify-between overflow-visible">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    4. Indicadores de Risco / Comprometimento
                  </h3>

                  <div className="flex justify-between gap-2.5 items-stretch w-full text-[11px] flex-1 overflow-visible">
                    {/* RISCO PARCELA / RENDA */}
                    <div
                      className="bg-[rgba(248,250,252,0.7)] p-2.5 rounded-lg border border-[rgba(226,232,240,0.7)] text-center flex flex-col items-center justify-between overflow-visible"
                      style={{ width: '48.5%' }}
                    >
                      <span className="block text-[10px] font-bold text-slate-700 uppercase tracking-tight mb-1.5 text-center w-full">
                        Risco Parcela / Renda
                      </span>
                      <div style={{ width: '80px', height: '80px', margin: '0 auto', overflow: 'visible' }}>
                        {renderPrintPie(pctRiscoParcelaRenda, '#0284c7', '#cbd5e1', '#ffffff', '#1e293b')}
                      </div>
                      <div className="mt-2 pt-1.5 border-t border-[rgba(226,232,240,0.7)] w-full text-center space-y-0.5">
                        <div className="flex justify-between items-center text-[9.5px] px-1">
                          <span className="text-slate-500 font-medium">Comprometimento:</span>
                          <strong className="text-morar-700 font-bold">{pctRiscoParcelaRenda < 10 ? pctRiscoParcelaRenda.toFixed(2) : pctRiscoParcelaRenda.toFixed(1)}%</strong>
                        </div>
                        <div className="flex justify-between items-center text-[9.5px] px-1">
                          <span className="text-slate-500 font-medium">1ª Parcela:</span>
                          <span className="text-xs font-semibold text-slate-800">{fmt(valorRiscoParcela)}</span>
                        </div>
                      </div>
                    </div>

                    {/* RISCO PRÓ-SOLUTO TOTAL */}
                    <div
                      className="bg-[rgba(248,250,252,0.7)] p-2.5 rounded-lg border border-[rgba(226,232,240,0.7)] text-center flex flex-col items-center justify-between overflow-visible"
                      style={{ width: '48.5%' }}
                    >
                      <span className="block text-[10px] font-bold text-slate-700 uppercase tracking-tight mb-1.5 text-center w-full">
                        Risco Pró-Soluto Total
                      </span>
                      <div style={{ width: '80px', height: '80px', margin: '0 auto', overflow: 'visible' }}>
                        {renderPrintPie(pctRiscoProSoluto, '#4f46e5', '#cbd5e1', '#ffffff', '#1e293b')}
                      </div>
                      <div className="mt-2 pt-1.5 border-t border-[rgba(226,232,240,0.7)] w-full text-center space-y-0.5">
                        <div className="flex justify-between items-center text-[9.5px] px-1">
                          <span className="text-slate-500 font-medium">Comprometimento:</span>
                          <strong className="text-indigo-700 font-bold">{pctRiscoProSoluto < 10 ? pctRiscoProSoluto.toFixed(2) : pctRiscoProSoluto.toFixed(1)}%</strong>
                        </div>
                        <div className="flex justify-between items-center text-[9.5px] px-1">
                          <span className="text-slate-500 font-medium">Pró-Soluto Total:</span>
                          <span className="text-xs font-semibold text-slate-800">{fmt(valorRiscoProSoluto)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                ))}

              </div>

              {/* COLUNA DIREITA: BLOCO 2 & BLOCO 3 */}
              <div className="flex flex-col justify-between space-y-3">
                
                {/* 2. FLUXO DE ENTRADA C/ CONSTRUTORA */}
                {pdfSettings.mostrarBloco2 && (
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-morar-600" />
                    2. FLUXO DE ENTRADA C/ CONSTRUTORA
                  </h3>

                  {/* LINHA SUPERIOR COM 3 COLUNAS IGUAIS (ATO IMÓVEL, ITBI NO ATO, ATO PREMIADO) */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.8)] text-center flex flex-col justify-between">
                      <span className="block text-[9px] font-bold text-slate-500 uppercase mb-1 whitespace-nowrap">
                        Ato (Imóvel)
                      </span>
                      <strong className="text-slate-800 font-bold text-xs whitespace-nowrap">
                        {fmt(atoAposMensais)}
                      </strong>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.8)] text-center flex flex-col justify-between">
                      <span className="block text-[9px] font-bold text-morar-800 uppercase mb-1 whitespace-nowrap">
                        ITBI no Ato
                      </span>
                      <strong className="text-morar-900 font-bold text-xs whitespace-nowrap">
                        {fmt(atoITBIValidado)}
                      </strong>
                    </div>

                    <div className="bg-[rgba(255,251,235,0.6)] p-2 rounded-lg border border-amber-200 text-center flex flex-col justify-between">
                      <span className="block text-[9px] font-bold text-amber-800 uppercase mb-1 whitespace-nowrap">
                        Ato Premiado
                      </span>
                      <strong className="text-amber-800 font-extrabold text-xs whitespace-nowrap">
                        {fmt(descontoAto)}
                      </strong>
                    </div>
                  </div>

                  {/* LINHA INFERIOR COM 2 COLUNAS IGUAIS (50% CADA): 1ª MENSAL (30 DIAS) E 2ª MENSAL (60 DIAS) */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.8)] text-center">
                      <span className="block text-[9px] font-bold text-slate-500 uppercase mb-1 whitespace-nowrap">
                        1ª Mensal (30 Dias)
                      </span>
                      <strong className="text-slate-800 font-bold text-xs whitespace-nowrap">
                        {fmt(valParc2)}
                      </strong>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.8)] text-center">
                      <span className="block text-[9px] font-bold text-slate-500 uppercase mb-1 whitespace-nowrap">
                        2ª Mensal (60 Dias)
                      </span>
                      <strong className="text-slate-800 font-bold text-xs whitespace-nowrap">
                        {fmt(valParc3)}
                      </strong>
                    </div>
                  </div>
                </div>
                )}

                {/* 3. PARCELAMENTO MORAR (OU PARCELAMENTO PRÓ-SOLUTO / BANCO DIRETO) */}
                {pdfSettings.mostrarBloco3 && (isParcelamentoMorar ? (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 flex-1 flex flex-col justify-between">
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-morar-600" />
                        3. Parcelamento Morar
                      </h3>

                      {/* MENSAL DE OBRA */}
                      <div className="bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.8)]">
                        <div className="flex items-center justify-between text-[9.5px] mb-1">
                          <span className="font-bold text-slate-700 uppercase">Mensal de Obra</span>
                          {pmMensalObraDataInicio && <span className="text-slate-500">A partir de {pmMensalObraDataInicio}</span>}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-[10.5px] text-center">
                          <div><span className="block text-[9px] text-slate-400">Qtd</span><strong className="text-slate-900">{pmNMensaisObra}X</strong></div>
                          <div><span className="block text-[9px] text-slate-400">Valor</span><strong className="text-slate-900">{fmt(pmValorMensalObra)}</strong></div>
                          <div><span className="block text-[9px] text-slate-400">Total</span><strong className="text-slate-900">{fmt(pmValorMensalObraTotal)}</strong></div>
                        </div>
                      </div>

                      {/* INTERMEDIÁRIAS SEMESTRAIS */}
                      {pmSemestraisList.length > 0 && (
                        <div className="bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.8)] space-y-1">
                          <span className="font-bold text-slate-700 uppercase text-[9.5px]">Intermediárias Semestrais</span>
                          <div className="grid grid-cols-2 gap-1 text-[9.5px]">
                            {pmSemestraisList.map((s, idx) => (
                              <div key={idx} className="flex justify-between bg-white px-1.5 py-1 rounded border border-[rgba(226,232,240,0.6)]">
                                <span className="text-slate-500">{s.label} ({s.data}):</span>
                                <strong className="text-slate-900">{fmt(s.valor)}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* PARCELA CHAVES */}
                      {pmChavesEnabled && (
                        <div className="flex items-center justify-between bg-[rgba(255,251,235,0.6)] px-2.5 py-1.5 rounded-lg border border-amber-200 text-[10px]">
                          <span className="font-bold text-amber-800 uppercase">Parcela Chaves{pmChavesVencimento ? ` (${pmChavesVencimento})` : ''}</span>
                          <strong className="text-amber-900 font-bold">{fmt(pmValorChaves)}</strong>
                        </div>
                      )}

                      {/* PÓS-OBRA */}
                      {pmQtdParcelasPosObra > 0 && (
                        <div className="bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.8)]">
                          <div className="flex items-center justify-between text-[9.5px] mb-1">
                            <span className="font-bold text-slate-700 uppercase">Pós-Obra</span>
                            {pmPosObraDataInicio && <span className="text-slate-500">A partir de {pmPosObraDataInicio}</span>}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-[10.5px] text-center">
                            <div><span className="block text-[9px] text-slate-400">Qtd</span><strong className="text-slate-900">{pmQtdParcelasPosObra}X</strong></div>
                            <div><span className="block text-[9px] text-slate-400">Valor</span><strong className="text-slate-900">{fmt(pmValorPosObraParcela)}</strong></div>
                            <div><span className="block text-[9px] text-slate-400">Total</span><strong className="text-slate-900">{fmt(pmValorPosObraTotal)}</strong></div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* TARJA "SUBTOTAL ATÉ AS CHAVES" */}
                    <div className="flex justify-between items-center bg-morar-50 px-3 py-1.5 rounded-xl border border-morar-200 mt-2">
                      <span className="text-xs font-semibold text-slate-700">
                        Subtotal até as Chaves: <span className="text-[9.5px] font-normal text-slate-500">({pmPctSubtotalAteChaves.toFixed(1)}% do imóvel)</span>
                      </span>
                      <strong className="text-sm font-bold text-morar-700">{fmt(pmSubtotalAteChaves)}</strong>
                    </div>
                  </div>
                ) : (
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-morar-600" />
                      3. Parcelamento Pró-Soluto / Banco Direto
                    </h3>

                    <div className="flex justify-between items-center text-[10px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 mt-2">
                      <span>Amortização: <strong className="text-slate-700 font-semibold">Tabela Price</strong></span>
                      <span>Juros: <strong className="text-morar-700 font-bold">{appliedRatePct.toFixed(2)}% a.m.</strong></span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                      <div className="bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.8)] text-center">
                        <span className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Qtd. Mensais</span>
                        <strong className="text-morar-600 font-extrabold text-xs">{qtdMensais}x</strong>
                      </div>

                      <div className="bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.8)] text-center">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">1ª Parcela</span>
                        <strong className="text-slate-900 font-bold text-xs">{fmt(parcela)}</strong>
                      </div>

                      <div className="bg-slate-50 p-2 rounded-lg border border-[rgba(226,232,240,0.8)] text-center">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Última Parcela</span>
                        <strong className="text-slate-900 font-bold text-xs">{fmt(parcela)}</strong>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs pt-2">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-1 px-1 text-[11px]">
                        <span className="text-slate-500">Despesas Cartorárias & ITBI (Total {fmt(valorTotalITBI)}):</span>
                        <strong className="text-slate-800 font-semibold">{fmt(saldoITBI)}</strong>
                      </div>

                      <div className="flex justify-between items-center border-b border-slate-100 pb-1 px-1 text-[11px]">
                        <span className="text-slate-500">Pró-Soluto (Sinal Restante):</span>
                        <strong className="text-slate-900 font-bold">{fmt(proSoluto)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* TARJA "PRÓ-SOLUTO TOTAL C/ ITBI" */}
                  <div className="flex justify-between items-center bg-morar-50 px-3 py-1.5 rounded-xl border border-morar-200 mt-2">
                    <span className="text-xs font-semibold text-slate-700">Pró-Soluto Total c/ ITBI:</span>
                    <strong className="text-sm font-bold text-morar-700">{fmt(proSolutoTotalPainel)}</strong>
                  </div>
                </div>
                ))}

              </div>

            </div>

            {/* RODAPÉ / AVISO LEGAL */}
            <div className="bg-[rgba(255,251,235,0.5)] p-2.5 rounded-xl border border-amber-200 text-[9.5px] text-amber-900 leading-relaxed text-justify mt-2">
              <strong>Informações importantes:</strong> Estas informações referem-se apenas a uma simulação comercial e análise preliminar de crédito. As condições finais da operação e a efetivação dos resultados dependem de análise e aprovação formal junto ao agente financeiro e à construtora.
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
