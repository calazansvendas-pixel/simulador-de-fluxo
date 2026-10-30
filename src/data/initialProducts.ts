import { Product } from '../types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Vista dos Colibris',
    isFeatured: true,
    deliveryDate: '2026-02-28',
    deliveryDatePhase1: '2026-02-28',
    deliveryDatePhase2: '2027-02-28',
    conditions: [
      {
        id: 'cond_col_direto',
        name: 'Sinal c/ Banco Direto (60X)',
        numParcelas: 60,
        sinalMinimo: 'R$ 2.000,00',
        riscoRendaPct: 35,
        riscoImovelPct: 20,
        mesesTabela1: 60,
        taxaJuros1: 1.9,
        mesesTabela2: 60,
        taxaJuros2: 1.9,
        policy: 'POLÍTICA VISTA DOS COLIBRIS - SINAL C/ BANCO DIRETO:\n- Sinal parcelado em até 60x direto com a construtora.\n- Entrada mínima R$ 2.000,00.'
      },
      {
        id: 'cond_col_morar',
        name: 'Sinal c/ Morar',
        numParcelas: 60,
        sinalMinimo: 'R$ 2.000,00',
        riscoRendaPct: 30,
        riscoImovelPct: 17,
        percMaxProSolutoGlobal: 17.0,
        percMaxPosObra: 8.0,
        riscoPosPct: 8.0,
        mesesObra: 24,
        mesesPos: 36,
        globalSerie1Pct: 30.0,
        globalSerie2Pct: 25.0,
        globalSerie3Pct: 20.0,
        globalSerie4Pct: 15.0,
        globalSerie5Pct: 10.0,
        globalSerie6Pct: 5.0,
        mesesTabela1: 36,
        taxaJuros1: 0.0,
        mesesTabela2: 72,
        taxaJuros2: 1.0,
        policy: 'POLÍTICA VISTA DOS COLIBRIS - SINAL C/ MORAR:\n- Fluxo de Obra e Pós-Obra.\n- ITBI e Registro parcelados.'
      }
    ],
    tableInfo: {
      validFrom: '2026-07-01',
      validTo: '2026-10-31',
      fileName: 'tabela_vendas_vista_dos_colibris.xlsx',
      headers: ['Fase', 'TORRE', 'UNIDADE', 'ÁREA PRIVATIVA M² - APTO', 'ÁREA QUINTAL M²', 'TIPOLOGIA', 'AVALIAÇÃO', 'PREÇO', 'ITBI + Registro 1º Imóvel', 'ITBI + Registro 2º Imóvel'],
      rows: [
        ['1ª Fase', 'D', '303', '44,02 m²', '0,00 m²', '2 Quartos', 218000.00, 241902.00, 4806.00, 19230.00],
        ['1ª Fase', 'D', '801', '42,14 m²', '0,00 m²', '2 Quartos', 218000.00, 246902.00, 4806.00, 19230.00],
        ['1ª Fase', 'C', '304', '44,02 m²', '0,00 m²', '2 Quartos', 218000.00, 239902.00, 4806.00, 19230.00],
        ['1ª Fase', 'C', '308', '43,50 m²', '0,00 m²', '2 Quartos', 218000.00, 241902.00, 4806.00, 19230.00]
      ],
      active: true
    }
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Colina das Amoras',
    isFeatured: true,
    deliveryDate: '2027-06-30',
    deliveryDatePhase1: '2027-06-30',
    deliveryDatePhase2: '2027-11-30',
    conditions: [
      {
        id: 'cond_amo_direto',
        name: 'Sinal c/ Banco Direto (60X)',
        numParcelas: 60,
        sinalMinimo: 'R$ 2.000,00',
        riscoRendaPct: 35,
        riscoImovelPct: 20,
        mesesTabela1: 60,
        taxaJuros1: 1.9,
        mesesTabela2: 60,
        taxaJuros2: 1.9,
        policy: 'POLÍTICA COLINA DAS AMORAS - SINAL C/ BANCO DIRETO:\n- Sinal parcelado em até 60x direto com a construtora.\n- Entrada mínima R$ 2.000,00.'
      },
      {
        id: 'cond_amo_morar',
        name: 'Sinal c/ Morar',
        numParcelas: 60,
        sinalMinimo: 'R$ 2.000,00',
        riscoRendaPct: 30,
        riscoImovelPct: 17,
        percMaxProSolutoGlobal: 17.0,
        percMaxPosObra: 8.0,
        riscoPosPct: 8.0,
        mesesObra: 33,
        mesesPos: 27,
        globalSerie1Pct: 30.0,
        globalSerie2Pct: 25.0,
        globalSerie3Pct: 20.0,
        globalSerie4Pct: 15.0,
        globalSerie5Pct: 10.0,
        globalSerie6Pct: 5.0,
        mesesTabela1: 36,
        taxaJuros1: 0.0,
        mesesTabela2: 72,
        taxaJuros2: 1.0,
        policy: 'POLÍTICA COLINA DAS AMORAS - SINAL C/ MORAR:\n- Fluxo com períodos de Obra (INCC) e Pós-Obra (IPCA+1%).\n- ITBI e Registro parcelados (IGPM+1%).'
      }
    ],
    tableInfo: {
      validFrom: '2026-07-15',
      validTo: '2026-10-31',
      fileName: 'tabela_amoras_vigente.xlsx',
      headers: ['Fase', 'TORRE', 'UNIDADE', 'ÁREA PRIVATIVA M² - APTO', 'ÁREA QUINTAL M²', 'TIPOLOGIA', 'AVALIAÇÃO', 'PREÇO', 'ITBI + Registro 1º Imóvel', 'ITBI + Registro 2º Imóvel'],
      rows: [
        ['1ª', 'Bloco 1', '201', '48,50 m²', '0,00 m²', '2 Quartos c/ Suíte', 325000.00, 310000.00, 13671.00, 17050.00],
        ['1ª', 'Bloco 1', '302', '48,50 m²', '0,00 m²', '2 Quartos c/ Suíte', 330000.00, 315000.00, 13891.50, 17325.00]
      ],
      active: true
    }
  }
];
