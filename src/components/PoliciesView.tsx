import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Layers, 
  PlusCircle, 
  ShieldCheck, 
  Calculator, 
  Building, 
  ShieldAlert, 
  Eraser, 
  Save, 
  X,
  HardHat,
  KeyRound,
  Coins,
  TrendingUp,
  Calendar,
  CalendarClock,
  AlertTriangle,
  Percent
} from 'lucide-react';
import { CommercialCondition, Product, SelectedUnit, SimulationData } from '../types';
import { formatCurrency, parseCurrency } from '../utils/formatters';
import { calculatePresentValue, ensureProductConditions, calculatePolicyRiskValues, decomposeMorarMonths, getConditionKind, ConditionKind } from '../utils/calculations';

// Par "condição base -> condição com Comissão Apartada" dentro do mesmo
// empreendimento (ver blocosMeta.ts e o comentário de comissaoApartadaPct em
// types.ts). "Parcelamento Morar" não tem par de comissão apartada. As telas
// simplificadas ("**"/"Com. Apartada)**") não entram aqui: usam o MESMO
// ConditionKind das versões completas (getConditionKind não distingue
// completa de simplificada), então já ficam sincronizadas automaticamente.
const PAR_COMISSAO_APARTADA: Partial<Record<ConditionKind, ConditionKind>> = {
  'sinal-morar': 'sinal-morar-comissao-apartada',
  'banco-direto': 'banco-direto-comissao-apartada',
};

// Parâmetros que NUNCA são propagados da condição base para o par de Comissão
// Apartada: as regras específicas da própria comissão (dedução e parcelamento
// dela) e o texto descritivo da política, que referencia o nome de cada
// condição — tudo o mais (prazos, taxas, limites de risco, travas de
// aprovação) deve ficar idêntico entre as duas.
const CAMPOS_EXCLUSIVOS_COMISSAO_APARTADA: (keyof CommercialCondition)[] = [
  'comissaoApartadaPct',
  'comissaoApartadaParcelas',
  'comissaoApartadaParcelasMin',
  'comissaoApartadaParcelasMax',
  'policy',
];

interface PoliciesViewProps {
  products: Product[];
  activeProductId: string;
  onSelectProduct: (productId: string) => void;
  onSaveProductPolicy: (updatedProduct: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onOpenNewProductModal: () => void;
  onShowToast: (message: string) => void;
  clientIncome: number;
  isFirstHome?: boolean;
  simulationData?: SimulationData;
  selectedUnits?: Record<string, SelectedUnit>;
}

// Helpers para conversão e formatação robusta de decimais e inteiros
const parseDecimal = (val: string | number | undefined, defaultVal = 0): number => {
  if (val === undefined || val === null) return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  const cleaned = String(val).trim().replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? defaultVal : parsed;
};

// Mesma tolerância do parseDecimal, mas para inteiros — o padrão (defaultVal)
// só é usado quando o campo está vazio/indefinido ou não é um número válido.
// Diferente de "parseInt(val, 10) || defaultVal", um 0 digitado explicitamente
// pelo usuário é preservado (0 é um valor legítimo para vários campos da
// política de crédito, ex.: piso de sinal, meses de uma faixa/balde etc.).
const parseIntFlexible = (val: string | number | undefined, defaultVal = 0): number => {
  if (val === undefined || val === null) return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : Math.trunc(val);
  const trimmed = String(val).trim();
  if (trimmed === '') return defaultVal;
  const parsed = parseInt(trimmed, 10);
  return isNaN(parsed) ? defaultVal : parsed;
};

// Mesma ideia para o Sinal Mínimo (campo de moeda): só cai no padrão quando o
// texto está vazio — "R$ 0,00" digitado explicitamente é um piso válido.
const resolveSinalMinimo = (raw: string, defaultVal = 2000): number => {
  return raw.trim() === '' ? defaultVal : parseCurrency(raw);
};

const formatDecimalBR = (num: number, minDec = 1, maxDec = 2): string => {
  if (isNaN(num)) return '0';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: minDec, maximumFractionDigits: maxDec });
};

export const PoliciesView: React.FC<PoliciesViewProps> = ({
  products,
  activeProductId,
  onSelectProduct,
  onSaveProductPolicy,
  onDeleteProduct,
  onOpenNewProductModal,
  onShowToast,
  clientIncome,
  isFirstHome = true,
  simulationData,
  selectedUnits
}) => {
  const activeProd = products.find(p => p.id === activeProductId) || products[0];
  const prodWithConds = activeProd ? ensureProductConditions({ ...activeProd }) : null;

  const [activeConditionId, setActiveConditionId] = useState<string>('');
  
  // Local editable state for current product & condition
  const [productName, setProductName] = useState<string>('');
  const [deliveryDatePhase1, setDeliveryDatePhase1] = useState<string>('');
  const [deliveryDatePhase2, setDeliveryDatePhase2] = useState<string>('');
  const [isFeatured, setIsFeatured] = useState<boolean>(false);

  // String states for flexible decimal and numeric inputs (accepts both ',' and '.')
  const [numParcelasStr, setNumParcelasStr] = useState<string>('72');
  // Menor "Qtd. Mensais" que o corretor pode digitar na ficha — padrão 1
  // (comportamento histórico); pode ser reduzida até 0 para permitir quitar o
  // Pró-Soluto inteiro no Ato quando não há mais parcelas.
  const [parcelasMinimasStr, setParcelasMinimasStr] = useState<string>('1');
  const [sinalMinimo, setSinalMinimo] = useState<string>('R$ 2.000,00');
  const [riscoRendaStr, setRiscoRendaStr] = useState<string>('30,0');
  const [riscoImovelStr, setRiscoImovelStr] = useState<string>('25,0');
  const [mesesTabela1Str, setMesesTabela1Str] = useState<string>('36');
  const [taxaJuros1Str, setTaxaJuros1Str] = useState<string>('0,00');
  const [mesesTabela2Str, setMesesTabela2Str] = useState<string>('72');
  const [taxaJuros2Str, setTaxaJuros2Str] = useState<string>('1,00');
  // Taxa Bancária (%) — exclusiva do Sinal c/ Banco Direto: reduz o Risco
  // Máximo Apurado que sugere o Ato (Imóvel) e o "Pró-Soluto Total c/ ITBI"
  // exibido em tela; a parcela (Tabela Price) usa o valor antes do desconto.
  const [taxaAssinaturaContratoStr, setTaxaAssinaturaContratoStr] = useState<string>('0,0000');
  // % do Ato Premiado — desconto comercial aplicado em cima do Ato Efetivo. Antes
  // era fixo em 10% em todos os cálculos; agora vem por condição comercial e
  // pode ficar zerado (0%). Padrão histórico continua sendo 10%.
  const [atoPremiadoPctStr, setAtoPremiadoPctStr] = useState<string>('10,00');
  // Comissão Apartada — exclusiva da condição "Sinal c/ Banco Direto (Comissão
  // Apartada)": % sobre o Preço de Tabela (padrão 4%) e quantidade padrão de
  // parcelas (padrão 6x, editável na ficha por simulação).
  const [comissaoApartadaPctStr, setComissaoApartadaPctStr] = useState<string>('4,00');
  const [comissaoApartadaParcelasStr, setComissaoApartadaParcelasStr] = useState<string>('6');
  // Limites (mín./máx.) de parcelas que o corretor pode digitar na ficha para
  // a Comissão Apartada — travam o input em ambas as pontas.
  const [comissaoApartadaParcelasMinStr, setComissaoApartadaParcelasMinStr] = useState<string>('1');
  const [comissaoApartadaParcelasMaxStr, setComissaoApartadaParcelasMaxStr] = useState<string>('6');
  const [policyText, setPolicyText] = useState<string>('');
  // % de Desconto à Vista: comum a todas as condições comerciais de todos os
  // produtos (não é exclusivo de Sinal c/ Morar ou Parcelamento Morar) —
  // cadastro de base para uma futura regra de desconto, ainda sem uso no
  // cálculo do simulador.
  const [descontoAVistaStr, setDescontoAVistaStr] = useState<string>('0,0');

  // Estados específicos para a condição "Sinal c/ Morar"
  const [mesesObraStr, setMesesObraStr] = useState<string>('33');
  const [mesesPosStr, setMesesPosStr] = useState<string>('27');
  const [riscoPosStr, setRiscoPosStr] = useState<string>('8,0');
  const [globalSerie1Str, setGlobalSerie1Str] = useState<string>('30,0');
  const [globalSerie2Str, setGlobalSerie2Str] = useState<string>('25,0');
  const [globalSerie3Str, setGlobalSerie3Str] = useState<string>('20,0');
  const [globalSerie4Str, setGlobalSerie4Str] = useState<string>('15,0');
  const [globalSerie5Str, setGlobalSerie5Str] = useState<string>('10,0');
  const [globalSerie6Str, setGlobalSerie6Str] = useState<string>('5,0');
  // Quantidade de meses de cada balde (independente do percentual). Um balde
  // dividido entre Obra e Pós-Obra continua sendo o mesmo balde (mesmo percentual).
  const [serie1MesesStr, setSerie1MesesStr] = useState<string>('12');
  const [serie2MesesStr, setSerie2MesesStr] = useState<string>('12');
  const [serie3MesesStr, setSerie3MesesStr] = useState<string>('12');
  const [serie4MesesStr, setSerie4MesesStr] = useState<string>('12');
  const [serie5MesesStr, setSerie5MesesStr] = useState<string>('12');
  const [serie6MesesStr, setSerie6MesesStr] = useState<string>('12');

  // Estados específicos para a condição "Parcelamento Morar"
  const [pmSinalMinimoStr, setPmSinalMinimoStr] = useState<string>('10,0');
  const [pmSemestralMaxStr, setPmSemestralMaxStr] = useState<string>('4,0');
  const [pmChavesMaxStr, setPmChavesMaxStr] = useState<string>('15,0');
  const [pmChavesMesesAntesStr, setPmChavesMesesAntesStr] = useState<string>('2');
  const [pmPosObraMaxStr, setPmPosObraMaxStr] = useState<string>('5,0');
  const [pmQtdParcelasPosObraStr, setPmQtdParcelasPosObraStr] = useState<string>('12');
  const [pmParcelaMinMensalObra, setPmParcelaMinMensalObra] = useState<string>('R$ 200,00');
  const [pmParcelaMinSemestral, setPmParcelaMinSemestral] = useState<string>('R$ 200,00');
  const [pmParcelaMinPosObra, setPmParcelaMinPosObra] = useState<string>('R$ 200,00');

  // Estado das torres habilitadas para simulação nesta política
  const [torresHabilitadas, setTorresHabilitadas] = useState<string[]>([]);

  // Política de crédito distinta por fase: qual fase está sendo editada no
  // formulário agora, e quais torres desta condição pertencem à 2ª Fase.
  const [editingFase, setEditingFase] = useState<'1' | '2'>('1');
  const [torresFase2, setTorresFase2] = useState<string[]>([]);

  // Extração de todas as torres e contagem de unidades do empreendimento ativo
  const allTorres = React.useMemo(() => {
    const rows = prodWithConds?.tableInfo?.rows || [];
    return Array.from(new Set(rows.map(r => String(r[1] || '').trim()).filter(t => t !== '')));
  }, [prodWithConds?.tableInfo?.rows]);

  const unitsCountByTorre = React.useMemo(() => {
    const rows = prodWithConds?.tableInfo?.rows || [];
    const counts: Record<string, number> = {};
    rows.forEach(r => {
      const t = String(r[1] || '').trim();
      if (t) {
        counts[t] = (counts[t] || 0) + 1;
      }
    });
    return counts;
  }, [prodWithConds?.tableInfo?.rows]);

  const syncTorresToProduct = (newTorres: string[]) => {
    if (!prodWithConds) return;
    const updatedConditions = (prodWithConds.conditions || []).map(c => {
      if (c.id === activeConditionId) {
        return {
          ...c,
          torresHabilitadas: newTorres
        };
      }
      return c;
    });

    const updatedProd: Product = {
      ...prodWithConds,
      name: productName.trim() || prodWithConds.name,
      deliveryDate: deliveryDatePhase1 || deliveryDatePhase2 || '',
      deliveryDatePhase1,
      deliveryDatePhase2,
      isFeatured,
      conditions: updatedConditions
    };

    onSaveProductPolicy(updatedProd);
  };

  const handleToggleTorre = (torreName: string) => {
    const next = torresHabilitadas.includes(torreName)
      ? torresHabilitadas.filter(t => t !== torreName)
      : [...torresHabilitadas, torreName];
    setTorresHabilitadas(next);
    syncTorresToProduct(next);
  };

  const handleSelectAllTorres = () => {
    const next = [...allTorres];
    setTorresHabilitadas(next);
    syncTorresToProduct(next);
  };

  const handleDeselectAllTorres = () => {
    const next: string[] = [];
    setTorresHabilitadas(next);
    syncTorresToProduct(next);
  };

  const syncTorresFase2ToProduct = (newTorresFase2: string[]) => {
    if (!prodWithConds) return;
    const updatedConditions = (prodWithConds.conditions || []).map(c => {
      if (c.id === activeConditionId) {
        return {
          ...c,
          torresFase2: newTorresFase2
        };
      }
      return c;
    });

    const updatedProd: Product = {
      ...prodWithConds,
      name: productName.trim() || prodWithConds.name,
      deliveryDate: deliveryDatePhase1 || deliveryDatePhase2 || '',
      deliveryDatePhase1,
      deliveryDatePhase2,
      isFeatured,
      conditions: updatedConditions
    };

    onSaveProductPolicy(updatedProd);
  };

  const handleToggleTorreFase2 = (torreName: string) => {
    const next = torresFase2.includes(torreName)
      ? torresFase2.filter(t => t !== torreName)
      : [...torresFase2, torreName];
    setTorresFase2(next);
    syncTorresFase2ToProduct(next);
  };

  // Modal State for New Commercial Condition
  const [isNewConditionModalOpen, setIsNewConditionModalOpen] = useState<boolean>(false);
  const [newConditionName, setNewConditionName] = useState<string>('');
  const newCondInputRef = useRef<HTMLInputElement>(null);

  // Sync state when active product changes. `products` muda a cada salvamento
  // (inclusive os disparados por este próprio componente, como trocar de fase
  // ou salvar a política) — por isso o formulário só é recarregado do zero
  // quando o produto ou a condição ativa realmente mudam (lastSyncedConditionKeyRef),
  // nunca apenas porque o array de produtos foi atualizado. Sem essa guarda, um
  // salvamento feito enquanto se edita a 2ª Fase forçaria o formulário de volta
  // para a 1ª Fase no meio da edição.
  const lastSyncedConditionKeyRef = useRef<string>('');
  useEffect(() => {
    if (prodWithConds) {
      setProductName(prodWithConds.name);
      setDeliveryDatePhase1(prodWithConds.deliveryDatePhase1 || prodWithConds.deliveryDate || '');
      setDeliveryDatePhase2(prodWithConds.deliveryDatePhase2 || '');
      setIsFeatured(prodWithConds.isFeatured || false);

      // Se a condição ativa atual ainda existir no produto atualizado, mantenha-a
      const currentSelectedCond = prodWithConds.conditions.find(c => c.id === activeConditionId);
      const targetCond = currentSelectedCond || prodWithConds.conditions[0];
      const syncKey = `${activeProductId}:${targetCond ? targetCond.id : ''}`;

      if (lastSyncedConditionKeyRef.current !== syncKey) {
        lastSyncedConditionKeyRef.current = syncKey;
        if (currentSelectedCond) {
          loadConditionData(currentSelectedCond);
        } else if (targetCond) {
          setActiveConditionId(targetCond.id);
          loadConditionData(targetCond);
        }
      }
    }
  }, [activeProductId, products]);

  const loadConditionData = (cond: CommercialCondition, fase: '1' | '2' = '1') => {
    // Para a 2ª Fase, os campos de fase2Params sobrescrevem os da condição base;
    // qualquer campo não definido em fase2Params mantém o valor da 1ª Fase.
    const source: CommercialCondition = fase === '2' ? { ...cond, ...(cond.fase2Params || {}) } : cond;

    const condKind = getConditionKind(cond.name);
    const isMorar = condKind === 'sinal-morar';
    const isParcelamentoMorar = condKind === 'parcelamento-morar';
    const numP = source.numParcelas !== undefined ? source.numParcelas : 72;
    const parcelasMin = source.parcelasMinimas !== undefined ? source.parcelasMinimas : 1;
    const rr = source.riscoRendaPct !== undefined ? source.riscoRendaPct : (isParcelamentoMorar ? 40 : 30);
    const ri = source.percMaxProSolutoGlobal !== undefined
      ? source.percMaxProSolutoGlobal
      : (source.riscoImovelPct !== undefined ? source.riscoImovelPct : (isMorar ? 17 : 25));
    const rp = source.percMaxPosObra !== undefined
      ? source.percMaxPosObra
      : (source.riscoPosPct !== undefined ? source.riscoPosPct : 8.0);
    const m1 = source.mesesTabela1 !== undefined ? source.mesesTabela1 : 36;
    const t1 = source.taxaJuros1 !== undefined ? source.taxaJuros1 : 0.0;
    const m2 = source.mesesTabela2 !== undefined ? source.mesesTabela2 : 72;
    const t2 = source.taxaJuros2 !== undefined ? source.taxaJuros2 : 1.0;
    const ta = source.taxaAssinaturaContratoPct !== undefined ? source.taxaAssinaturaContratoPct : 0;
    // Padrão histórico do Ato Premiado é 10% — só se a política tiver um valor
    // gravado explicitamente (inclusive 0) é que ela sobrescreve o padrão.
    const apPct = source.atoPremiadoPct !== undefined ? Math.round(source.atoPremiadoPct * 10000) / 100 : 10;
    // Comissão Apartada: padrão 4% quando a política não define.
    const caPct = source.comissaoApartadaPct !== undefined ? Math.round(source.comissaoApartadaPct * 10000) / 100 : 4;
    const caParcelas = source.comissaoApartadaParcelas !== undefined ? source.comissaoApartadaParcelas : 6;
    const caParcelasMin = source.comissaoApartadaParcelasMin !== undefined ? source.comissaoApartadaParcelasMin : 1;
    const caParcelasMax = source.comissaoApartadaParcelasMax !== undefined ? source.comissaoApartadaParcelasMax : 6;

    const mo = source.mesesObra !== undefined ? source.mesesObra : 33;
    const mp = source.mesesPos !== undefined ? source.mesesPos : 27;
    const gs1 = source.globalSerie1Pct !== undefined ? source.globalSerie1Pct : 30.0;
    const gs2 = source.globalSerie2Pct !== undefined ? source.globalSerie2Pct : 25.0;
    const gs3 = source.globalSerie3Pct !== undefined ? source.globalSerie3Pct : 20.0;
    const gs4 = source.globalSerie4Pct !== undefined ? source.globalSerie4Pct : 15.0;
    const gs5 = source.globalSerie5Pct !== undefined ? source.globalSerie5Pct : 10.0;
    const gs6 = source.globalSerie6Pct !== undefined ? source.globalSerie6Pct : 5.0;
    const sm1 = source.serie1Meses !== undefined ? source.serie1Meses : 12;
    const sm2 = source.serie2Meses !== undefined ? source.serie2Meses : 12;
    const sm3 = source.serie3Meses !== undefined ? source.serie3Meses : 12;
    const sm4 = source.serie4Meses !== undefined ? source.serie4Meses : 12;
    const sm5 = source.serie5Meses !== undefined ? source.serie5Meses : 12;
    const sm6 = source.serie6Meses !== undefined ? source.serie6Meses : 12;

    const pmSinal = source.pmSinalMinimoPct !== undefined ? source.pmSinalMinimoPct : 10.0;
    const pmSemestral = source.pmParcelaSemestralMaxPct !== undefined ? source.pmParcelaSemestralMaxPct : 4.0;
    const pmChaves = source.pmParcelaChavesMaxPct !== undefined ? source.pmParcelaChavesMaxPct : 15.0;
    const pmChavesMesesAntes = source.pmParcelaChavesMesesAntes !== undefined ? source.pmParcelaChavesMesesAntes : 2;
    const pmPosObra = source.pmRiscoProSolutoPosObraPct !== undefined ? source.pmRiscoProSolutoPosObraPct : 5.0;
    const pmQtdPosObra = source.pmQtdParcelasPosObra !== undefined ? source.pmQtdParcelasPosObra : 12;
    const pmMinMensalObra = source.pmParcelaMinimaMensalObra !== undefined ? source.pmParcelaMinimaMensalObra : 200;
    const pmMinSemestral = source.pmParcelaMinimaSemestral !== undefined ? source.pmParcelaMinimaSemestral : 200;
    const pmMinPosObra = source.pmParcelaMinimaPosObra !== undefined ? source.pmParcelaMinimaPosObra : 200;

    const parsedSinal = source.sinalMinimo !== undefined ? parseCurrency(source.sinalMinimo) : 2000;
    const formattedSinal = formatCurrency(parsedSinal);
    const descontoAVista = source.descontoAVistaPct !== undefined ? source.descontoAVistaPct : 0;

    const rows = prodWithConds?.tableInfo?.rows || [];
    const prodsTorres = Array.from(new Set(rows.map(r => String(r[1] || '').trim()).filter(t => t !== '')));
    if (cond.torresHabilitadas && Array.isArray(cond.torresHabilitadas)) {
      setTorresHabilitadas(cond.torresHabilitadas);
    } else {
      setTorresHabilitadas(prodsTorres);
    }
    setTorresFase2(Array.isArray(cond.torresFase2) ? cond.torresFase2 : []);
    setEditingFase(fase);

    setNumParcelasStr(String(numP));
    setParcelasMinimasStr(String(parcelasMin));
    setSinalMinimo(formattedSinal);
    setRiscoRendaStr(formatDecimalBR(rr, 1, 2));
    setRiscoImovelStr(formatDecimalBR(ri, 1, 2));
    setRiscoPosStr(formatDecimalBR(rp, 1, 2));
    setMesesTabela1Str(String(m1));
    setTaxaJuros1Str(formatDecimalBR(t1, 2, 2));
    setMesesTabela2Str(String(m2));
    setTaxaJuros2Str(formatDecimalBR(t2, 2, 2));
    setTaxaAssinaturaContratoStr(formatDecimalBR(ta, 4, 4));
    setAtoPremiadoPctStr(formatDecimalBR(apPct, 2, 2));
    setComissaoApartadaPctStr(formatDecimalBR(caPct, 2, 2));
    setComissaoApartadaParcelasStr(String(caParcelas));
    setComissaoApartadaParcelasMinStr(String(caParcelasMin));
    setComissaoApartadaParcelasMaxStr(String(caParcelasMax));

    setMesesObraStr(String(mo));
    setMesesPosStr(String(mp));
    setGlobalSerie1Str(formatDecimalBR(gs1, 1, 2));
    setGlobalSerie2Str(formatDecimalBR(gs2, 1, 2));
    setGlobalSerie3Str(formatDecimalBR(gs3, 1, 2));
    setGlobalSerie4Str(formatDecimalBR(gs4, 1, 2));
    setGlobalSerie5Str(formatDecimalBR(gs5, 1, 2));
    setGlobalSerie6Str(formatDecimalBR(gs6, 1, 2));
    setSerie1MesesStr(String(sm1));
    setSerie2MesesStr(String(sm2));
    setSerie3MesesStr(String(sm3));
    setSerie4MesesStr(String(sm4));
    setSerie5MesesStr(String(sm5));
    setSerie6MesesStr(String(sm6));

    setPmSinalMinimoStr(formatDecimalBR(pmSinal, 1, 2));
    setPmSemestralMaxStr(formatDecimalBR(pmSemestral, 1, 2));
    setPmChavesMaxStr(formatDecimalBR(pmChaves, 1, 2));
    setPmChavesMesesAntesStr(String(pmChavesMesesAntes));
    setPmPosObraMaxStr(formatDecimalBR(pmPosObra, 1, 2));
    setPmQtdParcelasPosObraStr(String(pmQtdPosObra));
    setPmParcelaMinMensalObra(formatCurrency(pmMinMensalObra));
    setPmParcelaMinSemestral(formatCurrency(pmMinSemestral));
    setPmParcelaMinPosObra(formatCurrency(pmMinPosObra));
    setDescontoAVistaStr(formatDecimalBR(descontoAVista, 1, 2));

    setPolicyText(source.policy || '');
  };

  // Dynamic parsed numeric values for live calculations
  const numParcelas = parseIntFlexible(numParcelasStr, 1);
  // Piso 0 é um valor válido (permite ao corretor zerar a Qtd. Mensais na
  // ficha) — não cai de volta para 1 como um valor "inválido". Nunca pode
  // passar do "Nº Parcelas": um piso maior que o próprio teto não faz sentido.
  const parcelasMinimas = Math.min(numParcelas, Math.max(0, parseIntFlexible(parcelasMinimasStr, 1)));
  const riscoRendaPct = parseDecimal(riscoRendaStr, 30);
  const riscoImovelPct = parseDecimal(riscoImovelStr, 25);
  const riscoPosPct = parseDecimal(riscoPosStr, 8);
  const mesesTabela1 = parseIntFlexible(mesesTabela1Str, 1);
  const taxaJuros1 = parseDecimal(taxaJuros1Str, 0);
  const mesesTabela2 = parseIntFlexible(mesesTabela2Str, 1);
  const taxaJuros2 = parseDecimal(taxaJuros2Str, 1);
  const taxaAssinaturaContratoPct = parseDecimal(taxaAssinaturaContratoStr, 0);
  // Ato Premiado: input está em % humano (ex.: 10,00 = 10%); campo do tipo é em
  // decimal (0.10), então precisa dividir por 100 ao salvar e multiplicar ao ler.
  const atoPremiadoPctInput = parseDecimal(atoPremiadoPctStr, 10);
  const atoPremiadoPctSalvar = Math.max(0, atoPremiadoPctInput) / 100;
  // Comissão Apartada: mesma convenção (input em % humano, campo salvo em decimal).
  const comissaoApartadaPctInput = parseDecimal(comissaoApartadaPctStr, 4);
  const comissaoApartadaPctSalvar = Math.max(0, comissaoApartadaPctInput) / 100;
  const comissaoApartadaParcelasNum = Math.max(1, parseIntFlexible(comissaoApartadaParcelasStr, 6));
  // Limites de parcelas da Comissão Apartada: o teto nunca fica abaixo do piso
  // (se o gestor digitar um valor inválido, o teto sobe até o piso) e a
  // sugestão padrão é sempre travada dentro do intervalo [min, max].
  const comissaoApartadaParcelasMinNum = Math.max(1, parseIntFlexible(comissaoApartadaParcelasMinStr, 1));
  const comissaoApartadaParcelasMaxNum = Math.max(comissaoApartadaParcelasMinNum, parseIntFlexible(comissaoApartadaParcelasMaxStr, 6));
  const comissaoApartadaParcelasClamped = Math.min(comissaoApartadaParcelasMaxNum, Math.max(comissaoApartadaParcelasMinNum, comissaoApartadaParcelasNum));

  // Parâmetros Morar calculados dinamicamente
  const mesesObra = Math.max(0, parseIntFlexible(mesesObraStr, 0));
  const mesesPos = Math.max(0, parseIntFlexible(mesesPosStr, 0));
  const totalMesesMorar = mesesObra + mesesPos;

  const globalSerie1Pct = parseDecimal(globalSerie1Str, 30.0);
  const globalSerie2Pct = parseDecimal(globalSerie2Str, 25.0);
  const globalSerie3Pct = parseDecimal(globalSerie3Str, 20.0);
  const globalSerie4Pct = parseDecimal(globalSerie4Str, 15.0);
  const globalSerie5Pct = parseDecimal(globalSerie5Str, 10.0);
  const globalSerie6Pct = parseDecimal(globalSerie6Str, 5.0);

  // Quantidade de meses de cada balde (independente do percentual acima)
  const serie1Meses = Math.max(0, parseIntFlexible(serie1MesesStr, 12));
  const serie2Meses = Math.max(0, parseIntFlexible(serie2MesesStr, 12));
  const serie3Meses = Math.max(0, parseIntFlexible(serie3MesesStr, 12));
  const serie4Meses = Math.max(0, parseIntFlexible(serie4MesesStr, 12));
  const serie5Meses = Math.max(0, parseIntFlexible(serie5MesesStr, 12));
  const serie6Meses = Math.max(0, parseIntFlexible(serie6MesesStr, 12));
  const serieMesesCapacidades = [serie1Meses, serie2Meses, serie3Meses, serie4Meses, serie5Meses, serie6Meses];

  // Divisão dinâmica dos meses por séries usando a regra oficial Morar
  const { obra: mObra, pos: mPos } = decomposeMorarMonths(mesesObra, mesesPos, serieMesesCapacidades);

  // Parâmetros da condição "Parcelamento Morar"
  const pmSinalMinimoPct = parseDecimal(pmSinalMinimoStr, 10.0);
  const pmParcelaSemestralMaxPct = parseDecimal(pmSemestralMaxStr, 4.0);
  const pmParcelaChavesMaxPct = parseDecimal(pmChavesMaxStr, 15.0);
  const pmParcelaChavesMesesAntes = Math.max(0, parseIntFlexible(pmChavesMesesAntesStr, 0));
  const pmRiscoProSolutoPosObraPct = parseDecimal(pmPosObraMaxStr, 5.0);
  const pmQtdParcelasPosObra = Math.max(0, parseIntFlexible(pmQtdParcelasPosObraStr, 0));
  // Piso 0 é um valor válido (indica que o bloco nunca é zerado por parcela
  // mínima) — não cai de volta para 200 como um valor "inválido".
  const pmParcelaMinimaMensalObraNum = Math.max(0, parseCurrency(pmParcelaMinMensalObra));
  const pmParcelaMinimaSemestralNum = Math.max(0, parseCurrency(pmParcelaMinSemestral));
  const pmParcelaMinimaPosObraNum = Math.max(0, parseCurrency(pmParcelaMinPosObra));

  // Reúne os valores atualmente em edição no formulário como um objeto de
  // parâmetros de política de crédito — usado para gravar tanto na condição
  // base (1ª Fase) quanto em fase2Params (2ª Fase), já que o mesmo formulário
  // é reaproveitado para editar as duas fases.
  const buildCurrentParamsObject = (): Partial<CommercialCondition> => {
    const parsedCurrentSinal = resolveSinalMinimo(sinalMinimo);
    const formattedCurrentSinal = formatCurrency(parsedCurrentSinal);
    const isCurrentMorar = activeCondObj ? getConditionKind(activeCondObj.name) === 'sinal-morar' : false;

    return {
      numParcelas: isCurrentMorar ? totalMesesMorar : numParcelas,
      parcelasMinimas,
      sinalMinimo: formattedCurrentSinal,
      riscoRendaPct,
      riscoImovelPct,
      percMaxProSolutoGlobal: riscoImovelPct,
      percMaxPosObra: riscoPosPct,
      riscoPosPct,
      mesesTabela1,
      taxaJuros1,
      mesesTabela2,
      taxaJuros2,
      taxaAssinaturaContratoPct,
      atoPremiadoPct: atoPremiadoPctSalvar,
      comissaoApartadaPct: comissaoApartadaPctSalvar,
      comissaoApartadaParcelas: comissaoApartadaParcelasClamped,
      comissaoApartadaParcelasMin: comissaoApartadaParcelasMinNum,
      comissaoApartadaParcelasMax: comissaoApartadaParcelasMaxNum,
      mesesObra,
      mesesPos,
      globalSerie1Pct,
      globalSerie2Pct,
      globalSerie3Pct,
      globalSerie4Pct,
      globalSerie5Pct,
      globalSerie6Pct,
      serie1Meses,
      serie2Meses,
      serie3Meses,
      serie4Meses,
      serie5Meses,
      serie6Meses,
      pmSinalMinimoPct,
      pmParcelaSemestralMaxPct,
      pmParcelaChavesMaxPct,
      pmParcelaChavesMesesAntes,
      pmRiscoProSolutoPosObraPct,
      pmQtdParcelasPosObra,
      pmParcelaMinimaMensalObra: pmParcelaMinimaMensalObraNum,
      pmParcelaMinimaSemestral: pmParcelaMinimaSemestralNum,
      pmParcelaMinimaPosObra: pmParcelaMinimaPosObraNum,
      descontoAVistaPct: parseDecimal(descontoAVistaStr, 0),
      policy: policyText
    };
  };

  // Aplica `params` na fase certa (base ou fase2Params) da condição `condId`,
  // dependendo de qual fase está sendo editada no momento (editingFase).
  const applyParamsToCondition = (
    conditions: CommercialCondition[],
    condId: string,
    params: Partial<CommercialCondition>,
    fase: '1' | '2'
  ): CommercialCondition[] => {
    return conditions.map(c => {
      if (c.id !== condId) return c;
      if (fase === '2') {
        return {
          ...c,
          torresHabilitadas,
          torresFase2,
          fase2Params: { ...(c.fase2Params || {}), ...params }
        };
      }
      return {
        ...c,
        ...params,
        torresHabilitadas,
        torresFase2
      };
    });
  };

  // Mesma aplicação de `applyParamsToCondition`, mas também propaga (herda)
  // automaticamente os parâmetros da política para a condição-par de Comissão
  // Apartada do mesmo empreendimento, quando `condId` for uma condição base
  // com par (ver PAR_COMISSAO_APARTADA) — sem tocar nas regras próprias de
  // comissão nem no texto da política do par (CAMPOS_EXCLUSIVOS_COMISSAO_APARTADA).
  // Usada em todo ponto que persiste edições de política (salvar explícito ou
  // salvamento preventivo ao trocar de condição/fase), garantindo que a aba de
  // Comissão Apartada nunca fique com regras desatualizadas em relação à base.
  const applyParamsWithApartadaSync = (
    conditions: CommercialCondition[],
    condId: string,
    params: Partial<CommercialCondition>,
    fase: '1' | '2'
  ): CommercialCondition[] => {
    const updated = applyParamsToCondition(conditions, condId, params, fase);

    const sourceCond = conditions.find(c => c.id === condId);
    const pairKind = PAR_COMISSAO_APARTADA[getConditionKind(sourceCond?.name)];
    if (!pairKind) return updated;

    const syncedParams: Partial<CommercialCondition> = { ...params };
    CAMPOS_EXCLUSIVOS_COMISSAO_APARTADA.forEach(key => {
      delete syncedParams[key];
    });

    return updated.map(c => {
      if (c.id === condId) return c;
      if (getConditionKind(c.name) !== pairKind) return c;
      if (fase === '2') {
        return {
          ...c,
          fase2Params: { ...(c.fase2Params || {}), ...syncedParams }
        };
      }
      return { ...c, ...syncedParams };
    });
  };

  const handleSelectCondition = (condId: string) => {
    if (!prodWithConds) return;

    // Salva preventivamente o estado atual da condição (na fase que estava sendo editada) antes de trocar
    const params = buildCurrentParamsObject();
    const updatedConditions = applyParamsWithApartadaSync(prodWithConds.conditions || [], activeConditionId, params, editingFase);

    const updatedProd: Product = {
      ...prodWithConds,
      name: productName.trim() || prodWithConds.name,
      deliveryDate: deliveryDatePhase1 || deliveryDatePhase2 || '',
      deliveryDatePhase1,
      deliveryDatePhase2,
      isFeatured,
      numParcelas: params.numParcelas,
      conditions: updatedConditions
    };
    onSaveProductPolicy(updatedProd);

    setActiveConditionId(condId);
    const targetCond = updatedConditions.find(c => c.id === condId);
    if (targetCond) {
      loadConditionData(targetCond, '1');
    }
  };

  // Alterna entre editar os parâmetros da 1ª Fase ou da 2ª Fase da condição
  // comercial ativa, salvando preventivamente o formulário atual na fase de
  // origem antes de carregar os valores da fase de destino.
  const handleSwitchFase = (fase: '1' | '2') => {
    if (fase === editingFase) return;
    if (!prodWithConds) {
      setEditingFase(fase);
      return;
    }

    const params = buildCurrentParamsObject();
    const updatedConditions = applyParamsWithApartadaSync(prodWithConds.conditions || [], activeConditionId, params, editingFase);

    const updatedProd: Product = {
      ...prodWithConds,
      name: productName.trim() || prodWithConds.name,
      deliveryDate: deliveryDatePhase1 || deliveryDatePhase2 || '',
      deliveryDatePhase1,
      deliveryDatePhase2,
      isFeatured,
      conditions: updatedConditions
    };
    onSaveProductPolicy(updatedProd);

    const targetCond = updatedConditions.find(c => c.id === activeConditionId);
    if (targetCond) {
      loadConditionData(targetCond, fase);
    }
  };

  const handleOpenNewConditionModal = () => {
    setNewConditionName('');
    setIsNewConditionModalOpen(true);
    setTimeout(() => {
      newCondInputRef.current?.focus();
    }, 60);
  };

  const handleConfirmNewCondition = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prodWithConds) return;
    const trimmedName = newConditionName.trim();
    if (!trimmedName) {
      onShowToast("Informe um nome para a nova condição comercial.");
      return;
    }

    const newCondId = `cond_${prodWithConds.id}_${Date.now()}`;
    const isNewParcelamentoMorar = getConditionKind(trimmedName) === 'parcelamento-morar';
    const newCond: CommercialCondition = {
      id: newCondId,
      name: trimmedName,
      numParcelas: 72,
      parcelasMinimas: 1,
      sinalMinimo: 'R$ 2.000,00',
      riscoRendaPct: isNewParcelamentoMorar ? 40 : 30,
      riscoImovelPct: 25,
      mesesTabela1: 36,
      taxaJuros1: 0.0,
      mesesTabela2: 72,
      taxaJuros2: 1.0,
      torresHabilitadas: allTorres,
      torresFase2: [],
      policy: `POLÍTICA COMERCIAL DA CONDIÇÃO ${trimmedName.toUpperCase()}:\n- Parcelamento da entrada em até 72x.\n- Sinal mínimo a partir de R$ 2.000,00.\n- Taxa de 0,00% a.m. até 36 meses e 1,00% a.m. até 72 meses.`
    };

    // Salvar as edições atuais da condição em tela (na fase que estava sendo editada)
    const params = buildCurrentParamsObject();
    const currentConditionsUpdated = applyParamsWithApartadaSync(prodWithConds.conditions || [], activeConditionId, params, editingFase);

    const updatedProd: Product = {
      ...prodWithConds,
      name: productName.trim() || prodWithConds.name,
      deliveryDate: deliveryDatePhase1 || deliveryDatePhase2 || '',
      deliveryDatePhase1,
      deliveryDatePhase2,
      isFeatured,
      conditions: [...currentConditionsUpdated, newCond]
    };

    onSaveProductPolicy(updatedProd);
    setActiveConditionId(newCondId);
    loadConditionData(newCond, '1');
    setIsNewConditionModalOpen(false);
    setNewConditionName('');
    onShowToast(`Nova condição "${trimmedName}" criada com sucesso!`);
  };

  const handleDeleteCondition = () => {
    if (!prodWithConds) return;
    if (prodWithConds.conditions.length <= 1) {
      onShowToast("É necessário manter ao menos uma condição comercial por empreendimento.");
      return;
    }

    const remainingConds = prodWithConds.conditions.filter(c => c.id !== activeConditionId);
    const updatedProd: Product = {
      ...prodWithConds,
      name: productName.trim() || prodWithConds.name,
      deliveryDate: deliveryDatePhase1 || deliveryDatePhase2 || '',
      deliveryDatePhase1,
      deliveryDatePhase2,
      isFeatured,
      conditions: remainingConds
    };

    onSaveProductPolicy(updatedProd);
    const nextCond = remainingConds[0];
    setActiveConditionId(nextCond.id);
    loadConditionData(nextCond);
    onShowToast("Condição comercial removida!");
  };

  const handleSavePolicy = () => {
    if (!prodWithConds) return;
    if (!productName.trim()) {
      onShowToast("O nome do empreendimento é obrigatório.");
      return;
    }

    // Coleta o estado completo e normaliza os inputs decimais e inteiros
    const parsedNumParcelas = Math.max(0, parseIntFlexible(numParcelasStr, 72));
    // Nunca pode passar do "Nº Parcelas": um piso maior que o próprio teto não faz sentido.
    const parsedParcelasMinimas = Math.min(parsedNumParcelas, Math.max(0, parseIntFlexible(parcelasMinimasStr, 1)));
    const parsedSinalMinimoNum = resolveSinalMinimo(sinalMinimo);
    const formattedSinalMinimo = formatCurrency(parsedSinalMinimoNum);
    const parsedRiscoRenda = parseDecimal(riscoRendaStr, 30);
    const parsedRiscoImovel = parseDecimal(riscoImovelStr, 25);
    const parsedMeses1 = Math.max(0, parseIntFlexible(mesesTabela1Str, 36));
    const parsedTaxa1 = parseDecimal(taxaJuros1Str, 0);
    const parsedMeses2 = Math.max(0, parseIntFlexible(mesesTabela2Str, 72));
    const parsedTaxa2 = parseDecimal(taxaJuros2Str, 1);
    const parsedTaxaAssinaturaContrato = parseDecimal(taxaAssinaturaContratoStr, 0);
    const parsedAtoPremiadoPctInput = Math.max(0, parseDecimal(atoPremiadoPctStr, 10));
    const parsedAtoPremiadoPct = parsedAtoPremiadoPctInput / 100;
    const parsedComissaoApartadaPctInput = Math.max(0, parseDecimal(comissaoApartadaPctStr, 4));
    const parsedComissaoApartadaPct = parsedComissaoApartadaPctInput / 100;
    const parsedComissaoApartadaParcelasRaw = Math.max(1, parseIntFlexible(comissaoApartadaParcelasStr, 6));
    // Teto nunca abaixo do piso; sugestão padrão sempre travada em [min, max].
    const parsedComissaoApartadaParcelasMin = Math.max(1, parseIntFlexible(comissaoApartadaParcelasMinStr, 1));
    const parsedComissaoApartadaParcelasMax = Math.max(parsedComissaoApartadaParcelasMin, parseIntFlexible(comissaoApartadaParcelasMaxStr, 6));
    const parsedComissaoApartadaParcelas = Math.min(parsedComissaoApartadaParcelasMax, Math.max(parsedComissaoApartadaParcelasMin, parsedComissaoApartadaParcelasRaw));

    const parsedMesesObra = Math.max(0, parseIntFlexible(mesesObraStr, 33));
    const parsedMesesPos = Math.max(0, parseIntFlexible(mesesPosStr, 27));
    const parsedRiscoPos = parseDecimal(riscoPosStr, 8.0);
    const parsedGlobal1 = parseDecimal(globalSerie1Str, 30.0);
    const parsedGlobal2 = parseDecimal(globalSerie2Str, 25.0);
    const parsedGlobal3 = parseDecimal(globalSerie3Str, 20.0);
    const parsedGlobal4 = parseDecimal(globalSerie4Str, 15.0);
    const parsedGlobal5 = parseDecimal(globalSerie5Str, 10.0);
    const parsedGlobal6 = parseDecimal(globalSerie6Str, 5.0);
    const parsedSerie1Meses = Math.max(0, parseIntFlexible(serie1MesesStr, 12));
    const parsedSerie2Meses = Math.max(0, parseIntFlexible(serie2MesesStr, 12));
    const parsedSerie3Meses = Math.max(0, parseIntFlexible(serie3MesesStr, 12));
    const parsedSerie4Meses = Math.max(0, parseIntFlexible(serie4MesesStr, 12));
    const parsedSerie5Meses = Math.max(0, parseIntFlexible(serie5MesesStr, 12));
    const parsedSerie6Meses = Math.max(0, parseIntFlexible(serie6MesesStr, 12));

    const isCurrentMorar = activeCondObj ? getConditionKind(activeCondObj.name) === 'sinal-morar' : false;

    const parsedPmSinal = parseDecimal(pmSinalMinimoStr, 10.0);
    const parsedPmSemestral = parseDecimal(pmSemestralMaxStr, 4.0);
    const parsedPmChaves = parseDecimal(pmChavesMaxStr, 15.0);
    const parsedPmChavesMesesAntes = Math.max(0, parseIntFlexible(pmChavesMesesAntesStr, 0));
    const parsedPmPosObra = parseDecimal(pmPosObraMaxStr, 5.0);
    const parsedPmQtdPosObra = Math.max(0, parseIntFlexible(pmQtdParcelasPosObraStr, 0));
    // Piso 0 é um valor válido (indica que o bloco nunca é zerado por parcela
    // mínima) — não cai de volta para 200 como um valor "inválido".
    const parsedPmMinMensalObra = Math.max(0, parseCurrency(pmParcelaMinMensalObra));
    const parsedPmMinSemestral = Math.max(0, parseCurrency(pmParcelaMinSemestral));
    const parsedPmMinPosObra = Math.max(0, parseCurrency(pmParcelaMinPosObra));
    const parsedDescontoAVista = parseDecimal(descontoAVistaStr, 0);

    // Atualiza a formatação visual dos inputs ao salvar
    setNumParcelasStr(String(isCurrentMorar ? (parsedMesesObra + parsedMesesPos) : parsedNumParcelas));
    setParcelasMinimasStr(String(parsedParcelasMinimas));
    setSinalMinimo(formattedSinalMinimo);
    setRiscoRendaStr(formatDecimalBR(parsedRiscoRenda, 1, 2));
    setRiscoImovelStr(formatDecimalBR(parsedRiscoImovel, 1, 2));
    setRiscoPosStr(formatDecimalBR(parsedRiscoPos, 1, 2));
    setMesesTabela1Str(String(parsedMeses1));
    setTaxaJuros1Str(formatDecimalBR(parsedTaxa1, 2, 2));
    setMesesTabela2Str(String(parsedMeses2));
    setTaxaJuros2Str(formatDecimalBR(parsedTaxa2, 2, 2));
    setTaxaAssinaturaContratoStr(formatDecimalBR(parsedTaxaAssinaturaContrato, 4, 4));
    setAtoPremiadoPctStr(formatDecimalBR(parsedAtoPremiadoPctInput, 2, 2));
    setComissaoApartadaPctStr(formatDecimalBR(parsedComissaoApartadaPctInput, 2, 2));
    setComissaoApartadaParcelasStr(String(parsedComissaoApartadaParcelas));
    setComissaoApartadaParcelasMinStr(String(parsedComissaoApartadaParcelasMin));
    setComissaoApartadaParcelasMaxStr(String(parsedComissaoApartadaParcelasMax));

    setMesesObraStr(String(parsedMesesObra));
    setMesesPosStr(String(parsedMesesPos));
    setGlobalSerie1Str(formatDecimalBR(parsedGlobal1, 1, 2));
    setGlobalSerie2Str(formatDecimalBR(parsedGlobal2, 1, 2));
    setGlobalSerie3Str(formatDecimalBR(parsedGlobal3, 1, 2));
    setGlobalSerie4Str(formatDecimalBR(parsedGlobal4, 1, 2));
    setGlobalSerie5Str(formatDecimalBR(parsedGlobal5, 1, 2));
    setGlobalSerie6Str(formatDecimalBR(parsedGlobal6, 1, 2));
    setSerie1MesesStr(String(parsedSerie1Meses));
    setSerie2MesesStr(String(parsedSerie2Meses));
    setSerie3MesesStr(String(parsedSerie3Meses));
    setSerie4MesesStr(String(parsedSerie4Meses));
    setSerie5MesesStr(String(parsedSerie5Meses));
    setSerie6MesesStr(String(parsedSerie6Meses));
    setPmSinalMinimoStr(formatDecimalBR(parsedPmSinal, 1, 2));
    setPmSemestralMaxStr(formatDecimalBR(parsedPmSemestral, 1, 2));
    setPmChavesMaxStr(formatDecimalBR(parsedPmChaves, 1, 2));
    setPmChavesMesesAntesStr(String(parsedPmChavesMesesAntes));
    setPmPosObraMaxStr(formatDecimalBR(parsedPmPosObra, 1, 2));
    setPmQtdParcelasPosObraStr(String(parsedPmQtdPosObra));
    setPmParcelaMinMensalObra(formatCurrency(parsedPmMinMensalObra));
    setPmParcelaMinSemestral(formatCurrency(parsedPmMinSemestral));
    setPmParcelaMinPosObra(formatCurrency(parsedPmMinPosObra));
    setDescontoAVistaStr(formatDecimalBR(parsedDescontoAVista, 1, 2));

    const savedParams: Partial<CommercialCondition> = {
      numParcelas: isCurrentMorar ? (parsedMesesObra + parsedMesesPos) : parsedNumParcelas,
      parcelasMinimas: parsedParcelasMinimas,
      sinalMinimo: formattedSinalMinimo,
      riscoRendaPct: parsedRiscoRenda,
      riscoImovelPct: parsedRiscoImovel,
      percMaxProSolutoGlobal: parsedRiscoImovel,
      percMaxPosObra: parsedRiscoPos,
      riscoPosPct: parsedRiscoPos,
      mesesTabela1: parsedMeses1,
      taxaJuros1: parsedTaxa1,
      mesesTabela2: parsedMeses2,
      taxaJuros2: parsedTaxa2,
      taxaAssinaturaContratoPct: parsedTaxaAssinaturaContrato,
      atoPremiadoPct: parsedAtoPremiadoPct,
      comissaoApartadaPct: parsedComissaoApartadaPct,
      comissaoApartadaParcelas: parsedComissaoApartadaParcelas,
      comissaoApartadaParcelasMin: parsedComissaoApartadaParcelasMin,
      comissaoApartadaParcelasMax: parsedComissaoApartadaParcelasMax,
      mesesObra: parsedMesesObra,
      mesesPos: parsedMesesPos,
      globalSerie1Pct: parsedGlobal1,
      globalSerie2Pct: parsedGlobal2,
      globalSerie3Pct: parsedGlobal3,
      globalSerie4Pct: parsedGlobal4,
      globalSerie5Pct: parsedGlobal5,
      globalSerie6Pct: parsedGlobal6,
      serie1Meses: parsedSerie1Meses,
      serie2Meses: parsedSerie2Meses,
      serie3Meses: parsedSerie3Meses,
      serie4Meses: parsedSerie4Meses,
      serie5Meses: parsedSerie5Meses,
      serie6Meses: parsedSerie6Meses,
      pmSinalMinimoPct: parsedPmSinal,
      pmParcelaSemestralMaxPct: parsedPmSemestral,
      pmParcelaChavesMaxPct: parsedPmChaves,
      pmParcelaChavesMesesAntes: parsedPmChavesMesesAntes,
      pmRiscoProSolutoPosObraPct: parsedPmPosObra,
      pmQtdParcelasPosObra: parsedPmQtdPosObra,
      pmParcelaMinimaMensalObra: parsedPmMinMensalObra,
      pmParcelaMinimaSemestral: parsedPmMinSemestral,
      pmParcelaMinimaPosObra: parsedPmMinPosObra,
      descontoAVistaPct: parsedDescontoAVista,
      policy: policyText
    };
    const updatedConditions = applyParamsWithApartadaSync(prodWithConds.conditions || [], activeConditionId, savedParams, editingFase);

    const updatedProd: Product = {
      ...prodWithConds,
      name: productName.trim(),
      deliveryDate: deliveryDatePhase1 || deliveryDatePhase2 || '',
      deliveryDatePhase1,
      deliveryDatePhase2,
      isFeatured,
      numParcelas: isCurrentMorar ? (parsedMesesObra + parsedMesesPos) : parsedNumParcelas,
      conditions: updatedConditions
    };

    onSaveProductPolicy(updatedProd);
    onShowToast("✓ Alterações salvas com sucesso!");
  };

  // CALCULATIONS FOR DISPLAY CARDS
  // Only calculate values if simulation income / selected unit data exists
  const rendaVal = clientIncome > 0 ? clientIncome * (riscoRendaPct / 100) : 0;

  const appliedRatePct = (numParcelas <= mesesTabela1) ? taxaJuros1 : taxaJuros2;
  const vpVal = rendaVal > 0 ? calculatePresentValue(appliedRatePct, numParcelas, rendaVal) : 0;

  let propertyPrice = 0;
  let propertyEvaluation = 0;
  let propertyITBI = 0;
  const selUnit = selectedUnits?.[activeProductId];

  if (selUnit && selUnit.torre && selUnit.unidade && prodWithConds?.tableInfo?.rows) {
    const matchingRow = prodWithConds.tableInfo.rows.find(
      r => String(r[1] || '').trim().toLowerCase() === selUnit.torre.trim().toLowerCase() &&
           String(r[2] || '').trim().toLowerCase() === selUnit.unidade.trim().toLowerCase()
    );
    if (matchingRow) {
      if (matchingRow[6] !== undefined) propertyEvaluation = parseCurrency(matchingRow[6]);
      if (matchingRow[7] !== undefined) propertyPrice = parseCurrency(matchingRow[7]);
      const itbi1 = matchingRow[8] !== undefined ? parseCurrency(matchingRow[8]) : 0;
      const itbi2 = matchingRow[9] !== undefined ? parseCurrency(matchingRow[9]) : 0;
      propertyITBI = (isFirstHome ?? true) ? (itbi1 || itbi2) : (itbi2 || itbi1);
    }
  }

  const activeCondObj = prodWithConds?.conditions.find(c => c.id === activeConditionId);
  const currentCondition = activeCondObj || prodWithConds?.conditions[0];

  let valorAtoPremiado = 0;
  if (currentCondition && prodWithConds && (propertyPrice > 0 || propertyEvaluation > 0)) {
    const riskCalc = calculatePolicyRiskValues(
      prodWithConds,
      currentCondition,
      clientIncome,
      numParcelas,
      propertyPrice,
      propertyITBI,
      propertyEvaluation,
      undefined,
      simulationData?.financing || Infinity,
      simulationData?.subsidy || 0,
      simulationData?.fgts || 0,
      simulationData?.finPercent || 0.80
    );
    valorAtoPremiado = riskCalc.atoPremiado || 0;
  }

  const isMorarCondition = activeCondObj
    ? (getConditionKind(activeCondObj.name) === 'sinal-morar' || getConditionKind(activeCondObj.name) === 'sinal-morar-comissao-apartada')
    : false;
  const isParcelamentoMorarCondition = activeCondObj
    ? getConditionKind(activeCondObj.name) === 'parcelamento-morar'
    : false;
  // Comissão Apartada é compartilhada pelas duas variantes ("Sinal c/ Banco
  // Direto" e "Sinal c/ Morar") — os campos de % e parcelas padrão aparecem
  // em ambas, cada uma dentro do seu próprio layout de tela.
  const isComissaoApartadaCondition = activeCondObj
    ? (getConditionKind(activeCondObj.name) === 'banco-direto-comissao-apartada' || getConditionKind(activeCondObj.name) === 'sinal-morar-comissao-apartada')
    : false;

  const baseMaiorVendaAvaliacao = Math.max(propertyPrice, propertyEvaluation);
  const totalBaseRiscoImovel = isMorarCondition
    ? (propertyPrice > 0 ? Math.max(0, propertyPrice + propertyITBI) : 0)
    : (baseMaiorVendaAvaliacao > 0 
        ? Math.max(0, (baseMaiorVendaAvaliacao + propertyITBI) - valorAtoPremiado) 
        : 0);
  const riscoImovelVal = totalBaseRiscoImovel > 0 ? totalBaseRiscoImovel * (riscoImovelPct / 100) : 0;
  
  // Para Sinal c/ Morar: Base = Preço + ITBI (Sem deduzir Ato Premiado)
  const baseCalculoMorar = propertyPrice > 0 ? Math.max(0, propertyPrice + propertyITBI) : 0;
  const proSolutoGlobalMorar = baseCalculoMorar > 0 
    ? Math.round(baseCalculoMorar * (riscoImovelPct / 100) * 100) / 100 
    : 0;
  const tetoPosGlobalMorar = baseCalculoMorar > 0 
    ? Math.round(baseCalculoMorar * (riscoPosPct / 100) * 100) / 100 
    : 0;
  const minRiskVal = (vpVal > 0 && riscoImovelVal > 0) ? Math.min(vpVal, riscoImovelVal) : 0;

  // Renda base considerada para os cálculos de Morar
  const baseIncomeForMorar = clientIncome > 0 ? clientIncome : 0;

  // Tetos calculados em tempo real para Morar
  const parcGlobal1 = baseIncomeForMorar * (globalSerie1Pct / 100);
  const parcGlobal2 = baseIncomeForMorar * (globalSerie2Pct / 100);
  const parcGlobal3 = baseIncomeForMorar * (globalSerie3Pct / 100);
  const parcGlobal4 = baseIncomeForMorar * (globalSerie4Pct / 100);
  const parcGlobal5 = baseIncomeForMorar * (globalSerie5Pct / 100);
  const parcGlobal6 = baseIncomeForMorar * (globalSerie6Pct / 100);
  
  const totalObraBucketArr = mObra || [0,0,0,0,0,0];
  const totalPosBucketArr = mPos || [0,0,0,0,0,0];
  
  const capacidadeTotalFluxo = ((totalObraBucketArr[0]+totalPosBucketArr[0]) * parcGlobal1) +
                               ((totalObraBucketArr[1]+totalPosBucketArr[1]) * parcGlobal2) +
                               ((totalObraBucketArr[2]+totalPosBucketArr[2]) * parcGlobal3) +
                               ((totalObraBucketArr[3]+totalPosBucketArr[3]) * parcGlobal4) +
                               ((totalObraBucketArr[4]+totalPosBucketArr[4]) * parcGlobal5) +
                               ((totalObraBucketArr[5]+totalPosBucketArr[5]) * parcGlobal6);

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-morar-600 font-bold block">
            Gestão Comercial & Regras de Cálculo
          </span>
          <h1 className="text-xl font-bold font-heading text-slate-900">
            Políticas e Regras dos Empreendimentos
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Selecione o empreendimento e a condição comercial para configurar regras e políticas específicas de crédito.
          </p>
        </div>
        <button
          onClick={onOpenNewProductModal}
          type="button"
          className="px-4 py-2.5 bg-morar-600 hover:bg-morar-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Empreendimento</span>
        </button>
      </div>

      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        
        {/* 1. SELETOR DE EMPREENDIMENTO */}
        <div className="bg-morar-50/60 p-4 rounded-xl border border-morar-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1">
            <label className="block text-xs font-bold text-morar-600 uppercase tracking-wider mb-1.5">
              1. Selecione o Empreendimento para Visualizar / Editar
            </label>
            <select
              value={activeProductId}
              onChange={(e) => onSelectProduct(e.target.value)}
              className="w-full bg-white font-bold text-slate-900 border border-slate-300 rounded-xl py-2.5 px-3.5 focus:outline-none focus:border-morar-600 text-xs shadow-xs cursor-pointer"
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <span className="text-[10px] font-bold text-amber-700 uppercase bg-amber-50 px-2.5 py-1 rounded border border-amber-200 shrink-0">
              {isFeatured ? 'Destaque Principal' : 'Empreendimento'}
            </span>
            <button
              onClick={() => onDeleteProduct(activeProductId)}
              type="button"
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 bg-rose-50 px-3 py-2 rounded-xl border border-rose-100 transition-all shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir</span>
            </button>
          </div>
        </div>

        {/* FORMULÁRIO DE EDIÇÃO DO EMPREENDIMENTO */}
        <div className="space-y-5 text-xs pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Nome do Empreendimento *
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-morar-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Previsão de Entrega - 1ª Fase
              </label>
              <input
                type="date"
                value={deliveryDatePhase1}
                onChange={(e) => setDeliveryDatePhase1(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-morar-600 cursor-pointer"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Previsão de Entrega - 2ª Fase <span className="font-normal text-slate-400">(Opcional)</span>
              </label>
              <input
                type="date"
                value={deliveryDatePhase2}
                onChange={(e) => setDeliveryDatePhase2(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-morar-600 cursor-pointer"
              />
            </div>
          </div>

          {/* 2. SELETOR DE CONDIÇÃO COMERCIAL */}
          <div className="bg-gradient-to-br from-amber-50/80 via-amber-50/30 to-white p-4 rounded-xl border border-amber-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1">
                <label className="block text-xs font-extrabold text-amber-900 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-amber-600" />
                  <span>2. Selecione a Condição Comercial para Configurar a Política</span>
                </label>
                <select
                  value={activeConditionId}
                  onChange={(e) => handleSelectCondition(e.target.value)}
                  className="w-full bg-white font-bold text-slate-900 border border-amber-300 rounded-xl py-2.5 px-3.5 focus:outline-none focus:border-morar-600 text-xs shadow-xs cursor-pointer"
                >
                  {prodWithConds?.conditions.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={handleOpenNewConditionModal}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>+ Nova Condição</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCondition}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-semibold rounded-xl text-xs transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Condição</span>
                </button>
              </div>
            </div>
          </div>

          {/* SEÇÃO: TORRES DISPONÍVEIS PARA SIMULAÇÃO */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-morar-100 text-morar-700 rounded-lg">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span>Torres Disponíveis para Simulação</span>
                    {allTorres.length > 0 && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                        torresHabilitadas.length === allTorres.length
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : torresHabilitadas.length > 0
                          ? 'bg-morar-50 text-morar-700 border-morar-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {torresHabilitadas.length === allTorres.length
                          ? 'TODAS LIBERADAS'
                          : torresHabilitadas.length > 0
                          ? `PARCIALMENTE LIBERADAS (${torresHabilitadas.length} de ${allTorres.length})`
                          : 'NENHUMA LIBERADA'}
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Defina quais torres deste empreendimento estarão visíveis no Simulador para a condição <strong className="text-morar-700">{activeCondObj?.name || '--'}</strong>.
                  </p>
                </div>
              </div>

              {allTorres.length > 0 && (
                <div className="flex items-center gap-1.5 self-start sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={handleSelectAllTorres}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-[11px] transition-all cursor-pointer"
                  >
                    Marcar Todas
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllTorres}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-lg text-[11px] transition-all cursor-pointer"
                  >
                    Desmarcar Todas
                  </button>
                </div>
              )}
            </div>

            {allTorres.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Nenhuma torre identificada na tabela deste empreendimento. Importe a planilha de vendas na aba <strong>Importar Tabela</strong> para mapear as torres e unidades.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
                {allTorres.map(torreName => {
                  const isChecked = torresHabilitadas.includes(torreName);
                  const unitCount = unitsCountByTorre[torreName] || 0;
                  return (
                    <div
                      key={torreName}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleToggleTorre(torreName)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          handleToggleTorre(torreName);
                        }
                      }}
                      className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-morar-400 ${
                        isChecked
                          ? 'bg-morar-50/80 hover:bg-morar-50 border-morar-300 text-slate-900 shadow-2xs'
                          : 'bg-slate-50/60 hover:bg-slate-100/70 border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pointer-events-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="w-4 h-4 text-morar-600 rounded border-slate-300 focus:ring-morar-500 cursor-pointer pointer-events-none"
                        />
                        <div className="truncate">
                          <span className={`text-xs font-bold block truncate ${isChecked ? 'text-slate-900' : 'text-slate-500'}`}>
                            {torreName}
                          </span>
                          <span className={`text-[10px] font-medium block truncate ${isChecked ? 'text-slate-500' : 'text-slate-400'}`}>
                            {unitCount} {unitCount === 1 ? 'unidade' : 'unidades'}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border transition-colors ${
                        isChecked
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-400 border-slate-200'
                      }`}>
                        {isChecked ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {allTorres.length > 0 && torresHabilitadas.length === 0 && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Atenção: Nenhuma torre está liberada nesta política. Os corretores não conseguirão simular unidades nesta condição até que ao menos uma torre seja ativada.</span>
              </div>
            )}
          </div>

          {/* SEÇÃO: FASE DO EMPREENDIMENTO POR TORRE */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <div className="p-1.5 bg-violet-100 text-violet-700 rounded-lg">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  Fase do Empreendimento por Torre
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  Marque as torres que pertencem à <strong className="text-violet-700">2ª Fase</strong>. Torres não marcadas são consideradas 1ª Fase. A política de crédito de cada fase é configurada separadamente logo abaixo.
                </p>
              </div>
            </div>

            {allTorres.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Nenhuma torre identificada na tabela deste empreendimento.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
                {allTorres.map(torreName => {
                  const isFase2 = torresFase2.includes(torreName);
                  return (
                    <div
                      key={torreName}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleToggleTorreFase2(torreName)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          handleToggleTorreFase2(torreName);
                        }
                      }}
                      className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                        isFase2
                          ? 'bg-violet-50/80 hover:bg-violet-50 border-violet-300 text-slate-900 shadow-2xs'
                          : 'bg-slate-50/60 hover:bg-slate-100/70 border-slate-200 text-slate-500'
                      }`}
                    >
                      <span className={`text-xs font-bold truncate ${isFase2 ? 'text-slate-900' : 'text-slate-500'}`}>
                        {torreName}
                      </span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border transition-colors shrink-0 ml-2 ${
                        isFase2
                          ? 'bg-violet-100 text-violet-800 border-violet-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {isFase2 ? '2ª Fase' : '1ª Fase'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PARÂMETROS DA POLÍTICA DE CRÉDITO PARA A CONDIÇÃO SELECIONADA */}
          <div className="bg-gradient-to-r from-morar-50/80 via-slate-50 to-white p-4 rounded-xl border border-morar-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-morar-100 pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-morar-600" />
                <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  Parâmetros da Política de Crédito (<span className="text-morar-600 font-extrabold">{activeCondObj?.name || '--'}</span>)
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleSwitchFase('1')}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      editingFase === '1'
                        ? 'bg-white text-morar-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    1ª Fase
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchFase('2')}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      editingFase === '2'
                        ? 'bg-white text-violet-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    2ª Fase
                  </button>
                </div>
                {isMorarCondition && (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-morar-100 text-morar-800 border border-morar-200">
                    Condição Sinal c/ Morar ({totalMesesMorar}x)
                  </span>
                )}
                {isParcelamentoMorarCondition && (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Condição Parcelamento Morar
                  </span>
                )}
              </div>
            </div>

            {editingFase === '2' && (
              <div className="p-2.5 bg-violet-50 border border-violet-200 rounded-lg text-[11px] text-violet-800 flex items-center gap-2 font-semibold">
                <Layers className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                <span>Você está editando os parâmetros da <strong>2ª Fase</strong>. Campos não alterados aqui herdam automaticamente o valor da 1ª Fase.</span>
              </div>
            )}

            {/* CAMPOS COMUNS A TODAS AS CONDIÇÕES COMERCIAIS: DESCONTO À VISTA + % ATO PREMIADO */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
                <div className="lg:col-span-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1 rounded-md bg-amber-50 text-amber-700">
                      <Percent className="w-3.5 h-3.5" />
                    </div>
                    <label className="block font-bold text-slate-800 text-xs truncate" title="Percentual base para uma futura regra de desconto por pagamento à vista">
                      Desconto à Vista (%)
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                    Cadastro do percentual que servirá de base para um futuro desconto à vista. Ainda não é aplicado em nenhum cálculo do simulador.
                  </p>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={descontoAVistaStr}
                      onChange={(e) => setDescontoAVistaStr(e.target.value)}
                      onBlur={() => {
                        const val = parseDecimal(descontoAVistaStr, 0);
                        setDescontoAVistaStr(formatDecimalBR(val, 1, 2));
                      }}
                      placeholder="0,0"
                      className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-amber-700 text-center focus:outline-none focus:border-amber-600 text-xs"
                    />
                    <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">%</span>
                  </div>
                </div>

                <div className="lg:col-span-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1 rounded-md bg-fuchsia-50 text-fuchsia-700">
                      <Percent className="w-3.5 h-3.5" />
                    </div>
                    <label className="block font-bold text-slate-800 text-xs truncate" title="Percentual do Ato Premiado (desconto comercial sobre o Ato Efetivo). Padrão histórico é 10%; pode ser editado por condição comercial e inclusive ficar zerado (0%).">
                      % do Ato Premiado
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                    Desconto do Ato Premiado, aplicado em cima do Ato Efetivo. Vale em todos os cálculos que usam Ato Premiado nesta condição. Deixe em 0 para desligar.
                  </p>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={atoPremiadoPctStr}
                      onChange={(e) => setAtoPremiadoPctStr(e.target.value)}
                      onBlur={() => {
                        const val = Math.max(0, parseDecimal(atoPremiadoPctStr, 10));
                        setAtoPremiadoPctStr(formatDecimalBR(val, 2, 2));
                      }}
                      placeholder="10,00"
                      className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-fuchsia-700 text-center focus:outline-none focus:border-fuchsia-600 text-xs"
                    />
                    <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">%</span>
                  </div>
                </div>
              </div>
            </div>

            {isMorarCondition ? (
              /* ========================================================================= */
              /* LAYOUT EXCLUSIVO PARA CONDIÇÃO: SINAL C/ MORAR                            */
              /* ========================================================================= */
              <div className="space-y-4">
                {/* 1. BLOCO GERAL DE PRAZOS E SINAL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
                  {/* SINAL MÍNIMO */}
                  <div className="lg:col-span-3">
                    <label className="block font-semibold text-slate-700 mb-1 text-xs">
                      Sinal Mínimo (R$)
                    </label>
                    <input
                      type="text"
                      value={sinalMinimo}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setSinalMinimo(e.target.value)}
                      onBlur={() => {
                        setSinalMinimo(formatCurrency(resolveSinalMinimo(sinalMinimo)));
                      }}
                      placeholder="Ex: R$ 2.000,00"
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl font-bold text-emerald-600 focus:outline-none focus:border-morar-600 text-xs"
                    />
                  </div>

                  {/* MESES DE OBRA */}
                  <div className="lg:col-span-3">
                    <label className="block font-semibold text-slate-700 mb-1 text-xs truncate" title="Meses de Obra (INCC)">
                      Meses de Obra
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={mesesObraStr}
                        onChange={(e) => setMesesObraStr(e.target.value)}
                        onBlur={() => {
                          const val = Math.max(0, parseIntFlexible(mesesObraStr, 33));
                          setMesesObraStr(String(val));
                        }}
                        className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-center focus:outline-none focus:border-morar-600 text-xs"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">M</span>
                    </div>
                  </div>

                  {/* MESES PÓS-OBRA */}
                  <div className="lg:col-span-3">
                    <label className="block font-semibold text-slate-700 mb-1 text-xs truncate" title="Meses Pós-Obra (IPCA)">
                      Meses Pós-Obra
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={mesesPosStr}
                        onChange={(e) => setMesesPosStr(e.target.value)}
                        onBlur={() => {
                          const val = Math.max(0, parseIntFlexible(mesesPosStr, 27));
                          setMesesPosStr(String(val));
                        }}
                        className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-center focus:outline-none focus:border-morar-600 text-xs"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">M</span>
                    </div>
                  </div>

                  {/* TOTAL DE MESES (INFORMATIVO) */}
                  <div className="lg:col-span-3">
                    <label className="block font-semibold text-slate-700 mb-1 text-xs truncate" title="Total de Meses da Condição">
                      Total Meses
                    </label>
                    <div className="px-3 py-2 bg-morar-50 border border-morar-200 rounded-xl font-black text-morar-700 text-center text-xs">
                      {totalMesesMorar} Meses (Obra + Pós)
                    </div>
                  </div>
                </div>

                {/* 1.1 TRAVAS GLOBAIS DE RISCO DA POLÍTICA MORAR */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
                  {/* CAMPO 1: % MAX PRÓ-SOLUTO GLOBAL */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-800 text-xs truncate" title="Limite máximo do Pró-soluto sobre a base (Preço + ITBI)">
                        % Max Pró-Soluto Global
                      </label>
                      <span className="text-[10px] text-slate-500 font-bold">Padrão: 17,0%</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                      Limite máximo do Pró-soluto sobre a base (Preço + ITBI)
                    </p>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={riscoImovelStr}
                        onChange={(e) => setRiscoImovelStr(e.target.value)}
                        onBlur={() => {
                          const val = parseDecimal(riscoImovelStr, 17.0);
                          setRiscoImovelStr(formatDecimalBR(val, 1, 2));
                        }}
                        className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-indigo-700 text-center focus:outline-none focus:border-indigo-600 text-xs"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">%</span>
                    </div>
                  </div>

                  {/* CAMPO 2: % MAX PÓS-OBRA */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-800 text-xs truncate" title="Teto de comprometimento exclusivo da fase Pós-Obra">
                        % Max Pós-Obra
                      </label>
                      <span className="text-[10px] text-slate-500 font-bold">Padrão: 8,0%</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                      Teto de comprometimento exclusivo da fase Pós-Obra
                    </p>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={riscoPosStr}
                        onChange={(e) => setRiscoPosStr(e.target.value)}
                        onBlur={() => {
                          const val = parseDecimal(riscoPosStr, 8.0);
                          setRiscoPosStr(formatDecimalBR(val, 1, 2));
                        }}
                        className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-purple-700 text-center focus:outline-none focus:border-purple-600 text-xs"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">%</span>
                    </div>
                  </div>
                </div>

                
                {/* 2. BLOCO: SÉRIES DE COMPROMETIMENTO DE RENDA (BALDES DE MESES INDEPENDENTES) */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-amber-50 text-amber-700">
                        <HardHat className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                        Séries de Comprometimento de Renda (Percentual e Meses de Cada Balde)
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 -mt-1.5">
                    Cada balde tem seu próprio percentual e sua própria quantidade de meses. Um balde dividido entre Obra e Pós-Obra continua sendo o mesmo balde (mesmo percentual) nas duas fases.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      { title: 'Série 1 (Balde 1)', val: globalSerie1Str, set: setGlobalSerie1Str, def: 30.0, parc: parcGlobal1, mesesVal: serie1MesesStr, mesesSet: setSerie1MesesStr },
                      { title: 'Série 2 (Balde 2)', val: globalSerie2Str, set: setGlobalSerie2Str, def: 25.0, parc: parcGlobal2, mesesVal: serie2MesesStr, mesesSet: setSerie2MesesStr },
                      { title: 'Série 3 (Balde 3)', val: globalSerie3Str, set: setGlobalSerie3Str, def: 20.0, parc: parcGlobal3, mesesVal: serie3MesesStr, mesesSet: setSerie3MesesStr },
                      { title: 'Série 4 (Balde 4)', val: globalSerie4Str, set: setGlobalSerie4Str, def: 15.0, parc: parcGlobal4, mesesVal: serie4MesesStr, mesesSet: setSerie4MesesStr },
                      { title: 'Série 5 (Balde 5)', val: globalSerie5Str, set: setGlobalSerie5Str, def: 10.0, parc: parcGlobal5, mesesVal: serie5MesesStr, mesesSet: setSerie5MesesStr },
                      { title: 'Série 6 (Balde 6)', val: globalSerie6Str, set: setGlobalSerie6Str, def: 5.0, parc: parcGlobal6, mesesVal: serie6MesesStr, mesesSet: setSerie6MesesStr },
                    ].map((serie, index) => (
                      <div key={index} className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="font-bold text-slate-700">{serie.title}</span>
                          {clientIncome > 0 && (
                            <span className="font-semibold text-emerald-600 text-[10px]">
                              Teto Renda: {formatCurrency(serie.parc)}/mês
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="relative flex items-center flex-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={serie.val}
                              onChange={(e) => serie.set(e.target.value)}
                              onBlur={() => {
                                const parsed = parseDecimal(serie.val, serie.def);
                                serie.set(formatDecimalBR(parsed, 1, 2));
                              }}
                              title="Percentual do balde"
                              className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 text-center focus:outline-none focus:border-morar-600 text-xs"
                            />
                            <span className="absolute right-2.5 font-extrabold text-slate-500 text-xs pointer-events-none">%</span>
                          </div>
                          <div className="relative flex items-center flex-1">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={serie.mesesVal}
                              onChange={(e) => serie.mesesSet(e.target.value)}
                              onBlur={() => {
                                const parsed = Math.max(0, parseIntFlexible(serie.mesesVal, 12));
                                serie.mesesSet(String(parsed));
                              }}
                              title="Quantidade de meses do balde"
                              className="w-full pl-3 pr-9 py-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 text-center focus:outline-none focus:border-morar-600 text-xs"
                            />
                            <span className="absolute right-2.5 font-extrabold text-slate-500 text-[10px] pointer-events-none">mês</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. CARDS DE RESUMO E RISCO DO EMPREENDIMENTO */}
                <div className="pt-2 grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">

                  {/* CARD 1: CAPACIDADE TOTAL DE FLUXO */}
                  <div className="bg-emerald-50/90 p-3.5 rounded-xl border border-emerald-200/90 flex flex-col justify-between space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
                        <Coins className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-emerald-950 text-[11px] uppercase tracking-wider truncate">
                          Capacidade Total Fluxo
                        </span>
                        <span className="text-[10px] text-emerald-700 font-medium block truncate">
                          Total Baseado na Renda
                        </span>
                      </div>
                    </div>
                    <div className="pt-1">
                      <input
                        type="text"
                        readOnly
                        value={formatCurrency(capacidadeTotalFluxo)}
                        className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl font-extrabold text-emerald-700 text-center text-sm shadow-2xs cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* CARD 2: PRÓ-SOLUTO GLOBAL (17%) */}
                  <div className="bg-indigo-50/90 p-3.5 rounded-xl border border-indigo-200/90 flex flex-col justify-between space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-800 shrink-0">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-indigo-950 text-[11px] uppercase tracking-wider truncate">
                          Pró-Soluto Global ({formatDecimalBR(riscoImovelPct, 1, 2)}%)
                        </span>
                        <span className="text-[10px] text-indigo-700 font-medium block truncate">
                          Teto Máximo de Fluxo da Base
                        </span>
                      </div>
                    </div>
                    <div className="pt-1">
                      <input
                        type="text"
                        readOnly
                        value={formatCurrency(proSolutoGlobalMorar)}
                        className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-xl font-extrabold text-indigo-700 text-center text-sm shadow-2xs cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* CARD 3: TETO PÓS-OBRA (8%) */}
                  <div className="bg-purple-50/90 p-3.5 rounded-xl border border-purple-200/90 flex flex-col justify-between space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-purple-100 text-purple-800 shrink-0">
                        <CalendarClock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-purple-950 text-[11px] uppercase tracking-wider truncate">
                          Teto Pós-Obra ({formatDecimalBR(riscoPosPct, 1, 2)}%)
                        </span>
                        <span className="text-[10px] text-purple-700 font-medium block truncate">
                          Trava Máxima no Pós-Chaves
                        </span>
                      </div>
                    </div>
                    <div className="pt-1">
                      <input
                        type="text"
                        readOnly
                        value={formatCurrency(tetoPosGlobalMorar)}
                        className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-extrabold text-purple-700 text-center text-sm shadow-2xs cursor-not-allowed"
                      />
                    </div>
                  </div>

                </div>

                {/* COMISSÃO APARTADA — só na condição "Sinal c/ Morar (Comissão Apartada)" */}
                {isComissaoApartadaCondition && (
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-3xl">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 text-[11px]" title="Percentual sobre o Preço de Tabela que define o valor total da comissão. Ela sai do fluxo do Ato e vira um parcelamento próprio, sem taxa bancária nem limite de risco.">
                        Comissão Apartada (%)
                      </label>
                      <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                        % sobre o Preço de Tabela. Os limites de risco continuam sobre o valor cheio — só o Ato final sai líquido desta comissão.
                      </p>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={comissaoApartadaPctStr}
                          onChange={(e) => setComissaoApartadaPctStr(e.target.value)}
                          onBlur={() => {
                            const parsed = Math.max(0, parseDecimal(comissaoApartadaPctStr, 4));
                            setComissaoApartadaPctStr(formatDecimalBR(parsed, 2, 2));
                          }}
                          className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-fuchsia-700 text-center focus:outline-none focus:border-morar-600 text-xs"
                        />
                        <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">%</span>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 text-[11px]" title="Menor quantidade de parcelas que o corretor pode digitar na ficha para a Comissão Apartada.">
                        Mínimo de Parcelas
                      </label>
                      <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                        Piso do parcelamento da comissão na ficha.
                      </p>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={comissaoApartadaParcelasMinStr}
                          onChange={(e) => setComissaoApartadaParcelasMinStr(e.target.value)}
                          onBlur={() => {
                            const currentMax = Math.max(1, parseIntFlexible(comissaoApartadaParcelasMaxStr, 6));
                            const parsedMin = Math.min(currentMax, Math.max(1, parseIntFlexible(comissaoApartadaParcelasMinStr, 1)));
                            setComissaoApartadaParcelasMinStr(String(parsedMin));
                            const currentPadrao = Math.max(1, parseIntFlexible(comissaoApartadaParcelasStr, 6));
                            if (currentPadrao < parsedMin) setComissaoApartadaParcelasStr(String(parsedMin));
                          }}
                          className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-fuchsia-700 text-center focus:outline-none focus:border-morar-600 text-xs"
                        />
                        <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">X</span>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 text-[11px]" title="Maior quantidade de parcelas que o corretor pode digitar na ficha para a Comissão Apartada.">
                        Máximo de Parcelas
                      </label>
                      <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                        Teto do parcelamento da comissão na ficha.
                      </p>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={comissaoApartadaParcelasMaxStr}
                          onChange={(e) => setComissaoApartadaParcelasMaxStr(e.target.value)}
                          onBlur={() => {
                            const currentMin = Math.max(1, parseIntFlexible(comissaoApartadaParcelasMinStr, 1));
                            const parsedMax = Math.max(currentMin, parseIntFlexible(comissaoApartadaParcelasMaxStr, 6));
                            setComissaoApartadaParcelasMaxStr(String(parsedMax));
                            const currentPadrao = Math.max(1, parseIntFlexible(comissaoApartadaParcelasStr, 6));
                            if (currentPadrao > parsedMax) setComissaoApartadaParcelasStr(String(parsedMax));
                          }}
                          className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-fuchsia-700 text-center focus:outline-none focus:border-morar-600 text-xs"
                        />
                        <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">X</span>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 text-[11px]" title="Quantidade padrão de parcelas da comissão — sugestão inicial, editável por simulação na própria ficha, sempre dentro do intervalo mín./máx. ao lado.">
                        Parcelas Padrão da Comissão
                      </label>
                      <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                        Sugestão inicial ao abrir a ficha; o corretor pode ajustar em cada simulação.
                      </p>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={comissaoApartadaParcelasStr}
                          onChange={(e) => setComissaoApartadaParcelasStr(e.target.value)}
                          onBlur={() => {
                            const min = Math.max(1, parseIntFlexible(comissaoApartadaParcelasMinStr, 1));
                            const max = Math.max(min, parseIntFlexible(comissaoApartadaParcelasMaxStr, 6));
                            const parsed = Math.min(max, Math.max(min, parseIntFlexible(comissaoApartadaParcelasStr, 6)));
                            setComissaoApartadaParcelasStr(String(parsed));
                          }}
                          className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-fuchsia-700 text-center focus:outline-none focus:border-morar-600 text-xs"
                        />
                        <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">X</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : isParcelamentoMorarCondition ? (
              /* ========================================================================= */
              /* LAYOUT EXCLUSIVO PARA CONDIÇÃO: PARCELAMENTO MORAR                        */
              /* ========================================================================= */
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
                  {/* SINAL MÍNIMO (% DO VALOR DO IMÓVEL) */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-800 text-xs truncate" title="Sinal (Ato) mínimo, como percentual do valor do imóvel">
                        Sinal Mínimo
                      </label>
                      <span className="text-[10px] text-slate-500 font-bold">Padrão: 10,0%</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pmSinalMinimoStr}
                        onChange={(e) => setPmSinalMinimoStr(e.target.value)}
                        onBlur={() => setPmSinalMinimoStr(formatDecimalBR(parseDecimal(pmSinalMinimoStr, 10.0), 1, 2))}
                        className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-emerald-700 text-center focus:outline-none focus:border-morar-600 text-xs"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">%</span>
                    </div>
                  </div>

                  {/* RISCO DE RENDA (TETO DA MENSAL DE OBRA) */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-800 text-xs truncate" title="Teto da parcela mensal de obra sobre a renda bruta do cliente">
                        Risco de Renda
                      </label>
                      <span className="text-[10px] text-slate-500 font-bold">Padrão: 40,0%</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={riscoRendaStr}
                        onChange={(e) => setRiscoRendaStr(e.target.value)}
                        onBlur={() => setRiscoRendaStr(formatDecimalBR(parseDecimal(riscoRendaStr, 40.0), 1, 2))}
                        className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-morar-700 text-center focus:outline-none focus:border-morar-600 text-xs"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">%</span>
                    </div>
                  </div>

                  {/* QUANTIDADE DE PARCELAS PÓS-OBRA */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-800 text-xs truncate" title="Quantidade de parcelas mensais lineares no pós-obra">
                        Qtd. Parcelas Pós-Obra
                      </label>
                      <span className="text-[10px] text-slate-500 font-bold">Padrão: 12x</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={pmQtdParcelasPosObraStr}
                        onChange={(e) => setPmQtdParcelasPosObraStr(e.target.value)}
                        onBlur={() => setPmQtdParcelasPosObraStr(String(Math.max(0, parseIntFlexible(pmQtdParcelasPosObraStr, 12))))}
                        className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-center focus:outline-none focus:border-morar-600 text-xs"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">X</span>
                    </div>
                  </div>

                  {/* % MÁX. PARCELA SEMESTRAL */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-800 text-xs truncate" title="Teto de cada parcela intermediária semestral, sobre o valor do imóvel">
                        % Máx. Semestral
                      </label>
                      <span className="text-[10px] text-slate-500 font-bold">Padrão: 4,0%</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pmSemestralMaxStr}
                        onChange={(e) => setPmSemestralMaxStr(e.target.value)}
                        onBlur={() => setPmSemestralMaxStr(formatDecimalBR(parseDecimal(pmSemestralMaxStr, 4.0), 1, 2))}
                        className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-indigo-700 text-center focus:outline-none focus:border-indigo-600 text-xs"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">%</span>
                    </div>
                  </div>

                  {/* % MÁX. PARCELA CHAVES */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-800 text-xs truncate" title="Teto da parcela intermediária final (chaves), sobre o valor do imóvel">
                        % Máx. Chaves
                      </label>
                      <span className="text-[10px] text-slate-500 font-bold">Padrão: 15,0%</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pmChavesMaxStr}
                        onChange={(e) => setPmChavesMaxStr(e.target.value)}
                        onBlur={() => setPmChavesMaxStr(formatDecimalBR(parseDecimal(pmChavesMaxStr, 15.0), 1, 2))}
                        className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-amber-700 text-center focus:outline-none focus:border-amber-600 text-xs"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">%</span>
                    </div>
                  </div>

                  {/* MESES ANTES DO HABITE-SE (VENCIMENTO DAS CHAVES) */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-800 text-xs truncate" title="Quantos meses antes do habite-se a parcela de chaves vence">
                        Chaves: Meses Antes
                      </label>
                      <span className="text-[10px] text-slate-500 font-bold">Padrão: 2</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={pmChavesMesesAntesStr}
                        onChange={(e) => setPmChavesMesesAntesStr(e.target.value)}
                        onBlur={() => setPmChavesMesesAntesStr(String(Math.max(0, parseIntFlexible(pmChavesMesesAntesStr, 2))))}
                        className="w-full pl-3 pr-9 py-2 bg-white border border-slate-300 rounded-xl font-bold text-amber-700 text-center focus:outline-none focus:border-amber-600 text-xs"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">M</span>
                    </div>
                  </div>

                  {/* % MÁX. PRÓ-SOLUTO PÓS-OBRA */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-800 text-xs truncate" title="Teto do somatório das parcelas mensais pós-obra, sobre o valor do imóvel">
                        % Máx. Pró-Soluto Pós-Obra
                      </label>
                      <span className="text-[10px] text-slate-500 font-bold">Padrão: 5,0%</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pmPosObraMaxStr}
                        onChange={(e) => setPmPosObraMaxStr(e.target.value)}
                        onBlur={() => setPmPosObraMaxStr(formatDecimalBR(parseDecimal(pmPosObraMaxStr, 5.0), 1, 2))}
                        className="w-full pl-3 pr-7 py-2 bg-white border border-slate-300 rounded-xl font-bold text-purple-700 text-center focus:outline-none focus:border-purple-600 text-xs"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-400 text-xs pointer-events-none">%</span>
                    </div>
                  </div>
                </div>

                {/* PARCELA MÍNIMA DE CADA BLOCO RECORRENTE */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-800 text-xs truncate" title="Abaixo deste valor, a parcela mensal de obra é considerada inviável (mas nunca é zerada — a Obra é sempre priorizada)">
                        Parcela Mín. Mensal Obra
                      </label>
                      <span className="text-[10px] text-slate-500 font-bold">Padrão: R$ 200,00</span>
                    </div>
                    <input
                      type="text"
                      value={pmParcelaMinMensalObra}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setPmParcelaMinMensalObra(e.target.value)}
                      onBlur={() => {
                        const v = Math.max(0, parseCurrency(pmParcelaMinMensalObra));
                        setPmParcelaMinMensalObra(formatCurrency(v));
                      }}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 text-center focus:outline-none focus:border-morar-600 text-xs"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-800 text-xs truncate" title="Abaixo deste valor, o bloco de intermediárias semestrais é zerado e o saldo passa para a Obra">
                        Parcela Mín. Semestral
                      </label>
                      <span className="text-[10px] text-slate-500 font-bold">Padrão: R$ 200,00</span>
                    </div>
                    <input
                      type="text"
                      value={pmParcelaMinSemestral}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setPmParcelaMinSemestral(e.target.value)}
                      onBlur={() => {
                        const v = Math.max(0, parseCurrency(pmParcelaMinSemestral));
                        setPmParcelaMinSemestral(formatCurrency(v));
                      }}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 text-center focus:outline-none focus:border-morar-600 text-xs"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block font-bold text-slate-800 text-xs truncate" title="Abaixo deste valor, o bloco de pós-obra é zerado e o saldo passa para a Obra">
                        Parcela Mín. Pós-Obra
                      </label>
                      <span className="text-[10px] text-slate-500 font-bold">Padrão: R$ 200,00</span>
                    </div>
                    <input
                      type="text"
                      value={pmParcelaMinPosObra}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setPmParcelaMinPosObra(e.target.value)}
                      onBlur={() => {
                        const v = Math.max(0, parseCurrency(pmParcelaMinPosObra));
                        setPmParcelaMinPosObra(formatCurrency(v));
                      }}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 text-center focus:outline-none focus:border-morar-600 text-xs"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 px-1 leading-relaxed">
                  A quantidade de meses de obra (parcelas mensais lineares) é calculada automaticamente a partir da data de hoje e da previsão de entrega (habite-se) do empreendimento — assim como as intermediárias semestrais, sempre em Junho e Dezembro. Os valores e quantidades podem ser ajustados manualmente na ficha do cliente; esta política define apenas as sugestões iniciais, os pisos de parcela mínima e o vencimento da parcela de chaves.
                </p>
              </div>
            ) : (
              /* ========================================================================= */
              /* LAYOUT PADRÃO PARA CONDIÇÃO: SINAL C/ BANCO DIRETO                        */
              /* ========================================================================= */
              <div className="space-y-4">
                {/* PRIMEIRA LINHA DE PARÂMETROS DA POLÍTICA */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
                  
                  {/* 1. NÚMERO DE PARCELAS COM "X" INTERNO */}
                  <div className="lg:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1 truncate" title="Número de Parcelas">
                      1. Nº Parcelas
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={numParcelasStr}
                        onChange={(e) => setNumParcelasStr(e.target.value)}
                        onBlur={() => {
                          const val = Math.max(0, parseIntFlexible(numParcelasStr, 72));
                          setNumParcelasStr(String(val));
                          // Se o Nº Parcelas caiu abaixo do piso já configurado em
                          // "Parcelas Mín.", o piso desce junto — nunca pode ficar
                          // maior que o próprio teto.
                          const pisoAtual = Math.max(0, parseIntFlexible(parcelasMinimasStr, 1));
                          if (pisoAtual > val) {
                            setParcelasMinimasStr(String(val));
                            onShowToast(`Parcelas Mín. ajustado para ${val}x para não passar do novo Nº Parcelas.`);
                          }
                        }}
                        className="w-full pl-3 pr-7 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-center focus:outline-none focus:border-morar-600"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-500 text-xs pointer-events-none">X</span>
                    </div>
                  </div>

                  {/* PARCELAS MÍNIMAS: menor "Qtd. Mensais" que o corretor pode digitar na
                      ficha (padrão 1, comportamento histórico); reduzir até 0 permite quitar
                      o Pró-Soluto inteiro no Ato quando não sobra mais parcela nenhuma. */}
                  <div className="lg:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1 truncate" title="Menor quantidade de parcelas que o corretor pode digitar na ficha (0 permite quitar tudo no Ato)">
                      Parcelas Mín.
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={parcelasMinimasStr}
                        onChange={(e) => setParcelasMinimasStr(e.target.value)}
                        onBlur={() => {
                          const val = Math.max(0, parseIntFlexible(parcelasMinimasStr, 1));
                          if (val > numParcelas) {
                            setParcelasMinimasStr(String(numParcelas));
                            onShowToast(`Parcelas Mín. não pode passar do Nº Parcelas (${numParcelas}x). Ajustado.`);
                          } else {
                            setParcelasMinimasStr(String(val));
                          }
                        }}
                        className="w-full pl-3 pr-7 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-center focus:outline-none focus:border-morar-600"
                      />
                      <span className="absolute right-3 font-extrabold text-slate-500 text-xs pointer-events-none">X</span>
                    </div>
                  </div>

                  {/* 2. SINAL MÍNIMO */}
                  <div className="lg:col-span-3">
                    <label className="block font-semibold text-slate-700 mb-1">
                      2. Sinal Mínimo
                    </label>
                    <input
                      type="text"
                      value={sinalMinimo}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setSinalMinimo(e.target.value)}
                      onBlur={() => {
                        setSinalMinimo(formatCurrency(resolveSinalMinimo(sinalMinimo)));
                      }}
                      placeholder="Ex: 5000, 5000,00 ou R$ 5.000,00"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-emerald-600 focus:outline-none focus:border-morar-600"
                    />
                  </div>

                  {/* 3. RISCO DA RENDA (%) E VALOR CALCULADO */}
                  <div className="lg:col-span-3 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 truncate" title="Risco da Renda (%)">
                        3. Risco Renda %
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={riscoRendaStr}
                          onChange={(e) => setRiscoRendaStr(e.target.value)}
                          onBlur={() => {
                            const parsed = parseDecimal(riscoRendaStr, 30);
                            setRiscoRendaStr(formatDecimalBR(parsed, 1, 2));
                          }}
                          className="w-full pl-2 pr-6 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-center focus:outline-none focus:border-morar-600"
                        />
                        <span className="absolute right-2.5 font-extrabold text-slate-500 text-xs pointer-events-none">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 truncate" title="Valor Calculado da Renda">
                        Valor Renda
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={formatCurrency(rendaVal)}
                        className="w-full px-2 py-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 text-center cursor-not-allowed text-xs truncate"
                      />
                    </div>
                  </div>

                  {/* 4. RISCO DO IMÓVEL (%) E VALOR CALCULADO */}
                  <div className="lg:col-span-4 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 truncate" title="Risco do Imóvel (%)">
                        4. Risco Imóvel %
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={riscoImovelStr}
                          onChange={(e) => setRiscoImovelStr(e.target.value)}
                          onBlur={() => {
                            const parsed = parseDecimal(riscoImovelStr, 25);
                            setRiscoImovelStr(formatDecimalBR(parsed, 1, 2));
                          }}
                          className="w-full pl-2 pr-6 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-center focus:outline-none focus:border-morar-600"
                        />
                        <span className="absolute right-2.5 font-extrabold text-slate-500 text-xs pointer-events-none">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 truncate" title="Valor do Risco (Maior valor Venda/Avaliação + ITBI - Ato Premiado) * %">
                        Val. Risco Imóvel
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={formatCurrency(riscoImovelVal)}
                        className="w-full px-2 py-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold text-emerald-700 text-center cursor-not-allowed text-xs truncate"
                      />
                    </div>
                  </div>

                </div>

                {/* SEGUNDA LINHA: FAIXAS DE TAXA DE JUROS POR PRAZO DE PARCELAS */}
                <div className="pt-3 border-t border-morar-100/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
                  {/* FAIXA 1 */}
                  <div className="lg:col-span-6 grid grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-slate-200/80">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 truncate text-[11px]" title="Até Qtd. Meses (Faixa 1)">
                        5. Prazo Faixa 1 (Meses)
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={mesesTabela1Str}
                          onChange={(e) => setMesesTabela1Str(e.target.value)}
                          onBlur={() => {
                            const val = Math.max(0, parseIntFlexible(mesesTabela1Str, 36));
                            setMesesTabela1Str(String(val));
                          }}
                          className="w-full pl-2 pr-6 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 text-center focus:outline-none focus:border-morar-600 text-xs"
                        />
                        <span className="absolute right-2 font-bold text-slate-400 text-[10px] pointer-events-none">M</span>
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 truncate text-[11px]" title="Taxa Juros Faixa 1 (% a.m.)">
                        Taxa Juros 1 (% a.m.)
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={taxaJuros1Str}
                          onChange={(e) => setTaxaJuros1Str(e.target.value)}
                          onBlur={() => {
                            const parsed = parseDecimal(taxaJuros1Str, 0);
                            setTaxaJuros1Str(formatDecimalBR(parsed, 2, 2));
                          }}
                          className="w-full pl-2 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-emerald-600 text-center focus:outline-none focus:border-morar-600 text-xs"
                        />
                        <span className="absolute right-1.5 font-bold text-slate-400 text-[10px] pointer-events-none">% a.m.</span>
                      </div>
                    </div>
                  </div>

                  {/* FAIXA 2 */}
                  <div className="lg:col-span-6 grid grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-slate-200/80">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 truncate text-[11px]" title="Até Qtd. Meses (Faixa 2)">
                        6. Prazo Faixa 2 (Meses)
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={mesesTabela2Str}
                          onChange={(e) => setMesesTabela2Str(e.target.value)}
                          onBlur={() => {
                            const val = Math.max(0, parseIntFlexible(mesesTabela2Str, 72));
                            setMesesTabela2Str(String(val));
                          }}
                          className="w-full pl-2 pr-6 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 text-center focus:outline-none focus:border-morar-600 text-xs"
                        />
                        <span className="absolute right-2 font-bold text-slate-400 text-[10px] pointer-events-none">M</span>
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1 truncate text-[11px]" title="Taxa Juros Faixa 2 (% a.m.)">
                        Taxa Juros 2 (% a.m.)
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={taxaJuros2Str}
                          onChange={(e) => setTaxaJuros2Str(e.target.value)}
                          onBlur={() => {
                            const parsed = parseDecimal(taxaJuros2Str, 1);
                            setTaxaJuros2Str(formatDecimalBR(parsed, 2, 2));
                          }}
                          className="w-full pl-2 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-emerald-600 text-center focus:outline-none focus:border-morar-600 text-xs"
                        />
                        <span className="absolute right-1.5 font-bold text-slate-400 text-[10px] pointer-events-none">% a.m.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* TAXA BANCÁRIA: REDUZ O ATO/PRÓ-SOLUTO EXIBIDO; A PARCELA USA O VALOR BRUTO */}
                <div className="pt-3 border-t border-morar-100/80">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 max-w-sm">
                    <label className="block font-semibold text-slate-700 mb-1 text-[11px]" title="Percentual descontado do Risco Máximo Apurado para sugerir o Ato (Imóvel) e o Pró-Soluto Total c/ ITBI exibido — a parcela (Tabela Price) usa o valor antes desse desconto">
                      Taxa Bancária (%)
                    </label>
                    <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                      Reduz o Ato (Imóvel) sugerido e o "Pró-Soluto Total c/ ITBI" exibido em tela — a parcela continua calculada sobre o valor cheio, antes desse desconto.
                    </p>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={taxaAssinaturaContratoStr}
                        onChange={(e) => setTaxaAssinaturaContratoStr(e.target.value)}
                        onBlur={() => {
                          const parsed = parseDecimal(taxaAssinaturaContratoStr, 0);
                          setTaxaAssinaturaContratoStr(formatDecimalBR(parsed, 4, 4));
                        }}
                        className="w-full pl-2 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-amber-700 text-center focus:outline-none focus:border-morar-600 text-xs"
                      />
                      <span className="absolute right-1.5 font-bold text-slate-400 text-[10px] pointer-events-none">%</span>
                    </div>
                  </div>
                </div>

                {/* COMISSÃO APARTADA — só na condição "Sinal c/ Banco Direto (Comissão Apartada)" */}
                {isComissaoApartadaCondition && (
                  <div className="pt-3 border-t border-morar-100/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl">
                    <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                      <label className="block font-semibold text-slate-700 mb-1 text-[11px]" title="Percentual sobre o Preço de Tabela que define o valor total da comissão. Ela sai do fluxo de Ato/Pró-Soluto e vira um parcelamento próprio, sem taxa bancária nem limite de risco.">
                        Comissão Apartada (%)
                      </label>
                      <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                        % sobre o Preço de Tabela. Os limites de risco (25% imóvel, 35% renda) continuam sobre o valor cheio — só o Ato final sai líquido desta comissão.
                      </p>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={comissaoApartadaPctStr}
                          onChange={(e) => setComissaoApartadaPctStr(e.target.value)}
                          onBlur={() => {
                            const parsed = Math.max(0, parseDecimal(comissaoApartadaPctStr, 4));
                            setComissaoApartadaPctStr(formatDecimalBR(parsed, 2, 2));
                          }}
                          className="w-full pl-2 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-fuchsia-700 text-center focus:outline-none focus:border-morar-600 text-xs"
                        />
                        <span className="absolute right-1.5 font-bold text-slate-400 text-[10px] pointer-events-none">%</span>
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                      <label className="block font-semibold text-slate-700 mb-1 text-[11px]" title="Menor quantidade de parcelas que o corretor pode digitar na ficha para a Comissão Apartada.">
                        Mínimo de Parcelas
                      </label>
                      <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                        Piso do parcelamento da comissão na ficha.
                      </p>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={comissaoApartadaParcelasMinStr}
                          onChange={(e) => setComissaoApartadaParcelasMinStr(e.target.value)}
                          onBlur={() => {
                            const currentMax = Math.max(1, parseIntFlexible(comissaoApartadaParcelasMaxStr, 6));
                            const parsedMin = Math.min(currentMax, Math.max(1, parseIntFlexible(comissaoApartadaParcelasMinStr, 1)));
                            setComissaoApartadaParcelasMinStr(String(parsedMin));
                            const currentPadrao = Math.max(1, parseIntFlexible(comissaoApartadaParcelasStr, 6));
                            if (currentPadrao < parsedMin) setComissaoApartadaParcelasStr(String(parsedMin));
                          }}
                          className="w-full pl-2 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-fuchsia-700 text-center focus:outline-none focus:border-morar-600 text-xs"
                        />
                        <span className="absolute right-1.5 font-bold text-slate-400 text-[10px] pointer-events-none">X</span>
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                      <label className="block font-semibold text-slate-700 mb-1 text-[11px]" title="Maior quantidade de parcelas que o corretor pode digitar na ficha para a Comissão Apartada.">
                        Máximo de Parcelas
                      </label>
                      <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                        Teto do parcelamento da comissão na ficha.
                      </p>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={comissaoApartadaParcelasMaxStr}
                          onChange={(e) => setComissaoApartadaParcelasMaxStr(e.target.value)}
                          onBlur={() => {
                            const currentMin = Math.max(1, parseIntFlexible(comissaoApartadaParcelasMinStr, 1));
                            const parsedMax = Math.max(currentMin, parseIntFlexible(comissaoApartadaParcelasMaxStr, 6));
                            setComissaoApartadaParcelasMaxStr(String(parsedMax));
                            const currentPadrao = Math.max(1, parseIntFlexible(comissaoApartadaParcelasStr, 6));
                            if (currentPadrao > parsedMax) setComissaoApartadaParcelasStr(String(parsedMax));
                          }}
                          className="w-full pl-2 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-fuchsia-700 text-center focus:outline-none focus:border-morar-600 text-xs"
                        />
                        <span className="absolute right-1.5 font-bold text-slate-400 text-[10px] pointer-events-none">X</span>
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                      <label className="block font-semibold text-slate-700 mb-1 text-[11px]" title="Quantidade padrão de parcelas da comissão — sugestão inicial, editável por simulação na própria ficha, sempre dentro do intervalo mín./máx. ao lado.">
                        Parcelas Padrão da Comissão
                      </label>
                      <p className="text-[10px] text-slate-500 mb-1.5 leading-tight">
                        Sugestão inicial ao abrir a ficha; o corretor pode ajustar em cada simulação.
                      </p>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={comissaoApartadaParcelasStr}
                          onChange={(e) => setComissaoApartadaParcelasStr(e.target.value)}
                          onBlur={() => {
                            const min = Math.max(1, parseIntFlexible(comissaoApartadaParcelasMinStr, 1));
                            const max = Math.max(min, parseIntFlexible(comissaoApartadaParcelasMaxStr, 6));
                            const parsed = Math.min(max, Math.max(min, parseIntFlexible(comissaoApartadaParcelasStr, 6)));
                            setComissaoApartadaParcelasStr(String(parsed));
                          }}
                          className="w-full pl-2 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-fuchsia-700 text-center focus:outline-none focus:border-morar-600 text-xs"
                        />
                        <span className="absolute right-1.5 font-bold text-slate-400 text-[10px] pointer-events-none">X</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TERCEIRA LINHA: VALOR PRESENTE (VP EXCEL) E LIMITES DE RISCO (3 CARDS DIVIDIDOS EM 1/3 CADA) */}
                <div className="pt-3 border-t border-morar-100/80 grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
                  
                  {/* 1/3: VP RISCO RENDA */}
                  <div className="bg-emerald-50/90 p-3.5 rounded-xl border border-emerald-200/90 flex flex-col justify-between space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
                        <Calculator className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-emerald-950 text-[11px] uppercase tracking-wider truncate">
                          7. VP Risco Renda
                        </span>
                        <span className="text-[10px] text-emerald-700 font-medium block truncate">
                          Aplicado: {appliedRatePct.toFixed(2)}% a.m. ({numParcelas}x)
                        </span>
                      </div>
                    </div>
                    <div className="pt-1">
                      <input
                        type="text"
                        readOnly
                        value={formatCurrency(vpVal)}
                        className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl font-extrabold text-emerald-700 text-center text-sm shadow-2xs cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* 2/3: VALOR RISCO DO IMÓVEL */}
                  <div className="bg-morar-50/90 p-3.5 rounded-xl border border-morar-200/90 flex flex-col justify-between space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-morar-100 text-morar-600 shrink-0">
                        <Building className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-slate-900 text-[11px] uppercase tracking-wider truncate">
                          8. Val. Risco Imóvel
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium block truncate">
                          =(Maior valor Venda/Avaliação + ITBI - Ato Premiado) * % Risco
                        </span>
                      </div>
                    </div>
                    <div className="pt-1">
                      <input
                        type="text"
                        readOnly
                        value={formatCurrency(riscoImovelVal)}
                        className="w-full px-3 py-2 bg-white border border-morar-300 rounded-xl font-extrabold text-morar-600 text-center text-sm shadow-2xs cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* 3/3: MÍNIMO ENTRE VP E RISCO IMÓVEL */}
                  <div className="bg-amber-50/90 p-3.5 rounded-xl border border-amber-200/90 flex flex-col justify-between space-y-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 shrink-0">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="block font-bold text-amber-950 text-[11px] uppercase tracking-wider truncate">
                          9. Mínimo (VP x Imóvel)
                        </span>
                        <span className="text-[10px] text-amber-700 font-medium block truncate">
                          Limite Máximo p/ Pró-Soluto Total
                        </span>
                      </div>
                    </div>
                    <div className="pt-1">
                      <input
                        type="text"
                        readOnly
                        value={formatCurrency(minRiskVal)}
                        className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl font-extrabold text-amber-800 text-center text-sm shadow-2xs cursor-not-allowed"
                      />
                    </div>
                  </div>

                </div>
              </div>
            )}

          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block font-semibold text-slate-700">
                Regras de Cálculo e Política Comercial da Condição Selecionada
              </label>
              <button
                type="button"
                onClick={() => setPolicyText('')}
                className="text-[11px] font-semibold text-slate-500 hover:text-morar-600 flex items-center gap-1 cursor-pointer"
              >
                <Eraser className="w-3 h-3" />
                <span>Limpar Quadro</span>
              </button>
            </div>
            <textarea
              rows={6}
              value={policyText}
              onChange={(e) => setPolicyText(e.target.value)}
              placeholder="Digite as novas regras comerciais e de cálculo para esta condição..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-morar-600"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="editProductFeatured"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="rounded text-morar-600 focus:ring-morar-600 cursor-pointer"
            />
            <label htmlFor="editProductFeatured" className="font-semibold text-slate-700 cursor-pointer">
              Definir como Empreendimento em Destaque
            </label>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end">
            <button
              onClick={handleSavePolicy}
              type="button"
              className="px-5 py-2.5 bg-morar-600 hover:bg-morar-700 text-white font-semibold rounded-xl text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Alterações</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL: NOVA CONDIÇÃO COMERCIAL */}
      {isNewConditionModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsNewConditionModalOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsNewConditionModalOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 relative">
            <button
              type="button"
              onClick={() => setIsNewConditionModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Nova Condição Comercial
                </h3>
                <p className="text-xs text-slate-500">
                  Empreendimento: <span className="font-semibold text-slate-700">{productName || activeProd.name}</span>
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmNewCondition} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nome da Condição Comercial *
                </label>
                <input
                  ref={newCondInputRef}
                  type="text"
                  value={newConditionName}
                  onChange={(e) => setNewConditionName(e.target.value)}
                  placeholder="Ex: Sinal em 36X c/ Direto, À Vista c/ Desconto..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600 transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewConditionModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newConditionName.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Criar Condição</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

