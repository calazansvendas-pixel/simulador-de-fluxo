// Helpers compartilhados pelos modais de exportação de PDF (PdfExportModal e
// PdfExportModalMorar) para tornar a captura via html2canvas-pro robusta
// mesmo em conexões lentas ou navegadores mais carregados.

import { PdfExportSettings, PdfExportSettingsByKind } from '../types';

// Configuração do que cada ficha em PDF deve conter e apresentar, editável na
// página "Configurar Exportação de PDF" — uma por tipo de condição comercial.
export const DEFAULT_PDF_EXPORT_SETTINGS: PdfExportSettings = {
  mostrarValores: true,
  mostrarCliente: true,
  mostrarImobiliaria: true,
  mostrarDataSimulacao: true,
  mostrarBloco1: true,
  mostrarBloco2: true,
  mostrarBloco3: true,
  mostrarBloco4: true,
};

export const DEFAULT_PDF_EXPORT_SETTINGS_BY_KIND: PdfExportSettingsByKind = {
  'banco-direto': { ...DEFAULT_PDF_EXPORT_SETTINGS },
  'sinal-morar': { ...DEFAULT_PDF_EXPORT_SETTINGS },
  'parcelamento-morar': { ...DEFAULT_PDF_EXPORT_SETTINGS },
  'banco-direto-comissao-apartada': { ...DEFAULT_PDF_EXPORT_SETTINGS },
  'sinal-morar-comissao-apartada': { ...DEFAULT_PDF_EXPORT_SETTINGS },
  'simulador-simplificado': { ...DEFAULT_PDF_EXPORT_SETTINGS },
  'simulador-simplificado-comissao-apartada': { ...DEFAULT_PDF_EXPORT_SETTINGS },
};

// A configuração em si (quem pode editar o quê, por cargo) mora no banco —
// ver src/services/pdfPermissoesService.ts. Os padrões acima (tudo visível)
// são o que vale enquanto o Administrador não configurar um cargo específico.

/**
 * Espera pelo menos dois frames de animação (garante que o navegador
 * completou um ciclo de layout/pintura desde a última mutação do DOM) e, em
 * seguida, confirma que o CSS do Tailwind já está de fato aplicado no
 * elemento informado antes de liberar a captura.
 *
 * A verificação usa a cor de fundo computada do próprio elemento: todo
 * conteúdo capturado por estes modais usa a classe `bg-white`, que resulta
 * em `rgb(255, 255, 255)` quando o CSS já carregou, contra o transparente
 * padrão do navegador (`rgba(0, 0, 0, 0)`) quando ainda não. Sem essa
 * checagem, um atraso fixo (ex.: 150ms) podia não ser suficiente em
 * conexões lentas — a folha de estilos ainda não tinha sido processada a
 * tempo, e o html2canvas capturava o conteúdo "cru", sem nenhuma
 * formatação, sem lançar nenhum erro (o catch do fallback não pegava esse
 * caso, pois a captura em si tinha "sucesso").
 */
export async function waitForStyledPaint(
  element: HTMLElement,
  maxAttempts = 30,
  intervalMs = 50
): Promise<void> {
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const isUnstyled = () => {
    const bg = window.getComputedStyle(element).backgroundColor;
    return bg === '' || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';
  };

  let attempts = 0;
  while (isUnstyled() && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    attempts++;
  }
}

/**
 * Copia o CSS já carregado e aplicado no documento real como um `<style>`
 * inline dentro do documento clonado pelo html2canvas-pro.
 *
 * Internamente, o html2canvas-pro clona a árvore inteira do documento —
 * incluindo o `<link rel="stylesheet">` da build de produção — para dentro
 * de um iframe isolado, que precisa recarregar essa folha de estilos pela
 * rede antes de aplicá-la. Em conexões lentas, essa recarga podia não
 * terminar a tempo da captura, resultando num PDF sem nenhum estilo do
 * Tailwind aplicado (fundo dos cards, bordas, cores), mesmo sem nenhum erro
 * ser lançado. Passar isto como `onclone` injeta o CSS já pronto (lido do
 * documento real, que garantidamente já está com os estilos aplicados)
 * diretamente no clone, de forma síncrona — sem depender de nenhuma nova
 * busca pela rede.
 */
export function inlineLiveStylesheets(clonedDoc: Document): void {
  const cssText = Array.from(document.styleSheets)
    .map(sheet => {
      try {
        return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
      } catch {
        return '';
      }
    })
    .join('\n');
  if (!cssText) return;
  const styleEl = clonedDoc.createElement('style');
  styleEl.textContent = cssText;
  clonedDoc.head.appendChild(styleEl);
}

/**
 * Amostra o canvas capturado em busca de QUALQUER pixel cromático (ou seja,
 * não cinza — R, G e B claramente diferentes entre si). Toda a paleta do
 * Tailwind usada nas fichas (azul, âmbar, verde, roxo etc.) é cromática; uma
 * captura "crua" (sem nenhum CSS aplicado) é só texto preto sobre fundo
 * branco, portanto puramente em tons de cinza. Serve como sinal barato de
 * que a captura saiu com o estilo aplicado, sem precisar inspecionar
 * pixels específicos (cuja posição varia conforme o conteúdo).
 */
function canvasLooksStyled(canvas: HTMLCanvasElement): boolean {
  const sampleSize = 48;
  const sampler = document.createElement('canvas');
  sampler.width = sampleSize;
  sampler.height = sampleSize;
  const ctx = sampler.getContext('2d');
  if (!ctx) return true;
  ctx.drawImage(canvas, 0, 0, sampleSize, sampleSize);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
  } catch {
    return true;
  }
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (Math.abs(r - g) > 12 || Math.abs(g - b) > 12 || Math.abs(r - b) > 12) {
      return true;
    }
  }
  return false;
}

/**
 * Executa `captureFn` (a chamada ao html2canvas) e, se o canvas resultante
 * não tiver nenhum pixel colorido (indício de uma captura "crua", sem CSS
 * aplicado — visto em conexões lentas, mesmo sem nenhum erro lançado),
 * tenta de novo algumas vezes antes de desistir e devolver o último
 * resultado obtido.
 */
export async function captureStyledCanvas(
  element: HTMLElement,
  captureFn: () => Promise<HTMLCanvasElement>,
  maxAttempts = 3
): Promise<HTMLCanvasElement> {
  let lastCanvas: HTMLCanvasElement | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await waitForStyledPaint(element);
      await new Promise(resolve => setTimeout(resolve, 250 * attempt));
    }
    lastCanvas = await captureFn();
    if (canvasLooksStyled(lastCanvas)) {
      return lastCanvas;
    }
  }
  return lastCanvas as HTMLCanvasElement;
}
