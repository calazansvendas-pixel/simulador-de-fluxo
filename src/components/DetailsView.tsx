import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PainelFinanciamento } from './PainelFinanciamento';
import { ArrowLeft, RotateCcw, KeyRound, FileCheck2, Check, Coins, AlertTriangle, FileSpreadsheet, PieChart, Printer, ChevronDown, Save, Loader2, HandCoins } from 'lucide-react';
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Bar, LabelList } from 'recharts';
import { ActiveTab, Cargo, CommercialCondition, PdfExportSettings, Product, SelectedUnit, SimulationData, TelaVisibilitySettings } from '../types';
import { formatCurrency, formatArea, parseCurrency, formatDateMonthYear, formatDeliveryText, formatForEdit, isTabelaVencida, formatDateBr } from '../utils/formatters';
import { calculatePolicyRiskValues, ensureProductConditions, calcularParcelaPrice, resolveConditionForTorre, resolverDescontoConstrutora, resolverCartaNaMangaMaximo, resolverTetoAtoComDesconto, resolverTetoAtoComDescontoEComissao, getConditionKind, calcularParcelamentoMorar, monthsBetweenDates, subtractMonthsFromDate, contarSemestraisJunhoDezembro, gerarDatasSemestrais, ConditionKind } from '../utils/calculations';
import { CONDICOES_APP } from '../config/telasApp';
import { CLASSE_BOTAO_APARTAR_ATIVO, CLASSE_BOTAO_APARTAR_INATIVO, CONDICOES_BASE, ROTULO_CONDICAO_BASE, condicaoAlternadaComissao, condicaoBaseDe, isComissaoApartadaKind, telaDaCondicao } from '../utils/condicoesBase';
import { DEFAULT_PDF_EXPORT_SETTINGS } from '../utils/pdfExport';
import { DEFAULT_TELA_VISIBILITY_SETTINGS } from '../utils/telaVisibility';
import { pdfPermissoesService } from '../services/pdfPermissoesService';
import { telaVisibilidadeService } from '../services/telaVisibilidadeService';
import { PdfExportModal } from './PdfExportModal';
import { EmptySimulationNotice } from './EmptySimulationNotice';
import { FluxoEntradaConstrutora } from './FluxoEntradaConstrutora';
import { larguraMinimaBarra, rotuloBarraDireita } from './RotuloBarra';
import { PmCampoEditavel } from './PmCampoEditavel';
import { MiniSwitch } from './MiniSwitch';
import { MonthStepper } from './MonthStepper';
import { imoveisService } from '../services/imoveisService';

interface DetailsViewProps {
  // false enquanto a primeira sincronização das tabelas com o Firestore não terminou: o aviso
  // "Tabela de Vendas Não Importada" só pode aparecer depois disso (evita a tarja piscando).
  tabelasCarregadas?: boolean;
  product: Product | null;
  condition: CommercialCondition | null;
  products?: Product[];
  currentDate?: string;
  onSelectProduct?: (product: Product, conditionId: string) => void;
  onSelectCondition?: (condition: CommercialCondition, targetTab?: ActiveTab) => void;
  // Condições liberadas para o usuário (chaves de CONDICOES_APP); undefined = sem restrição.
  condicoesLiberadas?: string[];
  simulationData: SimulationData;
  // Atualiza o estado global da simulação (App): usado pelos seletores de % financiado e 1º imóvel.
  onSimulationDataChange?: (data: SimulationData) => void;
  selectedUnits: Record<string, SelectedUnit>;
  onUnitSelectChange: (productId: string, unit: SelectedUnit) => void;
  onBackToSimulator: () => void;
  onNavigateToImport: (productId: string) => void;
  onShowToast: (message: string) => void;
  // Cargo de quem está logado — decide o que aparece no PDF exportado,
  // conforme a política que o Administrador definiu em "Configurar
  // Exportação de PDF" (ver pdfPermissoesService.ts).
  cargoUsuario: Cargo;
}

export const DetailsView: React.FC<DetailsViewProps> = ({
  product,
  condition,
  products = [],
  currentDate,
  onSelectProduct,
  onSelectCondition,
  condicoesLiberadas,
  onSimulationDataChange,
  simulationData,
  selectedUnits,
  onUnitSelectChange,
  onBackToSimulator,
  onNavigateToImport,
  tabelasCarregadas = true,
  onShowToast,
  cargoUsuario
}) => {
  const currentProd = useMemo(() => {
    if (product) return product;
    if (products && products.length > 0) return products[0];
    return null;
  }, [product, products]);

  const [selectedTorre, setSelectedTorre] = useState<string>('');
  const [selectedUnidade, setSelectedUnidade] = useState<string>('');

  // Condição base (1ª Fase) selecionada para o produto atual.
  const baseCond = useMemo(() => {
    if (!currentProd) return null;
    const prodWithConds = ensureProductConditions({ ...currentProd });
    if (condition) {
      const match = prodWithConds.conditions.find(c => c.id === condition.id);
      if (match) return match;
    }
    return condition || prodWithConds.conditions[0];
  }, [currentProd, condition]);

  // Condição efetiva já resolvida para a torre selecionada: se a torre estiver
  // marcada como 2ª Fase na política, os parâmetros de fase2Params sobrescrevem
  // os da condição base.
  const currentCond = useMemo(() => (
    resolveConditionForTorre(baseCond, selectedTorre) || baseCond
  ), [baseCond, selectedTorre]);

  // Estado padrão dos 3 interruptores de desconto (Política de Crédito do produto; desligados por padrão).
  const padraoConstrutoraLigado = currentCond?.descontoConstrutoraPadraoLigado === true;
  const padraoVistaLigado = currentCond?.descontoVistaPadraoLigado === true;
  const padraoAtoLigado = currentCond?.descontoAtoPadraoLigado === true;

  // LÓGICA DE DEFINIÇÃO DO PRAZO PADRÃO (HERDADO DINAMICAMENTE DA POLÍTICA DE CRÉDITO)
  const condNumParcelas = currentCond?.numParcelas !== undefined
    ? Number(currentCond.numParcelas)
    : (currentProd?.numParcelas !== undefined ? Number(currentProd.numParcelas) : 60);

  // Teto de parcelas: exatamente o "Nº Parcelas" da política de crédito — nunca
  // o maior entre ele e as faixas de juros (mesesTabela1/2, que só definem qual
  // taxa se aplica, não quantas parcelas a política permite). Se a política
  // prevê 30 parcelas, 30 é o máximo que o corretor consegue digitar aqui.
  const limiteMaximoParcelas = Math.max(1, condNumParcelas);
  // Menor "Qtd. Mensais" que o corretor pode digitar nesta ficha — vem da
  // política de crédito da condição (padrão 1, comportamento histórico); pode
  // ser reduzida a 0 para permitir quitar o Pró-Soluto inteiro no Ato.
  const parcelasMinimasCond = currentCond?.parcelasMinimas !== undefined
    ? Math.max(0, Number(currentCond.parcelasMinimas))
    : 1;

  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [isFirstHomeLocal, setIsFirstHomeLocal] = useState<boolean>(simulationData.isFirstHome ?? true);

  const [valAtoManual, setValAtoManual] = useState<number | null>(null);
  const [atoInputText, setAtoInputText] = useState<string>('');
  const [isEditingAto, setIsEditingAto] = useState<boolean>(false);
  // Pgtº à vista (botão de cabeçalho, igual ao do Sinal c/ Morar): aplica o
  // desconto à vista da política sobre o preço, zera o ITBI e quita o saldo
  // inteiro no Ato — SEPARADO do botão "Parcelado/À Vista" já existente
  // (isAVistaActive mais abaixo), que continua só quitando o Pró-Soluto sem
  // mexer em preço/ITBI. Estado explícito, mesmo padrão do FichaMorar.tsx.
  const [isPagamentoAVistaAtivoManual, setIsPagamentoAVistaAtivoManual] = useState<boolean>(false);
  // Interruptor do Desconto à Vista: só vale com o "Pgtº à vista" ativo (nasce com o padrão do produto).
  const [descontoVistaAtivo, setDescontoVistaAtivo] = useState<boolean>(false);

  const [valAtoITBI, setValAtoITBI] = useState<number>(0);
  const [itbiInputText, setItbiInputText] = useState<string>('');
  const [isEditingITBI, setIsEditingITBI] = useState<boolean>(false);
  // Piso digitado pelo CORRETOR em "ITBI no Ato" (null = nenhum; o valor
  // exibido em valAtoITBI pode estar 100% ou parcialmente elevado por
  // migração automática — ver itbiAtoSugeridoBanco mais abaixo). Guardado à
  // parte pelo mesmo motivo do FichaMorar.tsx: reaproveitar o próprio
  // valAtoITBI como piso faria uma migração automática anterior "grudar" e
  // nunca descer quando a Qtd. Mensais aumenta de novo.
  const [itbiAtoManualFloor, setItbiAtoManualFloor] = useState<number | null>(null);

  const [isAtoPremiadoEnabled, setIsAtoPremiadoEnabled] = useState<boolean>(padraoAtoLigado);

  const [valParc2, setValParc2] = useState<number>(0);
  const [parc2InputText, setParc2InputText] = useState<string>('');
  const [isEditingParc2, setIsEditingParc2] = useState<boolean>(false);

  const [valParc3, setValParc3] = useState<number>(0);
  // Liga/desliga o Desconto Construtora da regra da política (sempre inicia desligado).
  const [descontoConstrutoraAtivo, setDescontoConstrutoraAtivo] = useState<boolean>(padraoConstrutoraLigado);
  // "Carta na Manga" digitada pelo corretor (limitada ao teto da política; zera ao trocar de unidade).
  const [cartaNaManga, setCartaNaManga] = useState<number>(0);
  // Interruptor da Carta na Manga: só habilita com valor digitado; liga sozinho ao digitar.
  const [cartaNaMangaAtiva, setCartaNaMangaAtiva] = useState<boolean>(false);
  // 1ª/2ª Mensal (30 e 60 dias) ligadas na Política? Desligadas, os cards somem e os valores
  // ficam em R$ 0,00 (as fórmulas do fluxo continuam iguais, só com mensais zeradas).
  const mensal1Ativa = currentCond?.habilitar1aMensal !== false;
  const mensal2Ativa = currentCond?.habilitar2aMensal !== false;
  useEffect(() => {
    if (!mensal1Ativa) { setValParc2(0); setParc2InputText(''); setIsEditingParc2(false); }
    if (!mensal2Ativa) { setValParc3(0); setParc3InputText(''); setIsEditingParc3(false); }
  }, [mensal1Ativa, mensal2Ativa]);
  const [parc3InputText, setParc3InputText] = useState<string>('');
  const [isEditingParc3, setIsEditingParc3] = useState<boolean>(false);

  const [qtdMensais, setQtdMensais] = useState<number>(condNumParcelas);
  // Quantidade de parcelas da Comissão Apartada — sugestão vem da política
  // (comissaoApartadaParcelas), mas é editável por simulação nesta ficha.
  const [comissaoParcelasManual, setComissaoParcelasManual] = useState<number | null>(null);

  // Condição comercial "Parcelamento Morar": mesmo layout desta tela (Sinal c/
  // Banco Direto), mas com o Bloco 3 substituído por um motor de cálculo próprio
  // (ver calcularParcelamentoMorar em utils/calculations.ts) — sem financiamento/
  // Tabela Price, com Sinal mínimo em % do valor do imóvel, parcelas mensais
  // lineares de obra, intermediárias semestrais, parcela final (chaves) e
  // parcelamento pós-obra, todos calculados a partir da política de crédito.
  const isParcelamentoMorar = getConditionKind(currentCond?.name) === 'parcelamento-morar';

  // Condição comercial "Sinal c/ Banco Direto (Comissão Apartada)": mesma tela e
  // mesmíssimo motor de cálculo do Banco Direto comum — a única diferença é que a
  // comissão da corretora sai do fluxo de Ato/Pró-Soluto e vira um parcelamento
  // próprio e independente (ver comissaoApartadaValor mais abaixo e o ponto de
  // desconto dentro do laço iterativo do Ato).
  const isComissaoApartada = getConditionKind(currentCond?.name) === 'banco-direto-comissao-apartada';

  // O que este cargo pode ver no PDF exportado — definido pelo Administrador
  // em "Configurar Exportação de PDF". Busca de novo sempre que o cargo ou a
  // condição (Banco Direto x Parcelamento Morar) mudar; começa mostrando tudo
  // até a busca terminar, pra nunca travar a exportação.
  const [pdfSettings, setPdfSettings] = useState<PdfExportSettings>(DEFAULT_PDF_EXPORT_SETTINGS);
  useEffect(() => {
    let cancelado = false;
    pdfPermissoesService.carregarConfiguracaoParaExportar(
      cargoUsuario,
      isParcelamentoMorar ? 'parcelamento-morar' : isComissaoApartada ? 'banco-direto-comissao-apartada' : 'banco-direto'
    )
      .then(settings => { if (!cancelado) setPdfSettings(settings); });
    return () => { cancelado = true; };
  }, [cargoUsuario, isParcelamentoMorar, isComissaoApartada]);

  // O que este cargo pode ver NA TELA (independente do PDF) — definido pelo
  // Administrador em "Configurar Visibilidade dos Quadros".
  const [telaSettings, setTelaSettings] = useState<TelaVisibilitySettings>(DEFAULT_TELA_VISIBILITY_SETTINGS);
  useEffect(() => {
    let cancelado = false;
    telaVisibilidadeService.carregarConfiguracaoParaTela(
      cargoUsuario,
      isParcelamentoMorar ? 'parcelamento-morar' : isComissaoApartada ? 'banco-direto-comissao-apartada' : 'banco-direto'
    )
      .then(settings => { if (!cancelado) setTelaSettings(settings); });
    return () => { cancelado = true; };
  }, [cargoUsuario, isParcelamentoMorar, isComissaoApartada]);

  // Todos os campos da condição "Parcelamento Morar" (quantidade e valor de
  // cada bloco) partem de uma sugestão calculada pela política de crédito, mas
  // são livremente editáveis nesta ficha — resetam ao trocar produto/condição
  // ou ao clicar em "Limpar" (null = usa a sugestão automática).
  const [pmMensalObraValorManual, setPmMensalObraValorManual] = useState<number | null>(null);
  // Qtd. Meses da Mensal de Obra: editável, mas só pode DIMINUIR em relação à
  // sugestão automática (hoje -> habite-se) — nunca aumentar além dela.
  const [pmMesesObraManual, setPmMesesObraManual] = useState<number | null>(null);
  const [pmChavesEnabled, setPmChavesEnabled] = useState<boolean>(true);
  // Ligar/desligar cada intermediária semestral individualmente (índice ->
  // usada ou não). Ausente no mapa = usada (padrão true).
  const [pmSemestralIndividualEnabled, setPmSemestralIndividualEnabled] = useState<Record<number, boolean>>({});
  // Valor de cada intermediária semestral, editável individualmente (índice
  // -> valor manual). Cada uma é independente das demais: editar uma não
  // altera o valor das outras, mas entra no mesmo motor de cálculo, então
  // dispara um novo cálculo geral do fluxo (o Ato absorve a diferença).
  const [pmSemestralValorManual, setPmSemestralValorManual] = useState<Record<number, number>>({});
  // Data de cada intermediária semestral, editável individualmente (índice ->
  // "YYYY-MM"). Quando não há override, usa a data sugerida automaticamente.
  const [pmSemestralDatasManual, setPmSemestralDatasManual] = useState<Record<number, string>>({});
  const [pmChavesValorManual, setPmChavesValorManual] = useState<number | null>(null);
  const [pmQtdPosObraManual, setPmQtdPosObraManual] = useState<number | null>(null);
  const [pmPosObraValorManual, setPmPosObraValorManual] = useState<number | null>(null);

  // Sync isFirstHomeLocal when simulationData.isFirstHome changes
  useEffect(() => {
    setIsFirstHomeLocal(simulationData.isFirstHome ?? true);
  }, [simulationData.isFirstHome]);

  // Sync state when product or unit selection changes
  useEffect(() => {
    if (currentProd) {
      const saved = selectedUnits[currentProd.id];
      if (saved && (saved.torre || saved.unidade)) {
        setSelectedTorre(saved.torre || '');
        setSelectedUnidade(saved.unidade || '');
      } else {
        setSelectedTorre('');
        setSelectedUnidade('');
        setValParc2(0);
        setParc2InputText('');
        setIsEditingParc2(false);
        setValParc3(0);
        setParc3InputText('');
        setIsEditingParc3(false);
      }
    }
  }, [currentProd?.id, selectedUnits]);

  // 2. FUNÇÃO E EFFECT DISPARADOS AO TROCAR DE EMPREENDIMENTO OU ATUALIZAR A POLÍTICA DE CRÉDITO:
  // Garante a limpeza do estado residual na memória, reset da seleção ativa de unidade e sincronização da Qtd. Mensais
  const prevProdCondKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = currentProd ? `${currentProd.id}::${currentCond?.id || ''}` : null;
    const isRealSwitch = prevProdCondKeyRef.current !== null && prevProdCondKeyRef.current !== key;
    // Mesmo empreendimento, só a condição comercial mudou: Torre/Unidade permanecem selecionadas
    // (o resto do fluxo volta ao padrão da nova condição e é recalculado para a mesma unidade).
    const soCondicaoMudou = isRealSwitch && !!currentProd && prevProdCondKeyRef.current!.split('::')[0] === currentProd.id;
    prevProdCondKeyRef.current = key;
    // No mount inicial (ex.: reabertura de uma simulação salva via "Editar"), a torre/unidade
    // já vêm restauradas em selectedUnits — não zera aqui, senão a seleção se perde assim que
    // a ficha monta. Só limpa quando o usuário de fato troca de produto/condição já dentro da ficha.
    if (!isRealSwitch) return;

    if (!soCondicaoMudou) {
      setSelectedTorre('');
      setSelectedUnidade('');
    }
    setValAtoManual(null);
    setAtoInputText('');
    setIsEditingAto(false);
    setIsPagamentoAVistaAtivoManual(false);
    setDescontoVistaAtivo(false);
    setValAtoITBI(0);
    setItbiAtoManualFloor(null);
    setItbiInputText('');
    setIsEditingITBI(false);
    setValParc2(0);
    setParc2InputText('');
    setIsEditingParc2(false);
    setValParc3(0);
    setParc3InputText('');
    setIsEditingParc3(false);
    setQtdMensais(condNumParcelas);
    setIsAtoPremiadoEnabled(padraoAtoLigado);
    setPmMensalObraValorManual(null);
    setPmMesesObraManual(null);
    setPmChavesEnabled(true);
    setPmSemestralIndividualEnabled({});
    setPmSemestralValorManual({});
    setPmSemestralDatasManual({});
    setPmChavesValorManual(null);
    setPmQtdPosObraManual(null);
    setPmPosObraValorManual(null);
    setComissaoParcelasManual(null);
    if (currentProd && !soCondicaoMudou) {
      onUnitSelectChange(currentProd.id, { torre: '', unidade: '' });
    }
  }, [currentProd?.id, currentCond?.id, currentCond?.numParcelas, condNumParcelas]);

  // Tabela vencida (data final de validade já passou em relação ao "Hoje é"
  // do cabeçalho) = trata como se não houvesse tabela nenhuma: zera as linhas
  // disponíveis para Torre/Unidade, bloqueando a simulação com preços
  // desatualizados até uma tabela nova ser importada.
  const tabelaVencida = isTabelaVencida(currentProd?.tableInfo?.validTo, currentDate);

  // Get table rows for current product
  const tableRows = tabelaVencida ? [] : (currentProd?.tableInfo?.rows || []);
  const uniqueTorres = React.useMemo(() => {
    return (Array.from(new Set(tableRows.map(r => String(r[1] || '').trim()).filter(t => t !== ''))) as string[])
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [tableRows]);

  // Torres habilitadas para simulação nesta política comercial (sempre a partir
  // da condição base — não depende de qual torre já está selecionada).
  const availableTorres = React.useMemo(() => {
    if (baseCond?.torresHabilitadas === undefined) return uniqueTorres;
    const allowed = (baseCond.torresHabilitadas || []).map(t => String(t || '').trim().toLowerCase());
    return uniqueTorres.filter(t => allowed.includes(String(t || '').trim().toLowerCase()));
  }, [uniqueTorres, baseCond?.torresHabilitadas]);

  // Validação estrita: se a torre ou unidade selecionada não estiver disponível, reseta a seleção
  useEffect(() => {
    if (!currentProd) return;

    if (selectedTorre) {
      const isTorreValid = availableTorres.some(t => t.toLowerCase() === selectedTorre.toLowerCase());
      if (!isTorreValid) {
        setSelectedTorre('');
        setSelectedUnidade('');
        onUnitSelectChange(currentProd.id, { torre: '', unidade: '' });
        return;
      }

      if (selectedUnidade) {
        const unitsOfCurrent = Array.from(new Set(
          tableRows
            .filter(r => String(r[1] || '').trim().toLowerCase() === selectedTorre.toLowerCase())
            .map(r => String(r[2] || '').trim())
            .filter(u => u !== '')
        ));

        const isUnidadeValid = unitsOfCurrent.some(u => String(u).toLowerCase() === selectedUnidade.toLowerCase());
        if (!isUnidadeValid) {
          setSelectedUnidade('');
          onUnitSelectChange(currentProd.id, { torre: selectedTorre, unidade: '' });
        }
      }
    }
  }, [availableTorres, currentProd?.id, currentCond?.id, tableRows]);

  // Filter units by selected torre
  const filteredUnits = selectedTorre
    ? (Array.from(new Set(
        tableRows
          .filter(r => String(r[1] || '').trim().toLowerCase() === selectedTorre.toLowerCase())
          .map(r => String(r[2] || '').trim())
          .filter(u => u !== '')
      )) as string[]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    : [];

  // Find exact row if torre and unidade are chosen
  const matchingRow = (selectedTorre && selectedUnidade)
    ? tableRows.find(r => 
        String(r[1] || '').trim().toLowerCase() === selectedTorre.toLowerCase() &&
        String(r[2] || '').trim().toLowerCase() === selectedUnidade.toLowerCase()
      )
    : null;

  const hasUnitSelected = Boolean(selectedTorre && selectedUnidade && matchingRow);

  // Extracted row data
  const fase = matchingRow ? String(matchingRow[0] || '1ª') : '-';
  const tipologia = matchingRow ? String(matchingRow[5] || '2 Quartos') : '-';
  const areaPriv = matchingRow ? formatArea(matchingRow[3]) : '0,00 m²';
  const areaQuintal = matchingRow ? formatArea(matchingRow[4]) : '0,00 m²';

  // Preço de lista (exibição) e Desconto Construtora (matriz da política por Produto/Torre/
  // Tipologia): precoTabelaOriginal — base de todo o fluxo — já sai líquido do desconto.
  const precoTabelaLista = hasUnitSelected && matchingRow ? parseCurrency(matchingRow[7]) : 0;
  // O desconto encontrado na regra fica registrado (descontoConstrutoraRegra), mas só entra nas
  // contas quando o corretor o ativa (inicia sempre desligado a cada unidade selecionada).
  const descontoConstrutoraRegra = hasUnitSelected
    ? resolverDescontoConstrutora(currentCond?.descontosConstrutora, currentProd?.id, selectedTorre, tipologia, precoTabelaLista)
    : 0;
  const descontoConstrutora = descontoConstrutoraAtivo ? descontoConstrutoraRegra : 0;
  useEffect(() => { setDescontoConstrutoraAtivo(padraoConstrutoraLigado); setCartaNaManga(0); setCartaNaMangaAtiva(false); }, [selectedTorre, selectedUnidade, currentProd?.id]);
  const cartaNaMangaMax = hasUnitSelected
    ? resolverCartaNaMangaMaximo(currentCond?.cartasNaManga, currentProd?.id, selectedTorre, tipologia, precoTabelaLista)
    : 0;
  const cartaNaMangaDigitada = Math.min(cartaNaManga, cartaNaMangaMax);
  // Só entra nas contas com o interruptor ligado e valor > 0.
  const cartaNaMangaEfetiva = cartaNaMangaAtiva && cartaNaMangaDigitada > 0 ? cartaNaMangaDigitada : 0;
  // Carta na Manga soma-se ao Desconto Construtora no abatimento do preço-base (cascata completa).
  const precoTabelaOriginal = Math.max(0, Math.round((precoTabelaLista - descontoConstrutora - cartaNaMangaEfetiva) * 100) / 100);
  const handleCartaNaMangaChange = (valor: number) => {
    const v = Math.min(Math.max(0, valor), cartaNaMangaMax);
    setCartaNaManga(v);
    if (v <= 0) setCartaNaMangaAtiva(false);
    else if (cartaNaManga <= 0) setCartaNaMangaAtiva(true);
    setValAtoManual(null);
    setAtoInputText('');
    setIsEditingAto(false);
  };
  const handleToggleCartaNaManga = () => {
    if (cartaNaMangaDigitada <= 0) return;
    setCartaNaMangaAtiva(v => !v);
    setValAtoManual(null);
    setAtoInputText('');
    setIsEditingAto(false);
  };
  const evaluation = hasUnitSelected && matchingRow ? parseCurrency(matchingRow[6]) : 0;

  // Desconto à Vista: aplicado sobre o Preço de Tabela ANTES de qualquer outro
  // cálculo do fluxo (Ato, ITBI, Pró-Soluto, motor do Parcelamento Morar etc.)
  // quando o botão "Pgtº à vista" (cabeçalho, igual ao Sinal c/ Morar) está
  // ativo — mesmo padrão já usado no Sinal c/ Morar (FichaMorar.tsx). O botão
  // "Parcelado/À Vista" mais simples (dentro do card do Ato) NUNCA usa este
  // preço com desconto — sempre lê precoTabelaOriginal diretamente, pra ficar
  // imune a este toggle.
  const descontoAVistaPctPolitica = currentCond?.descontoAVistaPct ?? 0;
  const valorDescontoAVista = isPagamentoAVistaAtivoManual && descontoVistaAtivo && precoTabelaOriginal > 0
    ? Math.round(precoTabelaOriginal * (descontoAVistaPctPolitica / 100) * 100) / 100
    : 0;
  const price = Math.max(0, Math.round((precoTabelaOriginal - valorDescontoAVista) * 100) / 100);

  // Taxa de Assinatura de Contrato (%) — exclusiva do Sinal c/ Banco Direto,
  // cadastrada em Políticas & Empreendimentos. Reduz o Risco Máximo Apurado
  // (o "Pró-Soluto Total c/ ITBI" bruto) para chegar no valor líquido — é
  // esse líquido que sugere o Ato (Imóvel), aparece em "Pró-Soluto Total c/
  // ITBI" e alimenta todo o resto do fluxo. A parcela (Tabela Price), mais
  // abaixo, é a única conta feita sobre o valor BRUTO (sem a redução).
  const taxaAssinaturaContratoPct = currentCond?.taxaAssinaturaContratoPct ?? 0;
  // % do Ato Premiado desta condição comercial (padrão histórico 10% quando a
  // política não define). 0% desliga completamente o desconto do Ato Premiado
  // nesta condição, mesmo com o botão "Ato Premiado" ligado na ficha.
  const pctAtoPremiadoCond = currentCond?.atoPremiadoPct ?? 0.10;
  const tetoDescontoAtoPremiado = Math.round(50000 * pctAtoPremiadoCond * 100) / 100;

  // Comissão Apartada: % sobre o Preço de Tabela (precoTabelaOriginal) MENOS o
  // Desconto do Ato Premiado — mesma base usada pela planilha de referência.
  // Ausente na política → 4% (mesmo padrão já citado no texto de política
  // padrão do app). Só existe (>0) quando a condição é a variante "Comissão
  // Apartada" — em qualquer outra condição fica em R$ 0,00, sem nenhum efeito
  // no restante da conta. O valor final (comissaoApartadaValor, que usa o
  // Desconto já resolvido) é calculado mais abaixo, depois de descontoAto —
  // ver o comentário lá para a explicação da referência circular envolvida.
  const pctComissaoApartadaCond = currentCond?.comissaoApartadaPct ?? 0.04;
  // Limites de parcelas da Comissão Apartada, configuráveis por condição
  // comercial em Políticas & Empreendimentos (padrão 1x a 6x).
  const minComissaoParcelas = Math.max(1, currentCond?.comissaoApartadaParcelasMin ?? 1);
  const maxComissaoParcelas = Math.max(minComissaoParcelas, currentCond?.comissaoApartadaParcelasMax ?? (currentCond?.comissaoApartadaParcelas ?? 6));
  const comissaoApartadaParcelasQtd = Math.min(
    maxComissaoParcelas,
    Math.max(minComissaoParcelas, comissaoParcelasManual ?? (currentCond?.comissaoApartadaParcelas ?? 6))
  );

  // ITBI depends on whether it's 1º Imóvel (Com Desconto) or 2º Imóvel (Sem Desconto)
  const itbiVal = (hasUnitSelected && matchingRow) 
    ? (isFirstHomeLocal ? parseCurrency(matchingRow[8]) : parseCurrency(matchingRow[9]))
    : 0;

  // Handle dropdown changes
  const handleTorreChange = (torre: string) => {
    setSelectedTorre(torre);
    setSelectedUnidade('');
    setDescontoConstrutoraAtivo(padraoConstrutoraLigado);
    setCartaNaManga(0);
    setCartaNaMangaAtiva(false);
    setIsAtoPremiadoEnabled(padraoAtoLigado);
    setIsPagamentoAVistaAtivoManual(false);
    setDescontoVistaAtivo(false);
    if (currentCond) {
      setQtdMensais(condNumParcelas);
    }
    if (currentProd) {
      onUnitSelectChange(currentProd.id, { torre, unidade: '' });
    }
  };

  const handleUnidadeChange = (unidade: string) => {
    setSelectedUnidade(unidade);
    setDescontoConstrutoraAtivo(padraoConstrutoraLigado);
    setCartaNaManga(0);
    setCartaNaMangaAtiva(false);
    setIsAtoPremiadoEnabled(padraoAtoLigado);
    setIsPagamentoAVistaAtivoManual(false);
    setDescontoVistaAtivo(false);
    if (currentCond) {
      setQtdMensais(condNumParcelas);
    }
    if (currentProd) {
      onUnitSelectChange(currentProd.id, { torre: selectedTorre, unidade });
    }
  };

  const handleProductDropdownChange = (prodId: string) => {
    const targetProd = products.find(p => p.id === prodId);
    if (targetProd && onSelectProduct) {
      const prodWithConds = ensureProductConditions({ ...targetProd });
      const firstCond = prodWithConds.conditions[0];
      onSelectProduct(prodWithConds, firstCond?.id || '');
    }
  };

  // Descarta os ajustes manuais do Ato / ITBI para o fluxo ser recalculado do zero.
  const resetarAjustesManuais = () => {
    setValAtoManual(null);
    setAtoInputText('');
    setIsEditingAto(false);
    setValAtoITBI(0);
    setItbiAtoManualFloor(null);
    setItbiInputText('');
    setIsEditingITBI(false);
  };

  // Seletor "1º imóvel": alterna ITBI com/sem desconto (matchingRow[8]/[9]) e recalcula rateio e totais.
  const handleFirstHomeChange = (value: boolean) => {
    if (value === isFirstHomeLocal) return;
    setIsFirstHomeLocal(value);
    resetarAjustesManuais();
    onSimulationDataChange?.({ ...simulationData, isFirstHome: value });
  };

  // Seletor "% financiado" (80% / 90%): atualiza simulationData.finPercent, base do financiamento.
  const handleFinancingPercentageChange = (finPercent: 0.8 | 0.9) => {
    if (simulationData.finPercent === finPercent) return;
    resetarAjustesManuais();
    onSimulationDataChange?.({ ...simulationData, finPercent });
  };

  const handleConditionDropdownChange = (condId: string, targetTab?: ActiveTab) => {
    if (!currentProd) return;
    const targetCond = currentProd.conditions.find(c => c.id === condId);
    if (targetCond && onSelectCondition) {
      onSelectCondition(targetCond, targetTab);
    }
  };

  // Função isolada de limpeza exclusiva da Ficha de Análise
  const handleResetFicha = () => {
    setSelectedTorre('');
    setSelectedUnidade('');
    setValAtoManual(null);
    setAtoInputText('');
    setIsEditingAto(false);
    setIsPagamentoAVistaAtivoManual(false);
    setDescontoVistaAtivo(false);
    setValAtoITBI(0);
    setItbiAtoManualFloor(null);
    setItbiInputText('');
    setIsEditingITBI(false);
    setIsAtoPremiadoEnabled(padraoAtoLigado);
    setValParc2(0);
    setParc2InputText('');
    setIsEditingParc2(false);
    setValParc3(0);
    setParc3InputText('');
    setIsEditingParc3(false);
    if (currentCond) {
      setQtdMensais(condNumParcelas);
    }
    setPmMensalObraValorManual(null);
    setPmMesesObraManual(null);
    setPmChavesEnabled(true);
    setPmSemestralIndividualEnabled({});
    setPmSemestralValorManual({});
    setPmSemestralDatasManual({});
    setPmChavesValorManual(null);
    setPmQtdPosObraManual(null);
    setPmPosObraValorManual(null);
    setComissaoParcelasManual(null);
    if (currentProd) {
      onUnitSelectChange(currentProd.id, { torre: '', unidade: '' });
    }
    onShowToast('Ficha de Análise limpa com sucesso. Os dados da simulação foram mantidos.');
  };

  // FINANCIAL CALCULATIONS
  const income = simulationData.income || 0;
  // "Parcelamento Morar" não trabalha com Subsídio, FGTS nem Financiamento
  // Bancário — zerados aqui na origem, mesmo que o corretor tenha digitado
  // algum valor no Simulador, para que também não consumam desnecessariamente
  // o teto/cascata de recursos abaixo.
  const rawSubsidy = (hasUnitSelected && !isParcelamentoMorar) ? (simulationData.subsidy || 0) : 0;
  const rawFGTS = (hasUnitSelected && !isParcelamentoMorar) ? (simulationData.fgts || 0) : 0;
  const inputFinancing = (hasUnitSelected && !isParcelamentoMorar) ? (simulationData.financing || 0) : 0;

  const percent = simulationData.finPercent;
  const maxAllowed = (hasUnitSelected && evaluation > 0) ? (evaluation * percent) : 0;

  // Sinal Mínimo configurado na Política de Crédito da condição selecionada.
  // Em "Parcelamento Morar" o piso é um percentual do valor do imóvel (VGV),
  // não um valor fixo em reais como nas demais condições.
  const pmSinalMinimoPct = currentCond?.pmSinalMinimoPct ?? 10;
  const sinalMinimoPolicy = isParcelamentoMorar
    ? (hasUnitSelected ? Math.round(price * (pmSinalMinimoPct / 100) * 100) / 100 : 0)
    : (currentCond?.sinalMinimo ? parseCurrency(currentCond.sinalMinimo) : 2000);
  // sinalMinimoPolicy já resolve o piso correto em ambos os ramos acima
  // (inclusive um Sinal Mínimo de R$ 0,00 configurado explicitamente na
  // política) — não há necessidade de um segundo fallback aqui.
  const sinalMinimoVal = sinalMinimoPolicy;

  // Nunca "inventamos" um valor de financiamento: só usamos exatamente o que
  // foi digitado em "Financiamento Estimado" no Simulador (capado pelo teto
  // do banco/avaliação ou pelo preço, quando aplicável) — se nada foi
  // digitado (ou foi digitado 0), o financiamento considerado é 0, nunca um
  // percentual estimado da avaliação. Vale para toda condição comercial.
  let rawMaxFinanc = 0;
  if (hasUnitSelected && inputFinancing > 0) {
    if (maxAllowed > 0) {
      rawMaxFinanc = Math.min(inputFinancing, maxAllowed);
    } else if (price > 0) {
      rawMaxFinanc = Math.min(inputFinancing, price);
    } else {
      rawMaxFinanc = inputFinancing;
    }
  }

  // 1. DEFINIÇÃO DO TETO MÁXIMO DA OPERAÇÃO:
  // a) Não pode ultrapassar o Valor de Avaliação.
  // b) Não pode ultrapassar o Preço de Tabela deduzido do sinal mínimo da política de crédito.
  const valorAvaliacao = (hasUnitSelected && evaluation > 0) ? evaluation : price;
  const precoTabelaMenosSinalMin = (hasUnitSelected && price > 0) ? Math.max(0, price - sinalMinimoVal) : 0;
  const tetoMaximo = (hasUnitSelected && price > 0)
    ? Math.min(valorAvaliacao, precoTabelaMenosSinalMin)
    : 0;

  // 2. TRAVA DO TOTAL NEGOCIADO
  const somaRecursos = hasUnitSelected ? (rawMaxFinanc + rawSubsidy + rawFGTS) : 0;
  const totalNegociado = hasUnitSelected ? Math.min(somaRecursos, tetoMaximo) : 0;
  const totalNegoc = totalNegociado;

  // 3. ABSORÇÃO DO EXCESSO (CORTE EM CASCATA)
  let maxFinanc = rawMaxFinanc;
  let fgts = rawFGTS;
  let subsidy = rawSubsidy;

  // Pagamento à vista = 100% recurso próprio do cliente: nenhum financiamento
  // bancário, subsídio ou FGTS é considerado (mesmo que tenha sido digitado no
  // Simulador) — o Ato (Imóvel) absorve o preço com desconto inteiro, e Max
  // Financ./Subsídio/FGTS/Total Negoc. ficam todos em R$ 0,00. Mesma regra já
  // aplicada em FichaMorar.tsx (Sinal c/ Morar).
  if (isPagamentoAVistaAtivoManual) {
    maxFinanc = 0;
    fgts = 0;
    subsidy = 0;
  }

  if (hasUnitSelected && somaRecursos > tetoMaximo) {
    let excesso = somaRecursos - tetoMaximo;

    // a) Tire primeiro do Financiamento Bancário (até zerar)
    const abateFinanc = Math.min(maxFinanc, excesso);
    maxFinanc -= abateFinanc;
    excesso -= abateFinanc;

    // b) Se ainda sobrar excesso, tire do FGTS (até zerar)
    if (excesso > 0) {
      const abateFGTS = Math.min(fgts, excesso);
      fgts -= abateFGTS;
      excesso -= abateFGTS;
    }

    // c) Se ainda sobrar, tire do Subsídio
    if (excesso > 0) {
      const abateSubsidy = Math.min(subsidy, excesso);
      subsidy -= abateSubsidy;
      excesso -= abateSubsidy;
    }
  }

  const maxPriceEval = Math.max(price, evaluation);
  // REFLEXO NO GAP INICIAL (SINAL TOTAL)
  const gapInicial = hasUnitSelected ? Math.max(0, price - totalNegoc) : 0;

  const despCartorias = hasUnitSelected
    ? (itbiVal > 0 ? itbiVal : (price * 0.0441))
    : 0;

  // ===================== MOTOR "PARCELAMENTO MORAR" =====================
  // Calculado em paralelo ao motor de "Sinal c/ Banco Direto" logo abaixo — os
  // dois nunca alimentam a tela ao mesmo tempo (isParcelamentoMorar decide
  // qual conjunto de valores é realmente usado), mas manter os dois cálculos
  // sempre executando evita qualquer risco de regressão no fluxo já testado
  // do Banco Direto: nada no bloco original precisou ser alterado ou
  // condicionado para este motor novo existir.
  const isPhase2ParaEntrega = hasUnitSelected && matchingRow ? String(fase).includes('2') : false;
  const deliveryDateRaw = isPhase2ParaEntrega && currentProd?.deliveryDatePhase2
    ? currentProd.deliveryDatePhase2
    : (currentProd?.deliveryDatePhase1 || currentProd?.deliveryDate || '');
  const hojeRef = currentDate || new Date().toISOString().split('T')[0];
  const pmMesesObraAuto = hasUnitSelected ? monthsBetweenDates(hojeRef, deliveryDateRaw) : 0;
  // Qtd. Meses da Mensal de Obra é editável, mas só para DIMINUIR em relação à
  // sugestão automática (hoje -> habite-se) — nunca ultrapassá-la. O teto
  // (máximo) é sempre pmMesesObraAuto; o input já garante isso via `maximo`.
  const pmMesesObraQtd = pmMesesObraManual !== null
    ? Math.min(Math.max(0, pmMesesObraManual), pmMesesObraAuto)
    : pmMesesObraAuto;
  // Se o corretor reduziu o prazo de obra em relação ao sugerido, entende-se
  // que não haverá parcelamento pós-obra (quem paga a obra mais rápido está
  // sinalizando que vai quitar tudo até as chaves) — zera automaticamente.
  const pmObraReduzida = pmMesesObraManual !== null && pmMesesObraQtd < pmMesesObraAuto;

  // Vencimento da parcela intermediária final (chaves): quantidade de meses
  // antes do habite-se definida na política de crédito (não é editável na
  // ficha — é um parâmetro comercial, não algo que varia por simulação).
  const pmChavesMesesAntes = currentCond?.pmParcelaChavesMesesAntes ?? 2;
  const pmChavesDataStr = deliveryDateRaw ? subtractMonthsFromDate(deliveryDateRaw, pmChavesMesesAntes) : '';
  const chavesVencimentoStr = pmChavesDataStr ? formatDateMonthYear(pmChavesDataStr) : '';

  // Intermediárias semestrais: sempre em Junho e Dezembro de cada ano, entre
  // hoje e o vencimento das chaves. Cada uma pode ser ligada/desligada
  // individualmente (padrão: todas ligadas) — permanecem disponíveis mesmo
  // com o prazo de obra reduzido, junto com a Parcela de Chaves.
  const pmSemestraisQtdAuto = hasUnitSelected ? contarSemestraisJunhoDezembro(hojeRef, pmChavesDataStr) : 0;
  const pmSemestraisDatasAuto = hasUnitSelected ? gerarDatasSemestrais(hojeRef, pmSemestraisQtdAuto) : [];
  const pmSemestraisDatas = pmSemestraisDatasAuto.map((dataAuto, idx) => (
    pmSemestralDatasManual[idx] ? `${pmSemestralDatasManual[idx]}-01` : dataAuto
  ));
  const pmSemestraisQtdEfetiva = pmSemestraisDatasAuto.filter((_, idx) => pmSemestralIndividualEnabled[idx] !== false).length;

  // Overrides de valor das intermediárias semestrais alinhados à ordem das
  // HABILITADAS (mesmo índice usado por pm.nSemestrais/pm.valoresSemestrais
  // no motor de cálculo) — pula as desligadas, preservando a ordem
  // cronológica das demais.
  const pmSemestraisEnabledIdxs = pmSemestraisDatasAuto
    .map((_, idx) => idx)
    .filter(idx => pmSemestralIndividualEnabled[idx] !== false);
  const pmSemestraisValoresManuais = pmSemestraisEnabledIdxs.map(idx => (
    pmSemestralValorManual[idx] !== undefined ? pmSemestralValorManual[idx] : null
  ));

  const pmPosObraQtd = pmObraReduzida
    ? 0
    : (pmQtdPosObraManual !== null ? pmQtdPosObraManual : (currentCond?.pmQtdParcelasPosObra ?? 12));

  // Datas de início: a 1ª mensal de obra vence no mês seguinte à venda; a 1ª
  // parcela pós-obra vence no mês seguinte à entrega (habite-se).
  const pmMensalObraDataInicioStr = hasUnitSelected ? subtractMonthsFromDate(hojeRef, -1) : '';
  const pmMensalObraDataInicio = pmMensalObraDataInicioStr ? formatDateMonthYear(pmMensalObraDataInicioStr) : '';
  const pmPosObraDataInicioStr = (hasUnitSelected && deliveryDateRaw) ? subtractMonthsFromDate(deliveryDateRaw, -1) : '';
  const pmPosObraDataInicio = pmPosObraDataInicioStr ? formatDateMonthYear(pmPosObraDataInicioStr) : '';

  // Valor de "Ato (Imóvel)" (opção "À Vista") que quita tudo de uma vez,
  // trazendo o saldo inteiro para o Ato — mesmo mecanismo do Banco Direto:
  // ponto fixo ato* = base - desconto(ato*), calculado sobre o financiamento
  // bancário eventual (maxFinanc) já descontando as mensais 30d/60d (que
  // continuam sendo pagas à parte e são somadas de volta ao final, mesma
  // convenção de valAtoManual). Precisa ser calculado ANTES do motor porque,
  // quando ativo, ele também zera os demais blocos (ver chamada abaixo) —
  // no motor novo eles não são mais "o que sobra do Ato", são calculados de
  // forma independente, então só reduzir o Ato não bastaria para esvaziá-los.
  const pmMensaisAntecipadas = (mensal1Ativa ? (valParc2 || 0) : 0) + (mensal2Ativa ? (valParc3 || 0) : 0);
  const pmBaseAVista = hasUnitSelected
    ? Math.max(0, price - maxFinanc - pmMensaisAntecipadas)
    : 0;
  const pmAtoAposAntecipadasAVistaTarget = hasUnitSelected
    ? resolverTetoAtoComDesconto(pmBaseAVista, isAtoPremiadoEnabled, pctAtoPremiadoCond)
    : 0;
  const pmAtoAVistaTarget = pmAtoAposAntecipadasAVistaTarget + pmMensaisAntecipadas;
  // No Parcelamento Morar não existe financiamento bancário nem FGTS: quitar
  // o Pró-Soluto já É quitar tudo. Por isso aqui só existe o botão "Pgtº à
  // vista" (cabeçalho) — o card "Ato (Imóvel)" não tem um segundo botão
  // separado, e pmIsAVistaActive aponta direto pro mesmo estado explícito.
  const pmIsAVistaActive = isPagamentoAVistaAtivoManual;

  const pm = calcularParcelamentoMorar({
    price,
    renda: income,
    // Esta condição não trabalha com subsídio nem FGTS — apenas financiamento
    // bancário eventual (maxFinanc), Sinal e o parcelamento direto com a Morar.
    recursos: hasUnitSelected ? maxFinanc : 0,
    valAtoManual,
    isAtoPremiadoEnabled,
    pctSinalMinimo: pmSinalMinimoPct,
    pctRiscoRenda: currentCond?.riscoRendaPct ?? 40,
    mesesObraQtd: pmMesesObraQtd,
    semestraisQtd: pmSemestraisQtdEfetiva,
    posObraQtd: pmPosObraQtd,
    pctSemestralMax: currentCond?.pmParcelaSemestralMaxPct ?? 4,
    pctChavesMax: currentCond?.pmParcelaChavesMaxPct ?? 15,
    pctPosObraMax: currentCond?.pmRiscoProSolutoPosObraPct ?? 5,
    // "À Vista" ativo: zera os demais blocos (todo o saldo já foi
    // direcionado para o Ato acima) — do contrário eles continuariam
    // usando seus tetos normais, já que no motor novo não dependem mais do
    // Ato para existir.
    posObraValorManual: pmIsAVistaActive ? 0 : pmPosObraValorManual,
    chavesValorManual: pmIsAVistaActive ? 0 : pmChavesValorManual,
    // Um array vazio NÃO zera as semestrais: o motor só reconhece um override
    // quando `semestraisValoresManuais[idx]` está definido (`!== null/undefined`)
    // — com `[]`, todo índice cai em `undefined` e volta a usar o valor
    // sugerido automático. Precisa de um 0 explícito em cada posição.
    semestraisValoresManuais: pmIsAVistaActive ? Array(pmSemestraisQtdEfetiva).fill(0) : pmSemestraisValoresManuais,
    mensalObraValorManual: pmIsAVistaActive ? 0 : pmMensalObraValorManual,
    parcelaMinimaMensalObra: currentCond?.pmParcelaMinimaMensalObra ?? 200,
    parcelaMinimaSemestral: currentCond?.pmParcelaMinimaSemestral ?? 200,
    parcelaMinimaPosObra: currentCond?.pmParcelaMinimaPosObra ?? 200,
    mensaisAntecipadas: pmMensaisAntecipadas,
    chavesHabilitada: pmIsAVistaActive ? false : pmChavesEnabled,
    atoPremiadoPct: currentCond?.atoPremiadoPct
  });
  // "Sinal Total" no mesmo sentido do Bloco 1 do Banco Direto: o que falta do
  // valor do imóvel antes de descontar o Ato em si (Ato + este saldo = tudo
  // que precisa ser pago fora do Ato: mensais de obra + semestrais + chaves).
  const pmSinalTotal = pm.saldoAPagarDireto + pm.atoEfetivo;

  // Percentuais de comprometimento de cada grupo do Parcelamento Morar,
  // usados no gráfico de barras logo abaixo do Bloco 4 — cada grupo em
  // relação à sua própria base: Mensais é % da Renda (mesmo teto rígido do
  // motor de cálculo); os demais são % do valor do Imóvel já líquido do
  // desconto do Ato Premiado (price - pm.descontoAtoPremiado) — o mesmo
  // "Valor Utilizado" que o motor de cálculo usa internamente como base de
  // todos os tetos percentuais dos blocos de imóvel.
  const pmComprometimentoData: { name: string; value: number; base: 'Imóvel' | 'Renda' }[] = [];
  if (isParcelamentoMorar) {
    const pmValorImovelBase = Math.max(0, price - pm.descontoAtoPremiado);
    pmComprometimentoData.push({
      name: 'Sinal',
      value: pmValorImovelBase > 0 ? (pm.atoEfetivo / pmValorImovelBase) * 100 : 0,
      base: 'Imóvel'
    });
    if (pm.nMensaisObra > 0) {
      pmComprometimentoData.push({ name: 'Mensais', value: pm.pctRendaMensalObra, base: 'Renda' });
    }
    pmSemestraisEnabledIdxs.forEach((_, rank) => {
      pmComprometimentoData.push({
        name: `Inter ${rank + 1}`,
        value: pmValorImovelBase > 0 ? ((pm.valoresSemestrais[rank] || 0) / pmValorImovelBase) * 100 : 0,
        base: 'Imóvel'
      });
    });
    if (pmChavesEnabled && pm.valorChaves > 0) {
      pmComprometimentoData.push({
        name: 'Chaves',
        value: pmValorImovelBase > 0 ? (pm.valorChaves / pmValorImovelBase) * 100 : 0,
        base: 'Imóvel'
      });
    }
    if (pm.qtdParcelasPosObra > 0) {
      pmComprometimentoData.push({
        name: 'Pós-Obra',
        // Soma de TODAS as parcelas de pós-obra (não apenas uma), sobre a
        // mesma base líquida do Ato Premiado.
        value: pmValorImovelBase > 0 ? (pm.valorPosObraTotal / pmValorImovelBase) * 100 : 0,
        base: 'Imóvel'
      });
    }
  }

  // Lista das intermediárias semestrais habilitadas, com data e valor, para
  // exibição na Ficha em PDF do Parcelamento Morar (mesma numeração de
  // "Semestral N" do Bloco 3 na tela).
  const pmSemestraisList = isParcelamentoMorar
    ? pmSemestraisDatas
        .map((dataStr, idx) => ({ idx, dataStr, ativa: pmSemestralIndividualEnabled[idx] !== false }))
        .filter(s => s.ativa)
        .map(s => {
          const rank = pmSemestraisEnabledIdxs.indexOf(s.idx);
          return {
            label: `Semestral ${s.idx + 1}`,
            data: formatDateMonthYear(s.dataStr),
            valor: pm.valoresSemestrais[rank] || 0
          };
        })
    : [];

  // ITBI ainda não alocado para "Pagamento ITBI no Ato" DIGITADO pelo corretor
  // (itbiAtoManualFloor, não o valAtoITBI exibido em tela — que pode já incluir
  // uma migração automática anterior, ver mais abaixo). É o ponto de partida
  // para a migração automática: o quanto ainda "precisa de um lugar".
  const valorTotalITBI = isPagamentoAVistaAtivoManual ? 0 : despCartorias;
  const itbiFloorManual = Math.min(itbiAtoManualFloor ?? 0, valorTotalITBI);
  const saldoITBIAntesDaMigracao = Math.max(0, valorTotalITBI - itbiFloorManual);

  // --- CÁLCULO ITERATIVO (RESOLUÇÃO DE REFERÊNCIA CIRCULAR COMO NO EXCEL) ---
  const riskCalcInitial = calculatePolicyRiskValues(
    currentProd,
    currentCond,
    income,
    qtdMensais,
    price,
    despCartorias,
    evaluation,
    0,
    inputFinancing,
    rawSubsidy,
    rawFGTS,
    percent
  );
  const vpValRiscoRenda = riskCalcInitial.vpVal;
  const riscoImovelPctDec = (currentCond?.riscoImovelPct !== undefined ? currentCond.riscoImovelPct : 25) / 100;

  let sinalTotalSemITBI = 0;
  let sinalTotalComITBI = 0;
  let baseRiscoImovel = 0;
  let valorRiscoImovel = 0;
  let riscoMaximoApuradoBruto = 0;
  let taxaBancaria = 0;
  let proSolutoLiquido = 0;
  let pagamentoAtoSinalEfetivo = 0;
  let atoPremiadoAtual = 0;
  // ITBI que este laço conseguiu manter parcelável (nunca mais que o saldo
  // ainda não alocado, nem mais que o teto de risco/renda apurado abaixo).
  let saldoITBIEfetivo = saldoITBIAntesDaMigracao;

  // Laço interno: resolve a referência circular do Ato Premiado (mesmo de
  // sempre) para um dado `saldoITBIParam`. Extraído em função porque agora
  // precisa rodar mais de uma vez — uma para cada tentativa do laço externo
  // de migração automática de ITBI logo abaixo.
  const resolverAtoPremiado = (saldoITBIParam: number) => {
    let sinalSemITBILocal = 0;
    let sinalComITBILocal = 0;
    let baseRiscoLocal = 0;
    let valorRiscoLocal = 0;
    let riscoMaximoLocal = 0;
    let taxaBancariaLocal = 0;
    let proSolutoLiquidoLocal = 0;
    let pagamentoAtoLocal = 0;
    let atoPremiadoLocal = 0;
    let iteracoes = 0;

    while (iteracoes < 1000) {
      // a) Recursos Aprovados = (Max Financiamento + Subsídio + FGTS) -> totalNegoc
      // b) GAP Inicial = (Preço de Tabela) - Recursos Aprovados -> gapInicial
      // c) Sinal Total s/ ITBI = GAP Inicial - atoPremiadoAtual
      sinalSemITBILocal = Math.max(0, gapInicial - atoPremiadoLocal);

      // d) Sinal Total c/ ITBI = (Sinal Total s/ ITBI) + ITBI ainda parcelável
      // (saldoITBIParam, não despCartorias cheio nem o saldo ainda sem migrar) —
      // a parte já alocada (manualmente ou por migração automática) não precisa
      // de proteção nenhuma aqui, ela já está paga; usar o ITBI cheio pediria,
      // no piso do Ato (Imóvel), um ITBI que já está coberto em outro campo,
      // contando o mesmo ITBI duas vezes. Sem nenhuma alocação, saldoITBIParam
      // === despCartorias e esta conta fica idêntica à de antes.
      sinalComITBILocal = sinalSemITBILocal + saldoITBIParam;

      // e) Base Risco Imóvel = (MAX(Preço Tabela, Avaliação Banco) + ITBI parcelável) - atoPremiadoAtual
      baseRiscoLocal = Math.max(0, (maxPriceEval + saldoITBIParam) - atoPremiadoLocal);

      // e) Valor Risco Imóvel = Base Risco Imóvel * (% Risco Imóvel);
      valorRiscoLocal = baseRiscoLocal * riscoImovelPctDec;

      // f) Risco Máximo Apurado (Bruto) = MIN(VP Risco Renda, Valor Risco Imóvel).
      // Checa `income > 0` (cliente com renda declarada), não `vpValRiscoRenda > 0`:
      // o teto de renda pode legitimamente ser 0 quando a Qtd. Mensais é 0 (sem
      // meses, não há capacidade nenhuma) — cair no ramo "sem teto de renda"
      // nesse caso ignoraria essa trava justamente no cenário que ela precisa cobrir.
      riscoMaximoLocal = (income > 0)
        ? Math.min(vpValRiscoRenda, valorRiscoLocal)
        : valorRiscoLocal;

      // g) Taxa Bancária (Taxa de Assinatura de Contrato, da política) = Risco Máximo Apurado * taxa;
      taxaBancariaLocal = riscoMaximoLocal * (taxaAssinaturaContratoPct / 100);

      // h) Pró-Soluto Líquido = Risco Máximo Apurado - Taxa Bancária;
      proSolutoLiquidoLocal = Math.max(0, riscoMaximoLocal - taxaBancariaLocal);

      // Comissão Apartada = (Preço de Tabela - Desconto do Ato Premiado) * %comissão — recalculada
      // A CADA ITERAÇÃO com o atoPremiadoAtual corrente, porque a comissão depende do Desconto,
      // que depende do Ato, que (nesta condição) depende da própria comissão: é uma referência
      // circular de verdade, resolvida convergindo junto com o resto do laço (mesmo padrão já
      // usado para o Ato Premiado). Em qualquer condição que não seja "Comissão Apartada", fica
      // sempre 0, sem nenhum efeito no restante da conta.
      const comissaoIteracaoAtual = isComissaoApartada
        ? Math.max(0, (precoTabelaOriginal - atoPremiadoLocal) * pctComissaoApartadaCond)
        : 0;

      // i) Pagamento Ato (Sinal Efetivo) = (Sinal Total c/ ITBI) - Pró-Soluto Líquido - Comissão
      // Apartada — é o valor JÁ LÍQUIDO da taxa (e, na variante Comissão Apartada, também já
      // líquido da comissão) que sugere o Ato; não o bruto (Risco Máximo Apurado). A comissão
      // NUNCA entra nos passos acima (Risco Imóvel 25%, Risco Renda 35%, Taxa Bancária) — eles
      // continuam sobre o valor cheio; só o Ato final é que sai líquido dela.
      pagamentoAtoLocal = Math.max(0, sinalComITBILocal - proSolutoLiquidoLocal - comissaoIteracaoAtual);

      // Ato Bruto Apurado = (Sinal Total c/ ITBI restante antes do desconto) - Pró-Soluto Líquido - Comissão
      const atoBrutoCalculado = Math.max(0, (gapInicial + saldoITBIParam) - proSolutoLiquidoLocal - comissaoIteracaoAtual);

      // j) novoAtoPremiado = pct do Pagamento Ato (Sinal Efetivo) caso o Ato Bruto seja >= 5000
      // pct vem da política do empreendimento (currentCond.atoPremiadoPct); ausente → 10%
      const novoAtoPremiado = (isAtoPremiadoEnabled && pctAtoPremiadoCond > 0 && atoBrutoCalculado >= 5000)
        ? Math.min(pagamentoAtoLocal * pctAtoPremiadoCond, tetoDescontoAtoPremiado)
        : 0;

      // 2. CONDIÇÃO DE PARADA: Tolerância zero para bater os centavos do Excel
      if (Math.abs(novoAtoPremiado - atoPremiadoLocal) < 0.0001) {
        atoPremiadoLocal = novoAtoPremiado;
        break;
      }

      atoPremiadoLocal = novoAtoPremiado;
      iteracoes++;
    }

    return {
      sinalSemITBI: sinalSemITBILocal,
      sinalComITBI: sinalComITBILocal,
      baseRisco: baseRiscoLocal,
      valorRisco: valorRiscoLocal,
      riscoMaximo: riscoMaximoLocal,
      taxaBancaria: taxaBancariaLocal,
      proSolutoLiquido: proSolutoLiquidoLocal,
      pagamentoAto: pagamentoAtoLocal,
      atoPremiado: atoPremiadoLocal
    };
  };

  if (hasUnitSelected && price > 0) {
    // Laço externo: migra para "ITBI no Ato" (nunca para o Ato (Imóvel), que é
    // uma conta à parte) o quanto do ITBI ainda sem alocação não cabe dentro do
    // teto de risco/renda apurado (riscoMaximo) — mesmo espírito do mecanismo já
    // usado no Sinal c/ Morar (itbiAtoSugerido): quando a Qtd. Mensais diminui e
    // sobra menos espaço pra parcelar, o ITBI cede primeiro, e só o que ainda
    // faltar depois disso é que segue inflando o Ato (Imóvel) via pagamentoAto,
    // exatamente como já acontecia. Converge em poucas voltas: reduzir
    // saldoITBIEfetivo também reduz ligeiramente o próprio teto (ele soma no
    // Risco Imóvel), então cada tentativa refina a anterior.
    let resultado = resolverAtoPremiado(saldoITBIEfetivo);
    for (let i = 0; i < 20; i++) {
      const novoSaldoEfetivo = Math.max(0, Math.min(saldoITBIAntesDaMigracao, resultado.riscoMaximo));
      if (Math.abs(novoSaldoEfetivo - saldoITBIEfetivo) < 0.01) break;
      saldoITBIEfetivo = novoSaldoEfetivo;
      resultado = resolverAtoPremiado(saldoITBIEfetivo);
    }

    sinalTotalSemITBI = resultado.sinalSemITBI;
    sinalTotalComITBI = resultado.sinalComITBI;
    baseRiscoImovel = resultado.baseRisco;
    valorRiscoImovel = resultado.valorRisco;
    riscoMaximoApuradoBruto = resultado.riscoMaximo;
    taxaBancaria = resultado.taxaBancaria;
    proSolutoLiquido = resultado.proSolutoLiquido;
    pagamentoAtoSinalEfetivo = resultado.pagamentoAto;
    atoPremiadoAtual = resultado.atoPremiado;

    // 1. TRAVA DO ATO MÍNIMO (PISO DA POLÍTICA DE CRÉDITO) & REDISTRIBUIÇÃO OBRIGATÓRIA
    if (pagamentoAtoSinalEfetivo < sinalMinimoVal) {
      pagamentoAtoSinalEfetivo = sinalMinimoVal;
      atoPremiadoAtual = 0; // Regra dos 10% não se aplica se não atingir 5k
      const baseDividaTotal = gapInicial + saldoITBIEfetivo;
      riscoMaximoApuradoBruto = Math.max(0, baseDividaTotal - pagamentoAtoSinalEfetivo);
      taxaBancaria = riscoMaximoApuradoBruto * (taxaAssinaturaContratoPct / 100);
      proSolutoLiquido = riscoMaximoApuradoBruto - taxaBancaria;
    }
  }

  // "ITBI no Ato" total = o que o corretor digitou manualmente + o que a
  // migração automática precisou elevar pra não estourar o teto de risco/renda
  // apurado acima (nunca inflando o Ato (Imóvel) — ver resolverAtoPremiado).
  // Sem nenhuma migração necessária, itbiAtoSugeridoBanco === itbiFloorManual e
  // tudo fica idêntico ao comportamento anterior.
  const itbiAtoSugeridoBanco = itbiFloorManual + Math.max(0, saldoITBIAntesDaMigracao - saldoITBIEfetivo);
  const atoITBIValidado = Math.min(itbiAtoSugeridoBanco, valorTotalITBI);
  const saldoITBI = Math.max(0, valorTotalITBI - atoITBIValidado);

  // Mantém o state valAtoITBI (usado pelo input controlado, PDF, gravação da
  // simulação etc.) sincronizado com a sugestão fresca acima — sobe OU desce
  // livremente conforme a Qtd. Mensais muda, nunca abaixo do piso manual
  // (itbiAtoManualFloor, já embutido em itbiAtoSugeridoBanco).
  useEffect(() => {
    if (Math.abs(itbiAtoSugeridoBanco - valAtoITBI) > 0.005) {
      setValAtoITBI(itbiAtoSugeridoBanco);
    }
  }, [itbiAtoSugeridoBanco, valAtoITBI]);

  const atoMinimoCalculado = hasUnitSelected ? Math.max(sinalMinimoVal, pagamentoAtoSinalEfetivo) : 0;
  const sinalTotalOriginal = gapInicial;

  // 1. LEITURA DO APORTE DAS MENSAIS (1ª MENSAL 30D / 2ª MENSAL 60D)
  const mens30d = mensal1Ativa ? (valParc2 || 0) : 0;
  const mens60d = mensal2Ativa ? (valParc3 || 0) : 0;
  const somaMensais = mens30d + mens60d;

  // Valor de "Ato (Imóvel)" (opção "À Vista") que zera exatamente o Pró-Soluto (Sinal
  // Restante), sem tocar Financiamento/FGTS/Subsídio — ponto fixo ato* = baseAVista -
  // desconto(ato*), calculado sobre os recursos ORIGINAIS (maxFinanc + subsidy + fgts,
  // antes de qualquer abatimento), já descontando as mensais 30d/60d (que continuam
  // sendo pagas à parte). A regra do Ato Premiado usada aqui (10% do Ato, capado em
  // R$5.000, a partir de R$5.000) é a mesma de resolverTetoAtoComDesconto/
  // calcularDescontoAtoPremiado, então a função é reaproveitada.
  // Usa sempre precoTabelaOriginal (nunca `price`): este botão simples não
  // aplica o desconto à vista da política, então precisa ficar imune ao
  // desconto que o botão "Pgtº à vista" (novo, no cabeçalho) pode aplicar.
  const baseAVista = hasUnitSelected
    ? Math.max(0, precoTabelaOriginal - (maxFinanc + subsidy + fgts) - somaMensais)
    : 0;
  // Comissão Apartada é paga por fora do contrato — quem escolhe "Pgtº à
  // vista" também não deve embutir esse valor no Ato, senão o cliente estaria
  // cobrindo a comissão sem ela aparecer separada em lugar nenhum. Mesmo ponto
  // fixo de cima, só que agora também descontando a comissão (ver
  // resolverTetoAtoComDescontoEComissao) — em condições que não são Comissão
  // Apartada, cai exatamente no comportamento de antes.
  const atoAposMensaisAVistaTarget = hasUnitSelected
    ? resolverTetoAtoComDescontoEComissao(baseAVista, isAtoPremiadoEnabled, pctAtoPremiadoCond, isComissaoApartada, pctComissaoApartadaCond, precoTabelaOriginal)
    : 0;
  // valAtoManual é o Ato ANTES da absorção das mensais (mesma convenção já usada pelo
  // onAtoChange existente do FluxoEntradaConstrutora), então somamos de volta.
  const atoAVistaTarget = atoAposMensaisAVistaTarget + somaMensais;
  const isAVistaActive = hasUnitSelected && valAtoManual !== null && Math.abs(valAtoManual - atoAVistaTarget) < 0.01;

  // Teto Máximo do Ato Imóvel: o maior Ato que quita integralmente a unidade, ou
  // seja, o ponto fixo ato* = (preço - subsídio) - desconto(ato*). Precisa ser
  // resolvido como ponto fixo porque o Ato Premiado depende do próprio valor do
  // Ato — não dá para subtrair um desconto já conhecido de antemão.
  //
  // Usar aqui o "atoPremiadoAtual" (o desconto do Ato SUGERIDO) dava um teto
  // errado sempre que o Ato sugerido caía no piso da política (trava do ato
  // mínimo, que zera atoPremiadoAtual): o teto virava o preço cheio e o cliente
  // conseguia lançar no Ato o valor do Ato Premiado A MAIS do que realmente
  // devia — o Pró-Soluto era clampado em R$ 0,00 e a diferença sumia da tela.
  // Mesma abordagem já usada na ficha "Sinal c/ Morar" (FichaMorar.tsx).
  // Mesmo motivo do atoAposMensaisAVistaTarget acima: numa Comissão Apartada,
  // esse teto (o maior Ato digitável à mão) também precisa deixar espaço pra
  // comissão — senão o corretor consegue digitar um Ato que estoura o que
  // sobra pra pagar o corretor à parte.
  const atoMaximoPossivel = hasUnitSelected
    ? resolverTetoAtoComDescontoEComissao(Math.max(0, price - subsidy), isAtoPremiadoEnabled, pctAtoPremiadoCond, isComissaoApartada, pctComissaoApartadaCond, precoTabelaOriginal)
    : 0;

  const atoImovelDigitadoBruto = (valAtoManual !== null && valAtoManual >= atoMinimoCalculado)
    ? valAtoManual
    : atoMinimoCalculado;

  const atoImovelDigitado = Math.min(atoImovelDigitadoBruto, atoMaximoPossivel);

  // Se o usuário digitou mensais 30d/60d, abate primeiro do Ato (até o piso configurado da política)
  let saldoParaAbater = somaMensais;
  const disponivelAbatimentoAto = Math.max(0, atoImovelDigitado - sinalMinimoVal);
  const atoAbsorvido = Math.min(disponivelAbatimentoAto, saldoParaAbater);
  let atoAposMensais = atoImovelDigitado - atoAbsorvido;
  saldoParaAbater -= atoAbsorvido;

  // Recálculo do Ato Premiado (desconto da Construtora) para o novo Ato do Imóvel
  let novoAtoPremiado = 0;
  if (isAtoPremiadoEnabled && pctAtoPremiadoCond > 0 && atoAposMensais >= 4500) {
    let currAtoEfetivo = atoAposMensais;
    let currAtoPremiado = 0;
    for (let iter = 0; iter < 100; iter++) {
      const atoBrutoCalculado = currAtoEfetivo + currAtoPremiado;
      const novoDesc = (atoBrutoCalculado >= 5000 && currAtoEfetivo >= 4500)
        ? Math.min(currAtoEfetivo * pctAtoPremiadoCond, tetoDescontoAtoPremiado)
        : 0;

      const lacuna = atoAposMensais - currAtoEfetivo;
      currAtoPremiado = novoDesc;
      if (Math.abs(lacuna) < 0.0001) break;
      currAtoEfetivo += lacuna;
    }
    novoAtoPremiado = currAtoPremiado;
  }

  // CASCATA DE AMORTIZAÇÃO DO FINANCIAMENTO (NOVA REGRA)
  const descontoAto = isAtoPremiadoEnabled ? novoAtoPremiado : 0;

  // Comissão Apartada — valor FINAL, agora que o Desconto do Ato Premiado já está
  // resolvido (mesma fórmula usada dentro do laço acima, mas com o desconto final
  // em vez do valor ainda convergindo iteração a iteração). É este valor — não o
  // intermediário do laço — que alimenta o card "Comissão a Pagar", a gravação da
  // simulação e o desconto no Pró-Soluto Total mais abaixo.
  const comissaoApartadaValor = isComissaoApartada
    ? Math.max(0, Math.round((precoTabelaOriginal - descontoAto) * pctComissaoApartadaCond * 100) / 100)
    : 0;
  const comissaoApartadaParcelaValor = comissaoApartadaValor > 0
    ? Math.round((comissaoApartadaValor / comissaoApartadaParcelasQtd) * 100) / 100
    : 0;

  // 1. Cálculo do Teto dos Recursos Bancários/Negociados:
  // O montante máximo que pode ser negociado via banco/governo não pode ultrapassar o saldo restante do imóvel.
  // Consideramos aqui o aporte direto do Ato.
  const saldoNecessarioImovel = hasUnitSelected 
    ? Math.max(0, price - atoImovelDigitado - descontoAto)
    : 0;

  // 2. Amortização do Excedente no Financiamento:
  const somaRecursosAprovados = maxFinanc + subsidy + fgts;
  let maxFinancEfetivo = maxFinanc;
  let fgtsEfetivo = fgts;
  let subsidyEfetivo = subsidy;

  if (somaRecursosAprovados > saldoNecessarioImovel) {
    let excessoAmortizar = somaRecursosAprovados - saldoNecessarioImovel;

    // Abate primeiramente no campo Max Financ (Financiamento Bancário)
    const abateFinanc = Math.min(maxFinancEfetivo, excessoAmortizar);
    maxFinancEfetivo -= abateFinanc;
    excessoAmortizar -= abateFinanc;

    // Se ainda houver excesso, abate do FGTS
    if (excessoAmortizar > 0) {
      const abateFgts = Math.min(fgtsEfetivo, excessoAmortizar);
      fgtsEfetivo -= abateFgts;
      excessoAmortizar -= abateFgts;
    }

    // Se ainda houver excesso, abate do Subsídio
    if (excessoAmortizar > 0) {
      const abateSubsidy = Math.min(subsidyEfetivo, excessoAmortizar);
      subsidyEfetivo -= abateSubsidy;
      excessoAmortizar -= abateSubsidy;
    }
  }

  // 3. REGRA ISOLADA PARA DESPESAS CARTORÁRIAS & ITBI (calculada aqui embaixo,
  // logo antes de ser usada no laço iterativo abaixo — ver mais acima, perto de
  // "gapInicial", onde despCartorias é definida):
  // O saldo de ITBI e Despesas Cartorárias NUNCA deve ser amortizado pelo excedente do Pagamento do Ato.
  // O ITBI/Despesas só é reduzido/abatido se o usuário preencher expressamente o campo "PAGAMENTO ITBI NO ATO".
  // Exceção: o botão "Pgtº à vista" zera o ITBI (fica por conta do cliente a
  // partir do Habite-se) — o botão "Parcelado/À Vista" mais simples nunca
  // mexe nisso, deixa o ITBI em aberto normalmente.
  const despCartoriasEfetivas = saldoITBI;

  // Base Líquida c/ ITBI da Operação
  const valorBaseImovel = hasUnitSelected ? Math.max(price, evaluation) : 0;
  const baseVendaLiquidaComITBI = hasUnitSelected
    ? Math.max(0, (valorBaseImovel + valorTotalITBI) - descontoAto)
    : 0;

  // 1. Definição do "Total Negoc.":
  // O campo Total Negoc. representa a soma de todos os recursos da operação bancária/recursos do cliente (Financiamento + Subsídio + FGTS):
  // totalNegoc = maxFinancEfetivo + subsidio + fgts
  const totalNegocEfetivo = hasUnitSelected
    ? (maxFinancEfetivo + subsidyEfetivo + fgtsEfetivo)
    : 0;

  // 2. Definição do "Sinal Total":
  // O Sinal Total deduz o Desconto do Ato Premiado do saldo restante do imóvel:
  // sinalTotal = precoTabela - totalNegoc - descontoAto
  const sinalTotal = hasUnitSelected
    ? Math.max(0, price - totalNegocEfetivo - descontoAto)
    : 0;

  // 3. REGRA DE DEDUÇÃO NO PRÓ-SOLUTO (SINAL RESTANTE):
  // Pró-Soluto (Sinal Restante) = Sinal Total - Pagamento Ato (Imóvel) - 1ª Mensal - 2ª Mensal
  // - Comissão Apartada (Nota: o descontoAto já foi deduzido diretamente na formação do
  // sinalTotal). A Comissão Apartada é paga por fora do contrato — reduz o Pró-Soluto
  // (e, por tabela, a parcela, reconstruída a partir dele mais abaixo em baseCalculoParcela)
  // pelo valor cheio da comissão. Em qualquer condição que não seja "Comissão Apartada",
  // comissaoApartadaValor é sempre 0, então esta linha fica idêntica ao comportamento de antes.
  //
  // Esse valor NÃO desconta a Taxa Bancária/Assinatura de Contrato — ela só
  // entra depois, ao reconstruir baseCalculoParcela (a parcela é a única conta
  // que usa o valor bruto, com a taxa embutida como um custo financiado a
  // mais, não como uma dedução do que fica pro Pró-Soluto).
  const proSolutoSinalRestanteSemTravaParcela = hasUnitSelected
    ? Math.max(0, sinalTotal - atoAposMensais - mens30d - mens60d - comissaoApartadaValor)
    : 0;

  // 2. PRÓ-SOLUTO TOTAL C/ ITBI (RISCO MÁX):
  // Isole e utilize o saldo devedor restante das despesas de ITBI/Cartório:
  // ITBI_Restante = Math.max(0, DespesasCartorariasTotal - PagamentoITBINoAto)
  // ProSolutoTotalComITBI = ProSolutoSinalRestante + ITBI_Restante
  const itbiRestante = saldoITBI;
  const proSolutoTotalParceladoSemTravaParcela = hasUnitSelected
    ? Math.max(0, proSolutoSinalRestanteSemTravaParcela + itbiRestante)
    : 0;

  // TRAVA DA PARCELA NO TETO DE RISCO (o mesmo riscoMaximoApuradoBruto usado
  // acima para sugerir o Ato — min(25% do imóvel, X% da renda presente-valorado)):
  // sem isso, a 1ª parcela do Pró-Soluto/Banco Direto podia ultrapassar o teto,
  // porque proSolutoSinalRestante é reconstruído aqui por uma conta separada
  // (Sinal Total - Ato - Mensais - Comissão) que não fica presa a esse teto. O
  // que não couber migra pro Ato (Imóvel): o cliente traz mais na entrada em
  // vez de financiar acima do que a política permite.
  //
  // A comparação usa proSolutoTotalParceladoSemTravaParcela (ainda SEM o
  // acréscimo da Taxa Bancária) contra riscoMaximoApuradoBruto (também sem
  // taxa) — maçã com maçã. Comparar contra baseCalculoParcela (que JÁ inclui a
  // taxa como acréscimo, de propósito) contaria esse acréscimo como se fosse
  // estouro do teto e empurraria dinheiro pro Ato à toa sempre que a trava do
  // Ato Mínimo estivesse ativa (ali riscoMaximoApuradoBruto vem sem taxa
  // nenhuma, então bater com um valor que já tem taxa somada sempre acusava
  // uma sobra do tamanho exato da Taxa Bancária).
  const excessoRiscoParcela = (hasUnitSelected && riscoMaximoApuradoBruto > 0)
    ? Math.max(0, proSolutoTotalParceladoSemTravaParcela - riscoMaximoApuradoBruto)
    : 0;
  const extraAtoPorTravaParcelaRisco = Math.round(excessoRiscoParcela * 100) / 100;

  // SEGUNDA TRAVA (teto de comprometimento da RENDA sobre a PARCELA FINAL): a parcela Price é
  // calculada sobre a base BRUTA (pró-soluto líquido da taxa ÷ (1 − taxa)). A trava acima compara
  // o pró-soluto ainda líquido com o teto BRUTO, então a taxa bancária reinflava a base e a
  // parcela passava do teto (ex.: 35% → 35,1%). Aqui o excesso é medido na base bruta contra o
  // valor presente do teto de renda (vpValRiscoRenda = PMT máx. da política trazido a valor
  // presente na mesma taxa/prazo) e a diferença migra para o Ato (Imóvel).
  const fatorLiquidoTaxa = taxaAssinaturaContratoPct < 100 ? (1 - taxaAssinaturaContratoPct / 100) : 1;
  const proSolutoAposTravaRisco = Math.max(0, proSolutoTotalParceladoSemTravaParcela - extraAtoPorTravaParcelaRisco);
  const baseBrutaAposTravaRisco = fatorLiquidoTaxa > 0 ? proSolutoAposTravaRisco / fatorLiquidoTaxa : proSolutoAposTravaRisco;
  const excessoBaseRenda = (hasUnitSelected && income > 0)
    ? Math.max(0, baseBrutaAposTravaRisco - Math.max(0, vpValRiscoRenda))
    : 0;
  const extraAtoPorTravaRenda = Math.ceil(excessoBaseRenda * fatorLiquidoTaxa * 100) / 100;
  const extraAtoPorTravaParcela = Math.round((extraAtoPorTravaParcelaRisco + extraAtoPorTravaRenda) * 100) / 100;

  atoAposMensais += extraAtoPorTravaParcela;
  const proSolutoSinalRestante = Math.max(0, proSolutoSinalRestanteSemTravaParcela - extraAtoPorTravaParcela);
  const proSoluto = proSolutoSinalRestante;
  const proSolutoTotalParcelado = hasUnitSelected
    ? Math.max(0, proSolutoSinalRestante + itbiRestante)
    : 0;
  const proSolutoTotalPainel = proSolutoTotalParcelado;

  const atoEfetivo = atoAposMensais + atoITBIValidado;
  const atoBruto = atoEfetivo + descontoAto;

  // Função utilitária para converter inputs flexíveis em número monetário
  const parseFlexibleCurrency = (input: string | number): number => {
    if (input === null || input === undefined || input === '') return 0;
    if (typeof input === 'number') return isNaN(input) ? 0 : input;

    let str = String(input).trim();
    str = str.replace(/^R\$\s*/i, '').trim();
    if (!str) return 0;

    if (str.includes(',')) {
      const clean = str.replace(/\./g, '').replace(',', '.');
      const val = parseFloat(clean);
      return isNaN(val) ? 0 : val;
    }

    if (str.includes('.')) {
      const parts = str.split('.');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
        const clean = str.replace(/\./g, '');
        const val = parseFloat(clean);
        return isNaN(val) ? 0 : val;
      }
      const val = parseFloat(str);
      return isNaN(val) ? 0 : val;
    }

    const val = parseFloat(str);
    return isNaN(val) ? 0 : val;
  };

  // Gatilho executado exclusivamente ao término da digitação (onBlur ou Enter)
  const handleFinishAtoEdit = (rawText: string) => {
    setIsEditingAto(false);
    const inputVal = parseFlexibleCurrency(rawText);
    // Mesmo teto aplicado no cálculo (atoMaximoPossivel), para que o valor
    // ajustado e a mensagem do toast batam exatamente com o que a tela mostra.
    const maxAtoPermitido = atoMaximoPossivel;

    if (rawText.trim() === '' || inputVal === 0) {
      setValAtoManual(null);
      setAtoInputText('');
      return;
    }

    if (hasUnitSelected && atoMinimoCalculado > 0) {
      if (inputVal < atoMinimoCalculado - 0.01) {
        if (onShowToast) {
          onShowToast(`O valor digitado (${formatCurrency(inputVal)}) é menor que o piso sugerido (${formatCurrency(atoMinimoCalculado)}). Valor restaurado.`);
        }
        setValAtoManual(null);
        setAtoInputText('');
      } else if (maxAtoPermitido > 0 && inputVal > maxAtoPermitido + 0.01) {
        if (onShowToast) {
          onShowToast(`O valor digitado excede o saldo total. O Ato foi ajustado para ${formatCurrency(maxAtoPermitido)}.`);
        }
        setValAtoManual(maxAtoPermitido);
        setAtoInputText(formatCurrency(maxAtoPermitido));
      } else {
        setValAtoManual(inputVal);
        setAtoInputText(formatCurrency(inputVal));
      }
    } else {
      setValAtoManual(inputVal > 0 ? inputVal : null);
      setAtoInputText(inputVal > 0 ? formatCurrency(inputVal) : '');
    }
  };

  // Gatilho executado exclusivamente ao término da digitação do ITBI no Ato (onBlur ou Enter)
  const handleFinishITBIEdit = (rawText: string) => {
    setIsEditingITBI(false);
    const parsed = parseFlexibleCurrency(rawText);
    const maxITBI = despCartorias > 0 ? despCartorias : 0;

    if (rawText.trim() === '' || parsed <= 0) {
      setValAtoITBI(0);
      setItbiInputText('');
      return;
    }

    if (hasUnitSelected && maxITBI > 0 && parsed > maxITBI) {
      if (onShowToast) {
        onShowToast(`O valor do Pagamento do ITBI no Ato não pode exceder o total de ${formatCurrency(maxITBI)}. Ajustado para o teto.`);
      }
      setValAtoITBI(maxITBI);
      setItbiInputText(formatCurrency(maxITBI));
    } else {
      setValAtoITBI(parsed);
      setItbiInputText(formatCurrency(parsed));
    }
  };

  // Gatilho executado exclusivamente ao término da digitação da 1ª Mensal 30d (onBlur ou Enter)
  const handleFinishParc2Edit = (rawText: string) => {
    setIsEditingParc2(false);
    const parsed = parseFlexibleCurrency(rawText);

    if (rawText.trim() === '' || parsed <= 0) {
      setValParc2(0);
      setParc2InputText('');
      return;
    }

    if (parsed > 0 && parsed < 200) {
      setValParc2(200);
      setParc2InputText(formatCurrency(200));
      if (onShowToast) {
        onShowToast('O valor mínimo para parcelas mensais é R$ 200,00.');
      }
    } else if (tetoMensal1.teto > 0 && parsed > tetoMensal1.teto) {
      // Autocorreção: trava no teto da Política (menor entre renda e imóvel, se ambos).
      const tetoCentavos = Math.floor(tetoMensal1.teto * 100) / 100;
      setValParc2(tetoCentavos);
      setParc2InputText(formatCurrency(tetoCentavos));
      if (onShowToast) {
        onShowToast(`Ajustado para o teto de ${formatCurrency(tetoCentavos)} (${tetoMensal1.texto}).`);
      }
    } else {
      setValParc2(parsed);
      setParc2InputText(formatCurrency(parsed));
    }
  };

  // Gatilho executado exclusivamente ao término da digitação da 2ª Mensal 60d (onBlur ou Enter)
  const handleFinishParc3Edit = (rawText: string) => {
    setIsEditingParc3(false);
    const parsed = parseFlexibleCurrency(rawText);

    if (rawText.trim() === '' || parsed <= 0) {
      setValParc3(0);
      setParc3InputText('');
      return;
    }

    if (parsed > 0 && parsed < 200) {
      setValParc3(200);
      setParc3InputText(formatCurrency(200));
      if (onShowToast) {
        onShowToast('O valor mínimo para parcelas mensais é R$ 200,00.');
      }
    } else if (tetoMensal2.teto > 0 && parsed > tetoMensal2.teto) {
      // Autocorreção: trava no teto da Política (menor entre renda e imóvel, se ambos).
      const tetoCentavos = Math.floor(tetoMensal2.teto * 100) / 100;
      setValParc3(tetoCentavos);
      setParc3InputText(formatCurrency(tetoCentavos));
      if (onShowToast) {
        onShowToast(`Ajustado para o teto de ${formatCurrency(tetoCentavos)} (${tetoMensal2.texto}).`);
      }
    } else {
      setValParc3(parsed);
      setParc3InputText(formatCurrency(parsed));
    }
  };

  // "Pgtº à vista" (botão de cabeçalho e interruptor do quadro de aprovação): mesmo fluxo nos dois.
  const handleTogglePagamentoAVistaDetails = (ativo: boolean, descontoLigado: boolean = padraoVistaLigado) => {
    setIsPagamentoAVistaAtivoManual(ativo);
    setDescontoVistaAtivo(ativo && descontoLigado);
    if (ativo) {
      // O Ato Premiado é desligado enquanto o pagamento à vista está
      // ativo, pra não empilhar os dois descontos sem uma regra definida
      // pra isso (mesmo padrão do Sinal c/ Morar) — volta a ficar
      // disponível normalmente ao desligar. `isAtoPremiadoEnabled` ainda
      // não reflete isso neste mesmo evento, então os cálculos abaixo já
      // usam `false` direto, na mão.
      setIsAtoPremiadoEnabled(false);
      // O preço com desconto ainda não está commitado no state do React
      // neste mesmo evento — por isso o ponto que quita tudo no Ato é
      // calculado aqui com o preço correto "na mão", em vez de reaproveitar
      // atoAVistaTarget/pmAtoAVistaTarget (que só refletem o desconto a
      // partir do próximo render). Mesmo padrão do Sinal c/ Morar
      // (FichaMorar.tsx / handleTogglePagamentoAVista).
      const descontoNaHora = (precoTabelaOriginal > 0 && descontoLigado)
        ? Math.round(precoTabelaOriginal * (descontoAVistaPctPolitica / 100) * 100) / 100
        : 0;
      const precoComDesconto = Math.max(0, Math.round((precoTabelaOriginal - descontoNaHora) * 100) / 100);
      if (isParcelamentoMorar) {
        const baseNaHora = hasUnitSelected ? Math.max(0, precoComDesconto - maxFinanc - pmMensaisAntecipadas) : 0;
        const atoAposAntecipadasNaHora = hasUnitSelected ? resolverTetoAtoComDesconto(baseNaHora, false, pctAtoPremiadoCond) : 0;
        setValAtoManual(atoAposAntecipadasNaHora + pmMensaisAntecipadas);
      } else {
        // Zera tudo: financiamento, subsídio e FGTS somem sozinhos (o Ato,
        // grande o bastante para cobrir o preço inteiro, já não deixa saldo
        // pra eles via a cascata de amortização existente) — só as mensais
        // 30d/60d precisam ser zeradas explicitamente aqui.
        setValParc2(0);
        setParc2InputText('');
        setValParc3(0);
        setParc3InputText('');
        const atoNaHora = hasUnitSelected ? resolverTetoAtoComDesconto(precoComDesconto, false, pctAtoPremiadoCond) : 0;
        setValAtoManual(atoNaHora);
      }
    } else {
      // Ato Premiado religado (mesmo padrão usado ao selecionar uma
      // unidade ou limpar o fluxo) — volta a ficar disponível normalmente.
      setIsAtoPremiadoEnabled(padraoAtoLigado);
      setValAtoManual(null);
      if (isParcelamentoMorar) {
        setPmMensalObraValorManual(null);
        setPmSemestralValorManual({});
        setPmChavesValorManual(null);
        setPmPosObraValorManual(null);
      }
    }
  };

  // Função para resetar exclusivamente o Fluxo de Pagamento (Quadros 2 e 3)
  const handleToggleDescontoVistaDetails = (ligado: boolean) => {
    if (!isPagamentoAVistaAtivoManual) return;
    handleTogglePagamentoAVistaDetails(true, ligado);
  };

  const limparFluxoPagamento = () => {
    setDescontoConstrutoraAtivo(padraoConstrutoraLigado);
    setCartaNaManga(0);
    setCartaNaMangaAtiva(false);
    setValAtoManual(null);
    setAtoInputText('');
    setIsEditingAto(false);
    setIsPagamentoAVistaAtivoManual(false);
    setDescontoVistaAtivo(false);
    setValAtoITBI(0);
    setItbiAtoManualFloor(null);
    setItbiInputText('');
    setIsEditingITBI(false);
    setValParc2(0);
    setParc2InputText('');
    setIsEditingParc2(false);
    setValParc3(0);
    setParc3InputText('');
    setIsEditingParc3(false);
    setQtdMensais(condNumParcelas);
    setIsAtoPremiadoEnabled(padraoAtoLigado);
    setPmMensalObraValorManual(null);
    setPmMesesObraManual(null);
    setPmChavesEnabled(true);
    setPmSemestralIndividualEnabled({});
    setPmSemestralValorManual({});
    setPmSemestralDatasManual({});
    setPmChavesValorManual(null);
    setPmQtdPosObraManual(null);
    setPmPosObraValorManual(null);
    setComissaoParcelasManual(null);
    if (onShowToast) {
      onShowToast('Fluxo de pagamento redefinido para as condições padrão.');
    }
  };

  // Taxa de juros da política de crédito (a.m.)
  const meses1 = currentCond?.mesesTabela1 !== undefined ? currentCond.mesesTabela1 : 36;
  const taxa1 = currentCond?.taxaJuros1 !== undefined ? currentCond.taxaJuros1 : 0;
  const taxa2 = currentCond?.taxaJuros2 !== undefined ? currentCond.taxaJuros2 : 1.9;
  const appliedRatePct = (qtdMensais <= meses1) ? taxa1 : taxa2;

  // 4. CÁLCULO DA BASE PARA A PARCELA (RECONSTRÓI O VALOR BRUTO, ANTES DA TAXA):
  // proSolutoTotalParcelado (= proSolutoTotalPainel, exibido em tela) já saiu
  // líquido da Taxa de Assinatura de Contrato — a mesma redução já foi aplicada
  // lá atrás, no motor que sugere o Ato (Imóvel). A parcela é a única conta que
  // usa o valor BRUTO (antes da redução), então ele é reconstruído aqui.
  const baseCalculoParcela = taxaAssinaturaContratoPct < 100
    ? proSolutoTotalParcelado / (1 - taxaAssinaturaContratoPct / 100)
    : proSolutoTotalParcelado;

  // 5. CÁLCULO DA PARCELA MENSAL (TABELA PRICE COM TAXA APLICADA):
  const parcela = (hasUnitSelected && baseCalculoParcela > 0 && qtdMensais > 0)
    ? calcularParcelaPrice(appliedRatePct, qtdMensais, baseCalculoParcela)
    : 0;

  // Tetos da 1ª/2ª Mensal vêm da Política de Crédito (% da renda e/ou % do imóvel). Sem
  // configuração não há teto. Com ambos, vale o menor.
  const resolverTetoMensal = (lim?: { maxPercentualRenda?: number; maxPercentualImovel?: number }) => {
    const porRenda = lim?.maxPercentualRenda && lim.maxPercentualRenda > 0 && income && income > 0
      ? income * lim.maxPercentualRenda / 100 : 0;
    const porImovel = lim?.maxPercentualImovel && lim.maxPercentualImovel > 0 && price > 0
      ? price * lim.maxPercentualImovel / 100 : 0;
    const candidatos = [porRenda, porImovel].filter(v => v > 0);
    if (candidatos.length === 0) return { teto: 0, texto: '' };
    const teto = Math.min(...candidatos);
    const texto = porRenda > 0 && porImovel > 0
      ? (porRenda <= porImovel ? `${lim!.maxPercentualRenda}% da renda` : `${lim!.maxPercentualImovel}% do valor do imóvel`)
      : (porRenda > 0 ? `${lim!.maxPercentualRenda}% da renda` : `${lim!.maxPercentualImovel}% do valor do imóvel`);
    return { teto, texto };
  };
  const tetoMensal1 = resolverTetoMensal(currentCond?.limite1aMensal);
  const tetoMensal2 = resolverTetoMensal(currentCond?.limite2aMensal);
  const isExceededParc2 = tetoMensal1.teto > 0 && mens30d > tetoMensal1.teto;
  const isExceededParc3 = tetoMensal2.teto > 0 && mens60d > tetoMensal2.teto;

  const totalEntradaMorar = atoAposMensais + atoITBIValidado + mens30d + mens60d + descontoAto;

  // --- INDICADORES DE RISCO DA OPERAÇÃO ---
  const baseRendaInformada = (simulationData.income && simulationData.income > 0) ? simulationData.income : 0;

  // Gráfico 1: "Risco Parcela / Comprometimento" (Fatia 1: 1ª Parcela sobre a Base da Renda | Fatia 2: Restante da Renda)
  const valorRiscoParcela = parcela;
  const pctRiscoParcelaRenda = baseRendaInformada > 0
    ? Math.min(100, Math.max(0, (valorRiscoParcela / baseRendaInformada) * 100))
    : 0;
  const valorRestanteRenda = Math.max(0, baseRendaInformada - valorRiscoParcela);
  const pctRestanteRenda = Math.max(0, 100 - pctRiscoParcelaRenda);

  // Gráfico 2: "Risco Pró-Soluto Total" (Fatia 1: Pró-Soluto Total c/ ITBI sobre a Base Líquida c/ ITBI | Fatia 2: Demais Recursos)
  // Este indicador mostra o quanto do TETO de risco da política (25% imóvel / 35%
  // renda, o que for menor) está sendo utilizado — por isso usa riscoMaximoApuradoBruto
  // (o valor BRUTO, antes da Taxa Bancária e da Comissão Apartada), não
  // proSolutoTotalPainel (que já é o Pró-Soluto de verdade, líquido dessas deduções,
  // usado no Bloco 3/parcela). Usar o valor líquido aqui fazia o percentual ficar
  // artificialmente abaixo do teto configurado (ex.: 24,9% em vez de 25,0%), como se a
  // política não estivesse sendo usada no limite quando na verdade estava.
  // No pagamento à vista não existe Pró-Soluto nenhum (o cliente já paga o imóvel
  // inteiro no Ato) — riscoMaximoApuradoBruto continua sendo só o TETO teórico da
  // política (25%/35%, calculado em cima do valor do imóvel, independente de haver
  // ou não financiamento de fato), então sem esta trava o gráfico mostraria um risco
  // de Pró-Soluto que nunca é usado. Mesma lógica já aplicada ao ITBI (valorTotalITBI
  // acima) e ao Risco Parcela/Renda (valorRiscoParcela, que já zera via `parcela`).
  const valorRiscoProSoluto = isPagamentoAVistaAtivoManual ? 0 : riscoMaximoApuradoBruto;
  const pctRiscoProSoluto = baseVendaLiquidaComITBI > 0
    ? Math.min(100, Math.max(0, (valorRiscoProSoluto / baseVendaLiquidaComITBI) * 100))
    : 0;
  const valorRestanteProSoluto = Math.max(0, baseVendaLiquidaComITBI - valorRiscoProSoluto);
  const pctRestanteProSoluto = Math.max(0, 100 - pctRiscoProSoluto);

  // Valores de exibição dos Blocos 1 e 4: quando a condição é "Parcelamento
  // Morar", usam o motor `pm` calculado acima; nas demais condições, mantêm
  // exatamente os valores já calculados pelo fluxo original do Banco Direto
  // (nada muda para elas).
  // Esta condição não trabalha com Subsídio nem FGTS — ficam sempre zerados.
  const displaySubsidy = isParcelamentoMorar ? 0 : subsidyEfetivo;
  const displayFgts = isParcelamentoMorar ? 0 : fgtsEfetivo;
  const displayDescontoAto = isParcelamentoMorar ? pm.descontoAtoPremiado : descontoAto;
  const displayMaxFinanc = isParcelamentoMorar ? maxFinanc : maxFinancEfetivo;
  // totalNegoc (genérico) inclui subsídio/FGTS do Simulador, que não se aplicam
  // ao Parcelamento Morar — aqui o "Total Negoc." é só o financiamento bancário.
  const displayTotalNegoc = isParcelamentoMorar ? maxFinanc : totalNegocEfetivo;
  const displaySinalTotal = isParcelamentoMorar ? pmSinalTotal : sinalTotal;

  // Bloco 1 padronizado com "Sinal c/ Morar" (FichaMorar): só VISUAL — nenhuma fórmula do Banco Direto muda.
  //  - Sinal Total (s/ ITBI) = preço − total negociado (ainda sem abater o Desconto do Ato Premiado);
  //  - Sinal Líquido = o "Sinal Total" que este card já mostrava (já líquido do Ato Premiado);
  //  - Total com ITBI = o "Sinal + ITBI" que este card já mostrava (mesma conta de antes).
  const sinalTotalSemITBIExibido = hasUnitSelected ? Math.max(0, Math.round((price - totalNegocEfetivo) * 100) / 100) : 0;
  // Barra "Distribuído": soma das peças do fluxo (Ato bruto + mensais + comissão + Pró-Soluto + ITBI
  // parcelado) conferida contra o total que elas devem fechar (Sinal Líquido + Ato Premiado + ITBI total).
  const totalDistribuidoBanco = hasUnitSelected
    ? Math.round((atoBruto + mens30d + mens60d + comissaoApartadaValor + proSoluto + itbiRestante) * 100) / 100
    : 0;
  const referenciaDistribuidoBanco = hasUnitSelected
    ? Math.round((sinalTotal + descontoAto + valorTotalITBI) * 100) / 100
    : 0;
  const diferencaDistribuidoBanco = Math.round((totalDistribuidoBanco - referenciaDistribuidoBanco) * 100) / 100;

  const displayPctRiscoParcelaRenda = isParcelamentoMorar ? pm.pctRendaMensalObra : pctRiscoParcelaRenda;
  const displayValorRiscoParcela = isParcelamentoMorar ? pm.valorMensalObra : valorRiscoParcela;
  const displayPctRiscoProSoluto = isParcelamentoMorar ? pm.pctSubtotalAteChaves : pctRiscoProSoluto;
  const displayValorRiscoProSoluto = isParcelamentoMorar ? pm.subtotalAteChaves : valorRiscoProSoluto;
  // "Parcelamento Morar" não soma ITBI à Base Líquida (não entra ITBI/registro
  // nesta condição), mas continua deduzindo o desconto do Ato Premiado.
  const pmBaseLiquida = hasUnitSelected ? Math.max(0, price - pm.descontoAtoPremiado) : 0;
  const displayBaseLiquida = isParcelamentoMorar ? pmBaseLiquida : baseVendaLiquidaComITBI;

  // Função auxiliar para renderizar Gráficos de Pizza Sólidos com percentuais internos
  // refinados — mesmo motor de renderização (Recharts) e mesma identidade visual
  // (raio, borda branca entre fatias, estilo de rótulo) dos gráficos de "Sinal c/
  // Morar", mantendo a lógica própria de cada gráfico daqui: 1 valor de risco/
  // comprometimento (fatia colorida) + o saldo livre (fatia neutra), em vez das 3
  // categorias exaustivas que "Sinal c/ Morar" usa.
  const renderSolidPie = (
    pct: number,
    colorPrimary: string,
    colorSecondary: string = '#cbd5e1',
    primaryTextColor: string = '#ffffff',
    secondaryTextColor: string = '#1e293b'
  ) => {
    const clampedPct = Math.min(100, Math.max(0, pct));
    const restPct = Math.max(0, 100 - clampedPct);

    const formatPct = (val: number) => {
      return (val < 10 && val > 0) ? val.toFixed(2) : val.toFixed(1);
    };

    const isSolo = clampedPct <= 0 || restPct <= 0;
    const data = isSolo
      ? [{ name: 'primary', value: 100, fill: clampedPct > 0 ? colorPrimary : colorSecondary }]
      : [
          { name: 'primary', value: clampedPct, fill: colorPrimary },
          { name: 'secondary', value: restPct, fill: colorSecondary }
        ];

    const calcCentroidRadius = (innerR: number, outerR: number, sliceAngleDeg: number) => {
      const theta = (sliceAngleDeg * Math.PI) / 180;
      if (theta <= 0.001) return outerR * 0.58;
      const factor = (2 / 3) * (Math.sin(theta / 2) / (theta / 2));
      return outerR * Math.min(0.68, Math.max(0.48, factor));
    };

    const renderLabel = (props: any) => {
      const { cx, cy, midAngle, innerRadius, outerRadius, value, name, percent } = props;
      if (value <= 0) return null;
      const isPrimary = name === 'primary';

      if (isSolo) {
        return (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill={clampedPct > 0 ? primaryTextColor : secondaryTextColor} fontSize="11" fontWeight="normal">
            {clampedPct > 0 ? '100.0%' : '0.0%'}
          </text>
        );
      }

      if (!isPrimary && value < 18) return null;

      const sliceAngleDeg = (percent || 0) * 360;
      const radius = calcCentroidRadius(innerRadius, outerRadius, sliceAngleDeg);
      const RADIAN = Math.PI / 180;
      const x = cx + radius * Math.cos(-midAngle * RADIAN);
      const y = cy + radius * Math.sin(-midAngle * RADIAN);
      const labelText = `${formatPct(value)}%`;

      if (isPrimary && value < 14) {
        return (
          <g>
            <rect x={x - 20} y={y - 7} width="40" height="14" rx="4" fill={colorPrimary} opacity="0.95" />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize="9" fontWeight="normal">
              {labelText}
            </text>
          </g>
        );
      }

      return (
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill={isPrimary ? primaryTextColor : secondaryTextColor} fontSize="11" fontWeight="normal">
          {labelText}
        </text>
      );
    };

    return (
      <div className="w-40 h-40 sm:w-48 sm:h-48 mx-auto select-none overflow-visible">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={0}
              outerRadius="90%"
              stroke="#ffffff"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              labelLine={false}
              label={renderLabel}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <RechartsTooltip formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name === 'primary' ? 'Comprometimento' : 'Saldo Livre']} />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // Dropdown de condição do painel lateral: só as 3 condições base. As variantes "Comissão
  // Apartada" saem do dropdown e são alternadas pelo botão "Apartar Comissão".
  const kindAtual = getConditionKind(currentCond.name);
  const baseAtual = condicaoBaseDe(kindAtual);
  const condicaoLiberada = (kind: ConditionKind) =>
    !condicoesLiberadas || CONDICOES_APP.some(i => i.variant === kind && condicoesLiberadas.includes(i.key));
  // Sempre as 3 condições base; a que o empreendimento não tem (ou o perfil não tem liberada)
  // fica desabilitada. Destino fixo: Sinal c/ Morar -> 'ficha-morar' (nunca a simplificada "**").
  const opcoesCondicaoBase = CONDICOES_BASE.map(base => {
    const cond = (currentProd.conditions || []).find(c => getConditionKind(c.name) === base);
    const disponivel = !!cond && (base === baseAtual || condicaoLiberada(base));
    return {
      base,
      id: cond ? cond.id : `indisponivel__${base}`,
      condId: cond?.id,
      disabled: !disponivel,
      label: ROTULO_CONDICAO_BASE[base] + (disponivel ? '' : ' (indisponível)')
    };
  });
  const comissaoAtiva = isComissaoApartadaKind(kindAtual);
  const kindAlvoComissao = condicaoAlternadaComissao(kindAtual);
  const condAlvoComissao = kindAlvoComissao && condicaoLiberada(kindAlvoComissao)
    ? (currentProd.conditions || []).find(c => getConditionKind(c.name) === kindAlvoComissao)
    : undefined;
  const podeApartarComissao = !!condAlvoComissao && !!onSelectCondition;

  // Badge do painel lateral: só mês/ano (ex.: "Fev/2026") da fase da unidade selecionada.
  // Sem Torre + Unidade não dá para saber a fase do imóvel, então não mostra data nenhuma.
  const entregaChaves = hasUnitSelected
    ? formatDateMonthYear(
        String(fase).includes('2')
          ? (currentProd.deliveryDatePhase2 || currentProd.deliveryDate)
          : (currentProd.deliveryDatePhase1 || currentProd.deliveryDate)
      )
    : '';

  // Dynamic key delivery dates from product policy or selected unit phase
  const deliveryText = entregaChaves || formatDeliveryText(
    currentProd.deliveryDatePhase1,
    currentProd.deliveryDatePhase2,
    currentProd.deliveryDate
  );

  // Check if sales table exists, is active, and is not expired
  const hasTable = Boolean(
    currentProd.tableInfo &&
    currentProd.tableInfo.active &&
    currentProd.tableInfo.rows &&
    currentProd.tableInfo.rows.length > 0 &&
    !tabelaVencida
  );

  const [isSavingSimulation, setIsSavingSimulation] = useState<boolean>(false);

  // Monta o snapshot completo da simulação no formato salvo em `simulacoes`.
  const montarDadosCompletos = (): Record<string, any> => {
    const dadosCompletos: Record<string, any> = {
      empreendimento_id: currentProd.id,
      empreendimento_nome: currentProd.name,
      condicao_id: currentCond?.id || '',
      condicao_nome: currentCond?.name || '',
      torre: selectedTorre || 'Não Selecionada',
      unidade: selectedUnidade || 'Não Selecionada',
      tipologia: hasUnitSelected ? tipologia : null,
      simulation_data: simulationData,
      cliente_nome: simulationData.clientName || 'Cliente Não Informado',
      renda: baseRendaInformada,
      preco_tabela: price,
      avaliacao_bancaria: evaluation,
      itbi_total: valorTotalITBI,
      financiamento_maximo: displayMaxFinanc,
      subsidio: displaySubsidy,
      fgts: displayFgts,
      recurso_proprio: simulationData.ownResource || 0,
      ato_bruto: isParcelamentoMorar ? (pm.atoEfetivo + pm.descontoAtoPremiado) : atoBruto,
      desconto_ato_premiado: displayDescontoAto,
      ato_liquido: isParcelamentoMorar ? pm.atoEfetivo : atoEfetivo,
      itbi_no_ato: valAtoITBI,
      salvo_em: new Date().toISOString()
    };

    if (isParcelamentoMorar) {
      dadosCompletos.mensais_obra_qtd = pm.nMensaisObra;
      dadosCompletos.mensais_obra_valor = pm.valorMensalObra;
      dadosCompletos.semestrais_qtd = pm.nSemestrais;
      dadosCompletos.semestrais_valor = pm.nSemestrais > 0 ? Math.round((pm.totalSemestrais / pm.nSemestrais) * 100) / 100 : 0;
      dadosCompletos.parcela_chaves_valor = pm.valorChaves;
      dadosCompletos.parcela_chaves_vencimento = chavesVencimentoStr;
      dadosCompletos.pos_obra_qtd = pm.qtdParcelasPosObra;
      dadosCompletos.pos_obra_valor = pm.valorPosObraParcela;
      dadosCompletos.subtotal_ate_chaves = pm.subtotalAteChaves;
      dadosCompletos.pct_subtotal_ate_chaves = pm.pctSubtotalAteChaves;
    } else {
      dadosCompletos.mensais_qtd = qtdMensais;
      dadosCompletos.parcela_mensal = parcela;
      dadosCompletos.pro_soluto_total = proSolutoTotalPainel;
      if (isComissaoApartada) {
        dadosCompletos.comissao_apartada_valor = comissaoApartadaValor;
        dadosCompletos.comissao_apartada_parcelas = comissaoApartadaParcelasQtd;
        dadosCompletos.comissao_apartada_parcela_valor = comissaoApartadaParcelaValor;
      }
    }
    return dadosCompletos;
  };

  // Registro (id) já salvo automaticamente para a simulação atual — enquanto
  // a pessoa continua na mesma torre/unidade/condição, novos ajustes ATUALIZAM
  // essa mesma linha em vez de criar uma nova a cada salvamento automático.
  const autoSavedIdRef = useRef<string | null>(null);
  const autoSaveKeyRef = useRef<string>('');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Salva (ou atualiza, se já havia sido salva automaticamente) a simulação.
  // `silencioso` evita toast e o estado de "Salvando..." do botão — usado
  // pelo salvamento automático em segundo plano.
  const persistirSimulacao = async (silencioso: boolean) => {
    if (!currentProd) return;
    const dadosCompletos = montarDadosCompletos();
    if (!silencioso) setIsSavingSimulation(true);
    try {
      const payload = {
        cliente_nome: simulationData.clientName || 'Cliente Não Informado',
        renda: baseRendaInformada,
        empreendimento_id: currentProd.id,
        dados: dadosCompletos
      };
      const res = autoSavedIdRef.current
        ? await imoveisService.atualizarSimulacao(autoSavedIdRef.current, payload)
        : await imoveisService.salvarSimulacao(payload);

      if (res.success) {
        const novoId = (res.data as any[])?.[0]?.id;
        if (novoId) autoSavedIdRef.current = novoId;
        if (!silencioso) onShowToast(`Proposta de ${simulationData.clientName || 'simulação'} salva no Firestore com sucesso!`);
      } else if (!silencioso) {
        onShowToast(`Proposta registrada: ${res.error || 'Aviso de sincronização'}`);
      }
    } catch (e: any) {
      if (!silencioso) onShowToast(`Erro ao salvar simulação: ${e?.message || 'Falha na conexão'}`);
    } finally {
      if (!silencioso) setIsSavingSimulation(false);
    }
  };

  const handleSaveSimulation = () => persistirSimulacao(false);

  const isFieldDefined = (val: number | null | undefined): boolean => {
    return val !== null && val !== undefined && !isNaN(val) && val >= 0;
  };

  const isIncomeValid = isFieldDefined(simulationData.income);
  const isFinancingValid = isFieldDefined(simulationData.financing);
  const isSubsidyValid = isFieldDefined(simulationData.subsidy);
  const isFgtsValid = isFieldDefined(simulationData.fgts);

  const isSimulationComplete = isIncomeValid && isFinancingValid && isSubsidyValid && isFgtsValid;

  // Salvamento automático: toda simulação completa (renda/financiamento/
  // subsídio/FGTS preenchidos e uma unidade selecionada) fica registrada em
  // Simulações Salvas, mesmo que a pessoa nunca clique em "Salvar Simulação".
  // Espera 2,5s sem mudanças antes de gravar, pra não criar uma gravação a
  // cada tecla digitada.
  useEffect(() => {
    const chaveAtual = `${currentProd?.id || ''}|${currentCond?.id || ''}|${selectedTorre}|${selectedUnidade}`;
    if (chaveAtual !== autoSaveKeyRef.current) {
      autoSaveKeyRef.current = chaveAtual;
      autoSavedIdRef.current = null;
    }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (!currentProd || !hasUnitSelected || !isSimulationComplete) return;

    autoSaveTimerRef.current = setTimeout(() => {
      persistirSimulacao(true);
    }, 2500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentProd?.id, currentCond?.id, selectedTorre, selectedUnidade, hasUnitSelected, isSimulationComplete,
    isParcelamentoMorar, simulationData, baseRendaInformada, price, evaluation, valorTotalITBI,
    displayMaxFinanc, displaySubsidy, displayFgts, displayDescontoAto, valAtoITBI, atoBruto, atoEfetivo,
    pm, qtdMensais, parcela, proSolutoTotalPainel
  ]);

  if (!isSimulationComplete) {
    return (
      <EmptySimulationNotice
        onNavigateToSimulator={onBackToSimulator}
        missingItems={{
          income: !isIncomeValid,
          financing: !isFinancingValid,
          subsidy: !isSubsidyValid,
          fgts: !isFgtsValid
        }}
      />
    );
  }

  return (
    <div className="w-full max-w-[1555px] mx-auto space-y-4 animate-fade-in">
      
      {/* ALERTA: TABELA DE VENDAS NÃO IMPORTADA OU VENCIDA */}
      {tabelasCarregadas && !hasTable && (
        <div className={`${tabelaVencida ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'} border rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 ${tabelaVencida ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'} rounded-lg shrink-0`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h4 className={`text-xs font-bold ${tabelaVencida ? 'text-rose-900' : 'text-amber-900'}`}>
                {tabelaVencida ? 'Tabela de Vendas Vencida' : 'Tabela de Vendas Não Importada'}
              </h4>
              <p className={`text-xs font-medium mt-0.5 ${tabelaVencida ? 'text-rose-800' : 'text-amber-800'}`}>
                {tabelaVencida
                  ? `A validade desta tabela terminou em ${formatDateBr(currentProd.tableInfo?.validTo)}. Importe uma tabela nova para liberar a simulação com preços atualizados.`
                  : 'Atenção: É necessário importar a tabela de vendas para este empreendimento.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToImport(currentProd.id)}
            className={`px-3.5 py-1.5 ${tabelaVencida ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'} text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Importar Tabela (Excel)</span>
          </button>
        </div>
      )}

      {/* LAYOUT: painel do imóvel à esquerda + quadros de cálculo ao lado (empilha no mobile/tablet) */}
      <div className="flex flex-col lg:flex-row gap-4 items-start w-full">
        {/* COLUNA LATERAL ESQUERDA: cliente/ações + dados do imóvel (no desktop ocupa o espaço do antigo menu) */}
        {/* COLUNA LATERAL: card do imóvel/ações + card de financiamento */}
        <div className="w-full lg:w-[24.7%] min-[1555px]:w-[379px] shrink-0 space-y-4 lg:sticky lg:top-20">
        <aside className="w-full bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        {/* IDENTIFICAÇÃO + AÇÕES */}
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-2 text-xs">
          <div className="flex flex-col items-start gap-0.5 min-w-0 w-full">
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-slate-500 font-medium min-w-0">
                Cliente: <strong className="text-slate-900">{simulationData.clientName || 'Cliente Não Informado'}</strong>
              </span>
              {entregaChaves && (
                <span
                  id="badge-data-entrega"
                  className="shrink-0 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 flex items-center gap-1"
                  title="Entrega das chaves"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{entregaChaves}</span>
                </span>
              )}
            </div>
            <span className="text-slate-500 font-medium mt-2.5">
              Imobiliária: <strong className="text-slate-900">{simulationData.agency?.trim() || 'Imobiliária Não Informada'}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={onBackToSimulator}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex-1 shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-700"
              title="Voltar ao Simulador"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Voltar</span>
            </button>
            <button
              type="button"
              onClick={handleSaveSimulation}
              disabled={isSavingSimulation}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex-1 shrink-0 bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
              title="Salvar proposta/simulação no banco Firestore"
            >
              {isSavingSimulation ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              <span>{isSavingSimulation ? 'Salvando...' : 'Salvar'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPdfModalOpen(true)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex-1 shrink-0 bg-morar-50 hover:bg-morar-100 text-morar-700"
              title="Exportar Ficha de Análise em PDF / Imprimir"
            >
              <Printer className="w-3 h-3" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={handleResetFicha}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex-1 shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-600"
              title="Limpar Ficha de Análise"
            >
              <RotateCcw className="w-3 h-3 text-morar-600" />
              <span>Limpar</span>
            </button>
          </div>
        </div>

        {/* SELETORES DE EMPREENDIMENTO E CONDIÇÃO */}
        <div className="flex flex-col gap-2 w-full">
          {products && products.length > 1 && onSelectProduct ? (
            <div className="relative block w-full">
              <select
                value={currentProd.id}
                onChange={(e) => handleProductDropdownChange(e.target.value)}
                className="w-full appearance-none bg-morar-50 hover:bg-morar-100 text-morar-700 font-extrabold text-xs sm:text-sm pl-7 pr-7 py-1.5 text-center [text-align-last:center] rounded-lg border border-morar-200 uppercase tracking-wide cursor-pointer focus:outline-none focus:ring-2 focus:ring-morar-500/20"
              >
                {products.map(p => (
                  <option key={p.id} value={p.id} className="text-slate-800 font-semibold bg-white">
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-morar-600 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          ) : (
            <span className="block w-full text-center text-xs sm:text-sm font-extrabold text-morar-600 bg-morar-50 px-3 py-1.5 rounded-lg border border-morar-100 uppercase tracking-wide">
              {currentProd.name}
            </span>
          )}

          {onSelectCondition ? (
            <div className="relative block w-full">
              <select
                value={opcoesCondicaoBase.find(o => o.base === baseAtual)?.id ?? ''}
                onChange={(e) => {
                  const opt = opcoesCondicaoBase.find(o => o.id === e.target.value);
                  if (opt && opt.condId && !opt.disabled) handleConditionDropdownChange(opt.condId, telaDaCondicao(opt.base));
                }}
                className="w-full appearance-none bg-indigo-50 hover:bg-indigo-100 text-indigo-700 uppercase tracking-wide font-medium text-xs sm:text-sm py-1.5 pl-7 pr-7 text-center [text-align-last:center] rounded-lg border border-indigo-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              >
                {opcoesCondicaoBase.map(o => (
                  <option key={o.id} value={o.id} disabled={o.disabled} className="text-slate-800 font-medium bg-white">
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-indigo-600 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          ) : (
            <span className="block w-full text-center text-xs sm:text-sm font-medium uppercase tracking-wide text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
              {ROTULO_CONDICAO_BASE[baseAtual] ?? currentCond.name}
            </span>
          )}

          {/* BOTÃO APARTAR COMISSÃO — alterna Sinal c/ Morar e Sinal c/ Banco Direto para a variante
              "Comissão Apartada" (e volta), mantendo empreendimento, Torre e Unidade. */}
          <button
            type="button"
            onClick={() => condAlvoComissao && kindAlvoComissao && handleConditionDropdownChange(condAlvoComissao.id, telaDaCondicao(kindAlvoComissao))}
            disabled={!podeApartarComissao}
            aria-pressed={comissaoAtiva}
            title={kindAtual === 'parcelamento-morar'
              ? 'Não se aplica ao Parcelamento Morar'
              : !podeApartarComissao ? 'Variante de Comissão Apartada indisponível para este empreendimento/perfil' : comissaoAtiva ? 'Desativar a Comissão Apartada' : 'Apartar a comissão do fluxo'}
            className={`w-full flex items-center justify-center gap-1.5 text-xs py-1.5 px-3 rounded-lg border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${comissaoAtiva ? CLASSE_BOTAO_APARTAR_ATIVO : CLASSE_BOTAO_APARTAR_INATIVO}`}
          >
            <HandCoins className="w-3.5 h-3.5 shrink-0" />
            <span>{comissaoAtiva ? 'Comissão Apartada: Ativa' : 'Apartar Comissão'}</span>
          </button>
        </div>

        {/* PAINEL LATERAL: Torre/Unidade e, abaixo, 3 linhas x 2 colunas —
            Valores (Preço de Tabela | Avaliação), Características (Tipologia | Fase), Metragens (Área Privativa | Quintal). */}
        <div className="grid grid-cols-2 gap-2 text-xs w-full">
          <div className="bg-morar-50/60 p-2 rounded-lg border border-morar-100 flex flex-col items-center justify-center text-center min-w-0">
            <label className="block text-[10px] text-morar-600 font-bold uppercase mb-0.5 text-center whitespace-nowrap">
              TORRE *
            </label>
            <select
              value={selectedTorre}
              onChange={(e) => handleTorreChange(e.target.value)}
              className="w-full bg-white font-bold text-slate-900 border border-slate-200 rounded-md py-1 px-1 focus:outline-none focus:border-morar-600 text-xs cursor-pointer text-center"
            >
              <option value="">--</option>
              {availableTorres.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="bg-morar-50/60 p-2 rounded-lg border border-morar-100 flex flex-col items-center justify-center text-center min-w-0">
            <label className="block text-[10px] text-morar-600 font-bold uppercase mb-0.5 text-center whitespace-nowrap">
              UNIDADE *
            </label>
            <select
              value={selectedUnidade}
              onChange={(e) => handleUnidadeChange(e.target.value)}
              disabled={!selectedTorre}
              className="w-full bg-white font-bold text-slate-900 border border-slate-200 rounded-md py-1 px-1 focus:outline-none focus:border-morar-600 text-xs cursor-pointer text-center disabled:opacity-50"
            >
              <option value="">--</option>
              {filteredUnits.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs w-full">
          {/* LINHA 1 — VALORES */}
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex flex-col items-center justify-center text-center min-w-0">
            <span className="block text-[10px] text-slate-400 font-medium text-center mb-0.5 whitespace-nowrap">Preço de Tabela</span>
            <input
              type="text"
              value={formatCurrency(precoTabelaLista)}
              readOnly
              className="w-full bg-transparent font-bold text-slate-900 text-center focus:outline-none cursor-not-allowed text-xs whitespace-nowrap"
            />
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex flex-col items-center justify-center text-center min-w-0">
            <span className="block text-[10px] text-slate-400 font-medium text-center mb-0.5 whitespace-nowrap">Avaliação Bancária</span>
            <input
              type="text"
              value={formatCurrency(evaluation)}
              readOnly
              className="w-full bg-transparent font-bold text-emerald-600 text-center focus:outline-none cursor-not-allowed text-xs whitespace-nowrap"
            />
          </div>

          {/* LINHA 2 — CARACTERÍSTICAS */}
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex flex-col items-center justify-center text-center min-w-0">
            <span className="block text-[10px] text-slate-400 font-medium text-center mb-0.5 whitespace-nowrap">Tipologia</span>
            <input
              type="text"
              value={tipologia}
              readOnly
              className="w-full bg-transparent font-bold text-slate-700 text-center focus:outline-none cursor-not-allowed truncate text-xs"
              title={tipologia}
            />
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex flex-col items-center justify-center text-center min-w-0">
            <span className="block text-[10px] text-slate-400 font-medium text-center mb-0.5 whitespace-nowrap">Fase</span>
            <input
              id="campo-fase"
              type="text"
              value={fase}
              readOnly
              className="w-full bg-transparent font-bold text-slate-700 text-center focus:outline-none cursor-not-allowed text-xs"
            />
          </div>

          {/* LINHA 3 — METRAGENS */}
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex flex-col items-center justify-center text-center min-w-0">
            <span className="block text-[10px] text-slate-400 font-medium text-center mb-0.5 whitespace-nowrap">Área Privativa</span>
            <input
              type="text"
              value={areaPriv}
              readOnly
              className="w-full bg-transparent font-bold text-slate-700 text-center focus:outline-none cursor-not-allowed text-xs whitespace-nowrap"
            />
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/60 flex flex-col items-center justify-center text-center min-w-0">
            <span className="block text-[10px] text-slate-400 font-medium text-center mb-0.5 whitespace-nowrap">Quintal</span>
            <input
              type="text"
              value={areaQuintal}
              readOnly
              className="w-full bg-transparent font-bold text-slate-700 text-center focus:outline-none cursor-not-allowed text-xs whitespace-nowrap"
            />
          </div>
        </div>
        </aside>

        <PainelFinanciamento
          finPercent={simulationData.finPercent}
          isFirstHome={isFirstHomeLocal}
          onFinPercentChange={handleFinancingPercentageChange}
          onFirstHomeChange={handleFirstHomeChange}
          cartaNaManga={cartaNaMangaDigitada}
          cartaNaMangaMax={cartaNaMangaMax}
          onCartaNaMangaChange={handleCartaNaMangaChange}
        />
        </div>

        {/* ÁREA PRINCIPAL DOS QUADROS DE CÁLCULO */}
        <div className="flex-1 w-full min-w-0">
      {/* CORPO DA PÁGINA: GRID DE 2 COLUNAS IDÊNTICO AO PDF */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,56fr)_minmax(0,52fr)] gap-4 items-start">
        
        {/* ================= COLUNA DA ESQUERDA ================= */}
        <div className="space-y-4">
          
          {/* BLOCO 1: DADOS DA APROVAÇÃO DE CRÉDITO */}
          {telaSettings.mostrarBloco1 && (
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-morar-50 text-morar-600">
                  <FileCheck2 className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  1. Dados da Aprovação de Crédito
                </h3>
              </div>
              {!isParcelamentoMorar && hasUnitSelected && valorBaseImovel > 0 && (
                <div className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                  Valor Base: <strong className="text-slate-800">{formatCurrency(valorBaseImovel)}</strong>
                </div>
              )}
            </div>

            {/* SUBCOLUNAS LADO A LADO: RECURSOS DO CLIENTE & OPERAÇÃO BANCÁRIA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block border-b border-slate-200 pb-1 mb-1.5">
                    Recursos do Cliente
                  </span>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">Renda:</span>
                    <strong className="text-slate-800 font-semibold">{formatCurrency(income)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">Subsídio:</span>
                    <strong className="text-emerald-600 font-semibold">{formatCurrency(displaySubsidy)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">FGTS:</span>
                    <strong className="text-morar-600 font-semibold">{formatCurrency(displayFgts)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">Desconto à Vista:</span>
                    <MiniSwitch
                      ativo={isPagamentoAVistaAtivoManual && descontoVistaAtivo}
                      disabled={!hasUnitSelected || !isPagamentoAVistaAtivoManual}
                      onToggle={() => handleToggleDescontoVistaDetails(!descontoVistaAtivo)}
                      title={!isPagamentoAVistaAtivoManual ? 'Ative o botão "Pgtº à vista" para usar o Desconto à Vista' : (descontoVistaAtivo ? 'Desconto à Vista ativo — clique para desativar' : 'Ativar Desconto à Vista')}
                    />
                    <strong className={isPagamentoAVistaAtivoManual && descontoVistaAtivo ? 'text-emerald-600 font-bold' : 'text-slate-600 font-semibold'}>
                      {formatCurrency(isPagamentoAVistaAtivoManual && descontoVistaAtivo ? valorDescontoAVista : 0)}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">Desconto Ato:</span>
                    <MiniSwitch
                      ativo={isAtoPremiadoEnabled}
                      disabled={!hasUnitSelected || isPagamentoAVistaAtivoManual}
                      onToggle={() => setIsAtoPremiadoEnabled(!isAtoPremiadoEnabled)}
                      title={isPagamentoAVistaAtivoManual ? 'Desligado automaticamente enquanto o pagamento à vista está ativo' : (isAtoPremiadoEnabled ? 'Ato Premiado ativo — clique para desativar' : 'Ativar Ato Premiado')}
                    />
                    <strong className={isAtoPremiadoEnabled ? 'text-emerald-600 font-bold' : 'text-slate-600 font-semibold'}>
                      {formatCurrency(isAtoPremiadoEnabled ? displayDescontoAto : 0)}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">Desconto Construtora:</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={descontoConstrutoraAtivo}
                      disabled={descontoConstrutoraRegra <= 0}
                      onClick={() => {
                        // Um Ato digitado antes da troca ficaria preso ao preço antigo: volta para o
                        // Ato sugerido, recalculado com o preço novo.
                        setDescontoConstrutoraAtivo(v => !v);
                        setValAtoManual(null);
                        setAtoInputText('');
                        setIsEditingAto(false);
                      }}
                      title={descontoConstrutoraRegra <= 0
                        ? 'Nenhuma regra de Desconto Construtora para esta unidade'
                        : (descontoConstrutoraAtivo ? 'Desconto ativo — clique para desativar' : 'Desconto desativado — clique para ativar')}
                      className={`relative inline-flex h-2.5 w-5 shrink-0 items-center rounded-full transition-colors ${descontoConstrutoraAtivo ? 'bg-emerald-600/70 ring-1 ring-inset ring-emerald-700/20' : 'bg-slate-300'} ${descontoConstrutoraRegra <= 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span className={`inline-block h-1.5 w-1.5 rounded-full bg-white shadow-xs transition-transform ${descontoConstrutoraAtivo ? 'translate-x-3' : 'translate-x-0.5'}`} />
                    </button>
                    <strong className={descontoConstrutoraAtivo ? 'text-emerald-600 font-bold' : 'text-slate-600 font-semibold'}>
                      {formatCurrency(descontoConstrutora)}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center py-1 mt-1">
                    <span className="text-slate-600">Carta na Manga:</span>
                    <MiniSwitch
                      ativo={cartaNaMangaEfetiva > 0}
                      disabled={cartaNaMangaDigitada <= 0}
                      onToggle={handleToggleCartaNaManga}
                      title={cartaNaMangaDigitada <= 0 ? 'Digite um valor de Carta na Manga para habilitar' : (cartaNaMangaEfetiva > 0 ? 'Carta na Manga ativa — clique para desativar' : 'Ativar Carta na Manga')}
                    />
                    <strong className={cartaNaMangaEfetiva > 0 ? 'text-emerald-600 font-bold' : 'text-slate-600 font-semibold'}>
                      {formatCurrency(cartaNaMangaEfetiva)}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block border-b border-slate-200 pb-1 mb-1.5">
                    Operação Bancária
                  </span>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">Max Financ:</span>
                    <strong className="text-morar-600 font-bold">{formatCurrency(displayMaxFinanc)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">Total Negoc:</span>
                    <strong className="text-slate-800 font-semibold">{formatCurrency(displayTotalNegoc)}</strong>
                  </div>
                  {isParcelamentoMorar ? (
                    // Esta condição não usa ITBI/registro: mantém só o Sinal Total.
                    <div className="flex justify-between items-center py-1">
                      <span className="text-slate-600">Sinal Total:</span>
                      <strong className="text-amber-600 font-bold">{formatCurrency(displaySinalTotal)}</strong>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                        <span className="text-slate-600">Sinal Total (s/ ITBI):</span>
                        <strong className="text-amber-700 font-bold">{formatCurrency(sinalTotalSemITBIExibido)}</strong>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                        <span className="text-slate-600">Sinal Líquido:</span>
                        <strong className="text-amber-800 font-black">{formatCurrency(displaySinalTotal)}</strong>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                        <span className="text-slate-600">ITBI / Registro Total:</span>
                        <strong className="text-slate-800 font-semibold">{formatCurrency(valorTotalITBI)}</strong>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-600">Total com ITBI:</span>
                        <strong className="text-[#006B3F] font-bold">{formatCurrency(displaySinalTotal + saldoITBI)}</strong>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* VALIDAÇÃO EM TEMPO REAL: TOTAL DISTRIBUÍDO (mesma barra do "Sinal c/ Morar") */}
            {!isParcelamentoMorar && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 bg-morar-50 px-3.5 rounded-lg border border-morar-100 gap-2 transition-colors">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-800">Distribuído:</span>
                  {hasUnitSelected && (Math.abs(diferencaDistribuidoBanco) <= 0.05 ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-600" />
                      100% Validado
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200" title="O fluxo distribuído não fecha com o total do sinal + ITBI">
                      Diferença de {formatCurrency(Math.abs(diferencaDistribuidoBanco))}
                    </span>
                  ))}
                </div>
                <strong className="text-xs font-semibold text-morar-700">
                  {formatCurrency(totalDistribuidoBanco)}
                </strong>
              </div>
            )}
          </div>
          )}

          {/* BLOCO 4: INDICADORES DE RISCO / COMPROMETIMENTO (REPOSICIONADO NA COLUNA ESQUERDA) —
              no Parcelamento Morar, substituído pelo gráfico "Percentuais de Comprometimento"
              logo abaixo, que já cobre Mensal de Obra/Renda e Subtotal Até as Chaves. */}
          {!isParcelamentoMorar && telaSettings.mostrarBloco4 && (
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3.5">
            {/* Cabeçalho de Bases Compartilhadas */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-morar-50 text-morar-600">
                  <PieChart className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  4. Indicadores de Risco / Comprometimento
                </h3>
              </div>
              <div className="flex items-center flex-wrap gap-2 text-[10px]">
                <div className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                  <span className="text-slate-400 font-medium">{isParcelamentoMorar ? 'Base Líquida:' : 'Base Líq. c/ ITBI:'}</span>
                  <strong className="font-bold text-slate-800">{formatCurrency(displayBaseLiquida)}</strong>
                </div>
                <div className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                  <span className="text-slate-400 font-medium">Base Renda:</span>
                  <strong className="font-bold text-slate-800">{formatCurrency(baseRendaInformada)}</strong>
                </div>
              </div>
            </div>

            {/* GRÁFICOS DE PIZZA LADO A LADO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* SUB-CARD 1: RISCO PARCELA / COMPROMETIMENTO */}
              <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200/80 flex flex-col justify-between space-y-1">
                <div className="border-b border-slate-200/60 pb-1 text-center">
                  <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-tight flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-morar-600 shrink-0" />
                    Risco Parcela / Renda
                  </h4>
                  <p className="text-[9.5px] text-slate-500 mt-0.5">
                    {isParcelamentoMorar ? 'Mensal de Obra sobre a Renda' : '1ª Parcela sobre a Base da Renda'}
                  </p>
                </div>

                <div className="py-1 flex items-center justify-center overflow-visible">
                  {renderSolidPie(displayPctRiscoParcelaRenda, '#0284c7', '#cbd5e1')}
                </div>

                <div className="w-full pt-1.5 border-t border-slate-200/70 text-center space-y-0.5">
                  <div className="flex items-center justify-between px-1 text-[10px]">
                    <span className="text-slate-500 font-medium">Comprometimento:</span>
                    <strong className="text-morar-700 font-bold">
                      {displayPctRiscoParcelaRenda < 10 ? displayPctRiscoParcelaRenda.toFixed(2) : displayPctRiscoParcelaRenda.toFixed(1)}%
                    </strong>
                  </div>
                  <div className="flex items-center justify-between px-1 text-[10px]">
                    <span className="text-slate-500 font-medium">{isParcelamentoMorar ? 'Mensal de Obra:' : '1ª Parcela:'}</span>
                    <strong className="text-slate-800 font-semibold">
                      {formatCurrency(displayValorRiscoParcela)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* SUB-CARD 2: RISCO PRÓ-SOLUTO TOTAL */}
              <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200/80 flex flex-col justify-between space-y-1">
                <div className="border-b border-slate-200/60 pb-1 text-center">
                  <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-tight flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-violet-600 shrink-0" />
                    {isParcelamentoMorar ? 'Subtotal Até as Chaves' : 'Risco Pró-Soluto Total'}
                  </h4>
                  <p className="text-[9.5px] text-slate-500 mt-0.5">
                    {isParcelamentoMorar ? 'Sinal + Mensais + Semestrais + Chaves s/ Valor do Imóvel' : 'Pró-Soluto Total c/ ITBI s/ Base Líquida'}
                  </p>
                </div>

                <div className="py-1 flex items-center justify-center overflow-visible">
                  {renderSolidPie(displayPctRiscoProSoluto, '#7c3aed', '#cbd5e1')}
                </div>

                <div className="w-full pt-1.5 border-t border-slate-200/70 text-center space-y-0.5">
                  <div className="flex items-center justify-between px-1 text-[10px]">
                    <span className="text-slate-500 font-medium">Comprometimento:</span>
                    <strong className="text-violet-700 font-bold">
                      {displayPctRiscoProSoluto < 10 ? displayPctRiscoProSoluto.toFixed(2) : displayPctRiscoProSoluto.toFixed(1)}%
                    </strong>
                  </div>
                  <div className="flex items-center justify-between px-1 text-[10px]">
                    <span className="text-slate-500 font-medium">{isParcelamentoMorar ? 'Subtotal Até Chaves:' : 'Pró-Soluto Total:'}</span>
                    <strong className="text-slate-800 font-semibold">
                      {formatCurrency(displayValorRiscoProSoluto)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* GRÁFICO: PERCENTUAIS DE COMPROMETIMENTO POR GRUPO (SINAL, MENSAIS, INTERMEDIÁRIAS, CHAVES, PÓS-OBRA) */}
          {pmComprometimentoData.length > 0 && telaSettings.mostrarBloco4 && (telaSettings.mostrarComprometimentoPorSerie ?? true) && (
            <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-2">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-1.5">
                Percentuais de Comprometimento
              </h3>
              <div style={{ height: Math.max(160, pmComprometimentoData.length * 30) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pmComprometimentoData} layout="vertical" margin={{ top: 5, right: 46, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={56} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'normal' }} axisLine={false} tickLine={false} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16} minPointSize={larguraMinimaBarra}>
                      {pmComprometimentoData.map((entry, idx) => (
                        <Cell key={`pm-comp-${idx}`} fill={entry.base === 'Renda' ? '#0284c7' : '#7c3aed'} />
                      ))}
                      <LabelList dataKey="value" content={rotuloBarraDireita(10, (v) => `${v.toFixed(2)}%`)} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-3 text-[10px] font-medium text-slate-500 pt-1 border-t border-slate-200/60">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#7c3aed]" />% do Imóvel</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0284c7]" />% da Renda</span>
              </div>
            </div>
          )}

        </div>

        {/* ================= COLUNA DA DIREITA ================= */}
        <div className="space-y-4">
          
          {/* BLOCO 2: FLUXO DE ENTRADA C/ CONSTRUTORA (COMPONENTE PADRONIZADO) */}
          {telaSettings.mostrarBloco2 && (
          <FluxoEntradaConstrutora
            title="2. FLUXO DE ENTRADA C/ CONSTRUTORA"
            onLimpar={limparFluxoPagamento}
            valorAto={isParcelamentoMorar ? pm.atoEfetivo : atoAposMensais}
            valorAtoMinimo={isParcelamentoMorar ? pm.sinalMinimoCalculado : atoMinimoCalculado}
            valorAtoMaximo={isParcelamentoMorar ? pm.atoMaximoPossivel : atoMaximoPossivel}
            onAtoChange={(novoVal) => {
              setValAtoManual(novoVal);
            }}
            stepAto={currentCond?.stepAtoImovel}
            stepItbi={currentCond?.stepItbiAto}
            onShowToast={onShowToast}
            hideITBI={isParcelamentoMorar}
            valAtoITBI={valAtoITBI}
            valorTotalITBI={valorTotalITBI}
            isFirstHome={isFirstHomeLocal}
            onToggleFirstHome={() => setIsFirstHomeLocal(prev => !prev)}
            onITBIChange={(novoVal) => {
              setValAtoITBI(novoVal);
              // Guarda como piso manual — as próximas recalculagens (ex.: ao
              // mudar a Qtd. Mensais) partem dele, nunca de uma migração
              // automática anterior que porventura já esteja maior na tela.
              setItbiAtoManualFloor(novoVal > 0 ? novoVal : null);
            }}
            descontoAto={isParcelamentoMorar ? pm.descontoAtoPremiado : descontoAto}
            isAtoPremiadoActive={isAtoPremiadoEnabled}
            onToggleAtoPremiado={(ativo) => setIsAtoPremiadoEnabled(ativo)}
            // "Pgtº à vista" — botão de cabeçalho igual ao do Sinal c/ Morar: aplica
            // o desconto à vista da política, zera o ITBI e quita tudo no Ato. Único
            // botão de à vista em Parcelamento Morar (não existe financiamento/FGTS
            // nessa condição — quitar o Pró-Soluto já é quitar tudo, então o card
            // "Ato (Imóvel)" não precisa de um segundo botão separado ali).
            isPagamentoAVistaActive={isPagamentoAVistaAtivoManual}
            onTogglePagamentoAVista={handleTogglePagamentoAVistaDetails}
            isAVistaActive={isParcelamentoMorar ? undefined : isAVistaActive}
            onToggleAVista={isParcelamentoMorar ? undefined : (ativo) => {
              // Mesmo mecanismo de um Ato (Imóvel) digitado manualmente — só que o valor
              // é calculado automaticamente para o ponto exato que quita o Pró-Soluto,
              // sem tocar preço nem ITBI, ou desfeito para voltar ao fluxo parcelado.
              setValAtoManual(ativo ? atoAVistaTarget : null);
            }}
          >
            {/* 2ª LINHA: 2 COLUNAS IGUAIS (1ª MENSAL 30 DIAS E 2ª MENSAL 60 DIAS) — MESMO LAYOUT EM TODAS AS CONDIÇÕES */}
            {(mensal1Ativa || mensal2Ativa) && (
            <div className={`grid grid-cols-1 ${mensal1Ativa && mensal2Ativa ? 'sm:grid-cols-2' : ''} gap-2.5 pt-1`}>
              {/* 1ª MENSAL (30 DIAS) */}
              {mensal1Ativa && (
              <div className={`p-2.5 rounded-lg border transition-all ${
                isExceededParc2 ? 'bg-red-50/90 border-red-500' : 'bg-slate-50 border-slate-200/80'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <label className={`block text-[10px] font-bold uppercase whitespace-nowrap ${
                    isExceededParc2 ? 'text-red-900' : 'text-slate-500'
                  }`}>
                    1ª Mensal (30 Dias)
                  </label>
                </div>
                <input
                  id="input-primeira-mensal-30d"
                  type="text"
                  value={isEditingParc2 ? parc2InputText : (valParc2 > 0 ? formatCurrency(valParc2) : '')}
                  onFocus={(e) => {
                    setIsEditingParc2(true);
                    setParc2InputText(valParc2 > 0 ? formatForEdit(valParc2) : '');
                    e.target.select();
                  }}
                  onChange={(e) => {
                    setParc2InputText(e.target.value);
                    const parsed = parseFlexibleCurrency(e.target.value);
                    if (parsed >= 0) {
                      setValParc2(parsed);
                    }
                  }}
                  onBlur={(e) => {
                    handleFinishParc2Edit(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleFinishParc2Edit(parc2InputText);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="R$ 0,00"
                  className={`w-full px-2 py-1 rounded-md font-bold text-center text-xs transition-all focus:outline-none whitespace-nowrap ${
                    isExceededParc2
                      ? 'bg-red-100 border-2 border-red-500 text-red-900 focus:border-red-600'
                      : 'bg-white border border-slate-200 text-slate-800 focus:border-morar-600'
                  }`}
                />
                {isExceededParc2 && (
                  <div className="mt-1.5 flex items-center gap-1 text-[9.5px] font-bold text-rose-700 bg-rose-50 p-1 rounded border border-rose-400">
                    <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                    <span>Atenção: parcela excede {tetoMensal1.texto} (máx: {formatCurrency(tetoMensal1.teto)})!</span>
                  </div>
                )}
              </div>

              )}

              {/* 2ª MENSAL (60 DIAS) */}
              {mensal2Ativa && (
              <div className={`p-2.5 rounded-lg border transition-all ${
                isExceededParc3 ? 'bg-red-50/90 border-red-500' : 'bg-slate-50 border-slate-200/80'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <label className={`block text-[10px] font-bold uppercase whitespace-nowrap ${
                    isExceededParc3 ? 'text-red-900' : 'text-slate-500'
                  }`}>
                    2ª Mensal (60 Dias)
                  </label>
                </div>
                <input
                  id="input-segunda-mensal-60d"
                  type="text"
                  value={isEditingParc3 ? parc3InputText : (valParc3 > 0 ? formatCurrency(valParc3) : '')}
                  onFocus={(e) => {
                    setIsEditingParc3(true);
                    setParc3InputText(valParc3 > 0 ? formatForEdit(valParc3) : '');
                    e.target.select();
                  }}
                  onChange={(e) => {
                    setParc3InputText(e.target.value);
                    const parsed = parseFlexibleCurrency(e.target.value);
                    if (parsed >= 0) {
                      setValParc3(parsed);
                    }
                  }}
                  onBlur={(e) => {
                    handleFinishParc3Edit(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleFinishParc3Edit(parc3InputText);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="R$ 0,00"
                  className={`w-full px-2 py-1 rounded-md font-bold text-center text-xs transition-all focus:outline-none whitespace-nowrap ${
                    isExceededParc3
                      ? 'bg-red-100 border-2 border-red-500 text-red-900 focus:border-red-600'
                      : 'bg-white border border-slate-200 text-slate-800 focus:border-morar-600'
                  }`}
                />
                {isExceededParc3 && (
                  <div className="mt-1.5 flex items-center gap-1 text-[9.5px] font-bold text-rose-700 bg-rose-50 p-1 rounded border border-rose-400">
                    <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                    <span>Atenção: parcela excede {tetoMensal2.texto} (máx: {formatCurrency(tetoMensal2.teto)})!</span>
                  </div>
                )}
              </div>
              )}
            </div>
            )}

          </FluxoEntradaConstrutora>
          )}

          {/* BLOCO 3: PARCELAMENTO PRÓ-SOLUTO / BANCO DIRETO — OU PARCELAMENTO MORAR */}
          {telaSettings.mostrarBloco3 && (isParcelamentoMorar ? (
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-morar-50 text-morar-600">
                    <Coins className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    3. Parcelamento Morar
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                  {pm.nMensaisObra} meses de obra
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {/* MENSAL DE OBRA: PRIMEIRO QUADRO DO PARCELAMENTO MORAR */}
                <div className={`p-2.5 rounded-lg border ${pm.excedeRiscoRenda || pm.abaixoParcelaMinimaMensalObra ? 'bg-rose-50/60 border-rose-300' : 'bg-slate-50 border-slate-200/80'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Mensal de Obra</span>
                    {pmMensalObraDataInicio && (
                      <span className="text-[9.5px] text-slate-400 font-semibold">A partir de {pmMensalObraDataInicio}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-1.5">
                    <PmCampoEditavel
                      label="Qtd. Meses"
                      tipo="inteiro"
                      maximo={pmMesesObraAuto}
                      value={pmMesesObraQtd}
                      onCommit={setPmMesesObraManual}
                      onShowToast={onShowToast}
                    />
                    <PmCampoEditavel
                      label="Valor da Parcela"
                      tipo="moeda"
                      minimo={currentCond?.pmParcelaMinimaMensalObra ?? 200}
                      value={pm.valorMensalObra}
                      onCommit={setPmMensalObraValorManual}
                      onShowToast={onShowToast}
                    />
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 whitespace-nowrap">Valor Total</label>
                      <div className="w-full bg-white px-2 py-1.5 rounded-md border border-slate-200 font-bold text-slate-900 text-center text-xs">
                        {formatCurrency(pm.valorMensalObraTotal)}
                      </div>
                    </div>
                  </div>
                  {pm.excedeRiscoRenda && (
                    <div className="mt-1.5 flex items-center gap-1 text-[9.5px] font-bold text-rose-700 bg-rose-100/70 p-1 rounded border border-rose-300">
                      <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                      <span>Compromete mais de {currentCond?.riscoRendaPct ?? 40}% da renda bruta informada.</span>
                    </div>
                  )}
                  {pm.abaixoParcelaMinimaMensalObra && !pm.excedeRiscoRenda && (
                    <div className="mt-1.5 flex items-center gap-1 text-[9.5px] font-bold text-rose-700 bg-rose-100/70 p-1 rounded border border-rose-300">
                      <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                      <span>Abaixo da parcela mínima configurada na política.</span>
                    </div>
                  )}
                  {pmObraReduzida && (
                    <div className="mt-1.5 flex items-center gap-1 text-[9.5px] font-bold text-morar-700 bg-morar-50 p-1 rounded border border-morar-200">
                      <AlertTriangle className="w-3 h-3 text-morar-600 shrink-0" />
                      <span>Prazo reduzido do sugerido ({pmMesesObraAuto} meses) — Pós-Obra zerado automaticamente.</span>
                    </div>
                  )}
                </div>

                {/* INTERMEDIÁRIAS SEMESTRAIS: CADA UMA LIGADA/DESLIGADA INDIVIDUALMENTE */}
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Intermediárias Semestrais (Jun/Dez)</span>
                  {pmSemestraisDatasAuto.length > 0 && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                      {pmSemestraisQtdEfetiva}/{pmSemestraisDatasAuto.length}X
                    </span>
                  )}
                </div>

                {pmSemestraisDatas.map((dataStr, idx) => {
                  const semestralAtiva = pmSemestralIndividualEnabled[idx] !== false;
                  const semestralRank = pmSemestraisEnabledIdxs.indexOf(idx);
                  const semestralValorAtual = semestralRank >= 0 ? (pm.valoresSemestrais[semestralRank] ?? 0) : 0;
                  return (
                    <div key={idx} className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 ${semestralAtiva ? 'bg-slate-50 border-slate-200/80' : 'bg-slate-50/60 border-slate-200/60 opacity-60'}`}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={semestralAtiva}
                          onChange={(e) => setPmSemestralIndividualEnabled(prev => ({ ...prev, [idx]: e.target.checked }))}
                          className="rounded text-morar-600 focus:ring-morar-600 cursor-pointer"
                        />
                        <div>
                          <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Semestral {idx + 1}</span>
                          <input
                            type="month"
                            disabled={!semestralAtiva}
                            value={dataStr.slice(0, 7)}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPmSemestralDatasManual(prev => ({ ...prev, [idx]: val }));
                            }}
                            className="bg-white px-2 py-1 rounded-md border border-slate-200 font-semibold text-slate-700 text-xs focus:outline-none focus:border-morar-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </div>
                      </label>
                      {semestralAtiva && (
                        <div className="w-32">
                          <PmCampoEditavel
                            label="Valor"
                            tipo="moeda"
                            minimo={currentCond?.pmParcelaMinimaSemestral ?? 200}
                            value={semestralValorAtual}
                            onCommit={(novoValor) => {
                              setPmSemestralValorManual(prev => {
                                const next = { ...prev };
                                if (novoValor === null) {
                                  delete next[idx];
                                } else {
                                  next[idx] = novoValor;
                                }
                                return next;
                              });
                            }}
                            onShowToast={onShowToast}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* PARCELA FINAL (CHAVES) — LIGAR/DESLIGAR; O VENCIMENTO VEM DA POLÍTICA, NÃO É EDITÁVEL AQUI */}
                <div className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 ${pmChavesEnabled ? 'bg-amber-50 border-amber-200/80' : 'bg-slate-50 border-slate-200/80'}`}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pmChavesEnabled}
                      onChange={(e) => setPmChavesEnabled(e.target.checked)}
                      className="rounded text-morar-600 focus:ring-morar-600 cursor-pointer"
                    />
                    <div>
                      <span className={`block text-[10px] font-bold uppercase ${pmChavesEnabled ? 'text-amber-700' : 'text-slate-500'}`}>Parcela Chaves</span>
                      {pmChavesEnabled && chavesVencimentoStr && (
                        <span className="block text-[9.5px] text-amber-600 font-semibold mt-0.5">{chavesVencimentoStr}</span>
                      )}
                    </div>
                  </label>
                  {pmChavesEnabled && (
                    <div className="w-32">
                      <PmCampoEditavel
                        label="Valor"
                        tipo="moeda"
                        colorClass="text-amber-800"
                        value={pm.valorChaves}
                        onCommit={setPmChavesValorManual}
                        onShowToast={onShowToast}
                      />
                    </div>
                  )}
                </div>

                {/* PARCELAMENTO PÓS-OBRA — ZERADO AUTOMATICAMENTE SE O PRAZO DE OBRA FOI REDUZIDO */}
                <div className={`p-2.5 rounded-lg border ${pmObraReduzida ? 'bg-slate-50/60 border-slate-200/60 opacity-60' : 'bg-slate-50 border-slate-200/80'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Pós-Obra</span>
                    {!pmObraReduzida && pmPosObraDataInicio && (
                      <span className="text-[9.5px] text-slate-400 font-semibold">A partir de {pmPosObraDataInicio}</span>
                    )}
                  </div>
                  {pmObraReduzida ? (
                    <div className="text-[10px] text-slate-500 font-semibold text-center py-2">
                      Não utilizado — prazo de obra reduzido do sugerido.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-1.5">
                      <PmCampoEditavel
                        label="Qtd. Meses"
                        tipo="inteiro"
                        value={pmPosObraQtd}
                        onCommit={setPmQtdPosObraManual}
                        onShowToast={onShowToast}
                      />
                      <PmCampoEditavel
                        label="Valor da Parcela"
                        tipo="moeda"
                        minimo={currentCond?.pmParcelaMinimaPosObra ?? 200}
                        value={pm.valorPosObraParcela}
                        onCommit={setPmPosObraValorManual}
                        onShowToast={onShowToast}
                      />
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 whitespace-nowrap">Valor Total</label>
                        <div className="w-full bg-white px-2 py-1.5 rounded-md border border-slate-200 font-bold text-slate-900 text-center text-xs">
                          {formatCurrency(pm.valorPosObraTotal)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-xs pt-0.5">
                <div className="flex justify-between items-center border-b border-slate-100 pb-1.5 px-1">
                  <span className="text-slate-500 font-medium">Total Fase Obra (mensais + semestrais):</span>
                  <strong className="text-slate-900 font-bold">{formatCurrency(pm.valorMensalObraTotal + pm.totalSemestrais)}</strong>
                </div>

                <div className="flex justify-between items-center border-b border-slate-100 pb-1.5 px-1">
                  <span className="text-slate-500 font-medium">Total Pós-Obra:</span>
                  <strong className="text-slate-900 font-bold">{formatCurrency(pm.valorPosObraTotal)}</strong>
                </div>

                {/* TARJA SUBTOTAL ATÉ AS CHAVES */}
                <div className="flex justify-between items-center bg-morar-50 px-3 py-2 rounded-lg border border-morar-200 mt-1">
                  <span className="text-xs font-semibold text-slate-700">
                    Subtotal até as Chaves: <span className="text-[10.5px] font-normal text-slate-500">({pm.pctSubtotalAteChaves.toFixed(1)}% do imóvel)</span>
                  </span>
                  <strong className="text-sm sm:text-base font-bold text-morar-700">{formatCurrency(pm.subtotalAteChaves)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-morar-50 text-morar-600">
                    <Coins className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    3. Parcelamento Pró-Soluto / Banco Direto
                  </h3>
                </div>
              </div>

              {/* FAIXA DE AMORTIZAÇÃO E JUROS */}
              <div className="flex justify-between items-center text-[10px] text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span>Amortização: <strong className="text-slate-700 font-semibold">Tabela Price</strong></span>
                <span>Juros: <strong className="text-morar-700 font-bold">{appliedRatePct.toFixed(2)}% a.m.</strong></span>
              </div>

              <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2.5 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-center">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Qtd. Mensais
                  </label>
                  <div className="flex items-center justify-center">
                    <MonthStepper
                      total={qtdMensais}
                      onChange={setQtdMensais}
                      min={parcelasMinimasCond}
                      max={limiteMaximoParcelas}
                      colorClass="bg-white border-morar-200 text-morar-600"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-center">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">1ª Parcela</span>
                  <strong className="text-slate-900 font-bold text-xs sm:text-sm block mt-1">
                    {formatCurrency(parcela)}
                  </strong>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-center">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Última Parcela</span>
                  <strong className="text-slate-900 font-bold text-xs sm:text-sm block mt-1">
                    {formatCurrency(parcela)}
                  </strong>
                </div>
              </div>

              <div className="space-y-1.5 text-xs pt-0.5">
                <div className="flex justify-between items-center border-b border-slate-100 pb-1.5 px-1">
                  <span className="text-slate-500 font-medium">
                    Despesas Cartorárias & ITBI<span className="ml-1 text-[11px] text-slate-400 font-normal">(Total: {formatCurrency(valorTotalITBI)}):</span>
                  </span>
                  <strong className="text-slate-800 font-semibold">{formatCurrency(saldoITBI)}</strong>
                </div>

                <div className="flex justify-between items-center border-b border-slate-100 pb-1.5 px-1">
                  <span className="text-slate-500 font-medium">Pró-Soluto (Sinal Restante):</span>
                  <strong className="text-slate-900 font-bold">{formatCurrency(proSoluto)}</strong>
                </div>

                {/* TARJA PRÓ-SOLUTO TOTAL C/ ITBI */}
                <div className="flex justify-between items-center bg-morar-50 px-3 py-2 rounded-lg border border-morar-200 mt-1">
                  <span className="text-xs font-semibold text-slate-700">Pró-Soluto Total c/ ITBI:</span>
                  <strong className="text-sm sm:text-base font-bold text-morar-700">{formatCurrency(proSolutoTotalPainel)}</strong>
                </div>
              </div>
            </div>
          ))}

          {/* COMISSÃO A PAGAR — só na condição "Sinal c/ Banco Direto (Comissão Apartada)".
              Parcelamento simples e independente: não passa por taxa bancária nem por
              nenhum limite de risco, e não altera o Ato nem o Pró-Soluto (já saem líquidos
              dela, ver comissaoApartadaValor). */}
          {isComissaoApartada && (
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-fuchsia-50 text-fuchsia-600">
                    <Coins className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Comissão a Pagar
                  </h3>
                </div>
                {comissaoParcelasManual !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setComissaoParcelasManual(null);
                      const padrao = currentCond?.comissaoApartadaParcelas ?? 6;
                      onShowToast(`Parcelas da comissão restauradas para o padrão da política (${padrao}x).`);
                    }}
                    className="px-2 py-1 bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700 rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer shrink-0"
                    title="Restaurar Qtd. Parcelas para o padrão da política"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Padrão</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2.5 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-center">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Comissão Total</span>
                  <strong className="text-slate-900 font-bold text-xs sm:text-sm block mt-1">
                    {formatCurrency(comissaoApartadaValor)}
                  </strong>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-center">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Qtd. Parcelas
                  </label>
                  <div className="flex items-center justify-center">
                    <MonthStepper
                      total={comissaoApartadaParcelasQtd}
                      onChange={setComissaoParcelasManual}
                      min={minComissaoParcelas}
                      max={maxComissaoParcelas}
                      unitLabel="parcela"
                      colorClass="bg-white border-fuchsia-200 text-fuchsia-700"
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 font-medium mt-1">
                    Permitido de {minComissaoParcelas} a {maxComissaoParcelas} parcelas
                  </p>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-center">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Valor da Parcela</span>
                  <strong className="text-slate-900 font-bold text-xs sm:text-sm block mt-1">
                    {formatCurrency(comissaoApartadaParcelaValor)}
                  </strong>
                </div>
              </div>

              <p className="text-[10px] text-slate-500 leading-relaxed px-1">
                Parcelamento simples, sem taxa bancária nem limites de risco — só divide a comissão pelo número de parcelas. Não afeta o Ato, o Pró-Soluto nem os indicadores de comprometimento de renda exibidos nesta ficha.
              </p>
            </div>
          )}

        </div>

      </div>
        </div>
      </div>

      {/* RODAPÉ: AVISO LEGAL FULL-WIDTH (ABAIXO DO GRID DE 2 COLUNAS) */}
      <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 text-xs text-amber-900 leading-relaxed text-justify shadow-sm">
        <strong>Informações importantes:</strong> Estas informações referem-se apenas a uma simulação comercial e análise preliminar de crédito. As condições finais da operação e a efetivação dos resultados dependem de análise e aprovação formal junto ao agente financeiro e à construtora.
      </div>

      {/* MODAL DE EXPORTAÇÃO PDF */}
      {currentProd && currentCond && (
        <PdfExportModal
          isOpen={isPdfModalOpen}
          onClose={() => setIsPdfModalOpen(false)}
          pdfSettings={pdfSettings}
          product={currentProd}
          condition={currentCond}
          simulationData={simulationData}
          selectedTorre={selectedTorre}
          selectedUnidade={selectedUnidade}
          fase={fase}
          tipologia={tipologia}
          areaPriv={areaPriv}
          areaQuintal={areaQuintal}
          price={price}
          precoTabelaOriginal={precoTabelaLista}
          descontoConstrutora={descontoConstrutora}
            cartaNaManga={cartaNaMangaEfetiva}
          evaluation={evaluation}
          deliveryText={deliveryText}
          income={income}
          subsidyEfetivo={displaySubsidy}
          fgtsEfetivo={displayFgts}
          descontoAto={displayDescontoAto}
          maxFinanc={displayMaxFinanc}
          totalNegocEfetivo={displayTotalNegoc}
          sinalTotal={displaySinalTotal}
          despCartoriasEfetivas={despCartoriasEfetivas}
          atoAposMensais={isParcelamentoMorar ? pm.atoEfetivo : atoAposMensais}
          atoITBIValidado={atoITBIValidado}
          mostrarMensal1={mensal1Ativa}
          mostrarMensal2={mensal2Ativa}
          valParc2={mensal1Ativa ? valParc2 : 0}
          valParc3={mensal2Ativa ? valParc3 : 0}
          qtdMensais={qtdMensais}
          appliedRatePct={appliedRatePct}
          parcela={parcela}
          valorTotalITBI={valorTotalITBI}
          saldoITBI={saldoITBI}
          proSoluto={proSoluto}
          proSolutoTotalPainel={proSolutoTotalPainel}
          baseVendaLiquidaComITBI={displayBaseLiquida}
          baseRendaInformada={baseRendaInformada}
          pctRiscoParcelaRenda={displayPctRiscoParcelaRenda}
          valorRiscoParcela={displayValorRiscoParcela}
          pctRiscoProSoluto={displayPctRiscoProSoluto}
          valorRiscoProSoluto={displayValorRiscoProSoluto}
          isParcelamentoMorar={isParcelamentoMorar}
          pmValorMensalObra={pm.valorMensalObra}
          pmNMensaisObra={pm.nMensaisObra}
          pmValorMensalObraTotal={pm.valorMensalObraTotal}
          pmMensalObraDataInicio={pmMensalObraDataInicio}
          pmSemestraisList={pmSemestraisList}
          pmChavesEnabled={pmChavesEnabled}
          pmValorChaves={pm.valorChaves}
          pmChavesVencimento={chavesVencimentoStr}
          pmQtdParcelasPosObra={pm.qtdParcelasPosObra}
          pmValorPosObraParcela={pm.valorPosObraParcela}
          pmValorPosObraTotal={pm.valorPosObraTotal}
          pmPosObraDataInicio={pmPosObraDataInicio}
          pmSubtotalAteChaves={pm.subtotalAteChaves}
          pmPctSubtotalAteChaves={pm.pctSubtotalAteChaves}
          pmComprometimentoData={pmComprometimentoData}
        />
      )}

    </div>
  );
};

