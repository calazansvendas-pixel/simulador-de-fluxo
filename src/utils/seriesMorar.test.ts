import { describe, it, expect } from 'bun:test';
import { calculateMorarFlowEngine } from './calculations';

// Caso real: Vista dos Colibris — Torre D — Unidade 708 — Sinal c/ Morar (Comissão Apartada).
// Preço de Tabela R$ 309.929,11 − Desconto Construtora R$ 5.000,00; Subsídio 1.253,25; FGTS 25.698,99;
// Sinal Líquido R$ 34.210,75; Ato líquido R$ 2.000,00; ITBI R$ 13.508,51; Obra 30 m; Pós-Obra 42 m.
const PRECO = 309929.11 - 5000;
const FINANCIAMENTO = PRECO - 12197.16 - 34210.75 - 1253.25 - 25698.99;

const rodar = (extra: Record<string, unknown> = {}) => calculateMorarFlowEngine({
  precoTabela: PRECO, avaliacaoBanco: 307000, itbiRegistro: 13508.51, renda: 7586.32,
  financiamento: FINANCIAMENTO, subsidio: 1253.25, fgts: 25698.99,
  percentualRiscoGeral: 17, percentualRiscoPos: 8, mesesObra: 30, mesesPos: 42, tetoRendaMensalPct: 40,
  globalSeriesPct: [30, 25, 20, 15, 10, 5], serieMesesCapacidades: [12, 12, 12, 12, 12, 12],
  sinalMinimo: 2000, atoITBI: 0, isAtoPremiadoEnabled: true, atoPremiadoPct: 0.1,
  isComissaoApartada: true, pctComissaoApartada: 0.04, maxParcelasITBI: 72, ...extra
} as any);

describe('séries Morar — unidade 708 com Comissão Apartada', () => {
  const r = rodar();
  const obra = r.obraSeries.filter(s => s.qtd > 0);
  const pos = r.posSeries.filter(s => s.qtd > 0);

  it('mantém todos os meses: Obra 30 e Pós-Obra 42 (S3 6x + S4 12x + S5 12x + S6 12x)', () => {
    expect(obra.reduce((t, s) => t + s.qtd, 0)).toBe(30);
    expect(pos.reduce((t, s) => t + s.qtd, 0)).toBe(42);
    expect(pos.map(s => s.qtd)).toEqual([6, 12, 12, 12]);
  });

  it('nenhuma série zerada (valores naturais decrescentes, sem piso forçado)', () => {
    for (const s of [...obra, ...pos]) expect(s.parcelaLiquida).toBeGreaterThan(0);
  });

  it('as séries somam o Sinal Líquido − Ato (R$ 32.210,75) e o total fecha com o Total com ITBI', () => {
    const soma = [...obra, ...pos].reduce((t, s) => t + s.qtd * s.parcelaLiquida, 0);
    expect(Math.abs(soma - 32210.75)).toBeLessThanOrEqual(0.06);
    expect(Math.abs(r.distribuidoTotal - r.totalComITBI)).toBeLessThanOrEqual(0.06);
    expect(r.totalComITBI).toBeCloseTo(59916.42, 2);
  });

  it('parcela mensal do ITBI truncada: 72 × parcela nunca passa do saldo', () => {
    expect(r.parcelaMensalITBI).toBe(187.61);
    expect(72 * r.parcelaMensalITBI).toBeLessThanOrEqual(13508.51);
  });

  it('o mesmo vale com o prazo do ITBI informado (72x)', () => {
    const r2 = rodar({ parcelasITBI: 72 });
    const ss = [...r2.obraSeries, ...r2.posSeries].filter(s => s.qtd > 0);
    expect(r2.posSeries.filter(s => s.qtd > 0).reduce((t, s) => t + s.qtd, 0)).toBe(42);
    for (const s of ss) expect(s.parcelaLiquida).toBeGreaterThan(0);
  });
});
