import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  RotateCcw,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Coins,
  Receipt,
  FileCheck2,
  Building,
  Check,
  PieChart
} from 'lucide-react';
import { ActiveTab, Cargo, CommercialCondition, PdfConditionKind, PdfExportSettings, Product, SelectedUnit, SimulationData, TelaVisibilitySettings } from '../types';
import { formatCurrency, formatM2, formatArea, parseCurrency, formatDeliveryText, formatForEdit, isTabelaVencida, formatDateBr } from '../utils/formatters';
import { calculatePolicyRiskValues, ensureProductConditions, decomposeMorarMonths, calculateMorarFlowEngine, resolverDescontoEComissaoApartada, resolverTetoAtoComDesconto, resolveConditionForTorre, getConditionKind } from '../utils/calculations';
import { DEFAULT_PDF_EXPORT_SETTINGS } from '../utils/pdfExport';
import { DEFAULT_TELA_VISIBILITY_SETTINGS } from '../utils/telaVisibility';
import { pdfPermissoesService } from '../services/pdfPermissoesService';
import { telaVisibilidadeService } from '../services/telaVisibilidadeService';
import { PdfExportModalMorar, MorarFaixa } from './PdfExportModalMorar';
import { NovatoSimuladorView } from './NovatoSimuladorView';
import { MonthStepper } from './MonthStepper';
import { FichaMorarTopBar } from './FichaMorarTopBar';
import { FichaMorarActionBar } from './FichaMorarActionBar';
import { FichaMorarProdutoGrid } from './FichaMorarProdutoGrid';
import { EmptySimulationNotice } from './EmptySimulationNotice';
import { FluxoEntradaConstrutora } from './FluxoEntradaConstrutora';
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';

import { imoveisService } from '../services/imoveisService';

interface FichaMorarProps {
  product: Product | null;
  condition: CommercialCondition | null;
  products?: Product[];
  currentDate?: string;
  onSelectProduct?: (product: Product, conditionId: string) => void;
  // targetTab (opcional) é resolvido pelo próprio dropdown de condição do
  // cabeçalho (FichaMorarTopBar) quando a opção escolhida é uma variante
  // "**" — ver handleConditionDropdownChange abaixo e CONDICOES_APP.
  onSelectCondition?: (condition: CommercialCondition, targetTab?: ActiveTab) => void;
  simulationData: SimulationData;
  selectedUnits: Record<string, SelectedUnit>;
  onUnitSelectChange: (productId: string, unit: SelectedUnit) => void;
  onBackToSimulator: () => void;
  onNavigateToImport: (productId: string) => void;
  onShowToast: (message: string) => void;
  // Cargo de quem está logado — decide o que aparece no PDF exportado,
  // conforme a política que o Administrador definiu em "Configurar
  // Exportação de PDF" (ver pdfPermissoesService.ts).
  cargoUsuario: Cargo;
  // true quando o usuário navegou pela aba 'ficha-morar-simplificada' (ver
  // App.tsx e config/telasApp.ts) — troca o editor completo por
  // NovatoSimuladorView, uma visão simplificada (visual de Ficha Exportada)
  // com um subconjunto restrito de campos editáveis. Não depende do cargo:
  // qualquer perfil liberado pelo Administrador para essa tela (política de
  // "Editar cargo e permissões") pode navegar até aqui. Nenhum cálculo muda —
  // a visão simplificada reusa os mesmos state/handlers já computados abaixo,
  // só a apresentação (JSX) é diferente.
  isNovato?: boolean;
  // Condições comerciais liberadas para o dropdown do usuário logado (ver
  // CONDICOES_APP em config/telasApp.ts) — repassado ao FichaMorarTopBar
  // para filtrar as opções do seletor de condição do cabeçalho, mesma regra
  // já aplicada ao dropdown "Selecionar Condição" do Simulador. `undefined`
  // = sem restrição (Administrador).
  condicoesLiberadas?: string[];
}

export const FichaMorar: React.FC<FichaMorarProps> = ({
  product,
  condition,
  products = [],
  currentDate,
  onSelectProduct,
  onSelectCondition,
  simulationData,
  selectedUnits,
  onUnitSelectChange,
  onBackToSimulator,
  onNavigateToImport,
  onShowToast,
  cargoUsuario,
  isNovato = false,
  condicoesLiberadas
}) => {
  // Produto e Condição atuais com fallback para o primeiro disponível
  const currentProd = useMemo(() => {
    if (product) return product;
    if (products && products.length > 0) return products[0];
    return null;
  }, [product, products]);

  // Tabela vencida (data final de validade já passou em relação ao "Hoje é"
  // do cabeçalho) = trata como se não houvesse unidades nenhuma, bloqueando a
  // simulação com preços desatualizados até uma tabela nova ser importada.
  const tabelaVencida = isTabelaVencida(currentProd?.tableInfo?.validTo, currentDate);

  const [selectedTorre, setSelectedTorre] = useState<string>('');

  // Condição base (1ª Fase) selecionada para o produto atual.
  const baseCond = useMemo(() => {
    if (!currentProd) return null;
    const prodWithConds = ensureProductConditions({ ...currentProd });
    if (condition) {
      const match = prodWithConds.conditions.find(c => c.id === condition.id);
      if (match) return match;
    }
    return prodWithConds.conditions[0] || null;
  }, [currentProd, condition]);

  // Condição efetiva já resolvida para a torre selecionada: se a torre estiver
  // marcada como 2ª Fase na política, os parâmetros de fase2Params sobrescrevem
  // os da condição base. Todos os pontos de leitura de currentCond?.X abaixo
  // ficam automaticamente corretos por fase, sem precisar de edição individual.
  const currentCond = useMemo(() => (
    resolveConditionForTorre(baseCond, selectedTorre)
  ), [baseCond, selectedTorre]);

  // Precisa estar disponível cedo (usado no carregamento de configurações de
  // visibilidade/PDF por cargo, antes do restante da lógica de comissão abaixo).
  const isComissaoApartada = getConditionKind(currentCond?.name) === 'sinal-morar-comissao-apartada';

  // Quantidade de meses de cada balde (1 a 6), configurável na política de crédito.
  // Padrão 12 meses cada quando não definido (compatibilidade retroativa).
  const serieMesesCapacidades = useMemo<[number, number, number, number, number, number]>(() => [
    currentCond?.serie1Meses ?? 12,
    currentCond?.serie2Meses ?? 12,
    currentCond?.serie3Meses ?? 12,
    currentCond?.serie4Meses ?? 12,
    currentCond?.serie5Meses ?? 12,
    currentCond?.serie6Meses ?? 12
  ], [currentCond]);
  const [selectedUnidade, setSelectedUnidade] = useState<string>('');

  // Chave de configuração (PdfConditionKind) usada para buscar tanto o PDF
  // quanto a visibilidade na tela — a versão simplificada (isNovato) tem suas
  // PRÓPRIAS chaves ('simulador-simplificado'/'...-comissao-apartada'),
  // configuráveis pelo Administrador independente da tela completa, mesmo
  // usando a mesma condição comercial por trás (ver types.ts/PdfConditionKind).
  const condicaoKindParaConfig: PdfConditionKind = isNovato
    ? (isComissaoApartada ? 'simulador-simplificado-comissao-apartada' : 'simulador-simplificado')
    : (isComissaoApartada ? 'sinal-morar-comissao-apartada' : 'sinal-morar');

  // O que este cargo pode ver no PDF exportado — definido pelo Administrador
  // em "Configurar Exportação de PDF". Começa mostrando tudo até a busca
  // terminar, pra nunca travar a exportação.
  const [pdfSettings, setPdfSettings] = useState<PdfExportSettings>(DEFAULT_PDF_EXPORT_SETTINGS);
  useEffect(() => {
    let cancelado = false;
    pdfPermissoesService.carregarConfiguracaoParaExportar(cargoUsuario, condicaoKindParaConfig)
      .then(settings => { if (!cancelado) setPdfSettings(settings); });
    return () => { cancelado = true; };
  }, [cargoUsuario, condicaoKindParaConfig]);

  // O que este cargo pode ver NA TELA (independente do PDF) — definido pelo
  // Administrador em "Configurar Visibilidade dos Quadros".
  const [telaSettings, setTelaSettings] = useState<TelaVisibilitySettings>(DEFAULT_TELA_VISIBILITY_SETTINGS);
  useEffect(() => {
    let cancelado = false;
    telaVisibilidadeService.carregarConfiguracaoParaTela(cargoUsuario, condicaoKindParaConfig)
      .then(settings => { if (!cancelado) setTelaSettings(settings); });
    return () => { cancelado = true; };
  }, [cargoUsuario, condicaoKindParaConfig]);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [isFirstHomeLocal, setIsFirstHomeLocal] = useState<boolean>(simulationData.isFirstHome ?? true);

  // Estados dos Blocos de Pagamento Morar
  const [dataAto, setDataAto] = useState<string>('agosto, 2026');
  const [valAtoManual, setValAtoManual] = useState<number | null>(null);
  const [atoInputText, setAtoInputText] = useState<string>('');
  const [isEditingAto, setIsEditingAto] = useState<boolean>(false);

  // Estados dos Cards de ITBI no Ato e Ato Premiado (Padronizados)
  const [valAtoITBI, setValAtoITBI] = useState<number>(0);
  const [itbiAtoInputText, setItbiAtoInputText] = useState<string>('');
  const [isEditingAtoITBI, setIsEditingAtoITBI] = useState<boolean>(false);
  // Piso digitado pelo CORRETOR em "ITBI no Ato" (null = nenhum, valor exibido
  // é 100% sugestão automática do motor). Diferente de reaproveitar o próprio
  // valAtoITBI como piso: valAtoITBI pode estar temporariamente elevado por
  // uma sugestão automática anterior, e usá-lo como piso faria esse valor
  // elevado "grudar" para sempre. Guardando o piso manual à parte, o motor
  // sempre recomeça a conta do piso VERDADEIRO (este valor, ou 0 se nenhum) a
  // cada recálculo — por isso o valor sugerido consegue subir E DESCER
  // livremente conforme a Qtd. Meses muda, nunca abaixo do que o corretor
  // digitou de propósito.
  const [itbiAtoManualFloor, setItbiAtoManualFloor] = useState<number | null>(null);
  const [isAtoPremiadoEnabled, setIsAtoPremiadoEnabled] = useState<boolean>(true);
  // Comissão Apartada — só tem efeito na condição "Sinal c/ Morar (Comissão
  // Apartada)" (ver getConditionKind). Controle manual da quantidade de
  // parcelas da comissão, editável na própria ficha (sugestão inicial vem da
  // política em currentCond.comissaoApartadaParcelas).
  const [comissaoParcelasManual, setComissaoParcelasManual] = useState<number | null>(null);
  // Pagamento à vista: aplica o % de Desconto à Vista da política sobre o
  // Preço de Tabela (antes de qualquer outro cálculo), zera o ITBI (que passa
  // a ser responsabilidade do cliente após o Habite-se) e traz o Sinal
  // necessário inteiro para o Ato (Imóvel), zerando o Pró-Soluto.
  const [isPagamentoAVistaEnabled, setIsPagamentoAVistaEnabled] = useState<boolean>(false);

  // Faixas de Obra (INCC) - Padrão Morar: 12x, 12x, 9x, 0x (Total 33 meses)
  const [dataObra, setDataObra] = useState<string>('setembro, 2026');
  const [faixasObra, setFaixasObra] = useState<MorarFaixa[]>([
    { qtd: 12, valor: 0 },
    { qtd: 12, valor: 0 },
    { qtd: 9, valor: 0 },
    { qtd: 0, valor: 0 }
  ]);
  const [isManualObra, setIsManualObra] = useState<boolean>(false);

  // Faixas de Pós-Obra (IPCA+1%) - Padrão Morar: 3x, 12x, 12x, 0x (Total 27 meses)
  const [dataPos, setDataPos] = useState<string>('junho, 2029');
  const [faixasPos, setFaixasPos] = useState<MorarFaixa[]>([
    { qtd: 3, valor: 0 },
    { qtd: 12, valor: 0 },
    { qtd: 12, valor: 0 },
    { qtd: 0, valor: 0 }
  ]);
  const [isManualPos, setIsManualPos] = useState<boolean>(false);

  // Taxas e Registro (IGPM+1%) — o total de ITBI não é editável pela tela,
  // sempre o calculado a partir do preço/tabela (despCartoriasCalculadas
  // mais abaixo); `itbiTotalManual` continua existindo só porque o cálculo
  // ainda o consulta, mas sem nenhum campo de tela chamando o setter, fica
  // sempre `null`.
  const [dataITBI, setDataITBI] = useState<string>('setembro, 2026');
  const [itbiTotalManual, setItbiTotalManual] = useState<number | null>(null);

  // Nada neste bloco é editável pela tela — a quantidade de parcelas do ITBI
  // sempre acompanha a quantidade real de parcelas de Obra/Pós-Obra
  // (itbiObraTotalMeses/itbiPosTotalMeses, calculados mais abaixo a partir de
  // totalParcObra/totalParcPos), e o valor de cada parcela é sempre o que o
  // aplicativo calcula (itbiParcelaObraValor/itbiParcelaPosValor).
  // `itbiObraValorManual`/`itbiPosValorManual` continuam existindo só porque
  // o cálculo abaixo ainda os consulta; sem nenhum campo de tela chamando os
  // setters, ficam sempre `null`.
  const [itbiObraValorManual, setItbiObraValorManual] = useState<number | null>(null);
  const [itbiPosValorManual, setItbiPosValorManual] = useState<number | null>(null);



  // Sincronizar isFirstHomeLocal
  useEffect(() => {
    setIsFirstHomeLocal(simulationData.isFirstHome ?? true);
  }, [simulationData.isFirstHome]);

  // Sincronizar seleção de torre/unidade
  useEffect(() => {
    if (currentProd) {
      const saved = selectedUnits[currentProd.id];
      if (saved && (saved.torre || saved.unidade)) {
        setSelectedTorre(saved.torre || '');
        setSelectedUnidade(saved.unidade || '');
      } else {
        setSelectedTorre('');
        setSelectedUnidade('');
      }
    }
  }, [currentProd?.id, selectedUnits]);

  // Atualização e Reset Automático ao Trocar Torre / Unidade
  useEffect(() => {
    setValAtoManual(null);
    setAtoInputText('');
    setIsEditingAto(false);
    setValAtoITBI(0);
    setItbiAtoManualFloor(null);
    setItbiAtoInputText('');
    setIsEditingAtoITBI(false);
    setIsManualObra(false);
    setIsManualPos(false);
    setItbiTotalManual(null);
    setItbiObraValorManual(null);
    setItbiPosValorManual(null);
    // Nova torre/unidade herda a quantidade de parcelas padrão da política —
    // não carrega um ajuste manual feito para a unidade anterior.
    setComissaoParcelasManual(null);
    if (!selectedTorre || !selectedUnidade) {
      setFaixasObra([
        { qtd: 12, valor: 0 },
        { qtd: 12, valor: 0 },
        { qtd: 9, valor: 0 },
        { qtd: 0, valor: 0 }
      ]);
      setFaixasPos([
        { qtd: 3, valor: 0 },
        { qtd: 12, valor: 0 },
        { qtd: 12, valor: 0 },
        { qtd: 0, valor: 0 }
      ]);
    }
  }, [selectedTorre, selectedUnidade]);

  // Limpeza completa ao trocar de produto ou condição comercial
  const prevProdCondKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = currentProd ? `${currentProd.id}::${currentCond?.id || ''}` : null;
    const isRealSwitch = prevProdCondKeyRef.current !== null && prevProdCondKeyRef.current !== key;
    prevProdCondKeyRef.current = key;
    // No mount inicial (ex.: reabertura de uma simulação salva via "Editar"), a torre/unidade
    // já vêm restauradas em selectedUnits — não zera aqui, senão a seleção se perde assim que
    // a ficha monta. Só limpa quando o usuário de fato troca de produto/condição já dentro da ficha.
    if (!isRealSwitch) return;

    setSelectedTorre('');
    setSelectedUnidade('');
    setValAtoManual(null);
    setAtoInputText('');
    setIsEditingAto(false);
    setValAtoITBI(0);
    setItbiAtoManualFloor(null);
    setItbiAtoInputText('');
    setIsEditingAtoITBI(false);
    setIsAtoPremiadoEnabled(true);
    setIsPagamentoAVistaEnabled(false);
    setIsManualObra(false);
    setIsManualPos(false);
    setItbiTotalManual(null);
    setItbiObraValorManual(null);
    setItbiPosValorManual(null);
    // Nova condição comercial herda a quantidade de parcelas padrão dela
    // (comissaoApartadaParcelas) — não carrega um ajuste manual da anterior.
    setComissaoParcelasManual(null);
    setFaixasObra([
      { qtd: 12, valor: 0 },
      { qtd: 12, valor: 0 },
      { qtd: 9, valor: 0 },
      { qtd: 0, valor: 0 }
    ]);
    setFaixasPos([
      { qtd: 3, valor: 0 },
      { qtd: 12, valor: 0 },
      { qtd: 12, valor: 0 },
      { qtd: 0, valor: 0 }
    ]);
    if (currentProd) {
      onUnitSelectChange(currentProd.id, { torre: '', unidade: '' });
    }
  }, [currentProd?.id, currentCond?.id]);

  const [dbUnits, setDbUnits] = useState<any[]>([]);
  const [dbUnitsLoaded, setDbUnitsLoaded] = useState<boolean>(false);

  useEffect(() => {
    setDbUnitsLoaded(false);
    const fetchUnits = () => {
      if (currentProd) {
        imoveisService.listarUnidadesPorEmpreendimento(currentProd.id).then(data => {
          setDbUnits(data || []);
          setDbUnitsLoaded(true);
        });
      }
    };

    fetchUnits();

    window.addEventListener('tabela_atualizada', fetchUnits);
    return () => {
      window.removeEventListener('tabela_atualizada', fetchUnits);
    };
  }, [currentProd?.id]);

  // Unidades "efetivas" para fins de seleção: some por completo quando a
  // tabela está vencida, mesmo que o Supabase ainda tenha as linhas — é o que
  // impede escolher Torre/Unidade e simular com preços desatualizados.
  const dbUnitsEfetivos = tabelaVencida ? [] : dbUnits;

  const uniqueTorres = React.useMemo(() => {
    return (Array.from(new Set(dbUnitsEfetivos.map(u => String(u.torre || '').trim()).filter(t => t !== ''))) as string[])
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [dbUnitsEfetivos]);

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
    // Enquanto a busca das unidades no Supabase ainda está em andamento, availableTorres
    // fica vazio momentaneamente — não podemos usar isso para invalidar uma torre/unidade
    // já restaurada (ex.: reabertura de simulação salva), senão ela é zerada antes dos
    // dados chegarem.
    if (!dbUnitsLoaded) return;

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
          dbUnitsEfetivos
            .filter(u => String(u.torre || '').trim().toLowerCase() === selectedTorre.toLowerCase())
            .map(u => String(u.unidade || '').trim())
            .filter(u => u !== '')
        ));

        const isUnidadeValid = unitsOfCurrent.some(u => String(u).toLowerCase() === selectedUnidade.toLowerCase());
        if (!isUnidadeValid) {
          setSelectedUnidade('');
          onUnitSelectChange(currentProd.id, { torre: selectedTorre, unidade: '' });
        }
      }
    }
  }, [availableTorres, currentProd?.id, currentCond?.id, dbUnitsEfetivos, dbUnitsLoaded]);

  const filteredUnits = selectedTorre
    ? (Array.from(new Set(
        dbUnitsEfetivos
          .filter(u => String(u.torre || '').trim().toLowerCase() === selectedTorre.toLowerCase())
          .map(u => String(u.unidade || '').trim())
          .filter(u => u !== '')
      )) as string[]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    : [];

  const matchingRow = (selectedTorre && selectedUnidade)
    ? dbUnitsEfetivos.find(u =>
        String(u.torre || '').trim().toLowerCase() === selectedTorre.toLowerCase() &&
        String(u.unidade || '').trim().toLowerCase() === selectedUnidade.toLowerCase()
      )
    : null;

  const hasUnitSelected = Boolean(selectedTorre && selectedUnidade && matchingRow);

  // Mapeamento dos atributos vindos do Supabase / Mocks
  const fase = matchingRow ? String(matchingRow.status || '1ª') : '-';
  const tipologia = matchingRow ? String(matchingRow.tipologia || '2 Quartos') : '-';
  const areaPriv = matchingRow ? formatArea(matchingRow.area_privativa) : '0,00 m²';
  const areaQuintal = matchingRow ? formatArea(matchingRow.quintal) : '0,00 m²';

  const precoTabelaOriginal = hasUnitSelected && matchingRow ? Number(matchingRow.preco_tabela || 0) : 0;
  const evaluation = hasUnitSelected && matchingRow ? Number(matchingRow.avaliacao_bancaria || 0) : 0;

  // Desconto à Vista: aplicado sobre o Preço de Tabela ANTES de qualquer outro
  // cálculo do fluxo, então `price` — usado em todo o restante deste
  // componente (motor de cálculo, sinal necessário, teto do Ato etc.) — já sai
  // com o desconto embutido quando o pagamento à vista está ativo.
  const descontoAVistaPctPolitica = currentCond?.descontoAVistaPct ?? 0;
  const valorDescontoAVista = isPagamentoAVistaEnabled && precoTabelaOriginal > 0
    ? Math.round(precoTabelaOriginal * (descontoAVistaPctPolitica / 100) * 100) / 100
    : 0;
  const price = Math.max(0, Math.round((precoTabelaOriginal - valorDescontoAVista) * 100) / 100);

  const itbiValTabela = (hasUnitSelected && matchingRow) 
    ? (isFirstHomeLocal 
        ? Number(matchingRow.itbi_primeiro_imovel || matchingRow.itbi_total || 0) 
        : Number(matchingRow.itbi_segundo_imovel || matchingRow.itbi_total || matchingRow.itbi_primeiro_imovel || 0))
    : 0;

  // Alternar "Com Desconto" / "Sem Desconto" troca o ITBI/Registro lido da tabela
  // (1º x 2º imóvel), que entra tanto na base de risco quanto nas parcelas das
  // séries (o "+ ITBI" de cada mês) e nos totais do fluxo.
  //
  // Sem refazer o fluxo, só a base de risco reagia ao novo ITBI: as parcelas, o
  // "Total com ITBI" e o "Distribuído" continuavam presos ao ITBI anterior,
  // porque os valores de ITBI ficam "travados" em itbiObraValorManual /
  // itbiPosValorManual (cache da última vez que a série foi montada) e porque o
  // efeito de recálculo automático das séries só dispara com valAtoManual ===
  // null e sem override manual de obra/pós.
  //
  // Por isso aqui é aplicado o MESMO reset já usado ao trocar de torre/unidade:
  // é o que o app entende por "refazer todo o cálculo".
  const handleToggleFirstHome = () => {
    setIsFirstHomeLocal(prev => !prev);
    setValAtoManual(null);
    setAtoInputText('');
    setIsEditingAto(false);
    setValAtoITBI(0);
    setItbiAtoManualFloor(null);
    setItbiAtoInputText('');
    setIsEditingAtoITBI(false);
    setIsManualObra(false);
    setIsManualPos(false);
    setItbiTotalManual(null);
    setItbiObraValorManual(null);
    setItbiPosValorManual(null);
  };

  const handleTorreChange = (torre: string) => {
    setSelectedTorre(torre);
    setSelectedUnidade('');
    setIsManualObra(false);
    setIsManualPos(false);
    setItbiTotalManual(null);
    setItbiObraValorManual(null);
    setItbiPosValorManual(null);
    if (currentProd) {
      onUnitSelectChange(currentProd.id, { torre, unidade: '' });
    }
  };

  const handleUnidadeChange = (unidade: string) => {
    setSelectedUnidade(unidade);
    setIsManualObra(false);
    setIsManualPos(false);
    setItbiTotalManual(null);
    setItbiObraValorManual(null);
    setItbiPosValorManual(null);
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

  const handleConditionDropdownChange = (condId: string, targetTab?: ActiveTab) => {
    const targetCond = currentProd.conditions.find(c => c.id === condId);
    if (targetCond && onSelectCondition) {
      onSelectCondition(targetCond, targetTab);
    }
  };

  const handleResetFicha = () => {
    setSelectedTorre('');
    setSelectedUnidade('');
    setValAtoManual(null);
    setAtoInputText('');
    setIsEditingAto(false);
    setValAtoITBI(0);
    setItbiAtoManualFloor(null);
    setItbiAtoInputText('');
    setIsEditingAtoITBI(false);
    setIsAtoPremiadoEnabled(true);
    setIsPagamentoAVistaEnabled(false);
    setIsManualObra(false);
    setIsManualPos(false);
    setItbiTotalManual(null);
    setItbiObraValorManual(null);
    setItbiPosValorManual(null);
    // Nova condição comercial herda a quantidade de parcelas padrão dela
    // (comissaoApartadaParcelas) — não carrega um ajuste manual da anterior.
    setComissaoParcelasManual(null);
    setFaixasObra([
      { qtd: 12, valor: 0 },
      { qtd: 12, valor: 0 },
      { qtd: 9, valor: 0 },
      { qtd: 0, valor: 0 }
    ]);
    setFaixasPos([
      { qtd: 3, valor: 0 },
      { qtd: 12, valor: 0 },
      { qtd: 12, valor: 0 },
      { qtd: 0, valor: 0 }
    ]);
    if (currentProd) {
      onUnitSelectChange(currentProd.id, { torre: '', unidade: '' });
    }
    onShowToast('Ficha Morar limpa com sucesso. Selecione a Torre e Unidade para calcular.');
  };

  // Limpa o fluxo e deixa a sugestão inicial por conta do efeito de
  // "Inicialização inteligente e automática" (mais abaixo) — que só roda
  // DEPOIS que os states abaixo forem commitados pelo React. Chegou a existir
  // aqui uma chamada manual e síncrona a `calculateMorarFlowEngine`, mas ela
  // rodava no MESMO evento em que `isPagamentoAVistaEnabled`/
  // `isAtoPremiadoEnabled` eram desligados/religados — como o React só
  // atualiza esses states no próximo render, a chamada ainda enxergava
  // `price`/`maxFinanc`/`subsidy`/`fgts` com o desconto à vista da rodada
  // anterior, produzindo um Ato que não correspondia a nenhum cenário real
  // (só se corrigia num segundo clique em "Limpar", quando os states já
  // tinham se atualizado). Deixar o efeito automático fazer o recálculo evita
  // esse descompasso, pois ele já roda com os valores frescos.
  const limparFluxoPagamento = () => {
    setValAtoManual(null);
    setAtoInputText('');
    setIsEditingAto(false);
    setValAtoITBI(0);
    setItbiAtoManualFloor(null);
    setItbiAtoInputText('');
    setIsEditingAtoITBI(false);
    setIsAtoPremiadoEnabled(true);
    setIsPagamentoAVistaEnabled(false);
    setIsManualObra(false);
    setIsManualPos(false);
    setItbiTotalManual(null);
    setItbiObraValorManual(null);
    setItbiPosValorManual(null);
    // Volta a Qtd. Parcelas da Comissão Apartada para a sugestão padrão da
    // política (comissaoApartadaParcelas) em vez de manter um ajuste manual.
    setComissaoParcelasManual(null);

    if (onShowToast) {
      onShowToast('Fluxo de pagamento redefinido: Ato (Imóvel), ITBI no Ato e Ato Premiado restaurados.');
    }
  };

  // CÁLCULOS FINANCEIROS E RECURSOS
  const income = simulationData.income || 0;
  const rawSubsidy = hasUnitSelected ? (simulationData.subsidy || 0) : 0;
  const rawFGTS = hasUnitSelected ? (simulationData.fgts || 0) : 0;
  const inputFinancing = simulationData.financing || 0;
  const percent = simulationData.finPercent;
  const maxAllowed = (hasUnitSelected && evaluation > 0) ? (evaluation * percent) : 0;

  // Um Sinal Mínimo de R$ 0,00 configurado explicitamente na política é um
  // piso válido — só cai no padrão de R$ 2.000,00 quando o campo não foi
  // definido (string vazia/undefined).
  const sinalMinimoVal = currentCond?.sinalMinimo ? parseCurrency(currentCond.sinalMinimo) : 2000;
  // % do Ato Premiado desta condição comercial (padrão histórico 10% quando a política
  // não define). 0% desliga o desconto do Ato Premiado nesta condição mesmo com o botão
  // "Ato Premiado" ligado na ficha — comporta-se como se o Ato Premiado estivesse zerado.
  const pctAtoPremiadoCond = currentCond?.atoPremiadoPct ?? 0.10;

  // 1. VALOR BASE: Maior entre Preço de Tabela e Avaliação Bancária
  const valorBase = hasUnitSelected ? Math.max(price, evaluation) : 0;

  // Nunca "inventamos" um valor de financiamento: só usamos exatamente o que
  // foi digitado em "Financiamento Estimado" no Simulador (capado pelo teto
  // do banco/avaliação ou pelo preço, quando aplicável) — se nada foi
  // digitado (ou foi digitado 0), o financiamento considerado é 0, nunca um
  // percentual estimado da avaliação.
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

  const valorAvaliacao = (hasUnitSelected && evaluation > 0) ? evaluation : price;
  const precoTabelaMenosSinalMin = (hasUnitSelected && price > 0) ? Math.max(0, price - sinalMinimoVal) : 0;
  const tetoMaximo = (hasUnitSelected && price > 0)
    ? Math.min(valorAvaliacao, precoTabelaMenosSinalMin)
    : 0;

  const somaRecursos = hasUnitSelected ? (rawMaxFinanc + rawSubsidy + rawFGTS) : 0;
  const totalNegociado = hasUnitSelected ? Math.min(somaRecursos, tetoMaximo) : 0;
  const totalNegoc = totalNegociado;

  let maxFinanc = rawMaxFinanc;
  let fgts = rawFGTS;
  let subsidy = rawSubsidy;

  // Pagamento à vista = 100% recurso próprio do cliente: nenhum financiamento
  // bancário, subsídio ou FGTS é considerado (mesmo que tenha sido digitado no
  // Simulador) — o Ato (Imóvel) absorve o preço com desconto inteiro, e Max
  // Financ./Subsídio/FGTS/Total Negoc. ficam todos em R$ 0,00.
  if (isPagamentoAVistaEnabled) {
    maxFinanc = 0;
    fgts = 0;
    subsidy = 0;
  }

  if (hasUnitSelected && somaRecursos > tetoMaximo) {
    let excesso = somaRecursos - tetoMaximo;
    const abateFinanc = Math.min(maxFinanc, excesso);
    maxFinanc -= abateFinanc;
    excesso -= abateFinanc;

    if (excesso > 0) {
      const abateFGTS = Math.min(fgts, excesso);
      fgts -= abateFGTS;
      excesso -= abateFGTS;
    }

    if (excesso > 0) {
      const abateSubsidy = Math.min(subsidy, excesso);
      subsidy -= abateSubsidy;
      excesso -= abateSubsidy;
    }
  }

  // ITBI / REGISTRO TOTAL (Taxas cartorárias do empreendimento/unidade)
  const despCartoriasCalculadas = hasUnitSelected 
    ? (itbiValTabela > 0 ? itbiValTabela : (price * 0.0441))
    : 0;

  // No pagamento à vista o ITBI não entra na conta: fica zerado e passa a ser
  // responsabilidade do cliente, a partir da obtenção do Habite-se pelo empreendimento.
  const valorTotalITBI = isPagamentoAVistaEnabled
    ? 0
    : (itbiTotalManual !== null ? itbiTotalManual : despCartoriasCalculadas);
  const atoITBIValidado = Math.min(valAtoITBI, valorTotalITBI);
  const saldoITBI = Math.max(0, valorTotalITBI - atoITBIValidado);
  const despCartoriasEfetivas = valorTotalITBI;

  // DIVISÃO POR FASES (OBRA VS PÓS-OBRA)
  const totalParcObra = faixasObra.reduce((acc, f) => acc + (Number(f.qtd) || 0), 0);
  const totalParcPos = faixasPos.reduce((acc, f) => acc + (Number(f.qtd) || 0), 0);
  const totalParcMorar = totalParcObra + totalParcPos;

  // Comissão Apartada — exclusiva da condição "Sinal c/ Morar (Comissão
  // Apartada)". A comissão sai do fluxo de Ato: os limites de risco
  // (Pró-Soluto Global, Teto Pós-Obra) continuam calculados sobre o valor
  // CHEIO, sem desconto de comissão — só o Ato (Imóvel) sugerido/efetivo da
  // construtora sai líquido dela (ver atoLiquidoConstrutora mais abaixo).
  const pctComissaoApartadaCond = currentCond?.comissaoApartadaPct ?? 0.04;

  // Motor Base Morar (sem ato manual) para estabelecer o padrão de piso/sugestão e risco da política
  const morarEngineBase = useMemo(() => {
    if (!hasUnitSelected || price <= 0) return null;
    const mesesObraPadrao = currentCond?.mesesObra ?? 33;
    const mesesObraParam = totalParcObra > 0 ? totalParcObra : mesesObraPadrao;
    const mesesPosParam = totalParcObra < mesesObraPadrao ? 0 : (totalParcPos > 0 ? totalParcPos : (currentCond?.mesesPos ?? 27));

    const globalPct: [number, number, number, number, number, number] = [
      currentCond?.globalSerie1Pct ?? 30.0,
      currentCond?.globalSerie2Pct ?? 25.0,
      currentCond?.globalSerie3Pct ?? 20.0,
      currentCond?.globalSerie4Pct ?? 15.0,
      currentCond?.globalSerie5Pct ?? 10.0,
      currentCond?.globalSerie6Pct ?? 5.0
    ];

    const proSolutoGlobalParam = currentCond?.percMaxProSolutoGlobal ?? currentCond?.riscoImovelPct ?? 17.0;
    const posObraGlobalParam = currentCond?.percMaxPosObra ?? currentCond?.riscoPosPct ?? 8.0;

    return calculateMorarFlowEngine({
      precoTabela: price,
      avaliacaoBanco: evaluation,
      itbiRegistro: despCartoriasEfetivas,
      renda: income,
      financiamento: maxFinanc,
      subsidio: subsidy,
      fgts: fgts,
      percentualRiscoGeral: proSolutoGlobalParam,
      percentualRiscoPos: posObraGlobalParam,
      mesesObra: mesesObraParam,
      mesesPos: mesesPosParam,
      globalSeriesPct: globalPct,
      serieMesesCapacidades: serieMesesCapacidades,
      sinalMinimo: sinalMinimoVal,
      isAtoPremiadoEnabled,
      atoITBI: itbiAtoManualFloor ?? 0,
      atoPremiadoPct: pctAtoPremiadoCond,
      isComissaoApartada,
      pctComissaoApartada: pctComissaoApartadaCond
    });
  }, [hasUnitSelected, price, evaluation, despCartoriasEfetivas, income, maxFinanc, subsidy, fgts, currentCond, sinalMinimoVal, isAtoPremiadoEnabled, itbiAtoManualFloor, totalParcObra, totalParcPos, serieMesesCapacidades, isComissaoApartada, pctComissaoApartadaCond]);

  // Piso do Ato Sugerido Inicial e Saldo de Pró-Soluto padrão
  const atoSugeridoResidual = hasUnitSelected ? (morarEngineBase?.atoResidual ?? 0) : 0;
  const valorAtoEfetivo = valAtoManual !== null ? valAtoManual : atoSugeridoResidual;

  // Desconto do Ato Premiado e Comissão Apartada — exclusiva da condição
  // "Sinal c/ Morar (Comissão Apartada)". A base do desconto é sempre o Ato
  // (Imóvel) já líquido da comissão (nunca o bruto), resolvida no PRÓPRIO
  // motor de cálculo (calculateMorarFlowEngine → calcularAtoMinimoPorPreco em
  // calculations.ts) — única fonte de verdade dessa conta, tanto para o Ato
  // sugerido automaticamente (morarEngineBase) quanto para um Ato digitado
  // manualmente (resolverDescontoEComissaoApartada, mesma matemática).
  const { desconto: descontoAto, comissao: comissaoApartadaValor } = valAtoManual !== null
    ? resolverDescontoEComissaoApartada(valorAtoEfetivo, isAtoPremiadoEnabled, pctAtoPremiadoCond, isComissaoApartada, pctComissaoApartadaCond, precoTabelaOriginal)
    : { desconto: morarEngineBase?.atoPremiado ?? 0, comissao: morarEngineBase?.comissaoApartadaValor ?? 0 };
  // Limites de parcelas da Comissão Apartada, configuráveis por condição
  // comercial em Políticas & Empreendimentos (padrão 1x a 6x).
  const minComissaoParcelas = Math.max(1, currentCond?.comissaoApartadaParcelasMin ?? 1);
  const maxComissaoParcelas = Math.max(minComissaoParcelas, currentCond?.comissaoApartadaParcelasMax ?? (currentCond?.comissaoApartadaParcelas ?? 6));
  const comissaoApartadaParcelasQtd = Math.min(
    maxComissaoParcelas,
    Math.max(minComissaoParcelas, comissaoParcelasManual ?? (currentCond?.comissaoApartadaParcelas ?? 6))
  );
  const comissaoApartadaParcelaValor = comissaoApartadaValor > 0
    ? Math.round((comissaoApartadaValor / comissaoApartadaParcelasQtd) * 100) / 100
    : 0;
  // Ato (Imóvel) líquido da corretagem — na condição Comissão Apartada, a
  // comissão é paga pelo cliente por fora e NÃO compõe o Ato destinado à
  // construtora. `valorAtoEfetivo` (quando sugerido automaticamente) já é o
  // ponto fixo "(Sinal + ITBI) − Pró-Soluto − Desconto Ato Premiado" resolvido
  // pelo motor (ver atoResidual em calculateMorarFlowEngine) — o Ato Premiado
  // continua exibido à parte (card próprio), então aqui só a comissão é
  // deduzida, nunca o desconto do Ato Premiado de novo.
  const atoLiquidoConstrutora = isComissaoApartada
    ? Math.max(sinalMinimoVal, Math.round((valorAtoEfetivo - comissaoApartadaValor) * 100) / 100)
    : valorAtoEfetivo - descontoAto;

  // Teto do Ato (Imóvel): ponto fixo ato* = price - subsidy - desconto(ato*).
  // Não pode usar "descontoAto" acima diretamente pois ele reflete o desconto do
  // Ato ATUAL (sugerido ou já digitado), não o desconto que valeria no próprio teto.
  const valorAtoMaximoCalculado = hasUnitSelected
    ? resolverTetoAtoComDesconto(price - subsidy, isAtoPremiadoEnabled, pctAtoPremiadoCond)
    : 0;

  // =========================================================================
  // CASCATA COMPLETA DE AMORTIZAÇÃO PROGRESSIVA (REGRA MORAR):
  // Quando o Ato (Imóvel) ultrapassa o valor necessário para cobrir o Sinal:
  // Etapa 1 (Pró-Soluto): Zera as parcelas das séries da construtora (R$ 0,00 líquido).
  // Etapa 2 (Amortização do Financiamento): O excedente abate o Financiamento bancário (Total Negoc.).
  // Etapa 3 (Amortização do FGTS): Se o financiamento zerar, o restante abate o FGTS.
  // O Subsídio NUNCA é abatido: o teto do Ato (valorAtoMaximo) é limitado a
  // price - subsidy - descontoAto, então o excedente nunca ultrapassa a 3ª Etapa.
  // =========================================================================
  const sinalImovelInicial = hasUnitSelected ? Math.max(0, Math.round((price - (maxFinanc + subsidy + fgts)) * 100) / 100) : 0;
  const sinalLiquidoImovelNecessario = hasUnitSelected ? Math.max(0, Math.round((sinalImovelInicial - descontoAto) * 100) / 100) : 0;

  // Valor de Ato (Imóvel) que zera exatamente o Pró-Soluto (opção "À Vista"), sem
  // tocar em Financiamento/FGTS — ponto fixo ato* = sinalImovelInicial - desconto(ato*),
  // mesma equação de resolverTetoAtoComDesconto, mas com base no Sinal necessário
  // (antes de abater financiamento/FGTS) em vez de price - subsidy (que é o teto
  // absoluto, usado quando o excedente pode avançar até o FGTS).
  const atoAVistaTarget = hasUnitSelected
    ? resolverTetoAtoComDesconto(sinalImovelInicial, isAtoPremiadoEnabled, pctAtoPremiadoCond)
    : 0;
  const isAVistaActive = hasUnitSelected && valAtoManual !== null && Math.abs(valAtoManual - atoAVistaTarget) < 0.01;

  // 1ª Etapa: Verificação do Pró-Soluto da Construtora e Excedente
  const saldoProSolutoRestante = hasUnitSelected 
    ? Math.max(0, Math.round((sinalLiquidoImovelNecessario - valorAtoEfetivo) * 100) / 100)
    : 0;

  const excedenteAto = hasUnitSelected && valorAtoEfetivo > sinalLiquidoImovelNecessario
    ? Math.max(0, Math.round((valorAtoEfetivo - sinalLiquidoImovelNecessario) * 100) / 100)
    : 0;

  // 2ª Etapa: Abatimento do Financiamento Bancário (Total Negoc. / Financiamento)
  const financiamentoAbatido = Math.min(maxFinanc, excedenteAto);
  const maxFinancEfetivo = Math.max(0, Math.round((maxFinanc - financiamentoAbatido) * 100) / 100);
  const excedenteAposFinanc = Math.max(0, Math.round((excedenteAto - financiamentoAbatido) * 100) / 100);

  // 3ª Etapa: Abatimento do FGTS
  const fgtsAbatido = Math.min(fgts, excedenteAposFinanc);
  const fgtsEfetivo = Math.max(0, Math.round((fgts - fgtsAbatido) * 100) / 100);

  // O Subsídio nunca é abatido pelo Ato (Imóvel): o teto do Ato (valorAtoMaximo,
  // repassado ao FluxoEntradaConstrutora) já é limitado a price - subsidy - descontoAto,
  // então o excedente nunca ultrapassa a 3ª Etapa (FGTS).
  const subsidyEfetivo = subsidy;

  // RATEIO DO ITBI/REGISTRO — a quantidade de meses sempre acompanha a
  // quantidade real de parcelas de Obra/Pós-Obra, sem controle próprio.
  const itbiObraTotalMeses = totalParcObra > 0 ? totalParcObra : 33;
  const itbiPosTotalMeses = totalParcPos;
  const itbiTotalMeses = itbiObraTotalMeses + itbiPosTotalMeses;

  const itbiCalculadoMes = (hasUnitSelected && itbiTotalMeses > 0 && saldoITBI > 0)
    ? Math.round((saldoITBI / itbiTotalMeses) * 100) / 100
    : 0;

  const itbiParcelaObraValor = itbiObraTotalMeses > 0 
    ? (itbiObraValorManual !== null ? itbiObraValorManual : (itbiPosTotalMeses === 0 ? Math.round((saldoITBI / itbiObraTotalMeses) * 100) / 100 : itbiCalculadoMes))
    : 0;
  const itbiParcelaPosValor = itbiPosTotalMeses > 0
    ? (itbiPosValorManual !== null ? itbiPosValorManual : itbiCalculadoMes)
    : 0;

  // SOMA DAS PARCELAS DE CADA FASE (LÍQUIDO MORAR)
  const somaTotalObra = faixasObra.reduce((acc, f) => {
    const valLiq = saldoProSolutoRestante <= 0 ? 0 : (Number(f.valor) || 0);
    return acc + ((Number(f.qtd) || 0) * valLiq);
  }, 0);
  const somaTotalPos = faixasPos.reduce((acc, f) => {
    const valLiq = saldoProSolutoRestante <= 0 ? 0 : (Number(f.valor) || 0);
    return acc + ((Number(f.qtd) || 0) * valLiq);
  }, 0);
  const somaTotalParceladoMorar = Math.round((somaTotalObra + somaTotalPos) * 100) / 100;
  // Mesmos totais por fase acima, arredondados — usados pela tela
  // simplificada (NovatoSimuladorView) nas linhas "Total Fase Obra"/"Total
  // Fase Pós-Obra", que exibem só as parcelas do imóvel, SEM o rateio de
  // ITBI/Registro (diferente de totalFaseObraComITBI/totalFasePosComITBI
  // abaixo, usados pelo editor completo e pelos indicadores de risco).
  const totalFaseObraSemITBI = Math.round(somaTotalObra * 100) / 100;
  const totalFasePosSemITBI = Math.round(somaTotalPos * 100) / 100;

  // SOMA TOTAL DO ITBI PARCELADO E TOTAIS POR FASE C/ ITBI
  // A parcela mensal é sempre um valor arredondado (ex.: R$ 594,25); somando
  // essa parcela arredondada pelos 36 meses ela fecha uns centavos ACIMA ou
  // ABAIXO do ITBI/Registro Total nominal (ex.: 12x594,25 + 24x594,25 =
  // R$21.393,00, mas o nominal é R$21.392,92) — foi essa sobra de 8 centavos
  // que fazia "Total com ITBI" e "Distribuído" nunca fecharem no mesmo valor.
  // Sem edição manual de nenhuma das duas fases, a última fase com parcelas
  // (Pós-Obra, ou Obra se não houver Pós-Obra) absorve essa sobra/falta, de
  // forma que o total pareado dos dois nunca destoe do nominal.
  const semEdicaoManualITBI = itbiObraValorManual === null && itbiPosValorManual === null;
  let somaITBIObra = Math.round((itbiObraTotalMeses * itbiParcelaObraValor) * 100) / 100;
  let somaITBIPos = Math.round((itbiPosTotalMeses * itbiParcelaPosValor) * 100) / 100;
  if (semEdicaoManualITBI) {
    if (itbiPosTotalMeses > 0) {
      somaITBIPos = Math.round((saldoITBI - somaITBIObra) * 100) / 100;
    } else if (itbiObraTotalMeses > 0) {
      somaITBIObra = Math.round(saldoITBI * 100) / 100;
    }
  }
  const somaTotalITBI = Math.round((somaITBIObra + somaITBIPos) * 100) / 100;

  // TOTAIS EFETIVOS RECALCULADOS APÓS CASCATA
  const totalNegocEfetivo = hasUnitSelected ? Math.round((maxFinancEfetivo + subsidyEfetivo + fgtsEfetivo) * 100) / 100 : 0;
  const sinalTotalSemITBIEfetivo = hasUnitSelected ? Math.max(0, Math.round((price - totalNegocEfetivo) * 100) / 100) : 0;
  const sinalLiquidoTotalEfetivo = hasUnitSelected ? Math.max(0, Math.round((sinalTotalSemITBIEfetivo - descontoAto) * 100) / 100) : 0;
  // Usa sempre despCartoriasEfetivas (o total nominal, o mesmo número editável
  // no card "Correção IGPM+1%") em vez da soma das parcelas de ITBI já
  // arredondadas mês a mês — somar parcelas arredondadas pode fechar alguns
  // centavos acima/abaixo do nominal, o que fazia esse mesmo "ITBI / Registro
  // Total" aparecer com dois valores ligeiramente diferentes na mesma ficha.
  const sinalTotalComITBIEfetivo = hasUnitSelected
    ? Math.round((sinalTotalSemITBIEfetivo + despCartoriasEfetivas) * 100) / 100
    : 0;

  // PARCELAS LÍQUIDAS EFETIVAS DA CONSTRUTORA
  const somaParcelasLiquidasEfetivas = saldoProSolutoRestante <= 0 
    ? 0 
    : (isManualObra || isManualPos ? somaTotalParceladoMorar : saldoProSolutoRestante);

  const totalFaseObraComITBI = saldoProSolutoRestante <= 0 
    ? Math.round(somaITBIObra * 100) / 100
    : Math.round((somaTotalObra + somaITBIObra) * 100) / 100;

  const totalFasePosComITBI = saldoProSolutoRestante <= 0
    ? Math.round(somaITBIPos * 100) / 100
    : Math.round((somaTotalPos + somaITBIPos) * 100) / 100;

  // MAX FLUXO (PARCELAS MORAR + ITBI PARCELADO)
  const maxFluxoEfetivo = Math.round((somaParcelasLiquidasEfetivas + somaTotalITBI) * 100) / 100;

  // TOTALIZADOR DISTRIBUÍDO EM TEMPO REAL
  // Distribuído = Ato (Imóvel) + Desconto Ato + ITBI no Ato + Parcelas Líquidas da Construtora + ITBI Parcelado Total
  //
  // O corretor nunca deve ver aqui uma sobra de centavos pra resolver — cada
  // pedaço acima já é arredondado à parte (Math.round(...*100)/100), e somar
  // vários valores JÁ arredondados pode fechar alguns centavos acima ou abaixo
  // do "Total com ITBI" nominal (sinalTotalComITBIEfetivo), mesmo quando cada
  // conta individual está certa — arredondamento em cascata, não um erro de
  // fórmula. Por isso o resíduo é absorvido aqui, na hora de montar o total,
  // no Pró-Soluto (não no Ato): o Ato alimenta o Desconto do Ato Premiado (que
  // é uma fração DELE mesmo), então ajustar o Ato também move o Desconto, e o
  // resíduo nunca fecha — tentar isso à base de tentativa e erro (um efeito
  // que reajusta o Ato e vê se fechou) chegou a entrar num loop infinito de
  // re-render. O Pró-Soluto não alimenta mais nenhuma outra conta aqui, então
  // absorve o resíduo uma única vez, sem laço, sem estado e sem risco de loop.
  const totalDistribuidoAntesDoResiduo = Math.round(
    ((Number(valorAtoEfetivo) || 0) + (Number(descontoAto) || 0) + (Number(atoITBIValidado) || 0) + somaParcelasLiquidasEfetivas + somaTotalITBI) * 100
  ) / 100;
  const residuoArredondamento = hasUnitSelected
    ? Math.round((sinalTotalComITBIEfetivo - totalDistribuidoAntesDoResiduo) * 100) / 100
    : 0;
  const totalDistribuido = Math.round((totalDistribuidoAntesDoResiduo + residuoArredondamento) * 100) / 100;

  // INDICADORES DE RISCO E COMPROMETIMENTO
  const baseLiquidaComITBI = hasUnitSelected 
    ? (morarEngineBase?.baseCalculoComITBI || Math.max(0, (price - descontoAto) + despCartoriasEfetivas))
    : 0;
  const baseRendaInformada = income;
  const nomeFaixaRenda = currentCond?.name || 'Não informada';
  
  // Limites da Política
  const limiteMaximoRiscoRenda = currentCond?.riscoRendaPct ?? 0;
  const limiteMaximoProSoluto = currentCond?.percMaxProSolutoGlobal ?? currentCond?.riscoImovelPct ?? 17.0;

  // 1ª Parcela sobre a Base da Renda
  const primeiraParcelaObraLiquida = faixasObra.length > 0 ? (Number(faixasObra[0].valor) || 0) : 0;
  const valorRiscoParcela = hasUnitSelected ? (primeiraParcelaObraLiquida + (itbiObraTotalMeses > 0 ? itbiParcelaObraValor : 0)) : 0;
  const pctRiscoParcelaRenda = (baseRendaInformada > 0 && valorRiscoParcela > 0) ? Math.min(100, Math.max(0, (valorRiscoParcela / baseRendaInformada) * 100)) : 0;

  // Pró-Soluto Total c/ ITBI s/ Base Líquida
  const valorRiscoProSoluto = totalFaseObraComITBI + totalFasePosComITBI;
  const pctRiscoProSoluto = (baseLiquidaComITBI > 0 && valorRiscoProSoluto > 0) ? Math.min(100, Math.max(0, (valorRiscoProSoluto / baseLiquidaComITBI) * 100)) : 0;

  // Função auxiliar para renderizar Gráficos de Pizza Sólidos com percentuais internos refinados
  const renderSolidPie = (
    pct: number,
    colorPrimary: string,
    colorSecondary: string = '#cbd5e1',
    primaryTextColor: string = '#ffffff',
    secondaryTextColor: string = '#1e293b'
  ) => {
    const cx = 50;
    const cy = 50;
    const r = 40;
    const clampedPct = Math.min(100, Math.max(0, pct));
    const restPct = Math.max(0, 100 - clampedPct);

    const formatPct = (val: number) => {
      return (val < 10 && val > 0) ? val.toFixed(2) : val.toFixed(1);
    };

    if (clampedPct >= 100) {
      return (
        <svg
          className="w-24 h-24 sm:w-28 sm:h-28 mx-auto select-none overflow-visible block"
          viewBox="-10 -10 120 120"
        >
          <circle cx={cx} cy={cy} r={r} fill={colorPrimary} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill={primaryTextColor} fontSize="10" fontWeight="bold">
            100.0%
          </text>
        </svg>
      );
    }

    if (clampedPct <= 0) {
      return (
        <svg
          className="w-24 h-24 sm:w-28 sm:h-28 mx-auto select-none overflow-visible block"
          viewBox="-10 -10 120 120"
        >
          <circle cx={cx} cy={cy} r={r} fill={colorSecondary} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill={secondaryTextColor} fontSize="10" fontWeight="bold">
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

    const calcCentroidRadius = (sliceAngleDeg: number) => {
      const theta = (sliceAngleDeg * Math.PI) / 180;
      if (theta <= 0.001) return r * 0.58;
      const factor = (2 / 3) * (Math.sin(theta / 2) / (theta / 2));
      return r * Math.min(0.68, Math.max(0.48, factor));
    };

    const midAngle1 = angle / 2;
    const rLabel1 = calcCentroidRadius(angle);
    const rad1 = (midAngle1 - 90) * (Math.PI / 180);
    const textX1 = cx + rLabel1 * Math.cos(rad1);
    const textY1 = cy + rLabel1 * Math.sin(rad1);

    return (
      <svg
        className="w-24 h-24 sm:w-28 sm:h-28 mx-auto select-none overflow-visible block"
        viewBox="-12 -12 124 124"
      >
        <circle cx={cx} cy={cy} r={r} fill={colorSecondary} />
        <path d={pathD} fill={colorPrimary} />
        <line x1={cx} y1={cy} x2={cx} y2={cy - r} stroke="#ffffff" strokeWidth="1.5" />
        <line x1={cx} y1={cy} x2={x} y2={y} stroke="#ffffff" strokeWidth="1.5" />
        {clampedPct >= 14 ? (
          <text x={textX1} y={textY1} textAnchor="middle" dominantBaseline="central" fill={primaryTextColor} fontSize="10" fontWeight="bold">
            {formatPct(clampedPct)}%
          </text>
        ) : null}
      </svg>
    );
  };

  // CURVA OFICIAL MORAR DE DISTRIBUIÇÃO AUTOMÁTICA
  // Calcula dinamicamente as séries por teto de renda, extração do ITBI e fechamento do ato residual
  const aplicarDistribuicaoOficialMorar = (overrides?: { atoITBI?: number }) => {
    if (!hasUnitSelected || (sinalTotalSemITBIEfetivo <= 0 && price <= 0)) return;

    const mesesObraPadrao = currentCond?.mesesObra ?? 33;
    const mesesObraParam = totalParcObra > 0 ? totalParcObra : mesesObraPadrao;
    const mesesPosParam = totalParcObra < mesesObraPadrao ? 0 : (totalParcPos > 0 ? totalParcPos : (currentCond?.mesesPos ?? 27));

    const globalPct: [number, number, number, number, number, number] = [
      currentCond?.globalSerie1Pct ?? 30.0,
      currentCond?.globalSerie2Pct ?? 25.0,
      currentCond?.globalSerie3Pct ?? 20.0,
      currentCond?.globalSerie4Pct ?? 15.0,
      currentCond?.globalSerie5Pct ?? 10.0,
      currentCond?.globalSerie6Pct ?? 5.0
    ];

    const proSolutoGlobalParam = currentCond?.percMaxProSolutoGlobal ?? currentCond?.riscoImovelPct ?? 17.0;
    const posObraGlobalParam = currentCond?.percMaxPosObra ?? currentCond?.riscoPosPct ?? 8.0;

    const engineResult = calculateMorarFlowEngine({
      precoTabela: price,
      avaliacaoBanco: evaluation,
      itbiRegistro: despCartoriasEfetivas,
      renda: income,
      financiamento: maxFinanc,
      subsidio: subsidy,
      fgts: fgts,
      percentualRiscoGeral: proSolutoGlobalParam,
      percentualRiscoPos: posObraGlobalParam,
      mesesObra: mesesObraParam,
      mesesPos: mesesPosParam,
      globalSeriesPct: globalPct,
      serieMesesCapacidades: serieMesesCapacidades,
      sinalMinimo: sinalMinimoVal,
      atoITBI: overrides?.atoITBI !== undefined ? overrides.atoITBI : (itbiAtoManualFloor ?? 0),
      isAtoPremiadoEnabled,
      atoPremiadoPct: pctAtoPremiadoCond,
      isComissaoApartada,
      pctComissaoApartada: pctComissaoApartadaCond
    });

    const mObraArr = engineResult.obraSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));
    const mPosArr = mesesPosParam === 0
      ? [{ qtd: 0, valor: 0, serieIndex: 0 }, { qtd: 0, valor: 0, serieIndex: 1 }, { qtd: 0, valor: 0, serieIndex: 2 }, { qtd: 0, valor: 0, serieIndex: 3 }]
      : engineResult.posSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));

    setFaixasObra(mObraArr);
    setFaixasPos(mPosArr);
    setValAtoManual(engineResult.atoResidual);
    setAtoInputText(formatCurrency(engineResult.atoResidual));
    setItbiObraValorManual(engineResult.parcelaMensalITBI);
    setItbiPosValorManual(mesesPosParam === 0 ? 0 : engineResult.parcelaMensalITBI);
    // O motor eleva o ITBI no Ato sozinho (nunca o Ato (Imóvel)) quando o valor
    // plano de ITBI/mês furaria o teto de renda de algum balde — ver comentário
    // em calculateMorarFlowEngine. Sempre sincroniza com a sugestão fresca do
    // motor (nunca abaixo do piso manual, itbiAtoManualFloor): assim ela sobe
    // OU desce livremente conforme a Qtd. Meses muda, sem grudar num valor
    // auto-sugerido antigo quando os meses aumentam de novo.
    setValAtoITBI(engineResult.itbiAtoSugerido);
    setItbiAtoInputText(formatCurrency(engineResult.itbiAtoSugerido));
    setIsManualObra(false);
    setIsManualPos(false);
  };

  // Recalcula as parcelas líquidas das séries para um Ato (Imóvel) digitado manualmente.
  // Usa a mesma fórmula oficial de distribuição, mas passando `atoManual` ao motor para
  // que `fluxoProSolutoComITBI` (o que efetivamente sobra para ratear entre as séries)
  // já saia reduzido pelo excedente do Ato sobre o sugerido — sem isso, as parcelas
  // ficavam "travadas" no valor cheio até o Pró-Soluto zerar de uma vez.
  // `atoPremiadoOverride` existe porque quem chama logo após um setIsAtoPremiadoEnabled
  // ainda enxerga o valor ANTIGO de isAtoPremiadoEnabled no closure (o state do React só
  // é atualizado no próximo render). Nesses casos o novo valor é passado explicitamente.
  // `overrides` serve ao mesmo propósito para o Preço/ITBI — usado pelo toggle de
  // Pagamento à Vista, que precisa recalcular tudo já com o preço descontado e o
  // ITBI zerado antes que esses states sejam commitados.
  const recalcularSeriesParaAtoManual = (
    atoValor: number,
    atoPremiadoOverride?: boolean,
    overrides?: { precoTabela?: number; itbiRegistro?: number; atoITBI?: number; financiamento?: number; subsidio?: number; fgts?: number }
  ) => {
    if (!hasUnitSelected) return;
    const atoPremiadoAtivo = atoPremiadoOverride !== undefined ? atoPremiadoOverride : isAtoPremiadoEnabled;
    const precoParam = overrides?.precoTabela !== undefined ? overrides.precoTabela : price;
    const itbiRegistroParam = overrides?.itbiRegistro !== undefined ? overrides.itbiRegistro : despCartoriasEfetivas;
    const atoITBIParam = overrides?.atoITBI !== undefined ? overrides.atoITBI : (itbiAtoManualFloor ?? 0);
    const financiamentoParam = overrides?.financiamento !== undefined ? overrides.financiamento : maxFinanc;
    const subsidioParam = overrides?.subsidio !== undefined ? overrides.subsidio : subsidy;
    const fgtsParam = overrides?.fgts !== undefined ? overrides.fgts : fgts;

    const mesesObraPadrao = currentCond?.mesesObra ?? 33;
    const mesesObraParam = totalParcObra > 0 ? totalParcObra : mesesObraPadrao;
    const mesesPosParam = totalParcObra < mesesObraPadrao ? 0 : (totalParcPos > 0 ? totalParcPos : (currentCond?.mesesPos ?? 27));

    const globalPct: [number, number, number, number, number, number] = [
      currentCond?.globalSerie1Pct ?? 30.0,
      currentCond?.globalSerie2Pct ?? 25.0,
      currentCond?.globalSerie3Pct ?? 20.0,
      currentCond?.globalSerie4Pct ?? 15.0,
      currentCond?.globalSerie5Pct ?? 10.0,
      currentCond?.globalSerie6Pct ?? 5.0
    ];

    const proSolutoGlobalParam = currentCond?.percMaxProSolutoGlobal ?? currentCond?.riscoImovelPct ?? 17.0;
    const posObraGlobalParam = currentCond?.percMaxPosObra ?? currentCond?.riscoPosPct ?? 8.0;

    const engineResult = calculateMorarFlowEngine({
      precoTabela: precoParam,
      avaliacaoBanco: evaluation,
      itbiRegistro: itbiRegistroParam,
      renda: income,
      financiamento: financiamentoParam,
      subsidio: subsidioParam,
      fgts: fgtsParam,
      percentualRiscoGeral: proSolutoGlobalParam,
      percentualRiscoPos: posObraGlobalParam,
      mesesObra: mesesObraParam,
      mesesPos: mesesPosParam,
      globalSeriesPct: globalPct,
      serieMesesCapacidades: serieMesesCapacidades,
      sinalMinimo: sinalMinimoVal,
      atoITBI: atoITBIParam,
      isAtoPremiadoEnabled: atoPremiadoAtivo,
      atoManual: atoValor,
      atoPremiadoPct: pctAtoPremiadoCond,
      isComissaoApartada,
      pctComissaoApartada: pctComissaoApartadaCond
    });

    const mObraArr = engineResult.obraSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));
    const mPosArr = mesesPosParam === 0
      ? [{ qtd: 0, valor: 0, serieIndex: 0 }, { qtd: 0, valor: 0, serieIndex: 1 }, { qtd: 0, valor: 0, serieIndex: 2 }, { qtd: 0, valor: 0, serieIndex: 3 }]
      : engineResult.posSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));

    setFaixasObra(mObraArr);
    setFaixasPos(mPosArr);
    setItbiObraValorManual(engineResult.parcelaMensalITBI);
    setItbiPosValorManual(mesesPosParam === 0 ? 0 : engineResult.parcelaMensalITBI);
    // Mesma trava de teto de renda do ITBI — só sobe o campo "ITBI no Ato",
    // nunca o Ato (Imóvel) recalculado logo abaixo. Sempre sincroniza com a
    // sugestão fresca (nunca abaixo do piso manual), pra também poder descer.
    setValAtoITBI(engineResult.itbiAtoSugerido);
    setItbiAtoInputText(formatCurrency(engineResult.itbiAtoSugerido));
    setIsManualObra(false);
    setIsManualPos(false);

    // O motor eleva um Ato manual que ficaria ABAIXO do mínimo exigido pela
    // política de crédito (o Pró-Soluto resultante estouraria o risco máximo).
    // Quando isso acontece o campo precisa passar a mostrar o valor efetivamente
    // usado — o mais próximo do informado que ainda obedece a política —, senão
    // o Ato exibido não fecha com o restante do fluxo já recalculado.
    if (engineResult.atoResidual > atoValor + 0.005) {
      setValAtoManual(engineResult.atoResidual);
      setAtoInputText(formatCurrency(engineResult.atoResidual));
      if (onShowToast) {
        onShowToast(`Ato (Imóvel) ajustado para ${formatCurrency(engineResult.atoResidual)}: com ${formatCurrency(atoValor)} o Pró-Soluto ultrapassaria o risco máximo da política de crédito.`);
      }
    }
  };

  // Ligar/desligar o Ato Premiado ("Aplicar" / "Zerar") muda o quanto o cliente
  // deve à construtora (com o desconto ativo ele deve preço - desconto), então
  // todo o resto do fluxo precisa ser refeito. O Ato (Imóvel) em si, porém, é
  // uma decisão do usuário: se ele lançou um sinal maior, é porque quer a conta
  // feita com aquele sinal — antes o toggle descartava o Ato (setValAtoManual(null))
  // e voltava para o sugerido, o que impedia comparar o MESMO sinal com e sem o
  // Ato Premiado.
  //
  // Então o Ato é preservado e só as demais contas são refeitas. A única
  // correção aplicada ao próprio Ato é o teto: ao LIGAR o Ato Premiado o cliente
  // passa a dever menos, e um Ato que antes cabia pode ultrapassar o novo saldo
  // devido — nesse caso ele é limitado ao teto (mesmo ponto fixo usado pelo campo),
  // para o usuário nunca pagar mais do que realmente deve.
  const handleToggleAtoPremiado = (ativo: boolean) => {
    setIsAtoPremiadoEnabled(ativo);

    // O Ato exibido pode ser (a) a nossa própria sugestão — o app grava o Ato
    // sugerido em `valAtoManual` assim que a unidade é escolhida, então "não
    // digitado" NÃO é o mesmo que `valAtoManual === null` — ou (b) um sinal que
    // o usuário lançou por conta própria. Só o caso (b) é uma decisão dele.
    const atoAindaEhASugestao = valAtoManual === null
      || Math.abs(valAtoManual - atoSugeridoResidual) < 0.01;

    if (atoAindaEhASugestao) {
      // O usuário não lançou nenhum sinal diferente do que sugerimos: o Ato
      // Premiado é abatido diretamente do Ato (Imóvel), então o próprio Ato tem
      // de ser re-sugerido com o novo estado do prêmio. Preservar o número
      // antigo deixava o Ato defasado do restante do fluxo — era o que fazia o
      // Ato ficar abaixo do exigido (e o risco estourar) ao "Zerar" o prêmio.
      setValAtoManual(null);
      setAtoInputText('');
      setIsManualObra(false);
      setIsManualPos(false);
      return;
    }

    // O Ato está na posição "À Vista" (o usuário quitou o Pró-Soluto trazendo
    // o Sinal necessário inteiro para o Ato, via o alternador "Parcelado/À
    // Vista" do próprio card): ligar/desligar o Ato Premiado muda o desconto
    // comercial embutido nesse Sinal necessário, e só limitar a um teto (como
    // no ramo abaixo) deixa faltar exatamente o valor do Ato Premiado,
    // reabrindo parcelas. Em vez disso, o Ato é recalculado para o novo ponto
    // de quitação à vista — com o novo estado do prêmio —, mantendo o
    // Pró-Soluto zerado nos dois sentidos (ligando ou desligando).
    if (isAVistaActive) {
      const novoAtoVistaTarget = resolverTetoAtoComDesconto(sinalImovelInicial, ativo, pctAtoPremiadoCond);
      setValAtoManual(novoAtoVistaTarget);
      setAtoInputText(formatCurrency(novoAtoVistaTarget));
      recalcularSeriesParaAtoManual(novoAtoVistaTarget, ativo);
      return;
    }

    // Sinal lançado pelo usuário: é preservado, limitado ao novo teto (nunca
    // pagar mais do que o devido) e elevado ao piso da política de crédito
    // dentro de `recalcularSeriesParaAtoManual` quando o risco exigir.
    const novoTetoAto = resolverTetoAtoComDesconto(Math.max(0, price - subsidy), ativo, pctAtoPremiadoCond);
    const atoPreservado = Math.min(valAtoManual, novoTetoAto);

    setValAtoManual(atoPreservado);
    setAtoInputText(formatCurrency(atoPreservado));
    recalcularSeriesParaAtoManual(atoPreservado, ativo);
  };

  // Botão "Pgtº à vista": 100% recurso próprio do cliente. Aplica o % de
  // Desconto à Vista da política sobre o Preço de Tabela (antes de qualquer
  // outro cálculo), zera o ITBI — que passa a ser responsabilidade do cliente
  // a partir do Habite-se — e traz o preço com desconto INTEIRO para o Ato
  // (Imóvel), sem descontar Financiamento/Subsídio/FGTS: nenhum recurso
  // externo é usado, então Max Financ., Subsídio, FGTS e Total Negoc. ficam
  // todos em R$ 0,00 e o Pró-Soluto é quitado.
  //
  // O Ato Premiado é desligado automaticamente enquanto o pagamento à vista
  // está ativo, para não empilhar os dois descontos sem uma regra definida
  // para isso; ele volta a ficar disponível normalmente ao desligar.
  //
  // O preço descontado, o ITBI zerado, o Ato Premiado desligado e o
  // financiamento/subsídio/FGTS zerados ainda não estão commitados nos states
  // do React neste mesmo evento — por isso o cálculo é feito aqui com os
  // valores corretos "na mão" e passado via `overrides` para
  // `recalcularSeriesParaAtoManual`, em vez de depender de
  // `price`/`despCartoriasEfetivas`/`isAtoPremiadoEnabled`/`maxFinanc`/
  // `subsidy`/`fgts` (que só refletem o novo estado no próximo render).
  const handleTogglePagamentoAVista = (ativo: boolean) => {
    setIsPagamentoAVistaEnabled(ativo);

    if (!ativo) {
      // Volta ao fluxo parcelado normal: preço, ITBI e financiamento/subsídio/
      // FGTS retornam ao normal no próximo render; o Ato Premiado é religado
      // (mesmo padrão usado ao selecionar uma unidade ou limpar o fluxo) e o
      // Ato volta a ser sugerido automaticamente.
      setIsAtoPremiadoEnabled(true);
      setValAtoManual(null);
      setAtoInputText('');
      setIsManualObra(false);
      setIsManualPos(false);
      if (onShowToast) {
        onShowToast('Pagamento à vista desativado. Preço de Tabela, ITBI, Financiamento, Subsídio, FGTS e Ato Premiado voltam ao normal.');
      }
      return;
    }

    if (!hasUnitSelected || precoTabelaOriginal <= 0) return;

    const descontoPct = currentCond?.descontoAVistaPct ?? 0;
    const precoComDesconto = Math.max(0, Math.round(precoTabelaOriginal * (1 - descontoPct / 100) * 100) / 100);
    const valorDesconto = Math.round((precoTabelaOriginal - precoComDesconto) * 100) / 100;

    setIsAtoPremiadoEnabled(false);
    setValAtoITBI(0);
    setItbiAtoManualFloor(null);
    setItbiAtoInputText('');
    setValAtoManual(precoComDesconto);
    setAtoInputText(formatCurrency(precoComDesconto));
    recalcularSeriesParaAtoManual(precoComDesconto, false, {
      precoTabela: precoComDesconto,
      itbiRegistro: 0,
      atoITBI: 0,
      financiamento: 0,
      subsidio: 0,
      fgts: 0
    });

    if (onShowToast) {
      const mensagemDesconto = descontoPct > 0
        ? `Desconto à vista de ${formatCurrency(valorDesconto)} (${descontoPct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%) aplicado sobre o Preço de Tabela.`
        : 'Nenhum % de Desconto à Vista configurado na política desta condição.';
      onShowToast(`${mensagemDesconto} O ITBI foi zerado — é de responsabilidade do cliente a partir da obtenção do Habite-se pelo empreendimento. Financiamento, Subsídio e FGTS não são considerados: o Ato (Imóvel) absorve o valor integral.`);
    }
  };

  // Inicialização inteligente e automática quando a unidade é selecionada ou o sinal líquido é atualizado
  useEffect(() => {
    if (!isManualObra && !isManualPos && hasUnitSelected && valAtoManual === null && sinalLiquidoTotalEfetivo > 0) {
      const mesesObraParam = currentCond?.mesesObra ?? 33;
      const mesesPosParam = currentCond?.mesesPos ?? 27;

      const globalPct: [number, number, number, number, number, number] = [
        currentCond?.globalSerie1Pct ?? 30.0,
        currentCond?.globalSerie2Pct ?? 25.0,
        currentCond?.globalSerie3Pct ?? 20.0,
        currentCond?.globalSerie4Pct ?? 15.0,
        currentCond?.globalSerie5Pct ?? 10.0,
        currentCond?.globalSerie6Pct ?? 5.0
      ];

      const proSolutoGlobalParam = currentCond?.percMaxProSolutoGlobal ?? currentCond?.riscoImovelPct ?? 17.0;
      const posObraGlobalParam = currentCond?.percMaxPosObra ?? currentCond?.riscoPosPct ?? 8.0;

      const engineResult = calculateMorarFlowEngine({
        precoTabela: price,
        avaliacaoBanco: evaluation,
        itbiRegistro: despCartoriasEfetivas,
        renda: income,
        financiamento: maxFinanc,
        subsidio: subsidy,
        fgts: fgts,
        percentualRiscoGeral: proSolutoGlobalParam,
        percentualRiscoPos: posObraGlobalParam,
        mesesObra: mesesObraParam,
        mesesPos: mesesPosParam,
        globalSeriesPct: globalPct,
        serieMesesCapacidades: serieMesesCapacidades,
        sinalMinimo: sinalMinimoVal,
        atoITBI: itbiAtoManualFloor ?? 0,
        isAtoPremiadoEnabled,
        isComissaoApartada,
        pctComissaoApartada: pctComissaoApartadaCond
      });

      const mObraArr = engineResult.obraSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));
      const mPosArr = engineResult.posSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));

      setFaixasObra(mObraArr);
      setFaixasPos(mPosArr);
      setValAtoManual(engineResult.atoResidual);
      setAtoInputText(formatCurrency(engineResult.atoResidual));
      setItbiObraValorManual(engineResult.parcelaMensalITBI);
      setItbiPosValorManual(engineResult.parcelaMensalITBI);
      setValAtoITBI(engineResult.itbiAtoSugerido);
      setItbiAtoInputText(formatCurrency(engineResult.itbiAtoSugerido));
    }
  }, [sinalLiquidoTotalEfetivo, hasUnitSelected, isManualObra, isManualPos, valAtoManual, sinalMinimoVal, currentCond, income, despCartoriasEfetivas, itbiAtoManualFloor, price, evaluation, maxFinanc, subsidy, fgts, isAtoPremiadoEnabled, isComissaoApartada, pctComissaoApartadaCond]);

  const mesesObraPadraoPolitica = currentCond?.mesesObra ?? 33;
  const mesesPosPadraoPolitica = currentCond?.mesesPos ?? 27;

  // Função centralizada para aplicar e recalcular fluxo com nova quantidade de meses de Obra
  const recalcularFluxoObraMeses = (novoTotalObra: number) => {
    if (novoTotalObra < 0) return;

    const globalPct: [number, number, number, number, number, number] = [
      currentCond?.globalSerie1Pct ?? 30.0,
      currentCond?.globalSerie2Pct ?? 25.0,
      currentCond?.globalSerie3Pct ?? 20.0,
      currentCond?.globalSerie4Pct ?? 15.0,
      currentCond?.globalSerie5Pct ?? 10.0,
      currentCond?.globalSerie6Pct ?? 5.0
    ];

    const proSolutoGlobalParam = currentCond?.percMaxProSolutoGlobal ?? currentCond?.riscoImovelPct ?? 17.0;
    const posObraGlobalParam = currentCond?.percMaxPosObra ?? currentCond?.riscoPosPct ?? 8.0;

    // Se o Ato (Imóvel) exibido agora já destoa da sugestão automática atual
    // (antes de qualquer coisa mudar aqui), é porque o CORRETOR digitou aquele
    // valor de propósito — é o "sinal" que o cliente dele topou dar, então
    // mudar a Qtd. Meses não pode mais apagá-lo com uma sugestão nova. Nesse
    // caso o valor digitado é passado ao motor como piso (nunca reduzido, só
    // elevado se a política de crédito exigir mais com o novo prazo — ver
    // calculateMorarFlowEngine). Sem isso, valAtoManual mesmo não-nulo ainda é
    // só a sugestão automática pinada por uma recalculagem anterior, livre
    // para ser substituída de novo.
    const atoFoiDigitadoPeloUsuario = valAtoManual !== null && Math.abs(valAtoManual - atoSugeridoResidual) >= 0.01;
    const atoManualParam = atoFoiDigitadoPeloUsuario ? valAtoManual : undefined;

    // Aplica o resultado do motor no Ato (Imóvel): se o corretor não tinha
    // digitado nada, aceita a sugestão livremente, como sempre. Se tinha, só
    // atualiza quando o motor precisou elevá-lo (piso da política) — nunca
    // quando ele bateria exatamente no valor já digitado, preservando o
    // sinal do corretor sem sobrescrevê-lo à toa.
    const aplicarAtoResultante = (atoResidual: number) => {
      if (!atoFoiDigitadoPeloUsuario) {
        setValAtoManual(atoResidual);
        setAtoInputText(formatCurrency(atoResidual));
        return;
      }
      if (atoResidual > (valAtoManual as number) + 0.005) {
        setValAtoManual(atoResidual);
        setAtoInputText(formatCurrency(atoResidual));
        if (onShowToast) {
          onShowToast(`O Ato (Imóvel) digitado precisou subir para ${formatCurrency(atoResidual)}: com o novo prazo, o piso exigido pela política de crédito é maior.`);
        }
      }
      // Senão, mantém o valor digitado como está — não mexe em valAtoManual/atoInputText.
    };

    // Regra 1: Se o usuário reduziu os meses de Obra abaixo do padrão da política:
    if (novoTotalObra < mesesObraPadraoPolitica) {
      // 1. Zerar o período de Pós-Obra
      // 2. Concentração Total do ITBI na Obra
      setItbiObraValorManual(null);
      setItbiPosValorManual(0);

      const engineResult = calculateMorarFlowEngine({
        precoTabela: price,
        avaliacaoBanco: evaluation,
        itbiRegistro: despCartoriasEfetivas,
        renda: income,
        financiamento: maxFinanc,
        subsidio: subsidy,
        fgts: fgts,
        percentualRiscoGeral: proSolutoGlobalParam,
        percentualRiscoPos: posObraGlobalParam,
        mesesObra: novoTotalObra,
        mesesPos: 0,
        globalSeriesPct: globalPct,
        serieMesesCapacidades: serieMesesCapacidades,
        sinalMinimo: sinalMinimoVal,
        atoITBI: itbiAtoManualFloor ?? 0,
        isAtoPremiadoEnabled,
        atoManual: atoManualParam,
        isComissaoApartada,
        pctComissaoApartada: pctComissaoApartadaCond
      });

      const mObraArr = engineResult.obraSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));
      const mPosArr = [
        { qtd: 0, valor: 0, serieIndex: 0 },
        { qtd: 0, valor: 0, serieIndex: 1 },
        { qtd: 0, valor: 0, serieIndex: 2 },
        { qtd: 0, valor: 0, serieIndex: 3 }
      ];

      setFaixasObra(mObraArr);
      setFaixasPos(mPosArr);
      aplicarAtoResultante(engineResult.atoResidual);
      setItbiObraValorManual(engineResult.parcelaMensalITBI);
      setItbiPosValorManual(0);
      // Prazo curto pode fazer o ITBI/mês furar o teto de renda do balde — o
      // excedente sobe pro "ITBI no Ato" (nunca pro Ato (Imóvel) acima). Sempre
      // sincroniza com a sugestão fresca (nunca abaixo do piso manual): assim
      // ela também desce quando o prazo volta a aumentar.
      const itbiSubiu = engineResult.itbiAtoSugerido > valAtoITBI + 0.005;
      setValAtoITBI(engineResult.itbiAtoSugerido);
      setItbiAtoInputText(formatCurrency(engineResult.itbiAtoSugerido));
      setIsManualObra(false);
      setIsManualPos(false);

      if (onShowToast) {
        onShowToast(itbiSubiu
          ? `Obra reduzida para ${novoTotalObra} meses. Pós-Obra zerado; ITBI/mês (${formatCurrency(engineResult.parcelaMensalITBI)}) respeitando o teto de renda, com ${formatCurrency(engineResult.itbiAtoSugerido)} movido para o ITBI no Ato.`
          : `Obra reduzida para ${novoTotalObra} meses. Pós-Obra zerado e ITBI (${formatCurrency(engineResult.parcelaMensalITBI)}/mês) concentrado na Obra.`);
      }
    } else {
      // Regra 2: Usuário restaurou o padrão da política ou ampliou
      const novoPos = totalParcPos > 0 ? totalParcPos : mesesPosPadraoPolitica;
      setItbiObraValorManual(null);
      setItbiPosValorManual(null);

      const engineResult = calculateMorarFlowEngine({
        precoTabela: price,
        avaliacaoBanco: evaluation,
        itbiRegistro: despCartoriasEfetivas,
        renda: income,
        financiamento: maxFinanc,
        subsidio: subsidy,
        fgts: fgts,
        percentualRiscoGeral: proSolutoGlobalParam,
        percentualRiscoPos: posObraGlobalParam,
        mesesObra: novoTotalObra,
        mesesPos: novoPos,
        globalSeriesPct: globalPct,
        serieMesesCapacidades: serieMesesCapacidades,
        sinalMinimo: sinalMinimoVal,
        atoITBI: itbiAtoManualFloor ?? 0,
        isAtoPremiadoEnabled,
        atoManual: atoManualParam,
        isComissaoApartada,
        pctComissaoApartada: pctComissaoApartadaCond
      });

      const mObraArr = engineResult.obraSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));
      const mPosArr = engineResult.posSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));

      setFaixasObra(mObraArr);
      setFaixasPos(mPosArr);
      aplicarAtoResultante(engineResult.atoResidual);
      setItbiObraValorManual(engineResult.parcelaMensalITBI);
      setItbiPosValorManual(engineResult.parcelaMensalITBI);
      setValAtoITBI(engineResult.itbiAtoSugerido);
      setItbiAtoInputText(formatCurrency(engineResult.itbiAtoSugerido));
      setIsManualObra(false);
      setIsManualPos(false);

      if (onShowToast) {
        onShowToast(`Prazo de Obra restaurado para ${novoTotalObra} meses com divisão padrão de Pós-Obra (${novoPos} meses).`);
      }
    }
  };

  // Função centralizada para aplicar e recalcular fluxo com nova quantidade de meses de Pós-Obra
  const recalcularFluxoPosMeses = (novoTotalPos: number) => {
    if (novoTotalPos < 0) return;

    const globalPct: [number, number, number, number, number, number] = [
      currentCond?.globalSerie1Pct ?? 30.0,
      currentCond?.globalSerie2Pct ?? 25.0,
      currentCond?.globalSerie3Pct ?? 20.0,
      currentCond?.globalSerie4Pct ?? 15.0,
      currentCond?.globalSerie5Pct ?? 10.0,
      currentCond?.globalSerie6Pct ?? 5.0
    ];

    const proSolutoGlobalParam = currentCond?.percMaxProSolutoGlobal ?? currentCond?.riscoImovelPct ?? 17.0;
    const posObraGlobalParam = currentCond?.percMaxPosObra ?? currentCond?.riscoPosPct ?? 8.0;

    const mesesObraAtual = totalParcObra > 0 ? totalParcObra : mesesObraPadraoPolitica;

    // Mesma regra de recalcularFluxoObraMeses: um Ato (Imóvel) que já destoa
    // da sugestão automática atual foi digitado de propósito pelo corretor —
    // preserva esse valor (só o motor pode elevá-lo, se a política exigir).
    const atoFoiDigitadoPeloUsuario = valAtoManual !== null && Math.abs(valAtoManual - atoSugeridoResidual) >= 0.01;
    const atoManualParam = atoFoiDigitadoPeloUsuario ? valAtoManual : undefined;

    setItbiObraValorManual(null);
    setItbiPosValorManual(null);

    const engineResult = calculateMorarFlowEngine({
      precoTabela: price,
      avaliacaoBanco: evaluation,
      itbiRegistro: despCartoriasEfetivas,
      renda: income,
      financiamento: maxFinanc,
      subsidio: subsidy,
      fgts: fgts,
      percentualRiscoGeral: proSolutoGlobalParam,
      percentualRiscoPos: posObraGlobalParam,
      mesesObra: mesesObraAtual,
      mesesPos: novoTotalPos,
      globalSeriesPct: globalPct,
      serieMesesCapacidades: serieMesesCapacidades,
      sinalMinimo: sinalMinimoVal,
      atoITBI: itbiAtoManualFloor ?? 0,
      isAtoPremiadoEnabled,
      atoPremiadoPct: pctAtoPremiadoCond,
      atoManual: atoManualParam,
      isComissaoApartada,
      pctComissaoApartada: pctComissaoApartadaCond
    });

    const mObraArr = engineResult.obraSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));
    const mPosArr = novoTotalPos === 0
      ? [{ qtd: 0, valor: 0, serieIndex: 0 }, { qtd: 0, valor: 0, serieIndex: 1 }, { qtd: 0, valor: 0, serieIndex: 2 }, { qtd: 0, valor: 0, serieIndex: 3 }]
      : engineResult.posSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));

    setFaixasObra(mObraArr);
    setFaixasPos(mPosArr);
    if (!atoFoiDigitadoPeloUsuario) {
      setValAtoManual(engineResult.atoResidual);
      setAtoInputText(formatCurrency(engineResult.atoResidual));
    } else if (engineResult.atoResidual > (valAtoManual as number) + 0.005) {
      setValAtoManual(engineResult.atoResidual);
      setAtoInputText(formatCurrency(engineResult.atoResidual));
      if (onShowToast) {
        onShowToast(`O Ato (Imóvel) digitado precisou subir para ${formatCurrency(engineResult.atoResidual)}: com o novo prazo, o piso exigido pela política de crédito é maior.`);
      }
    }
    setItbiObraValorManual(engineResult.parcelaMensalITBI);
    setItbiPosValorManual(novoTotalPos > 0 ? engineResult.parcelaMensalITBI : 0);
    // Sempre sincroniza com a sugestão fresca do motor (nunca abaixo do piso
    // manual): assim ela também desce quando o prazo volta a aumentar.
    const itbiSubiu = engineResult.itbiAtoSugerido > valAtoITBI + 0.005;
    setValAtoITBI(engineResult.itbiAtoSugerido);
    setItbiAtoInputText(formatCurrency(engineResult.itbiAtoSugerido));
    setIsManualObra(false);
    setIsManualPos(false);

    if (onShowToast) {
      onShowToast(itbiSubiu
        ? `Pós-Obra ajustado para ${novoTotalPos} meses (${mesesObraAtual + novoTotalPos} meses totais). ITBI/mês (${formatCurrency(engineResult.parcelaMensalITBI)}) respeitando o teto de renda, com ${formatCurrency(engineResult.itbiAtoSugerido)} movido para o ITBI no Ato.`
        : `Pós-Obra ajustado para ${novoTotalPos} meses (${mesesObraAtual + novoTotalPos} meses totais). ITBI rediluído para ${formatCurrency(engineResult.parcelaMensalITBI)}/mês.`);
    }
  };

  const handleFinishITBIEdit = (rawText: string) => {
    setIsEditingAtoITBI(false);
    const parsed = parseCurrency(rawText);
    const maxITBI = valorTotalITBI > 0 ? valorTotalITBI : 0;

    let finalVal = 0;
    if (rawText.trim() === '' || isNaN(parsed) || parsed <= 0) {
      finalVal = 0;
      setValAtoITBI(0);
      setItbiAtoInputText('');
    } else if (hasUnitSelected && maxITBI > 0 && parsed > maxITBI) {
      if (onShowToast) {
        onShowToast(`O valor do Pagamento do ITBI no Ato não pode exceder o total de ${formatCurrency(maxITBI)}. Ajustado para o teto.`);
      }
      finalVal = maxITBI;
      setValAtoITBI(finalVal);
      setItbiAtoInputText(formatCurrency(finalVal));
    } else {
      finalVal = parsed;
      setValAtoITBI(finalVal);
      setItbiAtoInputText(formatCurrency(finalVal));
    }

    // Guarda este valor como o piso manual — as próximas recalculagens (ex.:
    // ao mudar a Qtd. Meses) partem dele, nunca de zero, mas também nunca de
    // um valor auto-sugerido anterior que porventura esteja maior na tela.
    setItbiAtoManualFloor(finalVal > 0 ? finalVal : null);

    setItbiObraValorManual(null);
    setItbiPosValorManual(null);

    // Recalcular o rateio de ITBI e séries
    const mesesObraParam = totalParcObra < mesesObraPadraoPolitica ? totalParcObra : mesesObraPadraoPolitica;
    const mesesPosParam = totalParcObra < mesesObraPadraoPolitica ? 0 : (totalParcPos >= 0 ? totalParcPos : mesesPosPadraoPolitica);
    const globalPct: [number, number, number, number, number, number] = [
      currentCond?.globalSerie1Pct ?? 30.0,
      currentCond?.globalSerie2Pct ?? 25.0,
      currentCond?.globalSerie3Pct ?? 20.0,
      currentCond?.globalSerie4Pct ?? 15.0,
      currentCond?.globalSerie5Pct ?? 10.0,
      currentCond?.globalSerie6Pct ?? 5.0
    ];

    const engineResult = calculateMorarFlowEngine({
      precoTabela: price,
      avaliacaoBanco: evaluation,
      itbiRegistro: despCartoriasEfetivas,
      renda: income,
      financiamento: maxFinanc,
      subsidio: subsidy,
      fgts: fgts,
      percentualRiscoGeral: currentCond?.percMaxProSolutoGlobal ?? currentCond?.riscoImovelPct ?? 17.0,
      percentualRiscoPos: currentCond?.percMaxPosObra ?? currentCond?.riscoPosPct ?? 8.0,
      mesesObra: mesesObraParam,
      mesesPos: mesesPosParam,
      globalSeriesPct: globalPct,
      serieMesesCapacidades: serieMesesCapacidades,
      sinalMinimo: sinalMinimoVal,
      atoITBI: finalVal,
      isAtoPremiadoEnabled,
      atoManual: valAtoManual !== null ? valAtoManual : undefined,
      atoPremiadoPct: pctAtoPremiadoCond,
      isComissaoApartada,
      pctComissaoApartada: pctComissaoApartadaCond
    });

    const mObraArr = engineResult.obraSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));
    const mPosArr = mesesPosParam === 0 
      ? [{ qtd: 0, valor: 0, serieIndex: 0 }, { qtd: 0, valor: 0, serieIndex: 1 }, { qtd: 0, valor: 0, serieIndex: 2 }, { qtd: 0, valor: 0, serieIndex: 3 }]
      : engineResult.posSeries.map(s => ({ qtd: s.qtd, valor: s.parcelaLiquida, serieIndex: s.serieIndex }));

    setFaixasObra(mObraArr);
    setFaixasPos(mPosArr);
    setItbiObraValorManual(engineResult.parcelaMensalITBI);
    setItbiPosValorManual(mesesPosParam === 0 ? 0 : engineResult.parcelaMensalITBI);
    // O valor digitado pode não bastar: se o saldo restante ainda furar o teto
    // de renda de algum balde com a quantidade de meses atual, o motor eleva
    // o próprio campo "ITBI no Ato" até o ponto em que o que sobra cabe.
    const itbiAjustado = engineResult.itbiAtoSugerido > finalVal + 0.005;
    if (itbiAjustado) {
      setValAtoITBI(engineResult.itbiAtoSugerido);
      setItbiAtoInputText(formatCurrency(engineResult.itbiAtoSugerido));
    }
    setIsManualObra(false);
    setIsManualPos(false);

    if (onShowToast) {
      if (itbiAjustado) {
        onShowToast(`ITBI no Ato ajustado para ${formatCurrency(engineResult.itbiAtoSugerido)}: com ${formatCurrency(finalVal)} o restante furaria o teto de renda na quantidade de meses atual.`);
      } else if (finalVal >= maxITBI && maxITBI > 0) {
        onShowToast(`ITBI quitado no Ato (${formatCurrency(finalVal)}). Parcela mensal de ITBI zerada.`);
      } else if (finalVal > 0) {
        onShowToast(`ITBI no Ato definido em ${formatCurrency(finalVal)}. Saldo de ITBI restante diluído a ${formatCurrency(engineResult.parcelaMensalITBI)}/mês.`);
      } else {
        onShowToast(`ITBI no Ato zerado. Valor total diluído a ${formatCurrency(engineResult.parcelaMensalITBI)}/mês.`);
      }
    }
  };

  // O teto de meses nunca pode passar do que a política de crédito prevê
  // (mesesObra/mesesPos da condição) — o corretor pode reduzir livremente,
  // mas não ampliar além do que a política cadastrou.
  const handleTotalObraParcelasChange = (newTotal: number) => {
    if (newTotal < 0) return;
    if (newTotal > mesesObraPadraoPolitica) {
      if (onShowToast) {
        onShowToast(`A política de crédito prevê no máximo ${mesesObraPadraoPolitica} meses de Obra.`);
      }
      recalcularFluxoObraMeses(mesesObraPadraoPolitica);
      return;
    }
    recalcularFluxoObraMeses(newTotal);
  };

  const handleTotalPosParcelasChange = (newTotal: number) => {
    if (newTotal < 0) return;
    if (newTotal > mesesPosPadraoPolitica) {
      if (onShowToast) {
        onShowToast(`A política de crédito prevê no máximo ${mesesPosPadraoPolitica} meses de Pós-Obra.`);
      }
      recalcularFluxoPosMeses(mesesPosPadraoPolitica);
      return;
    }
    recalcularFluxoPosMeses(newTotal);
  };

  const deliveryText = currentProd.deliveryDate 
    ? formatDeliveryText(currentProd.deliveryDate)
    : (fase.includes('2') && currentProd.deliveryDatePhase2)
      ? formatDeliveryText(currentProd.deliveryDatePhase2)
      : currentProd.deliveryDatePhase1
        ? formatDeliveryText(currentProd.deliveryDatePhase1)
        : '';

  const hasTable = dbUnitsEfetivos.length > 0;

  const pctObra = baseLiquidaComITBI > 0 ? (totalFaseObraComITBI / baseLiquidaComITBI) * 100 : 0;
  const pctPos = baseLiquidaComITBI > 0 ? (totalFasePosComITBI / baseLiquidaComITBI) * 100 : 0;
  const pctProSoluto = pctObra + pctPos;
  
  const pieData1 = [
    { name: 'Total Pró-Soluto', value: pctProSoluto, fill: '#059669', label: `${pctProSoluto.toFixed(2)}%` },
    { name: 'Total Obra', value: pctObra, fill: '#0284C7', label: `${pctObra.toFixed(2)}%` },
    { name: 'Total Pós-Obra', value: pctPos, fill: '#7C3AED', label: `${pctPos.toFixed(2)}%` }
  ].filter(d => d.value > 0);

  const pieData2 = [
    { name: 'Total Pró-Soluto', value: totalFaseObraComITBI + totalFasePosComITBI, fill: '#059669', label: formatCurrency(totalFaseObraComITBI + totalFasePosComITBI) },
    { name: 'Total Obra', value: totalFaseObraComITBI, fill: '#0284C7', label: formatCurrency(totalFaseObraComITBI) },
    { name: 'Total Pós-Obra', value: totalFasePosComITBI, fill: '#7C3AED', label: formatCurrency(totalFasePosComITBI) }
  ].filter(d => d.value > 0);

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, index, payload }: any) => {
    if (payload.value <= 0) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="normal">
        {payload.label}
      </text>
    );
  };

  // Cada balde/série (0-5) pode ter meses tanto em Obra quanto em Pós-Obra
  // quando atravessa a fronteira entre as duas fases (o mesmo peso da
  // política é mantido, só o rateio de meses muda) — cada fase tem sua
  // própria parcelaBrutaFinal (taxas diferentes), então precisam virar DUAS
  // barras distintas ("Série N (Obra)" / "Série N (Pós-Obra)") em vez de uma
  // só, que descartava silenciosamente o valor de uma das duas fases.
  const barData: { name: string; percBase: number; percBaseRaw: number; parcelaBruta: number; percRenda: number; percRendaRaw: number; qtdTotal: number; labelFormatado: string }[] = [];
  [0, 1, 2, 3, 4, 5].forEach(idx => {
    const oSerie = morarEngineBase?.obraSeries[idx] || { qtd: 0, parcelaBrutaFinal: 0 };
    const pSerie = morarEngineBase?.posSeries[idx] || { qtd: 0, parcelaBrutaFinal: 0 };
    const isSplit = oSerie.qtd > 0 && pSerie.qtd > 0;

    const pushFase = (fase: { qtd: number; parcelaBrutaFinal: number }, sufixo: string) => {
      if (fase.qtd <= 0) return;
      // `morarEngineBase` é o motor "base/sugerido" (sem considerar Ato manual
      // nem Pagamento à Vista) — quando o Ato já cobre o Pró-Soluto inteiro
      // (saldoProSolutoRestante <= 0), não sobra parcela nenhuma de verdade,
      // então a parcela bruta some daqui também, e não só nos cards de Obra/
      // Pós-Obra que já respeitavam isso.
      const parcelaBruta = saldoProSolutoRestante <= 0 ? 0 : fase.parcelaBrutaFinal;
      const subtotalBruto = fase.qtd * parcelaBruta;
      const percBase = baseLiquidaComITBI > 0 ? (subtotalBruto / baseLiquidaComITBI) * 100 : 0;
      const percRenda = income > 0 ? (parcelaBruta / income) * 100 : 0;
      barData.push({
        name: isSplit ? `Série ${idx + 1} ${sufixo}` : `Série ${idx + 1}`,
        percBase: Number(percBase.toFixed(2)),
        percBaseRaw: percBase,
        parcelaBruta,
        percRenda: Number(percRenda.toFixed(2)),
        percRendaRaw: percRenda,
        qtdTotal: fase.qtd,
        labelFormatado: `${percRenda.toFixed(2)}%`
      });
    };

    pushFase(oSerie, '(Obra)');
    pushFase(pSerie, '(Pós-Obra)');
  });

  // O ITBI/Registro parcelado é um comprometimento de renda à parte, pago todo
  // mês durante Obra e Pós-Obra independente das séries do Pró-Soluto — por
  // isso entra no gráfico como suas próprias barras, e não some quando as
  // séries do Pró-Soluto estão zeradas (ex.: Pró-Soluto inteiro levado para o
  // Ato): o risco do ITBI continua existindo mesmo nesse cenário.
  const pushItbiFase = (qtd: number, parcelaBruta: number, nome: string) => {
    if (qtd <= 0 || parcelaBruta <= 0) return;
    const subtotalBruto = qtd * parcelaBruta;
    const percBase = baseLiquidaComITBI > 0 ? (subtotalBruto / baseLiquidaComITBI) * 100 : 0;
    const percRenda = income > 0 ? (parcelaBruta / income) * 100 : 0;
    barData.push({
      name: nome,
      percBase: Number(percBase.toFixed(2)),
      percBaseRaw: percBase,
      parcelaBruta,
      percRenda: Number(percRenda.toFixed(2)),
      percRendaRaw: percRenda,
      qtdTotal: qtd,
      labelFormatado: `${percRenda.toFixed(2)}%`
    });
  };
  pushItbiFase(itbiObraTotalMeses, itbiParcelaObraValor, 'ITBI (Obra)');
  pushItbiFase(itbiPosTotalMeses, itbiParcelaPosValor, 'ITBI (Pós-Obra)');

  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200 text-xs z-50 relative">
          <strong className="block text-slate-800 mb-1">{data.name}</strong>
          <div className="space-y-1">
            <div className="flex justify-between gap-4"><span className="text-slate-500">Parcela:</span><strong className="text-slate-800">{formatCurrency(data.parcelaBruta)}</strong></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Renda:</span><strong className="text-slate-800">{formatCurrency(income)}</strong></div>
            <div className="flex justify-between gap-4 pt-1 border-t border-slate-100"><span className="text-slate-500 font-semibold">Comprometimento:</span><strong className="text-rose-600">{data.percRenda}%</strong></div>
          </div>
        </div>
      );
    }
    return null;
  };

  const [isSavingSimulation, setIsSavingSimulation] = useState<boolean>(false);

  // Monta o snapshot completo da simulação no formato salvo em `simulacoes`.
  const montarDadosCompletos = () => ({
    empreendimento_id: currentProd?.id || '',
    empreendimento_nome: currentProd?.name || '',
    condicao_id: currentCond?.id || '',
    condicao_nome: currentCond?.name || '',
    // Qual das duas telas (completa ou simplificada) gerou esta simulação —
    // usado só ao reabrir por "Simulações Salvas" (handleEditSimulation em
    // App.tsx), pra devolver a pessoa pra mesma versão da ficha em que ela
    // salvou, em vez de sempre cair na completa.
    origem_tela: isNovato ? 'ficha-morar-simplificada' : 'ficha-morar',
    torre: selectedTorre || 'Não Selecionada',
    unidade: selectedUnidade || 'Não Selecionada',
    tipologia: hasUnitSelected ? tipologia : null,
    simulation_data: simulationData,
    cliente_nome: simulationData.clientName || 'Cliente Não Informado',
    renda: income,
    preco_tabela: price,
    avaliacao_bancaria: evaluation,
    itbi_total: itbiValTabela,
    financiamento_maximo: maxFinancEfetivo,
    subsidio: subsidyEfetivo,
    fgts: fgtsEfetivo,
    recurso_proprio: simulationData.ownResource || 0,
    ato_bruto: valorAtoEfetivo,
    desconto_ato_premiado: descontoAto,
    ato_liquido: atoLiquidoConstrutora,
    itbi_no_ato: atoITBIValidado,
    total_obra: totalFaseObraComITBI,
    total_pos_obra: totalFasePosComITBI,
    pro_soluto_total: totalFaseObraComITBI + totalFasePosComITBI,
    faixas_obra: faixasObra,
    faixas_pos: faixasPos,
    comissao_apartada_valor: comissaoApartadaValor,
    comissao_apartada_parcelas: comissaoApartadaParcelasQtd,
    comissao_apartada_parcela_valor: comissaoApartadaParcelaValor,
    salvo_em: new Date().toISOString()
  });

  // Registro (id) já salvo automaticamente para a simulação atual — enquanto
  // a pessoa continua na mesma torre/unidade, novos ajustes ATUALIZAM essa
  // mesma linha em vez de criar uma nova a cada salvamento automático. Muda
  // de torre/unidade/empreendimento/cliente → vira uma simulação nova.
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
        renda: income,
        empreendimento_id: currentProd.id,
        dados: dadosCompletos
      };
      const res = autoSavedIdRef.current
        ? await imoveisService.atualizarSimulacao(autoSavedIdRef.current, payload)
        : await imoveisService.salvarSimulacao(payload);

      if (res.success) {
        const novoId = (res.data as any[])?.[0]?.id;
        if (novoId) autoSavedIdRef.current = novoId;
        if (!silencioso) onShowToast(`Proposta de ${simulationData.clientName || 'simulação'} salva no Supabase com sucesso!`);
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
    simulationData, income, price, evaluation, itbiValTabela, maxFinancEfetivo, subsidyEfetivo, fgtsEfetivo,
    valorAtoEfetivo, descontoAto, atoITBIValidado, totalFaseObraComITBI, totalFasePosComITBI,
    comissaoApartadaValor, comissaoApartadaParcelasQtd
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

  if (isNovato) {
    return (
      <>
        <NovatoSimuladorView
          pdfSettings={pdfSettings}
          telaSettings={telaSettings}
          condicoesLiberadas={condicoesLiberadas}
          product={currentProd}
          condition={currentCond}
          simulationData={simulationData}
          products={products}
          onSelectProduct={onSelectProduct}
          onProductChange={handleProductDropdownChange}
          onSelectCondition={onSelectCondition}
          onConditionChange={handleConditionDropdownChange}
          onLimpar={handleResetFicha}
          onSaveSimulation={handleSaveSimulation}
          isSavingSimulation={isSavingSimulation}
          selectedTorre={selectedTorre}
          selectedUnidade={selectedUnidade}
          availableTorres={availableTorres}
          filteredUnits={filteredUnits}
          onTorreChange={handleTorreChange}
          onUnidadeChange={handleUnidadeChange}
          fase={fase}
          tipologia={tipologia}
          areaPriv={areaPriv}
          areaQuintal={areaQuintal}
          price={price}
          precoTabelaOriginal={precoTabelaOriginal}
          evaluation={evaluation}
          deliveryText={deliveryText}
          income={income}
          subsidy={subsidyEfetivo}
          fgts={fgtsEfetivo}
          desconto={descontoAto}
          maxFinanc={maxFinancEfetivo}
          totalNegoc={totalNegocEfetivo}
          sinalTotal={sinalTotalSemITBIEfetivo}
          comITBI={sinalTotalComITBIEfetivo}
          distribuido={totalDistribuido}
          isAtoPremiadoEnabled={isAtoPremiadoEnabled}
          onToggleAtoPremiado={handleToggleAtoPremiado}
          dataAto={dataAto}
          valorAto={isComissaoApartada ? atoLiquidoConstrutora : valorAtoEfetivo}
          valorAtoMinimo={isComissaoApartada
            ? Math.max(0, Math.round((Math.max(sinalMinimoVal, atoSugeridoResidual) - comissaoApartadaValor) * 100) / 100)
            : Math.max(sinalMinimoVal, atoSugeridoResidual)}
          valorAtoMaximo={isComissaoApartada
            ? Math.max(0, Math.round((valorAtoMaximoCalculado - comissaoApartadaValor) * 100) / 100)
            : valorAtoMaximoCalculado}
          onAtoChange={(novoVal) => {
            if (novoVal === null) {
              setValAtoManual(null);
              setAtoInputText(formatCurrency(atoSugeridoResidual));
              aplicarDistribuicaoOficialMorar();
            } else {
              const novoValBruto = isComissaoApartada
                ? Math.round((novoVal + comissaoApartadaValor) * 100) / 100
                : novoVal;
              setValAtoManual(novoValBruto);
              setAtoInputText(formatCurrency(novoValBruto));
              recalcularSeriesParaAtoManual(novoValBruto);
            }
          }}
          valAtoITBI={valAtoITBI}
          valorTotalITBI={valorTotalITBI}
          isFirstHome={isFirstHomeLocal}
          onToggleFirstHome={handleToggleFirstHome}
          onITBIChange={(novoVal) => {
            setValAtoITBI(novoVal);
            setItbiAtoManualFloor(novoVal > 0 ? novoVal : null);
            // Reavalia imediatamente o risco (comprometimento de renda) com o
            // novo ITBI pago no Ato invocando a MESMA rotina global de
            // distribuição automática usada para reequilibrar uma proposta
            // fora do limite — ela recalcula e sobrescreve o Ato (Imóvel)
            // (valAtoManual/atoInputText) para o novo valor otimizado, além
            // das séries S1/S2/S3, em vez de só elevar o Ato quando estourava
            // o teto. `novoVal` é passado via override porque o state
            // (itbiAtoManualFloor) ainda não foi commitado neste tick.
            aplicarDistribuicaoOficialMorar({ atoITBI: novoVal });
          }}
          comissaoApartadaValor={comissaoApartadaValor}
          comissaoApartadaParcelasQtd={comissaoApartadaParcelasQtd}
          comissaoApartadaParcelaValor={comissaoApartadaParcelaValor}
          minComissaoParcelas={minComissaoParcelas}
          maxComissaoParcelas={maxComissaoParcelas}
          onComissaoParcelasChange={setComissaoParcelasManual}
          dataObra={dataObra}
          totalParcObra={totalParcObra}
          faixasObra={faixasObra}
          onObraTotalChange={handleTotalObraParcelasChange}
          maxParcObra={mesesObraPadraoPolitica}
          totalFaseObraSemITBI={totalFaseObraSemITBI}
          dataPos={dataPos}
          totalParcPos={totalParcPos}
          faixasPos={faixasPos}
          onPosTotalChange={handleTotalPosParcelasChange}
          maxParcPos={mesesPosPadraoPolitica}
          totalFasePosSemITBI={totalFasePosSemITBI}
          saldoProSolutoRestante={saldoProSolutoRestante}
          onLimparFluxo={limparFluxoPagamento}
          dataITBI={dataITBI}
          valorITBI={despCartoriasEfetivas}
          itbiObraQtd={itbiObraTotalMeses}
          itbiObraValor={itbiParcelaObraValor}
          itbiPosQtd={itbiPosTotalMeses}
          itbiPosValor={itbiParcelaPosValor}
          baseLiquidaComITBI={baseLiquidaComITBI}
          baseRendaInformada={baseRendaInformada}
          limiteMaximoRiscoRenda={limiteMaximoRiscoRenda}
          limiteMaximoProSoluto={limiteMaximoProSoluto}
          pctRiscoParcelaRenda={pctRiscoParcelaRenda}
          valorRiscoParcela={valorRiscoParcela}
          pctRiscoProSoluto={pctRiscoProSoluto}
          valorRiscoProSoluto={valorRiscoProSoluto}
          pieDataPct={pieData1}
          pieDataValor={pieData2}
          barData={barData}
          onShowToast={onShowToast}
          onBackToSimulator={onBackToSimulator}
          onOpenPdfExport={() => setIsPdfModalOpen(true)}
        />

        {isPdfModalOpen && (
          <PdfExportModalMorar
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
            precoTabelaOriginal={precoTabelaOriginal}
            evaluation={evaluation}
            deliveryText={deliveryText}
            income={income}
            subsidy={subsidyEfetivo}
            fgts={fgtsEfetivo}
            desconto={descontoAto}
            maxFinanc={maxFinancEfetivo}
            totalNegoc={totalNegocEfetivo}
            sinalTotal={sinalTotalSemITBIEfetivo}
            comITBI={sinalTotalComITBIEfetivo}
            distribuido={totalDistribuido}
            dataAto={dataAto}
            valorAto={isComissaoApartada ? atoLiquidoConstrutora : valorAtoEfetivo}
            comissaoApartadaValor={comissaoApartadaValor}
            comissaoApartadaParcelasQtd={comissaoApartadaParcelasQtd}
            comissaoApartadaParcelaValor={comissaoApartadaParcelaValor}
            dataObra={dataObra}
            totalParcObra={totalParcObra}
            faixasObra={faixasObra}
            dataPos={dataPos}
            totalParcPos={totalParcPos}
            faixasPos={faixasPos}
            dataITBI={dataITBI}
            valorITBI={despCartoriasEfetivas}
            itbiObraQtd={itbiObraTotalMeses}
            itbiObraValor={itbiParcelaObraValor}
            itbiPosQtd={itbiPosTotalMeses}
            itbiPosValor={itbiParcelaPosValor}
            isAtoPremiadoEnabled={isAtoPremiadoEnabled}
            baseLiquidaComITBI={baseLiquidaComITBI}
            baseRendaInformada={baseRendaInformada}
            limiteMaximoRiscoRenda={limiteMaximoRiscoRenda}
            limiteMaximoProSoluto={limiteMaximoProSoluto}
            pctRiscoParcelaRenda={pctRiscoParcelaRenda}
            valorRiscoParcela={valorRiscoParcela}
            pctRiscoProSoluto={pctRiscoProSoluto}
            valorRiscoProSoluto={valorRiscoProSoluto}
            pieDataPct={pieData1}
            pieDataValor={pieData2}
            barData={barData}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      
      {/* BARRA SUPERIOR DE NAVEGAÇÃO — componente compartilhado com a tela
          simplificada (NovatoSimuladorView), estritamente idêntico. */}
      <FichaMorarTopBar
        onBackToSimulator={onBackToSimulator}
        products={products}
        currentProd={currentProd}
        onSelectProduct={onSelectProduct}
        onProductChange={handleProductDropdownChange}
        currentCond={currentCond}
        onSelectCondition={onSelectCondition}
        onConditionChange={handleConditionDropdownChange}
        deliveryText={deliveryText}
        condicoesLiberadas={condicoesLiberadas}
        isSimplificado={false}
      />

      {/* ALERTA: TABELA DE VENDAS NÃO IMPORTADA OU VENCIDA */}
      {!hasTable && (
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

      {/* CARD DO IMÓVEL E CLIENTE CENTRALIZADOS */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm space-y-2.5 w-full overflow-hidden">
        <FichaMorarActionBar
          clientName={simulationData.clientName}
          agency={simulationData.agency}
          onLimpar={handleResetFicha}
          onSaveSimulation={handleSaveSimulation}
          isSavingSimulation={isSavingSimulation}
          onOpenPdfExport={() => setIsPdfModalOpen(true)}
        />

        <FichaMorarProdutoGrid
          selectedTorre={selectedTorre}
          selectedUnidade={selectedUnidade}
          availableTorres={availableTorres}
          filteredUnits={filteredUnits}
          onTorreChange={handleTorreChange}
          onUnidadeChange={handleUnidadeChange}
          fase={fase}
          tipologia={tipologia}
          areaPriv={areaPriv}
          areaQuintal={areaQuintal}
          precoTabelaOriginal={precoTabelaOriginal}
          evaluation={evaluation}
        />
      </div>

      {/* CORPO DA PÁGINA: GRID DE 2 COLUNAS IDÊNTICO AO DETAILSVIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        
        {/* ================= COLUNA DA ESQUERDA: DADOS DA APROVAÇÃO DE CRÉDITO ================= */}
        <div className="space-y-4">
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
              {hasUnitSelected && valorBase > 0 && (
                <div className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                  Valor Base: <strong className="text-slate-800">{formatCurrency(valorBase)}</strong>
                </div>
              )}
            </div>

            {/* SUBCOLUNAS LADO A LADO: RECURSOS DO CLIENTE & OPERAÇÃO BANCÁRIA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
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
                    <strong className="text-emerald-600 font-semibold">{formatCurrency(subsidyEfetivo)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">FGTS:</span>
                    <strong className="text-morar-600 font-semibold">{formatCurrency(fgtsEfetivo)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">Desconto à Vista:</span>
                    <strong className="text-amber-700 font-semibold">{formatCurrency(valorDescontoAVista)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 mt-1">
                    <span className="text-slate-600">Desconto Ato:</span>
                    <strong className="text-emerald-600 font-semibold">{formatCurrency(descontoAto)}</strong>
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
                    <strong className="text-morar-600 font-bold">{formatCurrency(maxFinancEfetivo)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">Total Negoc:</span>
                    <strong className="text-slate-800 font-semibold">{formatCurrency(totalNegocEfetivo)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">Sinal Total (s/ ITBI):</span>
                    <strong className="text-amber-700 font-bold">{formatCurrency(sinalTotalSemITBIEfetivo)}</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 mt-1">
                    <span className="text-slate-600">Sinal Líquido:</span>
                    <strong className="text-amber-800 font-black">{formatCurrency(sinalLiquidoTotalEfetivo)}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* TOTAIS COM ITBI E DISTRIBUIÇÃO */}
            <div className="space-y-1.5 pt-1 text-xs">
              <div className="flex justify-between items-center px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200/80">
                <span className="text-slate-600 font-medium">ITBI / Registro Total:</span>
                <strong className="text-emerald-700 font-bold">{formatCurrency(despCartoriasEfetivas)}</strong>
              </div>
              <div className="flex justify-between items-center px-3 py-1.5 bg-emerald-50/60 rounded-lg border border-emerald-100">
                <span className="text-emerald-900 font-bold">Total com ITBI:</span>
                <strong className="text-emerald-800 font-black text-xs sm:text-sm">{formatCurrency(sinalTotalComITBIEfetivo)}</strong>
              </div>
            </div>

            {/* VALIDAÇÃO AUTOMÁTICA EM TEMPO REAL: TOTAL DISTRIBUÍDO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 bg-morar-50 px-3.5 rounded-lg border border-morar-100 mt-3 gap-2 transition-colors">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-800">Distribuído:</span>
                {hasUnitSelected && (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" />
                    100% Validado
                  </span>
                )}
              </div>
              <strong className="text-xs sm:text-sm font-black text-morar-700">
                {formatCurrency(totalDistribuido)}
              </strong>
            </div>
          </div>
          )}

          {/* CORREÇÃO IGPM+1% (TAXAS E REGISTRO / ITBI INTERATIVO) — layout
              exclusivo do "Sinal c/ Morar" (e sua variante Comissão Apartada,
              únicas condições comerciais que renderizam este componente):
              posicionado logo abaixo dos Dados da Aprovação de Crédito, na
              mesma coluna, em vez de junto ao Fluxo de Entrada c/ Construtora
              (coluna da direita). Nenhuma mudança de regra de negócio/cálculo
              — mesmo card, mesmo estado, só a posição no grid. Continua
              respeitando a visibilidade de "Bloco 3" (mesma seção lógica de
              antes na configuração de Visibilidade dos Quadros). */}
          {telaSettings.mostrarBloco3 && (
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <Receipt className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Correção IGPM+1% (Taxas e Registro)
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleFirstHome}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                    isFirstHomeLocal
                      ? 'bg-morar-50 text-morar-700 border-morar-100 hover:bg-morar-100'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                  title="Alternar entre Com Desconto e Sem Desconto no ITBI"
                >
                  {isFirstHomeLocal ? '1º Imóvel (Com Desc.)' : '2º Imóvel (Sem Desc.)'}
                </button>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              {/* ITBI / REGISTRO TOTAL */}
              <div className="flex justify-between items-center bg-emerald-50/60 hover:bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 transition-colors">
                <div>
                  <span className="text-xs font-bold text-emerald-900 block">ITBI / Registro Total:</span>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-medium mt-0.5">
                    <span>A partir de:</span>
                    <input
                      type="text"
                      value={dataITBI}
                      onChange={(e) => setDataITBI(e.target.value)}
                      className="morar-input bg-transparent hover:bg-white/60 focus:bg-white border-b border-dashed border-emerald-300 font-bold text-emerald-900 px-1 py-0.5 text-[10px] w-24 text-center focus:outline-none"
                      placeholder="Data início"
                    />
                  </div>
                </div>
                <div className="w-36 text-right">
                  <div
                    className="w-full bg-emerald-50 px-2 py-1 rounded border border-emerald-100 font-black text-emerald-800 text-right text-xs sm:text-sm cursor-not-allowed"
                    title="Valor calculado automaticamente a partir do preço/tabela — não editável."
                  >
                    {despCartoriasEfetivas > 0 ? formatCurrency(despCartoriasEfetivas) : 'R$ 0,00'}
                  </div>
                </div>
              </div>

              {/* DISCRIMINAÇÃO: ITBI NO ATO E SALDO RESTANTE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50/90 p-2.5 rounded-lg border border-slate-200/80">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[11px] font-medium text-slate-600">ITBI Pago no Ato:</span>
                  <strong className="text-xs font-bold text-emerald-700">
                    {atoITBIValidado > 0 ? formatCurrency(atoITBIValidado) : 'R$ 0,00'}
                  </strong>
                </div>
                <div className="flex justify-between items-center px-1 border-t sm:border-t-0 sm:border-l border-slate-200 pt-1.5 sm:pt-0 sm:pl-2.5">
                  <span className="text-[11px] font-medium text-slate-600">Saldo Restante a Parcelar:</span>
                  <strong className="text-xs font-bold text-slate-900">
                    {saldoITBI > 0 ? formatCurrency(saldoITBI) : 'R$ 0,00'}
                  </strong>
                </div>
              </div>

              {/* DISTRIBUIÇÃO DAS PARCELAS RESTANTES: OBRA E PÓS-OBRA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* OBRA */}
                <div className="bg-slate-50 hover:bg-slate-50/90 p-2.5 rounded-lg border border-slate-200/80 space-y-1.5 text-center transition-colors">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Obra:</span>
                    <span className="text-[10px] text-slate-400 font-medium">{itbiObraTotalMeses} meses</span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    <div
                      className="w-10 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 font-bold text-slate-700 text-center text-xs cursor-not-allowed"
                      title="Sempre igual à quantidade de parcelas de Obra — não editável."
                    >
                      {itbiObraTotalMeses}
                    </div>
                    <span className="text-xs font-bold text-slate-600">X de</span>
                    <div
                      className="w-24 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold text-slate-700 text-right text-xs cursor-not-allowed"
                      title="Valor calculado automaticamente pelo aplicativo — não editável. Para mudar, ajuste a quantidade de parcelas."
                    >
                      {itbiParcelaObraValor > 0 ? formatCurrency(itbiParcelaObraValor) : 'R$ 0,00'}
                    </div>
                  </div>
                </div>

                {/* PÓS OBRA */}
                <div className="bg-slate-50 hover:bg-slate-50/90 p-2.5 rounded-lg border border-slate-200/80 space-y-1.5 text-center transition-colors">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Pós Obra:</span>
                    <span className="text-[10px] text-slate-400 font-medium">{itbiPosTotalMeses} meses</span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    <div
                      className="w-10 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 font-bold text-slate-700 text-center text-xs cursor-not-allowed"
                      title="Sempre igual à quantidade de parcelas de Pós-Obra — não editável."
                    >
                      {itbiPosTotalMeses}
                    </div>
                    <span className="text-xs font-bold text-slate-600">X de</span>
                    <div
                      className="w-24 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold text-slate-700 text-right text-xs cursor-not-allowed"
                      title="Valor calculado automaticamente pelo aplicativo — não editável. Para mudar, ajuste a quantidade de parcelas."
                    >
                      {itbiParcelaPosValor > 0 ? formatCurrency(itbiParcelaPosValor) : 'R$ 0,00'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* BLOCO 4: INDICADORES DE RISCO / COMPROMETIMENTO */}
          {telaSettings.mostrarBloco4 && (
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
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
                  <span className="text-slate-400 font-medium">Base Líq. c/ ITBI:</span>
                  <strong className="font-bold text-slate-800">{formatCurrency(baseLiquidaComITBI)}</strong>
                </div>
                <div className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                  <span className="text-slate-400 font-medium">Base Renda:</span>
                  <strong className="font-bold text-slate-800">{formatCurrency(baseRendaInformada)}</strong>
                </div>
                <div className="flex items-center gap-1 bg-morar-50 px-2 py-0.5 rounded border border-morar-100 text-morar-700">
                  <span className="font-semibold tracking-tight truncate max-w-[120px]" title={nomeFaixaRenda}>{nomeFaixaRenda}</span>
                </div>
              </div>
            </div>

            {/* GRÁFICOS CONSOLIDADOS: PERCENTUAL DE RISCO POR FASE + VOLUME FINANCEIRO POR FASE, LADO A LADO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* GRÁFICO 1: PERCENTUAL DE RISCO POR FASE */}
              <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3 shadow-2xs">
                <div className="text-center">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Percentual de Risco por Fase
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Distribuição percentual do Pró-Soluto sobre a Base Líquida com ITBI
                  </p>
                </div>

                <div className="w-40 h-40 sm:w-48 sm:h-48 mx-auto flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={pieData1}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        innerRadius={0}
                        outerRadius={64}
                        stroke="#ffffff"
                        strokeWidth={2}
                        startAngle={270}
                        endAngle={-90}
                        labelLine={false}
                        label={renderCustomizedLabel}
                      >
                        {pieData1.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name]} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center justify-center gap-3 sm:gap-4 text-[11px] font-semibold text-slate-600 flex-wrap pt-1 border-t border-slate-200/60">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7] shrink-0" />
                    <span>Total Obra</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed] shrink-0" />
                    <span>Total Pós-Obra</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#059669] shrink-0" />
                    <span>Total Pró-Soluto</span>
                  </span>
                </div>
              </div>

              {/* GRÁFICO 2: VOLUME FINANCEIRO POR FASE (R$) */}
              <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3 shadow-2xs">
                <div className="text-center">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Volume Financeiro por Fase (R$)
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Distribuição em R$ do Pró-Soluto sobre a Base Líquida com ITBI
                  </p>
                </div>

                <div className="w-40 h-40 sm:w-48 sm:h-48 mx-auto flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={pieData2}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        innerRadius={0}
                        outerRadius={64}
                        stroke="#ffffff"
                        strokeWidth={2}
                        startAngle={270}
                        endAngle={-90}
                        labelLine={false}
                        label={renderCustomizedLabel}
                      >
                        {pieData2.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(value: number, name: string) => [formatCurrency(value), name]} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center justify-center gap-3 sm:gap-4 text-[11px] font-semibold text-slate-600 flex-wrap pt-1 border-t border-slate-200/60">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7] shrink-0" />
                    <span>Total Obra</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed] shrink-0" />
                    <span>Total Pós-Obra</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#059669] shrink-0" />
                    <span>Total Pró-Soluto</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* INDICADORES CALCULADOS: 1ª PARCELA / RENDA & PRÓ-SOLUTO TOTAL EM R$ E % */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200/70 text-xs">
                {/* INDICADOR 1: 1ª PARCELA E COMPROMETIMENTO DA RENDA */}
                <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${pctRiscoParcelaRenda > limiteMaximoRiscoRenda ? 'bg-red-500' : 'bg-morar-600'}`} />
                      1ª Parcela:
                    </span>
                    <strong className="text-slate-900 font-bold">
                      {formatCurrency(valorRiscoParcela)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Comprometimento da Renda:</span>
                    <strong className={`font-bold ${pctRiscoParcelaRenda > limiteMaximoRiscoRenda ? 'text-red-600' : 'text-morar-700'}`}>
                      {pctRiscoParcelaRenda < 10 && pctRiscoParcelaRenda > 0 ? pctRiscoParcelaRenda.toFixed(2) : pctRiscoParcelaRenda.toFixed(1)}%
                    </strong>
                  </div>
                </div>

                {/* INDICADOR 2: PRÓ-SOLUTO TOTAL EM R$ E % */}
                <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${pctRiscoProSoluto > limiteMaximoProSoluto ? 'bg-red-500' : 'bg-emerald-600'}`} />
                      Pró-Soluto Total (R$):
                    </span>
                    <strong className="text-slate-900 font-bold">
                      {formatCurrency(valorRiscoProSoluto)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Pró-Soluto Total (%):</span>
                    <strong className={`font-bold ${pctRiscoProSoluto > limiteMaximoProSoluto ? 'text-red-600' : 'text-emerald-700'}`}>
                      {pctRiscoProSoluto < 10 && pctRiscoProSoluto > 0 ? pctRiscoProSoluto.toFixed(2) : pctRiscoProSoluto.toFixed(2)}%
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

        </div>

        {/* ================= COLUNA DA DIREITA: FLUXO DE ENTRADA C/ CONSTRUTORA & FAIXAS MORAR ================= */}
        <div className="space-y-4">
          
          {/* BLOCO 3: PERÍODO DE PAGAMENTOS (ATO + CORREÇÃO INCC/IPCA/IGPM E ITBI) */}
          {telaSettings.mostrarBloco3 && (
          <>
          <FluxoEntradaConstrutora
            title="2. FLUXO DE ENTRADA C/ CONSTRUTORA"
            onLimpar={limparFluxoPagamento}
            // Na condição Comissão Apartada, o campo ATO (IMÓVEL) exibe e aceita
            // o valor JÁ LÍQUIDO da corretagem (comissão paga por fora, não
            // compõe o caixa da construtora) — por isso o valor exibido, o piso,
            // o teto e o valor digitado (onAtoChange) são todos convertidos
            // aqui, na fronteira com o componente. Internamente (valAtoManual,
            // o motor de cálculo, os pisos de risco) tudo continua operando
            // sobre o Ato BRUTO, sem nenhuma mudança de comportamento.
            valorAto={isComissaoApartada ? atoLiquidoConstrutora : valorAtoEfetivo}
            valorAtoMinimo={isComissaoApartada
              ? Math.max(0, Math.round((Math.max(sinalMinimoVal, atoSugeridoResidual) - comissaoApartadaValor) * 100) / 100)
              : Math.max(sinalMinimoVal, atoSugeridoResidual)}
            // Teto do Ato: zera Pró-Soluto + Financiamento + FGTS, mas nunca avança sobre o
            // Subsídio. Resolvido como ponto fixo (ato* = price - subsidy - desconto(ato*))
            // pois o desconto do Ato Premiado é escalonado pelo próprio valor do Ato.
            valorAtoMaximo={isComissaoApartada
              ? Math.max(0, Math.round((valorAtoMaximoCalculado - comissaoApartadaValor) * 100) / 100)
              : valorAtoMaximoCalculado}
            onAtoChange={(novoVal) => {
              if (novoVal === null) {
                setValAtoManual(null);
                setAtoInputText(formatCurrency(atoSugeridoResidual));
                aplicarDistribuicaoOficialMorar();
              } else {
                // Converte o valor líquido digitado de volta para o Ato bruto
                // antes de gravar no estado — o motor de cálculo e os pisos de
                // risco (calcularSeriesParaAtoManual, efeitos de reajuste) nunca
                // veem/manipulam o valor líquido, só o bruto.
                const novoValBruto = isComissaoApartada
                  ? Math.round((novoVal + comissaoApartadaValor) * 100) / 100
                  : novoVal;
                setValAtoManual(novoValBruto);
                setAtoInputText(formatCurrency(novoValBruto));
                recalcularSeriesParaAtoManual(novoValBruto);
              }
            }}
            onShowToast={onShowToast}
            valAtoITBI={valAtoITBI}
            valorTotalITBI={valorTotalITBI}
            isFirstHome={isFirstHomeLocal}
            onToggleFirstHome={handleToggleFirstHome}
            onITBIChange={(novoVal) => {
              setValAtoITBI(novoVal);
              // Guarda o valor digitado como piso manual — as próximas
              // recalculagens (ex.: ao mudar a Qtd. Meses) partem dele, nunca
              // de zero, mas também nunca de uma sugestão automática anterior.
              setItbiAtoManualFloor(novoVal > 0 ? novoVal : null);
              // Reavalia imediatamente o risco (comprometimento de renda) com o
              // novo ITBI pago no Ato invocando a MESMA rotina global de
              // distribuição automática usada para reequilibrar uma proposta
              // fora do limite — ela recalcula e sobrescreve o Ato (Imóvel)
              // (valAtoManual/atoInputText) para o novo valor otimizado, além
              // das séries S1/S2/S3, em vez de só elevar o Ato quando estourava
              // o teto. `novoVal` é passado via override porque o state
              // (itbiAtoManualFloor) ainda não foi commitado neste tick.
              aplicarDistribuicaoOficialMorar({ atoITBI: novoVal });
            }}
            descontoAto={descontoAto}
            isAtoPremiadoActive={isAtoPremiadoEnabled}
            onToggleAtoPremiado={handleToggleAtoPremiado}
            isPagamentoAVistaActive={isPagamentoAVistaEnabled}
            onTogglePagamentoAVista={handleTogglePagamentoAVista}
            isAVistaActive={isAVistaActive}
            onToggleAVista={(ativo) => {
              if (ativo) {
                // Traz o Pró-Soluto inteiro para o Ato (Imóvel), zerando as parcelas —
                // mesmo mecanismo de um Ato manual, só que calculado automaticamente
                // para o valor exato que zera o Pró-Soluto (sem tocar Financiamento/FGTS),
                // já considerando o desconto do Ato Premiado quando ativo.
                setValAtoManual(atoAVistaTarget);
                setAtoInputText(formatCurrency(atoAVistaTarget));
                recalcularSeriesParaAtoManual(atoAVistaTarget);
              } else {
                // Volta para o fluxo parcelado normal (Ato automático/sugerido).
                setValAtoManual(null);
                setAtoInputText(formatCurrency(atoSugeridoResidual));
                aplicarDistribuicaoOficialMorar();
              }
            }}
          />

          {/* CARD 2: CORREÇÃO INCC - OBRA (INTERATIVO) */}
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-morar-50 text-morar-600">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Correção INCC - Obra
                  </h3>
                  <MonthStepper
                    total={totalParcObra}
                    onChange={handleTotalObraParcelasChange}
                    max={mesesObraPadraoPolitica}
                    colorClass="bg-morar-50 border-morar-100 text-morar-700"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium text-[11px]">A partir de:</span>
                  <input
                    type="text"
                    value={dataObra}
                    onChange={(e) => setDataObra(e.target.value)}
                    className="morar-input bg-slate-50 hover:bg-slate-100 focus:bg-white border border-dashed border-slate-200 hover:border-slate-300 focus:border-morar-500 rounded-md px-2 py-0.5 text-xs font-bold text-slate-800 w-32 text-center transition-all focus:outline-none"
                    placeholder="Ex: setembro, 2026"
                  />
                </div>
              </div>
            </div>

            {/* LISTA / GRID DE LINHAS DINÂMICAS DE OBRA */}
            <div className="space-y-2 text-xs">
              {faixasObra
                .map((faixa, originalIndex) => ({ faixa, originalIndex }))
                .filter(({ faixa }) => {
                  const valorLiquido = saldoProSolutoRestante <= 0 ? 0 : (Number(faixa.valor) || 0);
                  const meses = Number(faixa.qtd) || 0;
                  const itbiMensal = Number(itbiParcelaObraValor) || 0;
                  return meses > 0 && (valorLiquido > 0 || itbiMensal > 0);
                })
                .map(({ faixa, originalIndex }, index) => {
                  const valorLiquido = saldoProSolutoRestante <= 0 ? 0 : (Number(faixa.valor) || 0);
                  const subtotalSerie = (Number(faixa.qtd) || 0) * valorLiquido;
                  const parcelaBrutaComITBI = valorLiquido + itbiParcelaObraValor;
                  const displayIndex = (faixa as any).serieIndex !== undefined ? (faixa as any).serieIndex + 1 : originalIndex + 1;

                  return (
                    <div key={originalIndex} className="bg-slate-50/70 hover:bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 space-y-1.5 transition-colors">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="col-span-1 sm:col-span-4 flex items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-400">S{displayIndex}:</span>
                          <div
                            className="w-11 bg-slate-100 px-1 py-1 rounded border border-slate-200 font-bold text-slate-700 text-center text-xs cursor-not-allowed"
                            title="Calculado automaticamente a partir da Qtd. Meses de Obra acima — não editável."
                          >
                            {faixa.qtd}
                          </div>
                          <span className="font-bold text-slate-600 text-xs">X de</span>
                        </div>

                        <div className="col-span-1 sm:col-span-5">
                          <div
                            className="w-full px-2 py-1 rounded border border-slate-200 bg-slate-100 font-bold text-slate-700 text-right text-xs cursor-not-allowed"
                            title="Valor calculado automaticamente pelo aplicativo — não editável. Para mudar, ajuste a quantidade de parcelas."
                          >
                            {valorLiquido > 0 ? formatCurrency(valorLiquido) : 'R$ 0,00'}
                          </div>
                        </div>

                        <div className="col-span-1 sm:col-span-3 text-right">
                          <span className="text-[9px] text-slate-400 block font-medium">Subtotal</span>
                          <strong className="text-[11px] text-slate-800 font-bold">
                            {formatCurrency(subtotalSerie)}
                          </strong>
                        </div>
                      </div>

                      {/* DETALHE DO RATEIO DO ITBI + PARCELA BRUTA */}
                      <div className="flex items-center justify-between text-[10px] text-slate-500 bg-white/70 px-2 py-0.5 rounded border border-slate-100">
                        <span>+ ITBI: <strong className="text-emerald-700">{formatCurrency(itbiParcelaObraValor)}</strong></span>
                        <span>Parcela Bruta: <strong className="text-slate-900 font-bold">{formatCurrency(parcelaBrutaComITBI)}/mês</strong></span>
                      </div>
                    </div>
                  );
                })}

              <div className="flex justify-between items-center px-2 pt-1 text-[11px] text-slate-500 font-medium border-t border-slate-100 mt-1">
                <span>Total Fase Obra (c/ ITBI):</span>
                <strong className="text-slate-900 font-bold">{formatCurrency(totalFaseObraComITBI)}</strong>
              </div>
            </div>
          </div>

          {/* CARD 3: CORREÇÃO IPCA+1% - PÓS (INTERATIVO) */}
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Correção IPCA+1% - Pós
                  </h3>
                  <MonthStepper
                    total={totalParcPos}
                    onChange={handleTotalPosParcelasChange}
                    max={mesesPosPadraoPolitica}
                    colorClass="bg-indigo-50 border-indigo-100 text-indigo-700"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 font-medium text-[11px]">A partir de:</span>
                  <input
                    type="text"
                    value={dataPos}
                    onChange={(e) => setDataPos(e.target.value)}
                    className="morar-input bg-slate-50 hover:bg-slate-100 focus:bg-white border border-dashed border-slate-200 hover:border-slate-300 focus:border-morar-500 rounded-md px-2 py-0.5 text-xs font-bold text-slate-800 w-32 text-center transition-all focus:outline-none"
                    placeholder="Ex: junho, 2029"
                  />
                </div>
              </div>
            </div>

            {/* LISTA / GRID DE LINHAS DINÂMICAS DE PÓS-OBRA */}
            <div className="space-y-2 text-xs">
              {totalParcPos === 0 && (
                <div className="py-3 px-3 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center">
                  <p className="text-[11px] text-slate-500 font-medium">
                    Período Pós-Obra inativo (0 meses). Fluxo de parcelas e ITBI 100% concentrados na Obra.
                  </p>
                </div>
              )}
              {faixasPos
                .map((faixa, originalIndex) => ({ faixa, originalIndex }))
                .filter(({ faixa }) => {
                  const valorLiquido = saldoProSolutoRestante <= 0 ? 0 : (Number(faixa.valor) || 0);
                  const meses = Number(faixa.qtd) || 0;
                  const itbiMensal = Number(itbiParcelaPosValor) || 0;
                  return meses > 0 && (valorLiquido > 0 || itbiMensal > 0);
                })
                .map(({ faixa, originalIndex }, index) => {
                  const valorLiquido = saldoProSolutoRestante <= 0 ? 0 : (Number(faixa.valor) || 0);
                  const subtotalSerie = (Number(faixa.qtd) || 0) * valorLiquido;
                  const parcelaBrutaComITBI = valorLiquido + itbiParcelaPosValor;
                  const displayIndex = (faixa as any).serieIndex !== undefined ? (faixa as any).serieIndex + 1 : originalIndex + 1;

                  return (
                    <div key={originalIndex} className="bg-slate-50/70 hover:bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 space-y-1.5 transition-colors">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="col-span-1 sm:col-span-4 flex items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-400">S{displayIndex}:</span>
                          <div
                            className="w-11 bg-slate-100 px-1 py-1 rounded border border-slate-200 font-bold text-slate-700 text-center text-xs cursor-not-allowed"
                            title="Calculado automaticamente a partir da Qtd. Meses de Pós-Obra acima — não editável."
                          >
                            {faixa.qtd}
                          </div>
                          <span className="font-bold text-slate-600 text-xs">X de</span>
                        </div>

                        <div className="col-span-1 sm:col-span-5">
                          <div
                            className="w-full px-2 py-1 rounded border border-slate-200 bg-slate-100 font-bold text-slate-700 text-right text-xs cursor-not-allowed"
                            title="Valor calculado automaticamente pelo aplicativo — não editável. Para mudar, ajuste a quantidade de parcelas."
                          >
                            {valorLiquido > 0 ? formatCurrency(valorLiquido) : 'R$ 0,00'}
                          </div>
                        </div>

                        <div className="col-span-1 sm:col-span-3 text-right">
                          <span className="text-[9px] text-slate-400 block font-medium">Subtotal</span>
                          <strong className="text-[11px] text-slate-800 font-bold">
                            {formatCurrency(subtotalSerie)}
                          </strong>
                        </div>
                      </div>

                      {/* DETALHE DO RATEIO DO ITBI + PARCELA BRUTA */}
                      <div className="flex items-center justify-between text-[10px] text-slate-500 bg-white/70 px-2 py-0.5 rounded border border-slate-100">
                        <span>+ ITBI: <strong className="text-emerald-700">{formatCurrency(itbiParcelaPosValor)}</strong></span>
                        <span>Parcela Bruta: <strong className="text-slate-900 font-bold">{formatCurrency(parcelaBrutaComITBI)}/mês</strong></span>
                      </div>
                    </div>
                  );
                })}

              <div className="flex justify-between items-center px-2 pt-1 text-[11px] text-slate-500 font-medium border-t border-slate-100 mt-1">
                <span>Total Fase Pós-Obra (c/ ITBI):</span>
                <strong className="text-slate-900 font-bold">{formatCurrency(totalFasePosComITBI)}</strong>
              </div>
            </div>
          </div>
          </>
          )}

          {/* COMISSÃO A PAGAR — só na condição "Sinal c/ Morar (Comissão
              Apartada)". Parcelamento simples e independente: não passa por
              nenhum limite de risco, e não altera o Pró-Soluto (só o Ato da
              construtora sai líquido dela, ver atoLiquidoConstrutora). */}
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
                Parcelamento simples, sem taxa bancária nem limites de risco — só divide a comissão pelo número de parcelas. É pago em separado, por fora do contrato com a construtora, e não incide sobre as parcelas contratuais (séries de Obra/Pós-Obra) exibidas nesta ficha.
              </p>
            </div>
          )}

          {/* GRÁFICO: COMPROMETIMENTO POR SÉRIE (PARCELA / RENDA) — reposicionado
              para logo abaixo de "Comissão a Pagar", na coluna da direita
              (antes ficava ao final da coluna da esquerda). Mesmo componente,
              mesmos dados — só a posição no grid. */}
          {hasUnitSelected && telaSettings.mostrarBloco2 && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h4 className="text-sm font-semibold text-slate-800 uppercase text-center mb-4 tracking-wide">Comprometimento por Série (Parcela / Renda)</h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={50} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <RechartsTooltip content={<CustomBarTooltip />} cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="percRendaRaw" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={24}>
                      {barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#312e81', '#3730a3', '#4338ca', '#4f46e5', '#6366f1', '#818cf8'][index % 6]} />
                      ))}
                      <LabelList dataKey="labelFormatado" fill="#FFFFFF" fontSize={11} fontWeight="bold" position="insideRight" offset={10} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* MODAL DE EXPORTAÇÃO PDF ESPECÍFICO MORAR */}
      {isPdfModalOpen && (
        <PdfExportModalMorar
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
          precoTabelaOriginal={precoTabelaOriginal}
          evaluation={evaluation}
          deliveryText={deliveryText}
          income={income}
          subsidy={subsidyEfetivo}
          fgts={fgtsEfetivo}
          desconto={descontoAto}
          maxFinanc={maxFinancEfetivo}
          totalNegoc={totalNegocEfetivo}
          sinalTotal={sinalTotalSemITBIEfetivo}
          comITBI={sinalTotalComITBIEfetivo}
          distribuido={totalDistribuido}
          dataAto={dataAto}
          valorAto={isComissaoApartada ? atoLiquidoConstrutora : valorAtoEfetivo}
          comissaoApartadaValor={comissaoApartadaValor}
          comissaoApartadaParcelasQtd={comissaoApartadaParcelasQtd}
          comissaoApartadaParcelaValor={comissaoApartadaParcelaValor}
          dataObra={dataObra}
          totalParcObra={totalParcObra}
          faixasObra={faixasObra}
          dataPos={dataPos}
          totalParcPos={totalParcPos}
          faixasPos={faixasPos}
          dataITBI={dataITBI}
          valorITBI={despCartoriasEfetivas}
          itbiObraQtd={itbiObraTotalMeses}
          itbiObraValor={itbiParcelaObraValor}
          itbiPosQtd={itbiPosTotalMeses}
          itbiPosValor={itbiParcelaPosValor}
          isAtoPremiadoEnabled={isAtoPremiadoEnabled}
          baseLiquidaComITBI={baseLiquidaComITBI}
          baseRendaInformada={baseRendaInformada}
          limiteMaximoRiscoRenda={limiteMaximoRiscoRenda}
          limiteMaximoProSoluto={limiteMaximoProSoluto}
          pctRiscoParcelaRenda={pctRiscoParcelaRenda}
          valorRiscoParcela={valorRiscoParcela}
          pctRiscoProSoluto={pctRiscoProSoluto}
          valorRiscoProSoluto={valorRiscoProSoluto}
          pieDataPct={pieData1}
          pieDataValor={pieData2}
          barData={barData}
        />
      )}

    </div>
  );
};
