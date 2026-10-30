import { CommercialCondition, Product, SimulationData } from '../types';
import { parseCurrency } from './formatters';

export interface FinancialParams {
  precoTabela: number;
  avaliacaoBanco: number;
  renda: number;
  subsidio?: number;
  fgts?: number;
  financiamentoAprovado?: number;
  ltvMaximo?: number; // Ex: 0.80 para 80%
  itbiRegistro: number;
  percentualRiscoImovel: number; // Ex: 20 para 20%
  percentualRiscoRenda?: number; // Padrão 35%
  prazoMeses: number; // Ex: 60
  taxaJurosMensal?: number; // Taxa de juros ao mês em % (ex: 1.9 para 1.9%)
  atoManual?: number;
  aportesExtras?: number;
  sinalMinimo?: number;
  // % do Ato Premiado (0 a 1). Vem da política do empreendimento. Ausente → 10%.
  atoPremiadoPct?: number;
}

export interface SimulationResult {
  maxFinanciamento: number;
  totalNegociado: number;
  descontoAtoPremiado: number;
  sinalTotal: number;
  totalComITBI: number;
  tetoImovel: number;
  tetoRenda: number;
  proSolutoMaximo: number;
  atoSugerido: number;
  atoEfetivo: number;
  proSolutoRestante: number;
  proSolutoTotal: number;
  baseParcelar: number;
  taxaBancaria: number;
  baseLiquida: number;
  valorParcela: number;
  comprometimentoRenda: number;
  riscoImovelEfetivo: number;
  conferenciaValida: boolean;
}

/**
 * Calcula o Valor Presente (PV) dado PMT, taxa decimal e prazo
 */
export function calcularValorPresente(pmt: number, taxa: number, n: number): number {
  // `n` pode legitimamente ser 0 (nenhuma parcela) — nesse caso o Valor
  // Presente é 0, não 1 parcela. `n || 1` tratava 0 como "ausente" e caía num
  // valor de 1 parcela, mascarando um prazo genuinamente zerado.
  if (taxa <= 0) return (pmt || 0) * Math.max(0, n || 0);
  return (pmt || 0) * ((1 - Math.pow(1 + taxa, -n)) / taxa);
}

/**
 * Calcula a Parcela Mensal (PMT) pela Tabela Price dada PV, taxa decimal e prazo
 */
export function calcularPricePMT(pv: number, taxa: number, n: number): number {
  if (taxa <= 0) return (pv || 0) / (n || 1);
  return ((pv || 0) * taxa) / (1 - Math.pow(1 + taxa, -n));
}

export function calculatePresentValue(ratePerMonthPct: number, numInstallments: number, monthlyPayment: number): number {
  return calcularValorPresente(monthlyPayment || 0, (ratePerMonthPct || 0) / 100, numInstallments || 1);
}

export function calcularParcelaPrice(taxaAoMesPct: number, numParcelas: number, valorPresente: number): number {
  return calcularPricePMT(valorPresente || 0, (taxaAoMesPct || 0) / 100, numParcelas || 1);
}

export function calculatePricePMT(principal: number, ratePerMonthPct: number, numInstallments: number): number {
  return calcularPricePMT(principal || 0, (ratePerMonthPct || 0) / 100, numInstallments || 1);
}

/**
 * Tipo de tela/motor de cálculo de uma condição comercial, inferido do nome
 * (mesma convenção usada em todo o app: sem um campo explícito de "tipo",
 * o nome da condição é que decide qual tela e qual motor de cálculo se
 * aplicam). "Parcelamento Morar" é verificado ANTES de "Sinal c/ Morar" —
 * seu nome contém "morar", mas usa a tela/motor de "Sinal c/ Banco Direto"
 * com o Bloco 3 substituído, não a tela da Ficha Morar.
 */
export type ConditionKind = 'sinal-morar' | 'sinal-morar-comissao-apartada' | 'parcelamento-morar' | 'banco-direto' | 'banco-direto-comissao-apartada';

export function getConditionKind(condName: string | undefined | null): ConditionKind {
  const lower = (condName || '').toLowerCase();
  if (lower.includes('parcelamento') && lower.includes('morar')) return 'parcelamento-morar';
  const isMorarLike = lower.includes('morar') || lower.includes('incc') || lower.includes('obra') || lower.includes('ipca');
  // Variante do Sinal c/ Morar com a comissão separada do fluxo de Ato —
  // reconhecida pelo nome conter também "comiss" (ex.: "Sinal c/ Morar
  // (Comissão Apartada)"). Verificada ANTES de "sinal-morar" simples.
  if (isMorarLike && lower.includes('comiss')) return 'sinal-morar-comissao-apartada';
  if (isMorarLike) return 'sinal-morar';
  // Variante do Sinal c/ Banco Direto com a comissão separada do fluxo de
  // Ato/Pró-Soluto (ver comissaoApartadaPct em types.ts) — reconhecida pelo
  // nome conter "comiss" (ex.: "Sinal c/ Banco Direto (Comissão Apartada)").
  if (lower.includes('comiss')) return 'banco-direto-comissao-apartada';
  return 'banco-direto';
}

export function isParcelamentoMorarCondition(condName: string | undefined | null): boolean {
  return getConditionKind(condName) === 'parcelamento-morar';
}

export function isComissaoApartadaCondition(condName: string | undefined | null): boolean {
  return getConditionKind(condName) === 'banco-direto-comissao-apartada';
}

export function isMorarComissaoApartadaCondition(condName: string | undefined | null): boolean {
  return getConditionKind(condName) === 'sinal-morar-comissao-apartada';
}

/**
 * Garante que o produto possui a estrutura de condições comerciais necessárias
 */
export function ensureProductConditions(prod: Product): Product {
  if (!prod) return prod;
  if (!prod.conditions || prod.conditions.length === 0) {
    const opts = (prod.options && prod.options.length > 0)
      ? prod.options
      : ['Sinal c/ Banco Direto', 'Sinal c/ Morar'];

    prod.conditions = opts.map((optName, idx) => {
      const isMorar = getConditionKind(optName) === 'sinal-morar';
      return {
        id: `cond_${prod.id}_${idx + 1}`,
        name: optName,
        numParcelas: isMorar ? 60 : (prod.numParcelas || 60),
        sinalMinimo: prod.sinalMinimo || 'R$ 2.000,00',
        riscoRendaPct: prod.riscoRendaPct !== undefined ? prod.riscoRendaPct : 30,
        riscoImovelPct: prod.riscoImovelPct !== undefined ? prod.riscoImovelPct : 20,
        mesesTabela1: 36,
        taxaJuros1: 0.0,
        mesesTabela2: 72,
        taxaJuros2: 1.9,
        // Padrões específicos para Sinal c/ Morar
        mesesObra: isMorar ? 33 : 33,
        mesesPos: isMorar ? 27 : 27,
        percMaxProSolutoGlobal: isMorar ? 17.0 : (prod.riscoImovelPct || 20.0),
        percMaxPosObra: isMorar ? 8.0 : 8.0,
        riscoPosPct: isMorar ? 8.0 : 8.0,
        globalSerie1Pct: 30.0,
        globalSerie2Pct: 25.0,
        globalSerie3Pct: 20.0,
        globalSerie4Pct: 15.0,
        globalSerie5Pct: 10.0,
        globalSerie6Pct: 5.0,
        serie1Meses: 12,
        serie2Meses: 12,
        serie3Meses: 12,
        serie4Meses: 12,
        serie5Meses: 12,
        serie6Meses: 12,
        torresFase2: [],
        policy: prod.policy || `POLÍTICA COMERCIAL SINAL ${optName.toUpperCase()}:\n- Comissão padrão: 4% apartada na proposta.\n- Entrada mínima conforme negociação.\n- Sujeito à análise financeira.`
      };
    });
  }
  // Garante que condições já existentes (produtos antigos) também tenham o campo,
  // sem sobrescrever política de 2ª Fase já configurada.
  prod.conditions = prod.conditions.map(c => (
    c.torresFase2 === undefined ? { ...c, torresFase2: [] } : c
  ));
  // Garante os limites de parcelas da Comissão Apartada em condições
  // criadas antes desse campo existir — sem sobrescrever um limite já
  // configurado pelo gestor em Políticas & Empreendimentos.
  prod.conditions = prod.conditions.map(c => ({
    ...c,
    comissaoApartadaParcelasMin: c.comissaoApartadaParcelasMin ?? 1,
    comissaoApartadaParcelasMax: c.comissaoApartadaParcelasMax ?? 6
  }));
  return prod;
}

/**
 * Resolve a condição comercial efetiva para uma torre específica, aplicando os
 * overrides de fase2Params quando a torre estiver marcada como 2ª Fase
 * (torresFase2). Torres não listadas em torresFase2 usam a condição base (1ª
 * Fase) sem alterações. Qualquer campo de fase2Params que não esteja definido
 * mantém o valor da condição base (merge raso).
 */
export function resolveConditionForTorre(
  cond: CommercialCondition | null | undefined,
  torre: string | null | undefined
): CommercialCondition | null {
  if (!cond) return null;
  const isFase2 = !!torre && Array.isArray(cond.torresFase2) && cond.torresFase2.includes(torre);
  if (!isFase2 || !cond.fase2Params) return cond;
  return { ...cond, ...cond.fase2Params };
}

/**
 * Padrão histórico do percentual do Ato Premiado (10%). Quando a política do
 * empreendimento não define `atoPremiadoPct`, cai neste valor — assim simulações
 * antigas continuam batendo com o que era antes de esse campo ser editável.
 */
export const ATO_PREMIADO_PCT_PADRAO = 0.10;

/**
 * Regra Oficial de Desconto do Ato Premiado Morar (percentual configurável por
 * condição comercial):
 * - Ato >= 50.000: Desconto fixo de R$ (pct * 50.000) — teto histórico de R$ 5.000 quando pct = 10%
 * - Ato >= 5.000 e < 50.000: Desconto = Ato * pct
 * - Ato < 5.000: Desconto de R$ 0,00
 * - pct = 0 (política zerada): sempre R$ 0,00
 */
export function calcularDescontoAtoPremiado(valorAto: number, pct: number = ATO_PREMIADO_PCT_PADRAO): number {
  const ato = Math.max(0, valorAto || 0);
  const p = Math.max(0, pct || 0);
  if (p === 0) return 0;
  const tetoValor = Math.round(50000 * p * 100) / 100;
  if (ato >= 50000) {
    return tetoValor;
  }
  if (ato >= 5000) {
    return Math.round(ato * p * 100) / 100;
  }
  return 0;
}

/**
 * Dado um Ato (Imóvel) BRUTO já fixo (o total efetivamente cobrado do cliente
 * no momento do Ato — ex.: um valor digitado manualmente pelo corretor),
 * resolve o desconto do Ato Premiado e a comissão apartada de forma
 * consistente: a comissão é isolada do bruto ANTES de aplicar o fator do
 * desconto — a base do desconto é sempre o Ato líquido da comissão (o que
 * efetivamente fica com a construtora), nunca o bruto. Mesma regra usada
 * internamente em `calculateMorarFlowEngine` (ver `calcularAtoMinimoPorPreco`);
 * exportada à parte para telas que precisam resolver a comissão de um Ato já
 * digitado manualmente sem rodar o motor inteiro de novo.
 *
 * Sem comissão apartada (isComissaoApartada=false ou pctComissaoApartada<=0),
 * `net` é sempre igual a `atoGross` e o resultado é idêntico a chamar
 * calcularDescontoAtoPremiado diretamente.
 */
export function resolverDescontoEComissaoApartada(
  atoGross: number,
  isAtoPremiadoEnabled: boolean,
  pctAtoPremiado: number,
  isComissaoApartada: boolean,
  pctComissaoApartada: number,
  precoTabela: number
): { desconto: number; comissao: number; net: number } {
  const gross = Math.max(0, atoGross || 0);
  const pct = Math.max(0, pctAtoPremiado || 0);
  const pctComissaoEfetiva = (isComissaoApartada && pctComissaoApartada > 0) ? pctComissaoApartada : 0;

  if (!isAtoPremiadoEnabled || pct === 0) {
    const comissao = pctComissaoEfetiva > 0 ? Math.max(0, Math.round(precoTabela * pctComissaoEfetiva * 100) / 100) : 0;
    return { desconto: 0, comissao, net: Math.max(0, Math.round((gross - comissao) * 100) / 100) };
  }
  if (pctComissaoEfetiva === 0) {
    return { desconto: calcularDescontoAtoPremiado(gross, pct), comissao: 0, net: gross };
  }

  // Hipótese 1 (Ato líquido >= 50.000): desconto fixo, não depende do líquido.
  const descontoTeto = Math.round(50000 * pct * 100) / 100;
  const comissaoTeto = Math.max(0, Math.round((precoTabela - descontoTeto) * pctComissaoEfetiva * 100) / 100);
  const netTeto = gross - comissaoTeto;
  if (netTeto >= 50000) {
    return { desconto: descontoTeto, comissao: comissaoTeto, net: Math.round(netTeto * 100) / 100 };
  }

  // Hipótese 2 (5.000 <= Ato líquido < 50.000): net = (gross - preço*pctComissão) / (1 + pct*pctComissão)
  const denomNet = 1 + pct * pctComissaoEfetiva;
  const netAnalitico = denomNet > 0 ? (gross - precoTabela * pctComissaoEfetiva) / denomNet : 0;
  if (netAnalitico >= 5000 && netAnalitico < 50000) {
    let net = Math.round(netAnalitico * 100) / 100;
    let desconto = Math.round(net * pct * 100) / 100;
    let comissao = Math.max(0, Math.round((precoTabela - desconto) * pctComissaoEfetiva * 100) / 100);
    // Ajuste de centavos fino para convergência perfeita
    net = Math.round((gross - comissao) * 100) / 100;
    desconto = Math.round(net * pct * 100) / 100;
    comissao = Math.max(0, Math.round((precoTabela - desconto) * pctComissaoEfetiva * 100) / 100);
    net = Math.round((gross - comissao) * 100) / 100;
    return { desconto, comissao, net };
  }

  // Hipótese 3 (Ato líquido < 5.000): sem desconto.
  const comissaoSemDesconto = Math.max(0, Math.round(precoTabela * pctComissaoEfetiva * 100) / 100);
  return { desconto: 0, comissao: comissaoSemDesconto, net: Math.max(0, Math.round((gross - comissaoSemDesconto) * 100) / 100) };
}

/**
 * Resolve o ponto fixo ato* = base - calcularDescontoAtoPremiado(ato*), onde
 * "base" é o valor disponível para o Ato antes do desconto (ex: preço - subsídio).
 * Necessário porque o desconto do Ato Premiado é escalonado pelo próprio valor do
 * Ato, então não dá para simplesmente subtrair um desconto fixo de "base". O
 * percentual do Ato Premiado é configurável por condição comercial.
 */
export function resolverTetoAtoComDesconto(base: number, isAtoPremiadoEnabled: boolean, pct: number = ATO_PREMIADO_PCT_PADRAO): number {
  const baseValida = Math.max(0, base || 0);
  const p = Math.max(0, pct || 0);
  if (!isAtoPremiadoEnabled || p === 0) {
    return Math.round(baseValida * 100) / 100;
  }
  const tetoValor = 50000 * p; // desconto quando ato >= 50k
  // Hipótese: ato* >= 50.000 (desconto fixo)
  const tentativaFlat = baseValida - tetoValor;
  if (tentativaFlat >= 50000) {
    return Math.round(tentativaFlat * 100) / 100;
  }
  // Hipótese: 5.000 <= ato* < 50.000 (desconto de pct sobre o próprio Ato)
  const tentativaPct = baseValida / (1 + p);
  if (tentativaPct >= 5000 && tentativaPct < 50000) {
    return Math.round(tentativaPct * 100) / 100;
  }
  // Hipótese: ato* < 5.000 (sem desconto)
  return Math.max(0, Math.round(baseValida * 100) / 100);
}

/**
 * Mesmo ponto fixo de resolverTetoAtoComDesconto, mas também descontando a
 * Comissão Apartada quando a condição comercial for essa: ato* = base -
 * calcularDescontoAtoPremiado(ato*) - comissao(ato*), onde comissao(ato*) =
 * (precoTabela - calcularDescontoAtoPremiado(ato*)) * pctComissaoApartada —
 * a MESMA fórmula usada no restante do fluxo (ver comissaoApartadaValor em
 * DetailsView.tsx). Sem comissão apartada, cai exatamente no comportamento de
 * resolverTetoAtoComDesconto (a malha converge em 1 volta, com comissaoAtual = 0).
 * Usado nos pontos que hoje resolvem "o Ato que quita tudo de uma vez" (botão
 * "Pgtº à vista" e o teto de um Ato digitado manualmente) — sem isso, esses
 * caminhos deixavam a comissão embutida no Ato em vez de descontada dele.
 */
export function resolverTetoAtoComDescontoEComissao(
  baseSemComissao: number,
  isAtoPremiadoEnabled: boolean,
  pctAtoPremiado: number,
  isComissaoApartada: boolean,
  pctComissaoApartada: number,
  precoTabela: number
): number {
  if (!isComissaoApartada || !(pctComissaoApartada > 0)) {
    return resolverTetoAtoComDesconto(baseSemComissao, isAtoPremiadoEnabled, pctAtoPremiado);
  }

  let comissaoAtual = 0;
  let resultado = 0;
  for (let i = 0; i < 100; i++) {
    const baseAjustada = Math.max(0, baseSemComissao - comissaoAtual);
    resultado = resolverTetoAtoComDesconto(baseAjustada, isAtoPremiadoEnabled, pctAtoPremiado);
    const descontoAtoAtual = isAtoPremiadoEnabled ? calcularDescontoAtoPremiado(resultado, pctAtoPremiado) : 0;
    const novaComissao = Math.max(0, Math.round((precoTabela - descontoAtoAtual) * pctComissaoApartada * 100) / 100);
    if (Math.abs(novaComissao - comissaoAtual) < 0.0001) {
      comissaoAtual = novaComissao;
      break;
    }
    comissaoAtual = novaComissao;
  }

  return resultado;
}

export interface MorarMonthsDecomposition {
  obra: number[];
  pos: number[];
}

/**
 * Decompõe os meses de Obra e Pós-Obra em baldes contínuos, com transbordo
 * (spillover) de um balde para o próximo. Cada balde tem sua PRÓPRIA capacidade
 * de meses (baldeCapacidades, padrão 12 cada, configurável por balde na política
 * de crédito) — não é um tamanho fixo de 12 para todos. Um balde dividido pela
 * fronteira Obra/Pós-Obra continua sendo o MESMO balde (mesmo percentual) nas
 * duas fases; só muda quantos desses meses caem em cada fase.
 */
export function decomposeMorarMonths(
  mesesObra: number,
  mesesPos: number,
  baldeCapacidades?: number[]
): MorarMonthsDecomposition {
  const mObra = Math.max(0, mesesObra || 0);
  const mPos = Math.max(0, mesesPos || 0);
  const capacidades = [0, 1, 2, 3, 4, 5].map(idx => {
    const cap = baldeCapacidades?.[idx];
    return cap && cap > 0 ? cap : 12;
  });

  const obra = [0, 0, 0, 0, 0, 0];
  const pos = [0, 0, 0, 0, 0, 0];

  let remainingObra = mObra;
  let currentBucket = 0;

  // Fill Obra buckets
  while (remainingObra > 0 && currentBucket < 6) {
    const toFill = Math.min(capacidades[currentBucket], remainingObra);
    obra[currentBucket] = toFill;
    remainingObra -= toFill;
    if (obra[currentBucket] === capacidades[currentBucket]) {
      currentBucket++;
    }
  }

  // Fill Pos buckets, starting at the current bucket (which might be partially filled by Obra)
  let remainingPos = mPos;
  while (remainingPos > 0 && currentBucket < 6) {
    const spaceInBucket = capacidades[currentBucket] - obra[currentBucket];
    const toFill = Math.min(spaceInBucket, remainingPos);
    pos[currentBucket] = toFill;
    remainingPos -= toFill;
    if (pos[currentBucket] + obra[currentBucket] === capacidades[currentBucket]) {
      currentBucket++;
    }
  }

  return { obra, pos };
}

/**
 * Reparte `totalDisponivel` entre N itens, proporcional a `pesos[i]`, mas sem
 * nenhum item passar do seu teto em `tetos[i]` (dinheiro, não percentual — ex:
 * teto de renda de um balde já multiplicado pelos seus meses). Usa o algoritmo
 * clássico de "water-filling": a cada rodada, calcula a fatia proporcional de
 * cada item ainda livre; quem passaria do próprio teto é travado nesse teto e
 * sai da rodada seguinte, e o que sobra é redistribuído proporcionalmente entre
 * os itens que ainda estão livres — mantendo a proporção original entre eles.
 */
function distribuirComTetos(pesos: number[], tetos: number[], totalDisponivel: number): number[] {
  const n = pesos.length;
  const resultado = new Array(n).fill(0);
  const livre = new Array(n).fill(true);
  let restante = Math.max(0, totalDisponivel);

  for (let rodada = 0; rodada < n; rodada++) {
    const pesoLivreTotal = pesos.reduce((s, w, i) => (livre[i] ? s + (w || 0) : s), 0);
    if (pesoLivreTotal <= 0 || restante <= 0.005) break;

    let travouAlgum = false;
    for (let i = 0; i < n; i++) {
      if (!livre[i]) continue;
      const fatia = ((pesos[i] || 0) / pesoLivreTotal) * restante;
      if (fatia > tetos[i] + 0.005) {
        resultado[i] = Math.max(0, tetos[i]);
        livre[i] = false;
        restante -= resultado[i];
        travouAlgum = true;
      }
    }

    if (!travouAlgum) {
      const pesoFinal = pesos.reduce((s, w, i) => (livre[i] ? s + (w || 0) : s), 0);
      if (pesoFinal > 0) {
        for (let i = 0; i < n; i++) {
          if (livre[i]) resultado[i] = ((pesos[i] || 0) / pesoFinal) * restante;
        }
      }
      break;
    }
  }

  return resultado;
}

export interface MorarEngineParams {
  precoTabela: number;
  avaliacaoBanco?: number;
  itbiRegistro: number;
  renda: number;
  financiamento?: number;
  subsidio?: number;
  fgts?: number;
  percentualRiscoGeral?: number; // Ex: 17% da Base (Pró-Soluto Global / Max Fluxo)
  percentualRiscoPos?: number; // Ex: 8% da Base (Teto Pós-Obra Global)
  percentualRiscoObra?: number;
  mesesObra?: number; // Ex: 33
  mesesPos?: number; // Ex: 27
  globalSeriesPct?: [number, number, number, number, number, number];
  serieMesesCapacidades?: [number, number, number, number, number, number]; // Meses de cada balde (padrão 12 cada)
  sinalLiquidoTotal?: number;
  sinalMinimo?: number;
  atoITBI?: number;
  isAtoPremiadoEnabled?: boolean;
  isAtoZerado?: boolean;
  atoManual?: number;
  atoPremiado?: number; // Compatibilidade retroativa
  // % do Ato Premiado (0 a 1). Vem da política do empreendimento; quando ausente,
  // cai no padrão histórico de 10% (ATO_PREMIADO_PCT_PADRAO).
  atoPremiadoPct?: number;
  // Comissão Apartada: quando ativa, o desconto do Ato Premiado (e os tetos de
  // risco que dele derivam) passam a ser calculados sobre o Ato já líquido da
  // comissão — nunca sobre o valor bruto que ainda embute a comissão. Ver
  // `calcularAtoMinimoPorPreco`/`calcularAtoMinimoDaPolitica` mais abaixo.
  isComissaoApartada?: boolean;
  pctComissaoApartada?: number;
}

export interface MorarSerieResult {
  serieIndex: number;
  qtd: number;
  pctMae: number;
  capacidadeRenda: number;
  rateioFluxoGlobal: number;
  pesoProporcionalBalde?: number;
  travaTetoPos?: number;
  parcelaBrutaFinal: number;
  parcelaLiquida: number;
  subtotalLiquido: number;
}

export interface MorarEngineResult {
  baseCalculo: number;
  baseCalculoComITBI: number;
  maxRiscoObra: number;
  maxRiscoPos: number;
  totalProSolutoMaximo: number;
  maxFluxoGeral: number;
  tetoPosGlobal: number;
  parcelaMensalITBI: number;
  // ITBI no Ato sugerido pelo motor — igual ao informado em params.atoITBI,
  // exceto quando o valor plano de ITBI/mês precisou ceder espaço ao teto de
  // renda de algum balde (parcela + ITBI); nesse caso vem MAIOR que o
  // informado, com o excedente já embutido. Nunca vem menor — o motor só
  // eleva, nunca reduz o que o corretor digitou em "ITBI no Ato".
  itbiAtoSugerido: number;
  mesesTotaisGeral: number;
  obraSeries: MorarSerieResult[];
  posSeries: MorarSerieResult[];
  subtotalObraLiquido: number;
  subtotalPosLiquido: number;
  totalObraComITBI: number;
  totalPosComITBI: number;
  atoResidual: number;
  atoPremiado: number;
  atoBruto: number;
  totalProSolutoGerado: number;
  sinalLiquidoTotal: number;
  distribuidoTotal: number;
  totalComITBI: number;
  // Comissão Apartada resolvida internamente (0 quando a condição não é de
  // comissão apartada) — ver isComissaoApartada/pctComissaoApartada em
  // MorarEngineParams. O Ato (Imóvel) líquido da corretagem = atoResidual -
  // comissaoApartadaValor.
  comissaoApartadaValor: number;
}

/**
 * Motor de cálculo completo da condição Sinal c/ Morar - Linha do Tempo Contínua e Distribuição Oficial das Séries (Fórmula Exata do Excel)
 */
export function calculateMorarFlowEngine(params: MorarEngineParams): MorarEngineResult {
  const precoTabela = params.precoTabela || 0;
  const avaliacaoBanco = params.avaliacaoBanco && params.avaliacaoBanco > 0 ? params.avaliacaoBanco : precoTabela;
  const precoBase = Math.max(precoTabela, avaliacaoBanco);
  const itbiRegistro = params.itbiRegistro || 0;
  const renda = params.renda || 0;
  const financiamento = params.financiamento || 0;
  const subsidio = params.subsidio || 0;
  const fgts = params.fgts || 0;
  const mesesObra = params.mesesObra !== undefined ? params.mesesObra : 33;
  const mesesPos = params.mesesPos !== undefined ? params.mesesPos : 27;
  const isAtoPremiadoEnabled = params.isAtoPremiadoEnabled !== undefined ? params.isAtoPremiadoEnabled : true;
  const isAtoZerado = params.isAtoZerado === true;
  // Percentual do Ato Premiado desta condição comercial. Quando a política estiver
  // zerada (0%), o desconto do Ato é forçado a R$ 0,00 mesmo com o Ato Premiado
  // "ligado" — comporta-se equivalente a desligar o Ato Premiado para efeito de
  // cálculo. Quando ausente, cai no padrão histórico de 10%.
  const pctAtoPremiado = Math.max(0, params.atoPremiadoPct !== undefined ? params.atoPremiadoPct : ATO_PREMIADO_PCT_PADRAO);
  const isAtoPremiadoAtivoEfetivo = isAtoPremiadoEnabled && pctAtoPremiado > 0;

  // Comissão Apartada: quando ativa, o desconto do Ato Premiado nunca pode
  // incidir sobre a comissão — a base do desconto é estritamente o Ato da
  // Construtora (líquido da comissão). Ver calcularAtoMinimoPorPreco e
  // calcularAtoMinimoDaPolitica mais abaixo, onde essa regra é aplicada.
  const pctComissaoApartada = Math.max(0, params.pctComissaoApartada || 0);
  const isComissaoApartadaAtiva = params.isComissaoApartada === true && pctComissaoApartada > 0;
  // Percentual efetivo de comissão a usar nas fórmulas abaixo — sempre 0 fora
  // da condição de comissão apartada, mesmo que pctComissaoApartada tenha
  // chegado preenchido por engano (ex.: condição salva com o campo setado,
  // mas isComissaoApartada não marcado nesta chamada).
  const pctComissaoEfetiva = isComissaoApartadaAtiva ? pctComissaoApartada : 0;

  // Dado um Ato (Imóvel) BRUTO já fixo (o total efetivamente cobrado do
  // cliente no momento do Ato — usado, por exemplo, quando o Ato é digitado
  // manualmente), resolve o desconto do Ato Premiado e a comissão apartada de
  // forma consistente: a comissão é isolada do bruto ANTES de aplicar o fator
  // do desconto — a base do desconto é sempre o Ato líquido da comissão.
  // Reaproveita a mesma função exportada `resolverDescontoEComissaoApartada`
  // (única fonte de verdade dessa conta, também usada fora do motor).
  const resolverComissaoDadoAtoGross = (grossFixo: number): { desconto: number; comissao: number; net: number } => {
    return resolverDescontoEComissaoApartada(
      grossFixo,
      isAtoPremiadoAtivoEfetivo,
      pctAtoPremiado,
      isComissaoApartadaAtiva,
      pctComissaoEfetiva,
      precoTabela
    );
  };

  // 1. Fatiamento do Tempo (Cascata Contínua de Baldes, cada um com sua própria capacidade de meses):
  const { obra: mObra, pos: mPos } = decomposeMorarMonths(mesesObra, mesesPos, params.serieMesesCapacidades);
  const mesesTotaisGeral = mObra.reduce((a, b) => a + b, 0) + mPos.reduce((a, b) => a + b, 0);

  // Capacidade máxima de Pró-Soluto que a RENDA do cliente sustenta, independente
  // do preço do imóvel: cada balde de série trava sua parcela mensal em pctAno%
  // da renda (mesmo teto usado na distribuição final das séries, mais abaixo) —
  // a soma desses tetos, por quantos meses cada balde dura, é o máximo que
  // aquela fase consegue absorver, mesmo que o risco por PREÇO permitisse mais.
  // Sem levar isso em conta na hora de decidir o Ato, um Pró-Soluto "sugerido"
  // que a renda não sustenta fica só parcialmente distribuído — o resto some
  // (não vira parcela, que fica travada no teto de renda, nem vira Ato).
  const capacidadeRendaPorBalde = (idx: number): number => {
    const pctAno = (params.globalSeriesPct && params.globalSeriesPct[idx]) || [30, 25, 20, 15, 10, 5][idx] || 0;
    return renda > 0 ? Math.round((renda * (pctAno / 100)) * 100) / 100 : Infinity;
  };
  const capacidadeRendaObra = mObra.reduce((soma, qtd, idx) => soma + capacidadeRendaPorBalde(idx) * (qtd || 0), 0);
  const capacidadeRendaPos = mPos.reduce((soma, qtd, idx) => soma + capacidadeRendaPorBalde(idx) * (qtd || 0), 0);

  // ITBI Mensal = ITBI Restante a parcelar / (meses Obra + meses Pós) — mas nunca
  // pode furar o teto de renda de nenhum balde quando somado à parcela do
  // Pró-Soluto daquele balde (o MESMO teto usado na distribuição das séries mais
  // abaixo: parcela + ITBI ≤ pctAno% da renda — ver capacidadeRendaPorBalde acima
  // e o comentário de capRendaMesPorBalde mais abaixo). Antes, o valor plano
  // (itbiRestante / mesesTotaisGeral) não respeitava nenhum teto: ao reduzir a
  // quantidade de meses (aumentando essa parcela), ela furava o risco de renda
  // sem aviso, e o excedente não ia pra lugar nenhum — nem virava parcela (a
  // parcela do Pró-Soluto, capada, só ia a zero), nem virava Ato. Agora, quando
  // o valor plano sozinho já passa do teto de algum balde (mesmo com a parcela
  // do Pró-Soluto daquele balde já zerada), o excedente migra para o ITBI no
  // Ato (itbiAtoSugerido) — nunca para o Ato (Imóvel), que é uma conta à parte.
  // Sem meses nenhum pra parcelar (Obra e Pós-Obra ambos zerados), o ITBI
  // inteiro vai para o Ato. Converge em poucas voltas: mover mais para o Ato
  // reduz a parcela mensal de ITBI (igual em todo mês), o que também alivia os
  // demais baldes na mesma passada.
  const atoITBIInformado = Math.max(0, params.atoITBI || 0);
  let itbiAtoEfetivo = atoITBIInformado;
  let itbiRestante = Math.max(0, itbiRegistro - itbiAtoEfetivo);
  let parcelaMensalITBIExato = (mesesTotaisGeral > 0 && itbiRestante > 0)
    ? (itbiRestante / mesesTotaisGeral)
    : 0;

  if (mesesTotaisGeral <= 0) {
    itbiAtoEfetivo = itbiRegistro;
    itbiRestante = 0;
    parcelaMensalITBIExato = 0;
  } else {
    for (let iter = 0; iter < 20; iter++) {
      let excedente = 0;
      for (let idx = 0; idx < 6; idx++) {
        const cap = capacidadeRendaPorBalde(idx);
        if (cap === Infinity || parcelaMensalITBIExato <= cap) continue;
        if ((mObra[idx] || 0) > 0) excedente += (parcelaMensalITBIExato - cap) * mObra[idx];
        if ((mPos[idx] || 0) > 0) excedente += (parcelaMensalITBIExato - cap) * mPos[idx];
      }
      if (excedente < 0.01) break;
      itbiAtoEfetivo = Math.min(itbiRegistro, itbiAtoEfetivo + excedente);
      itbiRestante = Math.max(0, itbiRegistro - itbiAtoEfetivo);
      parcelaMensalITBIExato = itbiRestante > 0 ? (itbiRestante / mesesTotaisGeral) : 0;
    }
  }

  const parcelaMensalITBI = Math.round(parcelaMensalITBIExato * 100) / 100;
  const itbiAtoSugerido = Math.round(itbiAtoEfetivo * 100) / 100;

  // Sinal Total s/ ITBI = Preço Tabela - (Financiamento + Subsídio + FGTS)
  const totalNegociado = financiamento + subsidio + fgts;
  const sinalSemITBI = Math.max(0, precoTabela - totalNegociado);
  const sinalComITBI = Math.max(0, sinalSemITBI + itbiRegistro);

  const pctMaxProSoluto = (params.percentualRiscoGeral !== undefined ? params.percentualRiscoGeral : 17.0) / 100;
  // Risco Max Obra não é mais um percentual independente: é o resíduo de
  // (Total Pró-Soluto - Risco Max Pós), calculado mais abaixo.
  const pctMaxPos = (params.percentualRiscoPos !== undefined ? params.percentualRiscoPos : 5.1) / 100;

  // 2. Determinação exata de Desconto Comercial / Desconto Ato, Base Líquida com ITBI e Ato Residual
  let descontoAto = 0;
  let atoResidual = 0;
  let baseCalculoComITBI = 0;
  let totalProSolutoMaximo = 0;
  let comissaoApartadaValor = 0;

  // Ato mínimo que a política de crédito exige para este preço/renda/recursos —
  // o mesmo valor que o motor sugeriria automaticamente (sem nenhum Ato manual).
  // Pró-Soluto decresce monotonicamente conforme o Ato sobe, então este é
  // exatamente o ponto em que o risco fica right at the cap (17% por padrão):
  // qualquer Ato maior mantém o risco dentro da política; qualquer Ato menor
  // ultrapassa o limite. Serve de PISO para um Ato digitado manualmente — nunca
  // de teto, o usuário pode sempre pagar mais do que o mínimo exigido.
  //
  // Esta função resolve o Ato olhando só para o PREÇO do imóvel (risco máximo %
  // sobre a base). `calcularAtoMinimoDaPolitica`, logo abaixo, embrulha este
  // resultado aplicando também o teto por RENDA.
  //
  // Usa `itbiRestante` (ITBI ainda não alocado para "ITBI no Ato" acima) em vez
  // do ITBI total (`itbiRegistro`) em toda esta função: a parte do ITBI que já
  // foi separada para itbiAtoEfetivo/itbiAtoSugerido não precisa mais de
  // proteção nenhuma daqui, ela já está paga. Usar o ITBI cheio faria esta
  // conta pedir Ato (Imóvel) de novo para cobrir um ITBI que já está coberto em
  // outro campo — contando o mesmo ITBI duas vezes. Quando não há nenhum
  // atoITBI/itbiAtoEfetivo ainda definido, itbiRestante == itbiRegistro e o
  // resultado desta função é idêntico ao de antes.
  const calcularAtoMinimoPorPreco = (): { atoResidual: number; descontoAto: number; baseCalculoComITBI: number; totalProSolutoMaximo: number; comissaoApartadaValor: number } => {
    if (!isAtoPremiadoAtivoEfetivo) {
      const descontoAtoCalc = 0;
      const baseCalc = Math.max(0, Math.round((precoTabela + itbiRestante) * 100) / 100);
      const proSolutoMax = Math.round(baseCalc * pctMaxProSoluto * 100) / 100;
      const comissaoCalc = isComissaoApartadaAtiva ? Math.max(0, Math.round(precoTabela * pctComissaoEfetiva * 100) / 100) : 0;
      const atoCalc = (sinalSemITBI + itbiRestante) - proSolutoMax;
      const sinalMinimoFloorSemPremio = params.sinalMinimo && params.sinalMinimo > 0 ? params.sinalMinimo : 0;
      const atoCalcFinal = Math.max(sinalMinimoFloorSemPremio, Math.round(atoCalc * 100) / 100);
      return { atoResidual: atoCalcFinal, descontoAto: descontoAtoCalc, baseCalculoComITBI: baseCalc, totalProSolutoMaximo: proSolutoMax, comissaoApartadaValor: comissaoCalc };
    }

    // Resolução Circular / Iterativa Exata do Excel da Morar:
    // Base Líquida com ITBI = (Preço Tabela - Desconto Ato) + ITBI Restante
    // Total Pró-Soluto = Base Líquida * 17%
    // Ato Imóvel = (Sinal Total + ITBI Restante) - Total Pró-Soluto - Desconto Ato
    //
    // Comissão Apartada: em nenhuma das 3 hipóteses abaixo o desconto do Ato
    // Premiado pode incidir sobre a comissão — a base do desconto é sempre o
    // Ato líquido da comissão (o que efetivamente fica com a construtora).
    // `atoResidual` continua representando o BRUTO (o total cobrado do cliente
    // no momento do Ato, usado em todo o resto do motor exatamente como antes —
    // ver saldoAtoEfetivo mais abaixo); a comissão é isolada e devolvida à parte
    // em `comissaoApartadaValor` (Ato líquido = atoResidual - comissaoApartadaValor,
    // mesma conta já usada em FichaMorar.tsx para exibir o Ato (Imóvel)).
    //
    // Hipótese 1: Ato líquido >= 50.000 -> Desconto fixo de (pct * 50.000)
    const descontoAtoFlat50k = Math.round(50000 * pctAtoPremiado * 100) / 100;
    const baseCom5k = (precoTabela - descontoAtoFlat50k) + itbiRestante;
    const proSoluto5k = Math.round(baseCom5k * pctMaxProSoluto * 100) / 100;
    const comissaoCom5k = isComissaoApartadaAtiva ? Math.max(0, Math.round((precoTabela - descontoAtoFlat50k) * pctComissaoEfetiva * 100) / 100) : 0;
    const atoGrossCom5k = (sinalSemITBI + itbiRestante) - proSoluto5k - descontoAtoFlat50k;
    const atoLiquidoCom5k = atoGrossCom5k - comissaoCom5k;
    const sinalMinimoFloor = params.sinalMinimo && params.sinalMinimo > 0 ? params.sinalMinimo : 0;

    if (atoLiquidoCom5k >= 50000) {
      return {
        descontoAto: descontoAtoFlat50k,
        atoResidual: Math.max(sinalMinimoFloor, Math.round(atoGrossCom5k * 100) / 100),
        baseCalculoComITBI: Math.round(baseCom5k * 100) / 100,
        totalProSolutoMaximo: proSoluto5k,
        comissaoApartadaValor: comissaoCom5k
      };
    }

    // Hipótese 2: Ato líquido >= 5.000 e < 50.000 -> Desconto de pct sobre o
    // próprio Ato líquido (nunca sobre o bruto). Fórmula analítica derivada do
    // sistema acoplado {desconto = líquido*pct; comissão = (preço-desconto)*pctComissão;
    // bruto = líquido + comissão; bruto = (Sinal+ITBI) - proSolutoMax - desconto}:
    // líquido = [(Sinal+ITBI) - (Preço+ITBI)*pctMaxProSoluto - pctComissão*Preço]
    //           / (1 + pct - pct*pctMaxProSoluto - pct*pctComissão)
    // Quando não há comissão apartada, pctComissão = 0 e a fórmula cai exatamente
    // na original (líquido == bruto).
    const denom = 1 + pctAtoPremiado - (pctAtoPremiado * pctMaxProSoluto) - (pctAtoPremiado * pctComissaoEfetiva);
    const num = (sinalSemITBI + itbiRestante) - ((precoTabela + itbiRestante) * pctMaxProSoluto) - (pctComissaoEfetiva * precoTabela);
    const atoLiquidoAnalitico = denom > 0 ? num / denom : 0;

    if (atoLiquidoAnalitico >= 5000 && atoLiquidoAnalitico < 50000) {
      let atoLiquidoCalc = Math.round(atoLiquidoAnalitico * 100) / 100;
      let descontoAtoCalc = Math.round(atoLiquidoCalc * pctAtoPremiado * 100) / 100;
      let comissaoCalc = isComissaoApartadaAtiva ? Math.max(0, Math.round((precoTabela - descontoAtoCalc) * pctComissaoEfetiva * 100) / 100) : 0;
      let baseCalc = Math.round(((precoTabela - descontoAtoCalc) + itbiRestante) * 100) / 100;
      let proSolutoMax = Math.round(baseCalc * pctMaxProSoluto * 100) / 100;
      let atoGrossCalc = (sinalSemITBI + itbiRestante) - proSolutoMax - descontoAtoCalc;

      // Ajuste de centavos fino para convergência perfeita (mesmo padrão de antes)
      atoLiquidoCalc = Math.max(0, Math.round((atoGrossCalc - comissaoCalc) * 100) / 100);
      descontoAtoCalc = Math.round(atoLiquidoCalc * pctAtoPremiado * 100) / 100;
      comissaoCalc = isComissaoApartadaAtiva ? Math.max(0, Math.round((precoTabela - descontoAtoCalc) * pctComissaoEfetiva * 100) / 100) : 0;
      baseCalc = Math.round(((precoTabela - descontoAtoCalc) + itbiRestante) * 100) / 100;
      proSolutoMax = Math.round(baseCalc * pctMaxProSoluto * 100) / 100;
      atoGrossCalc = Math.max(sinalMinimoFloor, Math.round(((sinalSemITBI + itbiRestante) - proSolutoMax - descontoAtoCalc) * 100) / 100);

      return { atoResidual: atoGrossCalc, descontoAto: descontoAtoCalc, baseCalculoComITBI: baseCalc, totalProSolutoMaximo: proSolutoMax, comissaoApartadaValor: comissaoCalc };
    }

    // Hipótese 3: Ato líquido < 5.000 -> Desconto de R$ 0,00 (Ex: Unidade B-603)
    // Base Líquida com ITBI = (Preço Tabela - 0) + ITBI Restante
    // Total Pró-Soluto (17,00%) = Base Líquida * 0.17
    // Ato Imóvel = (Sinal Total + ITBI Restante) - Total Pró-Soluto - Desconto Ato
    const baseCalc = Math.round((precoTabela + itbiRestante) * 100) / 100;
    const proSolutoMax = Math.round(baseCalc * pctMaxProSoluto * 100) / 100;
    const comissaoSemDesconto = isComissaoApartadaAtiva ? Math.max(0, Math.round(precoTabela * pctComissaoEfetiva * 100) / 100) : 0;
    const atoCalc = (sinalSemITBI + itbiRestante) - proSolutoMax;
    return {
      descontoAto: 0,
      baseCalculoComITBI: baseCalc,
      totalProSolutoMaximo: proSolutoMax,
      atoResidual: Math.max(sinalMinimoFloor, Math.round(atoCalc * 100) / 100),
      comissaoApartadaValor: comissaoSemDesconto
    };
  };

  // Embrulha o resultado por preço aplicando também o teto por RENDA: se a soma
  // dos tetos de renda de cada balde (capacidadeRendaObra/Pos, calculados no
  // início da função) é menor que o Pró-Soluto que o preço permitiria, a renda
  // é o fator mais restritivo — a diferença precisa ir para o Ato, senão fica
  // sem dono (a distribuição das séries, mais abaixo, trava cada balde no seu
  // teto de renda de qualquer forma; sem este ajuste o excedente simplesmente
  // desaparecia do fluxo, sem virar nem parcela nem Ato).
  const calcularAtoMinimoDaPolitica = (): { atoResidual: number; descontoAto: number; baseCalculoComITBI: number; totalProSolutoMaximo: number; comissaoApartadaValor: number } => {
    const porPreco = calcularAtoMinimoPorPreco();

    // O teto de risco da Pós-Obra é um % da Base Líquida c/ ITBI, e essa base é
    // líquida do Desconto do Ato Premiado — ou seja, ela ENCOLHE conforme o Ato
    // (e o desconto de 10% sobre ele) cresce. Por isso a capacidade de renda
    // total precisa ser recalculada a cada volta da convergência abaixo, junto
    // com o desconto: mantê-la travada no desconto da hipótese por preço fazia
    // o Ato sugerido convergir para (base - capacidade) / 1,10 em vez do ponto
    // fixo correto (base - capacidade) / 1,092, fechando alguns reais abaixo do
    // valor da planilha de referência.
    const capacidadeRendaTotalCom = (desconto: number): number => {
      const baseCom = Math.max(0, Math.round(((precoTabela - desconto) + itbiRestante) * 100) / 100);
      const maxRiscoPosCom = Math.round(baseCom * pctMaxPos * 100) / 100;
      return Math.min(maxRiscoPosCom, capacidadeRendaPos) + capacidadeRendaObra;
    };

    const capacidadeRendaInicial = capacidadeRendaTotalCom(porPreco.descontoAto);

    if (porPreco.totalProSolutoMaximo <= capacidadeRendaInicial + 0.01) {
      return porPreco;
    }

    // A renda é o fator mais restritivo: eleva o Ato pela diferença. O desconto
    // do Ato Premiado pode mudar de faixa com o novo Ato (ex.: cruzar os
    // R$ 50.000,00), então converge em algumas voltas — mesmo padrão de
    // "ajuste fino" já usado na Hipótese 2 acima. Com Comissão Apartada ativa,
    // o desconto de cada volta é calculado sobre o Ato já líquido da comissão
    // (nunca sobre `atoAjustado` bruto) — mesma regra da Hipótese 2.
    const base = sinalSemITBI + itbiRestante;
    const sinalMinimoFloorRenda = params.sinalMinimo && params.sinalMinimo > 0 ? params.sinalMinimo : 0;
    let atoAjustado = porPreco.atoResidual + (porPreco.totalProSolutoMaximo - capacidadeRendaInicial);
    let descontoAjustado = porPreco.descontoAto;
    let comissaoAjustada = porPreco.comissaoApartadaValor;
    let capacidadeAjustada = capacidadeRendaInicial;
    for (let i = 0; i < 12; i++) {
      const atoLiquidoIter = isComissaoApartadaAtiva ? Math.max(0, atoAjustado - comissaoAjustada) : atoAjustado;
      descontoAjustado = isAtoPremiadoAtivoEfetivo ? calcularDescontoAtoPremiado(atoLiquidoIter, pctAtoPremiado) : 0;
      capacidadeAjustada = capacidadeRendaTotalCom(descontoAjustado);
      atoAjustado = Math.round((base - capacidadeAjustada - descontoAjustado) * 100) / 100;
      comissaoAjustada = isComissaoApartadaAtiva ? Math.max(0, Math.round((precoTabela - descontoAjustado) * pctComissaoEfetiva * 100) / 100) : 0;
    }
    atoAjustado = Math.max(sinalMinimoFloorRenda, atoAjustado);
    const baseAjustada = Math.max(0, Math.round(((precoTabela - descontoAjustado) + itbiRestante) * 100) / 100);

    return {
      atoResidual: atoAjustado,
      descontoAto: descontoAjustado,
      baseCalculoComITBI: baseAjustada,
      totalProSolutoMaximo: capacidadeAjustada,
      comissaoApartadaValor: comissaoAjustada
    };
  };

  if (params.atoManual !== undefined && params.atoManual > 0) {
    // Um Ato digitado/mantido manualmente é respeitado, mas nunca abaixo do
    // mínimo exigido pela política de crédito — se o Ato informado deixaria o
    // Pró-Soluto acima do risco máximo permitido, ele é elevado exatamente até
    // o ponto em que o risco volta a obedecer a política (nunca reduzido: o
    // usuário sempre pode optar por pagar mais do que o mínimo exigido).
    const atoMinimo = calcularAtoMinimoDaPolitica();
    atoResidual = Math.max(params.atoManual, atoMinimo.atoResidual);
    if (!isAtoZerado && isAtoPremiadoAtivoEfetivo) {
      // Comissão isolada ANTES de aplicar o fator do desconto: a base do
      // desconto é sempre o Ato líquido da comissão, nunca o bruto digitado.
      const resolvido = resolverComissaoDadoAtoGross(atoResidual);
      descontoAto = resolvido.desconto;
      comissaoApartadaValor = resolvido.comissao;
    } else {
      descontoAto = 0;
      comissaoApartadaValor = isComissaoApartadaAtiva ? Math.max(0, Math.round(precoTabela * pctComissaoEfetiva * 100) / 100) : 0;
    }
    baseCalculoComITBI = Math.max(0, Math.round(((precoTabela - descontoAto) + itbiRegistro) * 100) / 100);
    totalProSolutoMaximo = Math.round(baseCalculoComITBI * pctMaxProSoluto * 100) / 100;
  } else if (params.atoManual === 0 || isAtoZerado) {
    atoResidual = 0;
    descontoAto = 0;
    comissaoApartadaValor = isComissaoApartadaAtiva ? Math.max(0, Math.round(precoTabela * pctComissaoEfetiva * 100) / 100) : 0;
    baseCalculoComITBI = Math.max(0, Math.round((precoTabela + itbiRegistro) * 100) / 100);
    totalProSolutoMaximo = sinalComITBI;
  } else {
    const sugerido = calcularAtoMinimoDaPolitica();
    atoResidual = sugerido.atoResidual;
    descontoAto = sugerido.descontoAto;
    baseCalculoComITBI = sugerido.baseCalculoComITBI;
    totalProSolutoMaximo = sugerido.totalProSolutoMaximo;
    comissaoApartadaValor = sugerido.comissaoApartadaValor;
  }

  // Fluxo Pró-Soluto Efetivo com ITBI:
  // O Ato (Imóvel), o Ato Premiado (desconto comercial) e o ITBI no Ato são rigorosamente descontados do Pró-Soluto
  const saldoAtoEfetivo = isAtoZerado ? 0 : atoResidual;
  const saldoDescontoAto = isAtoZerado ? 0 : descontoAto;
  const saldoAtoITBI = params.atoITBI || 0;

  // 3. Tetos e Travas de Pró-Soluto (fórmula exata da planilha de referência):
  // Total Pró-Soluto (17,00% c/ ITBI) = Base c/ ITBI * 0.17
  // Risco Max Pós = Base c/ ITBI * pctMaxPos — `baseCalculoComITBI` já é líquida do
  // Desconto Ato (calculada como (precoTabela - descontoAto) + itbiRegistro mais acima),
  // então subtraí-lo de novo aqui descontava o Desconto Ato EM DOBRO, reduzindo o teto
  // da Pós-Obra indevidamente.
  // Risco Max Obra = Total Pró-Soluto - Risco Max Pós (resíduo, não é um percentual independente)
  const maxRiscoPos = Math.round(baseCalculoComITBI * pctMaxPos * 100) / 100;
  const maxRiscoObra = Math.round((totalProSolutoMaximo - maxRiscoPos) * 100) / 100;

  const fluxoProSolutoComITBI = Math.max(
    0,
    Math.round((sinalComITBI - saldoAtoEfetivo - saldoDescontoAto - saldoAtoITBI) * 100) / 100
  );

  const sinalLiquidoTotal = Math.max(0, Math.round((sinalSemITBI - saldoDescontoAto) * 100) / 100);
  const baseCalculo = precoBase;
  const maxFluxoGeral = fluxoProSolutoComITBI;
  const tetoPosGlobal = maxRiscoPos;

  // 4. Distribuição das Séries Morar em cascata (fórmula exata da planilha de referência):
  // Cada balde de 12 meses tem um peso (30%/25%/20%/15%/10%/5%). A série que atravessa a
  // fronteira Obra/Pós-Obra (ex: balde 3 com 9 meses em Obra + 3 meses em Pós) mantém o MESMO
  // peso — não reinicia a numeração.
  //
  // Isso acontece em duas etapas (cascata): primeiro cada balde vira uma participação
  // percentual DENTRO DA SUA FASE (peso×meses do balde ÷ peso×meses de todos os baldes
  // daquela fase); essa participação é então aplicada sobre a base financeira daquela
  // fase — e a fase Pós-Obra tem uma base própria, travada em `% Max Pós-Obra` da
  // política (maxRiscoPos), nunca podendo ultrapassá-la. Se a divisão "natural" (pelo
  // peso combinado das duas fases) daria à Pós-Obra mais do que esse teto, o excedente
  // fica com a Obra — mantendo a proporção original entre os baldes de cada fase.
  const seriesWeights = (params.globalSeriesPct && params.globalSeriesPct.length === 6)
    ? params.globalSeriesPct.map(p => (p || 0) / 100)
    : [0.30, 0.25, 0.20, 0.15, 0.10, 0.05];

  // Teto de renda de cada balde: a política de crédito trava a parcela + ITBI de um
  // balde em pctAno% da renda — nunca um percentual independente de "peso de
  // distribuição", é um teto de dinheiro por mês para aquele balde específico.
  const capRendaMesPorBalde = seriesWeights.map((_, idx) => {
    const pctAno = (params.globalSeriesPct && params.globalSeriesPct[idx]) || [30, 25, 20, 15, 10, 5][idx] || 0;
    return renda > 0 ? Math.round((renda * (pctAno / 100)) * 100) / 100 : Infinity;
  });

  const obraWeightedTotal = seriesWeights.reduce((sum, w, idx) => sum + w * (mObra[idx] || 0), 0);
  const posWeightedTotal = seriesWeights.reduce((sum, w, idx) => sum + w * (mPos[idx] || 0), 0);
  const combinedWeightedTotal = obraWeightedTotal + posWeightedTotal;

  const naturalPosMoney = combinedWeightedTotal > 0
    ? (posWeightedTotal / combinedWeightedTotal) * fluxoProSolutoComITBI
    : 0;
  const totalPosMoney = Math.max(0, Math.min(naturalPosMoney, maxRiscoPos));
  const totalObraMoney = Math.max(0, fluxoProSolutoComITBI - totalPosMoney);

  // Dentro de cada fase, reparte o total entre os baldes proporcional a peso×meses,
  // mas travando cada balde no seu próprio teto de renda (parcela + ITBI ≤ pctAno% da
  // renda) — o excedente de um balde que bateu no teto é redistribuído entre os
  // demais baldes da mesma fase, mantendo a proporção original entre eles.
  const obraPesos = seriesWeights.map((w, idx) => w * (mObra[idx] || 0));
  const posPesos = seriesWeights.map((w, idx) => w * (mPos[idx] || 0));
  const obraTetosMoney = capRendaMesPorBalde.map((cap, idx) => cap * (mObra[idx] || 0));
  const posTetosMoney = capRendaMesPorBalde.map((cap, idx) => cap * (mPos[idx] || 0));

  const obraMoneyPorBalde = distribuirComTetos(obraPesos, obraTetosMoney, totalObraMoney);
  const posMoneyPorBalde = distribuirComTetos(posPesos, posTetosMoney, totalPosMoney);

  const obraRatesBrutas = obraMoneyPorBalde.map((money, idx) => (mObra[idx] || 0) > 0 ? money / mObra[idx] : 0);
  const posRatesBrutas = posMoneyPorBalde.map((money, idx) => (mPos[idx] || 0) > 0 ? money / mPos[idx] : 0);

  const toLiquida = (brutaExata: number) => {
    if (brutaExata <= 0) return 0;
    const liquidaExata = brutaExata - parcelaMensalITBIExato;
    return Math.max(0, Math.round(liquidaExata * 100) / 100);
  };
  const obraRatesLiquidas = obraRatesBrutas.map(toLiquida);
  const posRatesLiquidas = posRatesBrutas.map(toLiquida);

  // Obra:
  const obraSeries: MorarSerieResult[] = mObra.map((qtd, idx) => {
    const pctAno = (params.globalSeriesPct && params.globalSeriesPct[idx]) || [30, 25, 20, 15, 10, 5][idx] || 0;
    const capRendaMes = renda > 0 ? Math.round((renda * (pctAno / 100)) * 100) / 100 : 0;
    if (qtd <= 0) {
      return {
        serieIndex: idx,
        qtd: 0,
        pctMae: pctAno,
        capacidadeRenda: capRendaMes,
        rateioFluxoGlobal: 0,
        parcelaBrutaFinal: 0,
        parcelaLiquida: 0,
        subtotalLiquido: 0
      };
    }
    const parcelaLiquida = obraRatesLiquidas[idx] || 0;
    const parcelaBrutaFinal = Math.round(obraRatesBrutas[idx] * 100) / 100;
    const subtotalLiquido = Math.round(parcelaLiquida * qtd * 100) / 100;

    return {
      serieIndex: idx,
      qtd,
      pctMae: pctAno,
      capacidadeRenda: capRendaMes,
      rateioFluxoGlobal: parcelaBrutaFinal,
      parcelaBrutaFinal,
      parcelaLiquida,
      subtotalLiquido
    };
  });

  // Pós-Obra:
  const posSeries: MorarSerieResult[] = mPos.map((qtd, idx) => {
    const pctAno = (params.globalSeriesPct && params.globalSeriesPct[idx]) || [30, 25, 20, 15, 10, 5][idx] || 0;
    const capRendaMes = renda > 0 ? Math.round((renda * (pctAno / 100)) * 100) / 100 : 0;
    if (qtd <= 0) {
      return {
        serieIndex: idx,
        qtd: 0,
        pctMae: pctAno,
        capacidadeRenda: capRendaMes,
        rateioFluxoGlobal: 0,
        parcelaBrutaFinal: 0,
        parcelaLiquida: 0,
        subtotalLiquido: 0
      };
    }
    const parcelaLiquida = posRatesLiquidas[idx] || 0;
    const parcelaBrutaFinal = Math.round(posRatesBrutas[idx] * 100) / 100;
    const subtotalLiquido = Math.round(parcelaLiquida * qtd * 100) / 100;

    return {
      serieIndex: idx,
      qtd,
      pctMae: pctAno,
      capacidadeRenda: capRendaMes,
      rateioFluxoGlobal: parcelaBrutaFinal,
      parcelaBrutaFinal,
      parcelaLiquida,
      subtotalLiquido
    };
  });

  const subtotalObraLiquido = Math.round(obraSeries.reduce((acc, s) => acc + s.subtotalLiquido, 0) * 100) / 100;
  const subtotalPosLiquido = Math.round(posSeries.reduce((acc, s) => acc + s.subtotalLiquido, 0) * 100) / 100;
  const totalProSolutoGerado = Math.round((subtotalObraLiquido + subtotalPosLiquido) * 100) / 100;

  const itbiObraTotal = Math.round(obraSeries.reduce((acc, s) => acc + s.qtd, 0) * parcelaMensalITBI * 100) / 100;
  const itbiPosTotal = Math.round(posSeries.reduce((acc, s) => acc + s.qtd, 0) * parcelaMensalITBI * 100) / 100;

  // totalObraMoney/totalPosMoney (seção 4) já respeitam o teto de % Max Pós-Obra em
  // qualquer cenário — não é mais preciso um atalho separado para o caso "fluxo no máximo".
  const totalObraComITBI = Math.round((subtotalObraLiquido + itbiObraTotal) * 100) / 100;
  const totalPosComITBI = Math.round((subtotalPosLiquido + itbiPosTotal) * 100) / 100;

  const itbiParceladoTotal = Math.round(mesesTotaisGeral * parcelaMensalITBI * 100) / 100;
  const atoPremiado = descontoAto;
  const atoBruto = Math.round((atoResidual + atoPremiado) * 100) / 100;

  const distribuidoTotal = Math.round(
    (atoResidual + (params.atoITBI || 0) + totalProSolutoGerado + itbiParceladoTotal + atoPremiado) * 100
  ) / 100;
  const totalComITBI = sinalComITBI;

  return {
    baseCalculo,
    baseCalculoComITBI,
    maxRiscoObra,
    maxRiscoPos,
    totalProSolutoMaximo,
    maxFluxoGeral,
    tetoPosGlobal,
    parcelaMensalITBI,
    itbiAtoSugerido,
    mesesTotaisGeral,
    obraSeries,
    posSeries,
    subtotalObraLiquido,
    subtotalPosLiquido,
    totalObraComITBI,
    totalPosComITBI,
    atoResidual,
    atoPremiado,
    atoBruto,
    totalProSolutoGerado,
    sinalLiquidoTotal,
    distribuidoTotal,
    totalComITBI,
    comissaoApartadaValor
  };
}

/**
 * Função principal de cálculo e simulação de fluxo linear (Sem loop e sem Ato Premiado)
 */
export function calcularSimulacaoFluxo(params: FinancialParams): SimulationResult {
  const precoTabela = params.precoTabela || 0;
  const avaliacaoBanco = params.avaliacaoBanco || 0;
  const renda = params.renda || 0;
  const subsidio = params.subsidio || 0;
  const fgts = params.fgts || 0;
  const financiamentoAprovado = params.financiamentoAprovado !== undefined ? params.financiamentoAprovado : Infinity;
  const ltvMaximo = params.ltvMaximo !== undefined ? params.ltvMaximo : 0.80;
  const itbiRegistro = params.itbiRegistro || 0;
  const percentualRiscoImovel = params.percentualRiscoImovel !== undefined ? params.percentualRiscoImovel : 20;
  const percentualRiscoRenda = params.percentualRiscoRenda !== undefined ? params.percentualRiscoRenda : 35;
  // `!== undefined` (não `||`) para respeitar um prazo explicitamente 0 —
  // uma política pode permitir reduzir o número de parcelas até zero, e
  // `0 || 60` voltaria a tratar isso como o padrão de 60 meses.
  const prazoMeses = params.prazoMeses !== undefined ? params.prazoMeses : 60;
  const pisoSinal = params.sinalMinimo !== undefined && params.sinalMinimo > 0 ? params.sinalMinimo : 2000;

  // 1. Taxa de juros mensal
  const jurosMensal = params.taxaJurosMensal !== undefined
      ? (params.taxaJurosMensal || 0) / 100
      : prazoMeses <= 60 ? 0.019 : 0.022;

  // 2. Cascata de Financiamento Máximo e Total Negociado
  let baseFinanc = Math.min(financiamentoAprovado, ltvMaximo * avaliacaoBanco);
  if (baseFinanc + subsidio + fgts > avaliacaoBanco && avaliacaoBanco > 0) {
    baseFinanc = Math.max(0, avaliacaoBanco - subsidio - fgts);
  }
  const maxFinanciamento = Math.max(0, Math.min(baseFinanc, Math.max(0, precoTabela - pisoSinal)));

  const totalNegociado = Math.min(
    subsidio + fgts + maxFinanciamento,
    subsidio + fgts + Math.max(0, precoTabela - pisoSinal)
  );

  // 3. Teto de Renda (35% da renda como PMT máximo)
  const pmtMaxRenda = renda * (percentualRiscoRenda / 100);
  const tetoRenda = calcularValorPresente(pmtMaxRenda, jurosMensal, prazoMeses);

  // 4. Laço de Equalização Circular (Ato Premiado <-> Ato Efetivo)
  let desconto = 0;
  let erro = 1;
  let iteracoes = 0;

  const aportesExtras = params.aportesExtras || 0;
  const atoManual = params.atoManual || 0;

  let sinalTotal = 0;
  let totalComITBI = 0;
  const maiorBase = Math.max(precoTabela, avaliacaoBanco);
  let baseRiscoImovel = 0;
  let tetoImovel = 0;
  let proSolutoMaximo = 0;
  let atoSugerido = 0;
  let atoEfetivo = 0;

  while (erro > 0.005 && iteracoes < 100) {
    sinalTotal = Math.max(0, precoTabela - totalNegociado - desconto);
    totalComITBI = sinalTotal + itbiRegistro;
    
    baseRiscoImovel = Math.max(0, maiorBase + itbiRegistro - desconto);
    tetoImovel = baseRiscoImovel * (percentualRiscoImovel / 100);
    
    proSolutoMaximo = Math.min(tetoImovel, tetoRenda, totalComITBI);

    // O Ato é ESTRITAMENTE a diferença entre a dívida e o risco máximo suportado.
    // A Taxa Bancária NÃO ENTRA nesta conta.
    atoSugerido = Math.max(totalComITBI - proSolutoMaximo - aportesExtras, pisoSinal);
    atoEfetivo = atoManual > 0 ? Math.max(atoManual, atoSugerido) : atoSugerido;

    // Regra do Desconto (Ato Premiado) — % configurável por condição comercial
    const pctAtoPremiadoFluxo = Math.max(0, params.atoPremiadoPct !== undefined ? params.atoPremiadoPct : ATO_PREMIADO_PCT_PADRAO);
    let novoDesconto = 0;
    if (pctAtoPremiadoFluxo > 0) {
      if (atoEfetivo > 50000) {
        novoDesconto = Math.round(50000 * pctAtoPremiadoFluxo * 100) / 100;
      } else if (atoEfetivo >= 5000 && atoEfetivo <= 50000) {
        novoDesconto = atoEfetivo * pctAtoPremiadoFluxo;
      }
    }

    erro = Math.abs(novoDesconto - desconto);
    desconto = novoDesconto;
    iteracoes++;
  }

  // 5. Pró-Soluto Efetivo e Cálculo da Parcela (Price)
  const proSolutoTotal = Math.max(0, totalComITBI - atoEfetivo - aportesExtras);
  const proSolutoRestante = Math.max(0, proSolutoTotal - itbiRegistro);

  // A dedução da taxa bancária (0,2003%) ocorre EXCLUSIVAMENTE na base de cálculo da Tabela Price (PMT)
  const taxaBancaria = proSolutoTotal * 0.002003;
  const baseLiquidaParcela = Math.max(0, proSolutoTotal - taxaBancaria);
  
  const valorParcela = calcularPricePMT(baseLiquidaParcela, jurosMensal, prazoMeses);

  const comprometimentoRenda = renda > 0 ? (valorParcela / renda) * 100 : 0;
  const riscoImovelEfetivo = baseRiscoImovel > 0 ? (proSolutoTotal / baseRiscoImovel) * 100 : 0;

  return {
    maxFinanciamento,
    totalNegociado,
    descontoAtoPremiado: desconto,
    sinalTotal,
    totalComITBI,
    tetoImovel,
    tetoRenda,
    proSolutoMaximo,
    atoSugerido,
    atoEfetivo,
    proSolutoRestante,
    proSolutoTotal,
    baseParcelar: proSolutoTotal,
    taxaBancaria,
    baseLiquida: baseLiquidaParcela,
    valorParcela,
    comprometimentoRenda,
    riscoImovelEfetivo,
    conferenciaValida: true,
  };
}

export function calculatePolicyRiskValues(
  prod: Product,
  cond: CommercialCondition,
  clientIncome: number,
  overrideNumParcelas?: number,
  overridePrice?: number,
  overrideITBI?: number,
  overrideEvaluation?: number,
  overrideAtoPremiado?: number, // Mantido na interface para compatibilidade, mas ignorado
  maxFinanciamentoBanco: number = Infinity,
  subsidy: number = 0,
  fgts: number = 0,
  ltvMaximo: number = 0.80
) {
  const numParcelas = overrideNumParcelas !== undefined
    ? overrideNumParcelas
    : (cond.numParcelas !== undefined ? cond.numParcelas : 60);

  const riscoRendaPct = cond.riscoRendaPct !== undefined ? cond.riscoRendaPct : 35;
  const percentualPolitica = cond.riscoImovelPct !== undefined ? cond.riscoImovelPct : 20;

  const meses1 = cond.mesesTabela1 !== undefined ? cond.mesesTabela1 : 36;
  const taxa1 = cond.taxaJuros1 !== undefined ? cond.taxaJuros1 : 0.0;
  const taxa2 = cond.taxaJuros2 !== undefined ? cond.taxaJuros2 : 1.9;
  const appliedRatePct = (numParcelas <= meses1) ? taxa1 : taxa2;

  let propertyPrice = overridePrice !== undefined ? overridePrice : 0;
  let propertyITBI = overrideITBI !== undefined ? overrideITBI : 0;
  let propertyEvaluation = overrideEvaluation !== undefined ? overrideEvaluation : 0;

  if (overridePrice === undefined && prod.tableInfo && prod.tableInfo.rows && prod.tableInfo.rows.length > 0) {
    const firstRow = prod.tableInfo.rows[0];
    if (firstRow[7] !== undefined) propertyPrice = parseCurrency(firstRow[7]);
    if (firstRow[8] !== undefined) propertyITBI = parseCurrency(firstRow[8]);
    if (firstRow[6] !== undefined) propertyEvaluation = parseCurrency(firstRow[6]);
  }

  const sinalMinimoNum = cond.sinalMinimo ? parseCurrency(cond.sinalMinimo) : 2000;

  const isMorar = getConditionKind(cond.name) === 'sinal-morar';

  if (isMorar) {
    const mesesObraParam = cond.mesesObra ?? 33;
    const mesesPosParam = cond.mesesPos ?? 27;
    const proSolutoGlobalParam = cond.percMaxProSolutoGlobal ?? cond.riscoImovelPct ?? 17.0;
    const posObraGlobalParam = cond.percMaxPosObra ?? cond.riscoPosPct ?? 8.0;

    const globalPct: [number, number, number, number, number, number] = [
      cond.globalSerie1Pct ?? 30.0,
      cond.globalSerie2Pct ?? 25.0,
      cond.globalSerie3Pct ?? 20.0,
      cond.globalSerie4Pct ?? 15.0,
      cond.globalSerie5Pct ?? 10.0,
      cond.globalSerie6Pct ?? 5.0
    ];

    const morarEngine = calculateMorarFlowEngine({
      precoTabela: propertyPrice || 0,
      avaliacaoBanco: propertyEvaluation || 0,
      itbiRegistro: propertyITBI || 0,
      renda: clientIncome || 0,
      financiamento: maxFinanciamentoBanco > 0 && maxFinanciamentoBanco !== Infinity ? maxFinanciamentoBanco : 0,
      subsidio: subsidy || 0,
      fgts: fgts || 0,
      percentualRiscoGeral: proSolutoGlobalParam,
      percentualRiscoPos: posObraGlobalParam,
      mesesObra: mesesObraParam,
      mesesPos: mesesPosParam,
      globalSeriesPct: globalPct,
      sinalMinimo: sinalMinimoNum > 0 ? sinalMinimoNum : 2000,
      isAtoPremiadoEnabled: true,
      atoPremiadoPct: cond.atoPremiadoPct
    });

    const simulacao: SimulationResult = {
      maxFinanciamento: maxFinanciamentoBanco > 0 && maxFinanciamentoBanco !== Infinity ? maxFinanciamentoBanco : 0,
      totalNegociado: (maxFinanciamentoBanco > 0 && maxFinanciamentoBanco !== Infinity ? maxFinanciamentoBanco : 0) + subsidy + fgts,
      descontoAtoPremiado: morarEngine.atoPremiado,
      sinalTotal: morarEngine.sinalLiquidoTotal,
      totalComITBI: morarEngine.totalComITBI,
      tetoImovel: morarEngine.maxFluxoGeral,
      tetoRenda: 0,
      proSolutoMaximo: morarEngine.maxFluxoGeral,
      atoSugerido: morarEngine.atoResidual,
      atoEfetivo: morarEngine.atoResidual,
      proSolutoRestante: morarEngine.totalProSolutoGerado,
      proSolutoTotal: morarEngine.totalProSolutoGerado,
      baseParcelar: morarEngine.totalProSolutoGerado,
      taxaBancaria: 0,
      baseLiquida: morarEngine.totalProSolutoGerado,
      valorParcela: morarEngine.obraSeries[0]?.parcelaLiquida || 0,
      comprometimentoRenda: 0,
      riscoImovelEfetivo: proSolutoGlobalParam,
      conferenciaValida: true
    };

    return {
      rendaVal: (clientIncome || 0) * (riscoRendaPct / 100),
      numParcelas: morarEngine.mesesTotaisGeral,
      appliedRatePct: 0,
      vpVal: morarEngine.maxFluxoGeral,
      propertyPrice: propertyPrice || 0,
      propertyEvaluation: propertyEvaluation || 0,
      propertyITBI: propertyITBI || 0,
      
      atoPremiado: morarEngine.atoPremiado,
      maiorBase: Math.max(propertyPrice || 0, propertyEvaluation || 0),
      baseAjustada: morarEngine.baseCalculoComITBI,
      baseComITBI: morarEngine.baseCalculoComITBI,
      baseBruta: morarEngine.baseCalculoComITBI,
      
      proSolutoTotalComITBI: morarEngine.distribuidoTotal,
      proSolutoTotal: morarEngine.totalProSolutoGerado,
      proSolutoRestante: morarEngine.totalProSolutoGerado,
      sinalSugerido: morarEngine.atoResidual,
      atoImovel: morarEngine.atoResidual,
      pagamentoAto: morarEngine.atoResidual,
      sinalTotal: morarEngine.totalComITBI - (propertyITBI || 0),
      totalComITBI: morarEngine.totalComITBI,
      taxaBancaria: 0,
      riscoUtilizadoTX: morarEngine.totalProSolutoGerado,
      baseCalculoParcela: morarEngine.totalProSolutoGerado,
      parcelaPrice: morarEngine.obraSeries[0]?.parcelaLiquida || 0,

      totalBaseImovel: morarEngine.baseCalculoComITBI,
      riscoImovelVal: morarEngine.maxFluxoGeral,
      minRiskVal: morarEngine.maxFluxoGeral,

      morarEngine,
      simulacao
    };
  }

  const simulacao = calcularSimulacaoFluxo({
    precoTabela: propertyPrice || 0,
    avaliacaoBanco: propertyEvaluation || 0,
    renda: clientIncome || 0,
    subsidio: subsidy || 0,
    fgts: fgts || 0,
    financiamentoAprovado: maxFinanciamentoBanco > 0 ? maxFinanciamentoBanco : Infinity,
    ltvMaximo: ltvMaximo || 0.80,
    itbiRegistro: propertyITBI || 0,
    percentualRiscoImovel: percentualPolitica,
    percentualRiscoRenda: riscoRendaPct,
    prazoMeses: numParcelas,
    taxaJurosMensal: appliedRatePct,
    sinalMinimo: sinalMinimoNum > 0 ? sinalMinimoNum : 2000,
    atoPremiadoPct: cond.atoPremiadoPct
  });

  return {
    rendaVal: (clientIncome || 0) * (riscoRendaPct / 100),
    numParcelas,
    appliedRatePct,
    vpVal: simulacao.tetoRenda || 0,
    propertyPrice: propertyPrice || 0,
    propertyEvaluation: propertyEvaluation || 0,
    propertyITBI: propertyITBI || 0,
    
    atoPremiado: simulacao.descontoAtoPremiado || 0,
    maiorBase: Math.max(propertyPrice || 0, propertyEvaluation || 0),
    baseAjustada: Math.max(propertyPrice || 0, propertyEvaluation || 0) + (propertyITBI || 0) - (simulacao.descontoAtoPremiado || 0),
    baseComITBI: Math.max(propertyPrice || 0, propertyEvaluation || 0) + (propertyITBI || 0) - (simulacao.descontoAtoPremiado || 0),
    baseBruta: Math.max(propertyPrice || 0, propertyEvaluation || 0) + (propertyITBI || 0) - (simulacao.descontoAtoPremiado || 0),
    
    proSolutoTotalComITBI: simulacao.proSolutoTotal || 0,
    proSolutoTotal: simulacao.proSolutoTotal || 0,
    proSolutoRestante: simulacao.proSolutoRestante || 0,
    sinalSugerido: simulacao.atoSugerido || 0,
    atoImovel: simulacao.atoEfetivo || 0,
    pagamentoAto: simulacao.atoEfetivo || 0,
    sinalTotal: simulacao.sinalTotal || 0,
    totalComITBI: simulacao.totalComITBI || 0,
    taxaBancaria: simulacao.taxaBancaria || 0,
    riscoUtilizadoTX: simulacao.baseLiquida || 0,
    baseCalculoParcela: simulacao.baseLiquida || 0,
    parcelaPrice: simulacao.valorParcela || 0,

    totalBaseImovel: Math.max(propertyPrice || 0, propertyEvaluation || 0) + (propertyITBI || 0) - (simulacao.descontoAtoPremiado || 0),
    riscoImovelVal: simulacao.tetoImovel || 0,
    minRiskVal: simulacao.proSolutoMaximo || 0,

    simulacao
  };
}

/**
 * Diferença em meses de calendário entre duas datas no formato "YYYY-MM-DD"
 * (o dia do mês é ignorado — só ano e mês contam, como nos demais campos de
 * "meses até a entrega" já usados no app). Nunca retorna negativo.
 */
export function monthsBetweenDates(fromDateStr?: string, toDateStr?: string): number {
  if (!fromDateStr || !toDateStr) return 0;
  const from = fromDateStr.split('-').map(n => parseInt(n, 10));
  const to = toDateStr.split('-').map(n => parseInt(n, 10));
  if (from.length < 2 || to.length < 2 || from.some(isNaN) || to.some(isNaN)) return 0;
  const diff = (to[0] - from[0]) * 12 + (to[1] - from[1]);
  return Math.max(0, diff);
}

/**
 * Subtrai `months` meses de calendário de uma data "YYYY-MM-DD" (o dia do mês
 * é ignorado, o resultado sempre volta com o dia "01"). Usado para calcular o
 * vencimento da parcela intermediária final (chaves), que vence alguns meses
 * antes do habite-se.
 */
export function subtractMonthsFromDate(dateStr?: string, months: number = 0): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-').map(n => parseInt(n, 10));
  if (parts.length < 2 || parts.some(isNaN)) return '';
  const totalMonths = parts[0] * 12 + (parts[1] - 1) - months;
  const yy = Math.floor(totalMonths / 12);
  const mm = (totalMonths % 12) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}-01`;
}

/**
 * Conta quantas datas de Junho ou Dezembro caem estritamente entre `hojeStr`
 * e `chavesDataStr` (os dois extremos não contam: um Junho/Dezembro que já
 * passou não gera intermediária, e a própria data das chaves é uma parcela à
 * parte, não uma intermediária semestral).
 */
export function contarSemestraisJunhoDezembro(hojeStr?: string, chavesDataStr?: string): number {
  if (!hojeStr || !chavesDataStr) return 0;
  const h = hojeStr.split('-').map(n => parseInt(n, 10));
  const c = chavesDataStr.split('-').map(n => parseInt(n, 10));
  if (h.length < 2 || c.length < 2 || h.some(isNaN) || c.some(isNaN)) return 0;
  const hojeIdx = h[0] * 12 + (h[1] - 1);
  const chavesIdx = c[0] * 12 + (c[1] - 1);
  let count = 0;
  for (let y = h[0]; y <= c[0]; y++) {
    for (const mes of [6, 12]) {
      const idx = y * 12 + (mes - 1);
      if (idx > hojeIdx && idx < chavesIdx) count++;
    }
  }
  return count;
}

/**
 * Gera as datas ("YYYY-MM-01") de `quantidade` intermediárias semestrais, uma
 * a cada Junho/Dezembro, começando no primeiro desses meses estritamente
 * depois de `hojeStr`. Usada tanto para a quantidade sugerida (calculada via
 * contarSemestraisJunhoDezembro) quanto para uma quantidade editada
 * manualmente — nos dois casos o resultado é sempre uma sequência de datas em
 * Junho/Dezembro, só muda quantas.
 */
export function gerarDatasSemestrais(hojeStr?: string, quantidade: number = 0): string[] {
  if (!hojeStr || quantidade <= 0) return [];
  const h = hojeStr.split('-').map(n => parseInt(n, 10));
  if (h.length < 2 || h.some(isNaN)) return [];
  const hojeIdx = h[0] * 12 + (h[1] - 1);

  // Primeiro Junho ou Dezembro estritamente após hoje
  let ano = h[0];
  let mesesCandidatos = [6, 12];
  const datas: string[] = [];
  outer: while (datas.length < quantidade) {
    for (const mes of mesesCandidatos) {
      const idx = ano * 12 + (mes - 1);
      if (idx > hojeIdx) {
        datas.push(`${ano}-${String(mes).padStart(2, '0')}-01`);
        if (datas.length >= quantidade) break outer;
      }
    }
    ano++;
  }
  return datas;
}

export interface ParcelamentoMorarParams {
  price: number; // Valor do imóvel (VGV) — base de todos os percentuais desta condição
  renda: number;
  recursos: number; // Apenas financiamento bancário — Subsídio e FGTS não entram nesta condição
  valAtoManual: number | null;
  isAtoPremiadoEnabled: boolean;
  pctSinalMinimo: number;
  pctRiscoRenda: number; // Teto da parcela mensal de obra como % da renda (referência 40%)

  // Quantidades já resolvidas pelo chamador (override manual do usuário, ou a
  // sugestão automática quando não há override): meses de obra (mensais
  // lineares), quantidade de intermediárias semestrais (0 se desligadas) e
  // quantidade de parcelas pós-obra.
  mesesObraQtd: number;
  semestraisQtd: number;
  posObraQtd: number;

  pctSemestralMax: number;
  pctChavesMax: number;
  pctPosObraMax: number;

  // Overrides manuais de VALOR (null/undefined = usa a sugestão automática
  // calculada a partir do saldo ainda disponível naquele ponto da cascata).
  posObraValorManual?: number | null;
  chavesValorManual?: number | null;
  // Overrides manuais de VALOR por intermediária semestral (índice = posição
  // entre as HABILITADAS, na ordem cronológica — mesma ordem de nSemestrais).
  // Cada uma é editável independentemente das demais: null/undefined numa
  // posição usa a sugestão automática só ali, sem afetar as outras; o array
  // pode ser mais curto que `semestraisQtd` (posições ausentes = automático).
  semestraisValoresManuais?: (number | null)[];
  mensalObraValorManual?: number | null;

  // Parcela mínima (R$) de cada bloco recorrente: abaixo desse piso, o bloco é
  // zerado e o saldo flui para o próximo da cascata — sempre priorizando o
  // período de Obra, que é o último da cascata e nunca é zerado por conta
  // deste piso (só fica com o que sobrar, mesmo que baixo).
  parcelaMinimaMensalObra: number;
  parcelaMinimaSemestral: number;
  parcelaMinimaPosObra: number;

  // 1ª Mensal (30 dias) + 2ª Mensal (60 dias): mesmo mecanismo já usado nas
  // demais condições comerciais — abatem primeiro do Ato (até o piso mínimo
  // de X% do imóvel), e o que sobrar reduz o saldo a parcelar diretamente.
  mensaisAntecipadas?: number;

  // Liga/desliga a parcela de chaves — o fluxo pode ser montado sem ela (o
  // saldo que seria dela flui para Semestrais/Mensais de Obra). Padrão true.
  chavesHabilitada?: boolean;

  // % do Ato Premiado (0 a 1). Vem da política do empreendimento; ausente = 10%.
  atoPremiadoPct?: number;
}

export interface ParcelamentoMorarResult {
  sinalMinimoCalculado: number;
  atoEfetivo: number;
  atoMaximoPossivel: number;
  descontoAtoPremiado: number;
  saldoAPagarDireto: number;
  nSemestrais: number;
  valoresSemestrais: number[];
  totalSemestrais: number;
  valorChaves: number;
  qtdParcelasPosObra: number;
  valorPosObraTotal: number;
  valorPosObraParcela: number;
  nMensaisObra: number;
  valorMensalObraTotal: number;
  valorMensalObra: number;
  pctRendaMensalObra: number;
  excedeRiscoRenda: boolean;
  abaixoParcelaMinimaMensalObra: boolean;
  subtotalAteChaves: number;
  pctSubtotalAteChaves: number;
}

/**
 * Motor de cálculo da condição "Parcelamento Morar" — replica a lógica da
 * planilha oficial usada pela Morar (fluxo direto): cada bloco recorrente é
 * calculado de forma INDEPENDENTE, sempre no seu teto máximo configurado na
 * política (a menos que editado manualmente na ficha):
 *   - Mensal de Obra: limitada por % da RENDA (padrão 40%) — é um teto
 *     rígido, não apenas um aviso.
 *   - Semestrais, Chaves e Pós-Obra: limitados por % do "Valor Utilizado"
 *     (Preço de Tabela menos o Desconto do Ato Premiado; o financiamento
 *     bancário eventual também é descontado, embora esta condição
 *     normalmente não o utilize).
 * O Ato (Sinal) é o bloco RESIDUAL: recebe o que sobra do Valor Utilizado
 * depois de reservados os tetos de todos os demais blocos, nunca abaixo do
 * Sinal Mínimo da política. Como o Desconto do Ato Premiado depende do
 * próprio Ato, e o Valor Utilizado depende do Desconto, a resolução é
 * iterativa (ponto fixo), mesmo padrão de referência circular já usado em
 * outros pontos do app.
 */
export function calcularParcelamentoMorar(p: ParcelamentoMorarParams): ParcelamentoMorarResult {
  const price = Math.max(0, p.price || 0);
  const recursos = Math.max(0, p.recursos || 0);
  const renda = Math.max(0, p.renda || 0);

  const sinalMinimoCalculado = Math.round(price * ((p.pctSinalMinimo ?? 10) / 100) * 100) / 100;

  const nMensaisObra = Math.max(0, Math.round(p.mesesObraQtd || 0));
  const nSemestrais = Math.max(0, Math.round(p.semestraisQtd || 0));
  const qtdParcelasPosObra = Math.max(0, Math.round(p.posObraQtd || 0));
  const chavesHabilitada = p.chavesHabilitada !== false;

  const parcelaMinimaMensalObra = Math.max(0, p.parcelaMinimaMensalObra ?? 200);
  const parcelaMinimaSemestral = Math.max(0, p.parcelaMinimaSemestral ?? 200);
  const parcelaMinimaPosObra = Math.max(0, p.parcelaMinimaPosObra ?? 200);

  const mensaisAntecipadas = Math.max(0, p.mensaisAntecipadas || 0);

  let atoAposAntecipadas = sinalMinimoCalculado;
  let descontoAtoPremiado = 0;
  let valorUtilizado = 0;
  let valorMensalObra = 0;
  let valorMensalObraTotal = 0;
  let valoresSemestrais: number[] = [];
  let totalSemestrais = 0;
  let valorChaves = 0;
  let valorPosObraParcela = 0;
  let valorPosObraTotal = 0;
  let antecipadasRestante = 0;

  // 40 iterações convergem com folga: a taxa de desconto do Ato Premiado
  // (10%) atua como fator de contração, reduzindo o erro pela metade (na
  // prática, por 10x) a cada passo.
  const pctAtoPremiadoPM = Math.max(0, p.atoPremiadoPct !== undefined ? p.atoPremiadoPct : ATO_PREMIADO_PCT_PADRAO);
  for (let iter = 0; iter < 40; iter++) {
    descontoAtoPremiado = (p.isAtoPremiadoEnabled && pctAtoPremiadoPM > 0)
      ? calcularDescontoAtoPremiado(atoAposAntecipadas, pctAtoPremiadoPM)
      : 0;
    valorUtilizado = Math.max(0, price - descontoAtoPremiado - recursos);

    // MENSAL DE OBRA — teto rígido de % da renda (padrão 40%), usado no valor
    // cheio por padrão (nunca zerada pela parcela mínima — apenas avisada).
    const mensalObraCapRenda = renda > 0 ? renda * ((p.pctRiscoRenda ?? 40) / 100) : 0;
    valorMensalObra = (p.mensalObraValorManual !== null && p.mensalObraValorManual !== undefined)
      ? Math.max(0, p.mensalObraValorManual)
      : mensalObraCapRenda;
    valorMensalObraTotal = nMensaisObra > 0 ? valorMensalObra * nMensaisObra : 0;

    // INTERMEDIÁRIAS SEMESTRAIS — teto de % do Valor Utilizado como sugestão
    // automática (abaixo da parcela mínima, zera); cada intermediária pode
    // ter seu valor editado manualmente de forma independente das demais —
    // qualquer edição entra direto nesta mesma cascata iterativa, então
    // dispara um novo cálculo geral (Ato residual, desconto do Ato Premiado
    // etc.) sem alterar o valor das outras intermediárias.
    const semestralTetoAuto = valorUtilizado * ((p.pctSemestralMax ?? 4) / 100);
    const semestralValorAuto = semestralTetoAuto < parcelaMinimaSemestral ? 0 : semestralTetoAuto;
    valoresSemestrais = Array.from({ length: nSemestrais }, (_, idx) => {
      const override = p.semestraisValoresManuais?.[idx];
      return (override !== null && override !== undefined) ? Math.max(0, override) : semestralValorAuto;
    });
    totalSemestrais = valoresSemestrais.reduce((soma, v) => soma + v, 0);

    // PARCELA DE CHAVES — teto de % do Valor Utilizado (pagamento único, sem
    // piso de parcela mínima); desligável, e nesse caso o teto some por
    // completo (o Ato absorve o que sobrar).
    const chavesTeto = valorUtilizado * ((p.pctChavesMax ?? 15) / 100);
    if (!chavesHabilitada) {
      valorChaves = 0;
    } else if (p.chavesValorManual !== null && p.chavesValorManual !== undefined) {
      valorChaves = Math.max(0, p.chavesValorManual);
    } else {
      valorChaves = chavesTeto;
    }

    // PÓS-OBRA — teto total de % do Valor Utilizado, dividido pela
    // quantidade de parcelas; abaixo da parcela mínima, o bloco é zerado.
    // Assim como a Mensal de Obra, é também uma parcela mensal recorrente —
    // por isso respeita o MESMO teto rígido de % da renda (padrão 40%) da
    // política de crédito, nunca podendo ultrapassá-lo mesmo que o teto de %
    // do imóvel permitisse um valor maior.
    if (qtdParcelasPosObra > 0) {
      const posObraTetoTotal = valorUtilizado * ((p.pctPosObraMax ?? 5) / 100);
      const posObraTetoPorImovel = posObraTetoTotal / qtdParcelasPosObra;
      const posObraCapRenda = renda > 0 ? renda * ((p.pctRiscoRenda ?? 40) / 100) : posObraTetoPorImovel;
      const natural = Math.min(posObraTetoPorImovel, posObraCapRenda);
      valorPosObraParcela = (p.posObraValorManual !== null && p.posObraValorManual !== undefined)
        ? Math.max(0, p.posObraValorManual)
        : (natural < parcelaMinimaPosObra ? 0 : natural);
      valorPosObraTotal = valorPosObraParcela * qtdParcelasPosObra;
    } else {
      valorPosObraParcela = 0;
      valorPosObraTotal = 0;
    }

    const somaDemaisBlocos = valorMensalObraTotal + totalSemestrais + valorChaves + valorPosObraTotal;
    const atoResidual = valorUtilizado - somaDemaisBlocos;
    const atoBrutoPreAntecipadas = (p.valAtoManual !== null && p.valAtoManual >= sinalMinimoCalculado)
      ? p.valAtoManual
      : Math.max(sinalMinimoCalculado, atoResidual);

    // 1ª/2ª Mensal (30/60 dias): abatem primeiro do Ato, até o piso mínimo
    // (sinalMinimoCalculado) — o que não couber fica em antecipadasRestante.
    const disponivelAbatimentoAto = Math.max(0, atoBrutoPreAntecipadas - sinalMinimoCalculado);
    const atoAbsorvidoAntecipadas = Math.min(disponivelAbatimentoAto, mensaisAntecipadas);
    atoAposAntecipadas = atoBrutoPreAntecipadas - atoAbsorvidoAntecipadas;
    antecipadasRestante = mensaisAntecipadas - atoAbsorvidoAntecipadas;
  }

  const atoMaximoPossivel = Math.max(0, price - recursos - descontoAtoPremiado);
  const atoEfetivo = Math.min(atoAposAntecipadas, atoMaximoPossivel);

  // RATEIO PROPORCIONAL entre Mensal de Obra e Pós-Obra: até aqui, os dois vinham
  // sempre do próprio teto individual (mensalObraCapRenda / "natural" do pós-obra,
  // acima) — cada um tratado como se seu teto cheio estivesse sempre garantido.
  // Nada impedia a SOMA dos dois tetos de passar do que realmente sobra do imóvel
  // depois do Ato (já no piso mínimo, sem poder cair mais) + Semestrais + Chaves —
  // e quando isso acontecia, o excesso simplesmente se empilhava em cima do preço
  // (Sinal Total > Preço do imóvel, o que não existe na prática: o cliente nunca
  // paga mais do que o imóvel custa). A correção: quando os dois tetos juntos não
  // cabem no que sobra, os dois encolhem juntos, na MESMA proporção entre si —
  // nunca um único bloco absorve o corte sozinho. Blocos com valor manual (o
  // corretor digitou) ficam de fora do rateio — são tratados como fixos, e o
  // corte (se precisar) recai só sobre o(s) bloco(s) automático(s).
  const mensalObraIsManual = p.mensalObraValorManual !== null && p.mensalObraValorManual !== undefined;
  const posObraIsManual = p.posObraValorManual !== null && p.posObraValorManual !== undefined;
  const somaMaximosFlexiveis =
    (mensalObraIsManual ? 0 : valorMensalObraTotal) + (posObraIsManual ? 0 : valorPosObraTotal);
  const totalFixo =
    (mensalObraIsManual ? valorMensalObraTotal : 0) + (posObraIsManual ? valorPosObraTotal : 0);
  const disponivelFlexiveis = Math.max(0, valorUtilizado - atoEfetivo - totalSemestrais - valorChaves - totalFixo);
  const fatorRateio = somaMaximosFlexiveis > 0
    ? Math.min(1, disponivelFlexiveis / somaMaximosFlexiveis)
    : 1;

  if (!mensalObraIsManual) {
    valorMensalObraTotal = valorMensalObraTotal * fatorRateio;
    valorMensalObra = nMensaisObra > 0 ? valorMensalObraTotal / nMensaisObra : 0;
  }
  if (!posObraIsManual) {
    valorPosObraTotal = valorPosObraTotal * fatorRateio;
    valorPosObraParcela = qtdParcelasPosObra > 0 ? valorPosObraTotal / qtdParcelasPosObra : 0;
  }

  // Antecipadas que não couberam no abatimento do Ato (raro: Ato já no piso
  // mínimo) reduzem o total das Mensais de Obra — depois do rateio acima, para
  // não distorcer a proporção entre Mensal de Obra e Pós-Obra.
  if (antecipadasRestante > 0) {
    valorMensalObraTotal = Math.max(0, valorMensalObraTotal - antecipadasRestante);
    valorMensalObra = nMensaisObra > 0 ? valorMensalObraTotal / nMensaisObra : 0;
  }

  const saldoAPagarDireto = valorMensalObraTotal + totalSemestrais + valorChaves + valorPosObraTotal;

  const abaixoParcelaMinimaMensalObra = nMensaisObra > 0 && valorMensalObra > 0 && valorMensalObra < parcelaMinimaMensalObra - 0.005;
  const pctRendaMensalObra = renda > 0 ? (valorMensalObra / renda) * 100 : 0;
  const excedeRiscoRenda = renda > 0 && valorMensalObra > renda * ((p.pctRiscoRenda ?? 40) / 100) + 0.01;

  const subtotalAteChaves = atoEfetivo + valorMensalObraTotal + totalSemestrais + valorChaves;
  const pctSubtotalAteChaves = price > 0 ? (subtotalAteChaves / price) * 100 : 0;

  return {
    sinalMinimoCalculado,
    atoEfetivo: Math.round(atoEfetivo * 100) / 100,
    atoMaximoPossivel: Math.round(atoMaximoPossivel * 100) / 100,
    descontoAtoPremiado: Math.round(descontoAtoPremiado * 100) / 100,
    saldoAPagarDireto: Math.round(saldoAPagarDireto * 100) / 100,
    nSemestrais,
    valoresSemestrais: valoresSemestrais.map(v => Math.round(v * 100) / 100),
    totalSemestrais: Math.round(totalSemestrais * 100) / 100,
    valorChaves: Math.round(valorChaves * 100) / 100,
    qtdParcelasPosObra,
    valorPosObraTotal: Math.round(valorPosObraTotal * 100) / 100,
    valorPosObraParcela: Math.round(valorPosObraParcela * 100) / 100,
    nMensaisObra,
    valorMensalObraTotal: Math.round(valorMensalObraTotal * 100) / 100,
    valorMensalObra: Math.round(valorMensalObra * 100) / 100,
    pctRendaMensalObra,
    excedeRiscoRenda,
    abaixoParcelaMinimaMensalObra,
    subtotalAteChaves: Math.round(subtotalAteChaves * 100) / 100,
    pctSubtotalAteChaves
  };
}
