import React, { useState, useRef } from 'react';
import { FileCheck, CheckCircle, AlertCircle, Trash2, CalendarClock, UploadCloud, Search, XCircle, Table as TableIcon, CheckCircle2, AlertTriangle, Loader2, Archive, ChevronDown, ChevronUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, TableInfo } from '../types';
import { COLUMN_DEFINITIONS, formatCurrency, formatArea, normalizeHeader, parseCurrency, parseM2Number, isTabelaVencida, formatDateBr } from '../utils/formatters';
import { supabase } from '../lib/supabaseClient';
import { imoveisService } from '../services/imoveisService';

interface ImportTableViewProps {
  products: Product[];
  activeImportProductId: string;
  onSelectImportProduct: (productId: string) => void;
  onSaveTableInfo: (productId: string, tableInfo: TableInfo) => void;
  onDeleteTable: (productId: string) => void;
  onShowToast: (message: string) => void;
  // "Hoje é" configurado no cabeçalho do app — usado para saber se a tabela
  // vigente já passou da validade (não a data real do dispositivo).
  currentDate: string;
}

// Helper to get first and last day of current month in YYYY-MM-DD format
const getCurrentMonthDates = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const validFrom = `${year}-${month}-01`;

  const lastDayObj = new Date(year, now.getMonth() + 1, 0);
  const lastDayStr = String(lastDayObj.getDate()).padStart(2, '0');
  const validTo = `${year}-${month}-${lastDayStr}`;

  return { validFrom, validTo };
};

export const ImportTableView: React.FC<ImportTableViewProps> = ({
  products,
  activeImportProductId,
  onSelectImportProduct,
  onSaveTableInfo,
  onDeleteTable,
  onShowToast,
  currentDate
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // IMPORTANTE: nunca cair para products[0] quando activeImportProductId não bate com
  // nenhum produto atual (ex.: uma janela momentânea logo após a lista de empreendimentos
  // ser recarregada do Supabase). Um fallback silencioso para "o primeiro da lista" fazia
  // a importação/arquivamento gravar no empreendimento errado sem nenhum aviso — é preciso
  // ficar sem produto selecionado (undefined) e deixar os `?.` abaixo lidarem com isso, em
  // vez de agir sobre dados de outro empreendimento.
  const activeProd = products.find(p => p.id === activeImportProductId);
  const tabelaVencida = Boolean(activeProd?.tableInfo?.active) && isTabelaVencida(activeProd?.tableInfo?.validTo, currentDate);

  const currentMonthDefaults = getCurrentMonthDates();

  const [validFrom, setValidFrom] = useState<string>(
    activeProd?.tableInfo?.validFrom || currentMonthDefaults.validFrom
  );
  const [validTo, setValidTo] = useState<string>(
    activeProd?.tableInfo?.validTo || currentMonthDefaults.validTo
  );
  
  const [lookupTorre, setLookupTorre] = useState<string>('');
  const [lookupUnidade, setLookupUnidade] = useState<string>('');

  const [tempParsedData, setTempParsedData] = useState<{
    headers: string[];
    rows: (string | number)[][];
    fileName: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Tabelas de vendas arquivadas (versões antigas substituídas) do empreendimento
  // selecionado — ver "Tabelas Arquivadas" mais abaixo.
  const [arquivadasAbertas, setArquivadasAbertas] = useState(false);
  const [arquivadas, setArquivadas] = useState<any[]>([]);
  const [carregandoArquivadas, setCarregandoArquivadas] = useState(false);
  const [excluirArquivadaId, setExcluirArquivadaId] = useState<string | null>(null);
  const [excluindoArquivada, setExcluindoArquivada] = useState(false);
  const [visualizandoArquivada, setVisualizandoArquivada] = useState<any | null>(null);
  const [lookupArquivadaTorre, setLookupArquivadaTorre] = useState('');
  const [lookupArquivadaUnidade, setLookupArquivadaUnidade] = useState('');

  const carregarArquivadas = React.useCallback(async (empId: string) => {
    setCarregandoArquivadas(true);
    const lista = await imoveisService.listarTabelasArquivadas(empId);
    setArquivadas(lista);
    setCarregandoArquivadas(false);
  }, []);

  React.useEffect(() => {
    if (activeProd && arquivadasAbertas) {
      carregarArquivadas(activeProd.id);
    }
  }, [activeImportProductId, arquivadasAbertas, activeProd, carregarArquivadas]);

  const handleConfirmDeleteArquivada = async () => {
    if (!excluirArquivadaId) return;
    setExcluindoArquivada(true);
    const res = await imoveisService.excluirTabelaArquivada(excluirArquivadaId);
    setExcluindoArquivada(false);
    setExcluirArquivadaId(null);
    if (res.success) {
      setArquivadas(prev => prev.filter(a => a.id !== excluirArquivadaId));
      onShowToast('Tabela arquivada excluída com sucesso.');
    } else {
      onShowToast(`Erro ao excluir tabela arquivada: ${res.error || 'erro desconhecido'}`);
    }
  };

  // Executa a exclusão de todas as unidades do empreendimento no Supabase e limpa o estado
  const handleConfirmDeleteUnits = async () => {
    if (!activeProd) return;
    setIsDeleting(true);
    try {
      const res = await imoveisService.limparUnidadesEmpreendimento(activeProd.id);
      if (!res.success) {
        console.warn('Aviso ao excluir no Supabase:', res.error);
      }
      
      onDeleteTable(activeProd.id);
      setTempParsedData(null);
      setLookupTorre('');
      setLookupUnidade('');
      
      // Notifica todos os módulos da aplicação
      window.dispatchEvent(new CustomEvent('tabela_atualizada'));
      onShowToast(`Unidades de "${activeProd.name}" excluídas do Supabase com sucesso.`);
    } catch (err: any) {
      console.error('Erro ao excluir unidades:', err);
      onShowToast(`Erro ao limpar unidades: ${err?.message || 'Falha na operação'}`);
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  // When active import product changes, update local fields
  React.useEffect(() => {
    if (activeProd) {
      const monthDefaults = getCurrentMonthDates();
      setValidFrom(activeProd.tableInfo?.validFrom || monthDefaults.validFrom);
      setValidTo(activeProd.tableInfo?.validTo || monthDefaults.validTo);
      setTempParsedData(null);
      setLookupTorre('');
      setLookupUnidade('');
    }
  }, [activeImportProductId, products]);

  const hasTable = activeProd?.tableInfo && activeProd.tableInfo.active;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: 'binary' });

        // Target sheet "Estudo (Status)" or fallback
        let targetSheetName = workbook.SheetNames.find(
          name => name.trim().toLowerCase() === 'estudo (status)'
        );

        if (!targetSheetName) {
          targetSheetName = workbook.SheetNames.find(
            name => name.toLowerCase().includes('estudo')
          ) || workbook.SheetNames[0];
          onShowToast(`Aba "Estudo (Status)" não localizada exatamente. Lendo aba "${targetSheetName}".`);
        } else {
          onShowToast(`Aba "Estudo (Status)" encontrada! Mapeando colunas...`);
        }

        const worksheet = workbook.Sheets[targetSheetName];
        const jsonData = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, { header: 1, defval: '' });

        if (!jsonData || jsonData.length === 0) {
          onShowToast("A aba da planilha está vazia.");
          return;
        }

        // Detecta a linha de cabeçalho e o índice de cada coluna PELO NOME (não por posição
        // fixa): cada tabela de venda pode ter as colunas em ordem/posição diferente, então
        // não dá pra assumir que "ITBI 1º Imóvel" está sempre na mesma letra de coluna.
        // Testa as primeiras linhas da planilha e usa a que casar com mais nomes conhecidos
        // (COLUMN_DEFINITIONS, definidos em utils/formatters.ts).
        let headerRowIndex = -1;
        let colIndices: Record<string, number> = {};
        let bestScore = -1;

        const maxHeaderRowsToScan = Math.min(jsonData.length, 6);
        for (let r = 0; r < maxHeaderRowsToScan; r++) {
          const row = jsonData[r];
          if (!row || !Array.isArray(row)) continue;

          const rowMatches: Record<string, number> = {};
          row.forEach((cell, idx) => {
            const norm = normalizeHeader(cell);
            if (!norm) return;
            for (const def of COLUMN_DEFINITIONS) {
              if (rowMatches[def.key] === undefined && def.match(norm)) {
                rowMatches[def.key] = idx;
                break;
              }
            }
          });

          const score = Object.keys(rowMatches).length;
          if (score > bestScore) {
            bestScore = score;
            colIndices = rowMatches;
            headerRowIndex = r;
          }
        }

        // Exige um mínimo de colunas reconhecidas pelo nome para confiar no cabeçalho detectado
        if (headerRowIndex === -1 || bestScore < 5) {
          onShowToast("Não foi possível identificar as colunas pelo nome do cabeçalho. Confira se a planilha tem uma linha com os nomes das colunas (TORRE, UNIDADE, PREÇO, ITBI, etc).");
          return;
        }

        // Algumas planilhas têm um cabeçalho mesclado verticalmente numa coluna específica
        // (ex.: uma célula mesclada com "ITBI+Registro" numa linha e "1º Imóvel" na linha
        // logo abaixo/acima) — como o texto de uma célula mesclada só existe na célula-âncora
        // do Excel, a coluna vizinha "some" nessa linha e o nome não bate com nada. Para as
        // colunas que ainda não foram reconhecidas na linha de cabeçalho escolhida, tenta de
        // novo combinando o texto dela com o da linha imediatamente acima e abaixo, coluna a
        // coluna, antes de considerar a coluna realmente ausente.
        const linhasVizinhasCabecalho = [headerRowIndex - 1, headerRowIndex, headerRowIndex + 1].filter(r => r >= 0 && r < jsonData.length);
        const totalColunasVizinhas = linhasVizinhasCabecalho.reduce((max, r) => Math.max(max, (jsonData[r] as any[])?.length || 0), 0);
        const colunasJaUsadas = new Set(Object.values(colIndices));
        for (let idx = 0; idx < totalColunasVizinhas; idx++) {
          if (colunasJaUsadas.has(idx)) continue;
          const textoCombinado = linhasVizinhasCabecalho.map(r => String((jsonData[r] as any[])?.[idx] ?? '')).join(' ');
          const normCombinado = normalizeHeader(textoCombinado);
          if (!normCombinado) continue;
          for (const def of COLUMN_DEFINITIONS) {
            if (colIndices[def.key] === undefined && def.match(normCombinado)) {
              colIndices[def.key] = idx;
              colunasJaUsadas.add(idx);
              break;
            }
          }
        }

        const colFase = colIndices["Fase"];
        const colTorre = colIndices["TORRE"];
        const colUnidade = colIndices["UNIDADE"];
        const colAreaPriv = colIndices["ÁREA PRIVATIVA M² - APTO"];
        const colQuintal = colIndices["ÁREA QUINTAL M²"];
        const colTipologia = colIndices["TIPOLOGIA"];
        const colAvaliacao = colIndices["AVALIAÇÃO"];
        const colPreco = colIndices["PREÇO"];
        const colItbi1 = colIndices["ITBI + Registro 1º Imóvel"];
        const colItbi2 = colIndices["ITBI + Registro 2º Imóvel"];

        if (colTorre === undefined || colUnidade === undefined || colPreco === undefined) {
          onShowToast("Colunas essenciais (TORRE, UNIDADE, PREÇO) não foram encontradas pelo nome do cabeçalho. Verifique os títulos das colunas na planilha.");
          return;
        }

        const mappedHeaders = [
          "Fase",
          "TORRE",
          "UNIDADE",
          "ÁREA PRIVATIVA M² - APTO",
          "ÁREA QUINTAL M²",
          "TIPOLOGIA",
          "AVALIAÇÃO",
          "PREÇO",
          "ITBI + Registro 1º Imóvel",
          "ITBI + Registro 2º Imóvel"
        ];

        // Conjunto estrito de torres residenciais válidas ("A" a "H")
        const VALID_RESIDENTIAL_TOWERS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

        // Palavras-chave para descarte de rodapés, resumos, viabilidade e totais
        const blacklistedKeywords = [
          'viabilidade',
          'falta de',
          'falta',
          'total geral',
          'quadro de resumo',
          'saldo devedor',
          'estoque total',
          'resumo geral',
          'tabela de precos',
          'tabela de preços',
          'media ponderada',
          'somatorio',
          'somatório',
          'resultado final'
        ];

        const filteredRows: (string | number)[][] = [];

        // Itera a partir da linha de dados (Linha 3 / índice 2 até o fim das unidades)
        for (let r = headerRowIndex + 1; r < jsonData.length; r++) {
          const rawRow = jsonData[r];
          if (!rawRow || !Array.isArray(rawRow)) continue;

          // 1. Filtro contra textos de rodapés, resumos, viabilidade e totais gerais (linhas 514+)
          const fullRowText = rawRow.map(c => String(c ?? '').toLowerCase()).join(' ');
          if (blacklistedKeywords.some(kw => fullRowText.includes(kw))) {
            continue;
          }

          // 2. Validação da Coluna TORRE (Coluna B / índice 1): Deve ser torre residencial ("A" a "H")
          const rawTorre = rawRow[colTorre];
          const cleanTorre = String(rawTorre ?? '')
            .trim()
            .toUpperCase()
            .replace(/^(TORRE|BLOCO)\s*/i, '')
            .trim();

          if (!cleanTorre || !VALID_RESIDENTIAL_TOWERS.has(cleanTorre)) {
            continue;
          }

          // 3. Validação da Coluna UNIDADE (Coluna E / índice 4): Descarte se for "LOJA", cabeçalho ou sem dígitos
          const rawUnidade = rawRow[colUnidade];
          const unidadeStr = String(rawUnidade ?? '').trim();
          if (!unidadeStr) continue;

          const upperUnidade = unidadeStr.toUpperCase();
          if (
            upperUnidade.includes('LOJA') ||
            upperUnidade.includes('COMERCIAL') ||
            upperUnidade.includes('ADM') ||
            upperUnidade.includes('UNIDADE') ||
            upperUnidade.includes('APTO') ||
            upperUnidade.includes('APT') ||
            upperUnidade.includes('TOTAL')
          ) {
            continue;
          }

          const hasDigits = /\d+/.test(unidadeStr);
          if (!hasDigits || unidadeStr.length > 8) {
            continue;
          }

          // 4. Extração e sanitização dos valores
          const preco = parseCurrency(rawRow[colPreco]);
          const avaliacao = parseCurrency(rawRow[colAvaliacao]);
          let itbi1 = parseCurrency(rawRow[colItbi1]);
          let itbi2 = parseCurrency(rawRow[colItbi2]) || itbi1;
          const areaPriv = parseM2Number(rawRow[colAreaPriv]);
          const areaQuintal = parseM2Number(rawRow[colQuintal]);
          const tipologia = String(rawRow[colTipologia] ?? '').trim() || '2 Quartos';
          
          // Fase (Coluna A / índice 0)
          const rawFase = rawRow[colFase];
          let fase = '1ª Fase';
          if (rawFase !== undefined && rawFase !== null && String(rawFase).trim() !== '') {
            const fStr = String(rawFase).trim();
            if (/^\d+$/.test(fStr)) {
              fase = `${fStr}ª Fase`;
            } else {
              fase = fStr;
            }
          }

          // Ignora linhas sem nenhuma informação numérica relevante
          if (preco <= 0 && avaliacao <= 0 && areaPriv <= 0) {
            continue;
          }

          // Validação e isolamento do ITBI (manter estritamente a taxa de registro, sem embutir o preço do imóvel)
          if (preco > 50000 && itbi1 > preco) {
            itbi1 = Math.max(0, Math.round((itbi1 - preco) * 100) / 100);
          }
          if (preco > 50000 && itbi2 > preco) {
            itbi2 = Math.max(0, Math.round((itbi2 - preco) * 100) / 100);
          }

          filteredRows.push([
            fase,
            cleanTorre,
            unidadeStr,
            formatArea(areaPriv),
            formatArea(areaQuintal),
            tipologia,
            avaliacao,
            preco,
            itbi1,
            itbi2
          ]);
        }

        setTempParsedData({
          headers: mappedHeaders,
          rows: filteredRows,
          fileName: file.name
        });

        onShowToast(`Sucesso! ${filteredRows.length} unidades importadas da aba "Estudo (Status)".`);

      } catch (err) {
        console.error(err);
        onShowToast("Erro ao processar a planilha Excel.");
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleClear = () => {
    const monthDefaults = getCurrentMonthDates();
    setTempParsedData(null);
    setValidFrom(monthDefaults.validFrom);
    setValidTo(monthDefaults.validTo);
    setLookupTorre('');
    setLookupUnidade('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProd) return;

    if (!validFrom || !validTo) {
      onShowToast("Preencha as datas de vigência inicial e final.");
      return;
    }

    if (validFrom > validTo) {
      onShowToast("A data inicial não pode ser maior que a data final.");
      return;
    }

    const currentFileName = tempParsedData?.fileName || activeProd.tableInfo?.fileName || `tabela_${activeProd.id}.xlsx`;
    const currentHeaders = tempParsedData?.headers || activeProd.tableInfo?.headers || COLUMN_DEFINITIONS.map(d => d.label);
    const currentRows = tempParsedData?.rows || activeProd.tableInfo?.rows || [];

    if (currentRows.length === 0) {
      onShowToast("A tabela está vazia. Nenhuma unidade para salvar.");
      return;
    }

    setIsSaving(true);
    
    // Mapeamento dos dados processados para o formato esperado pelo Supabase
    const unidadesProcessadas = imoveisService.converterLinhasParaUnidades(activeProd.id, currentRows);

    try {
      // 1. Se já havia uma tabela vigente com unidades e uma planilha nova foi importada
      // agora, guarda a tabela antiga em "Tabelas Arquivadas" antes de sobrescrevê-la.
      if (tempParsedData && activeProd.tableInfo?.active && (activeProd.tableInfo.rows?.length || 0) > 0) {
        const arquivarRes = await imoveisService.arquivarTabelaAtual(activeProd.id, activeProd.name, activeProd.tableInfo);
        if (!arquivarRes.success) {
          console.warn('Aviso: não foi possível arquivar a tabela anterior:', arquivarRes.error);
        }
      }

      // 2. Garante que o empreendimento exista no Supabase, já com a vigência da nova tabela
      await imoveisService.sincronizarEmpreendimento({
        id: activeProd.id,
        nome: activeProd.name,
        delivery_date_phase1: activeProd.deliveryDatePhase1 || activeProd.deliveryDate,
        delivery_date_phase2: activeProd.deliveryDatePhase2,
        tabela_valid_from: validFrom,
        tabela_valid_to: validTo,
        tabela_file_name: currentFileName
      });

      // 3. Realiza o upsert em lote e obtém os dados do banco
      const res = await imoveisService.salvarUnidadesLote(activeProd.id, unidadesProcessadas);
      
      let finalRows = currentRows;
      if (res.success && res.data && res.data.length > 0) {
        // Converte as unidades do banco de volta para o formato de linhas da tabela preservando colunas de ITBI
        const converted = imoveisService.converterUnidadesParaLinhas(res.data);
        if (converted && converted.length > 0) {
          finalRows = converted.map((cRow, idx) => {
            const orig = currentRows[idx];
            if (orig && String(orig[1]).trim() === String(cRow[1]).trim() && String(orig[2]).trim() === String(cRow[2]).trim()) {
              return [
                cRow[0],
                cRow[1],
                cRow[2],
                cRow[3],
                cRow[4],
                cRow[5],
                cRow[6],
                cRow[7],
                orig[8] !== undefined && orig[8] !== null ? orig[8] : cRow[8],
                orig[9] !== undefined && orig[9] !== null ? orig[9] : cRow[9]
              ];
            }
            return cRow;
          });
        }
      }

      const newTableInfo: TableInfo = {
        validFrom,
        validTo,
        fileName: currentFileName,
        headers: currentHeaders,
        rows: finalRows,
        active: true
      };

      // 4. Salva no estado global e no cache local (localStorage)
      onSaveTableInfo(activeProd.id, newTableInfo);
      setTempParsedData(null);
      onShowToast(`Sucesso! ${unidadesProcessadas.length} unidades sincronizadas no banco Supabase.`);

      // 5. Dispara evento customizado para atualizar todos os componentes e abas abertas
      window.dispatchEvent(new CustomEvent('tabela_atualizada'));
      if (arquivadasAbertas) carregarArquivadas(activeProd.id);

    } catch (err: any) {
      console.error(err);
      
      // Fallback local se o banco falhar
      const newTableInfo: TableInfo = {
        validFrom,
        validTo,
        fileName: currentFileName,
        headers: currentHeaders,
        rows: currentRows,
        active: true
      };
      onSaveTableInfo(activeProd.id, newTableInfo);
      setTempParsedData(null);
      onShowToast("Tabela salva localmente. Aviso ao sincronizar com Supabase.");
    } finally {
      setIsSaving(false);
    }
  };

  const currentHeaders = tempParsedData?.headers || activeProd?.tableInfo?.headers || [];
  const currentRows = tempParsedData?.rows || activeProd?.tableInfo?.rows || [];
  const currentFileName = tempParsedData?.fileName || activeProd?.tableInfo?.fileName || '';

  // Filter preview table rows by lookup fields
  const displayRows = currentRows.filter(row => {
    const torreCell = String(row[1] || '').toLowerCase();
    const unidadeCell = String(row[2] || '').toLowerCase();

    const matchesTorre = !lookupTorre || torreCell.includes(lookupTorre.toLowerCase().trim());
    const matchesUnidade = !lookupUnidade || unidadeCell.includes(lookupUnidade.toLowerCase().trim());

    return matchesTorre && matchesUnidade;
  });

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-morar-600 font-bold block">
            Gestão de Tabelas de Venda
          </span>
          <h1 className="text-xl font-bold font-heading text-slate-900">
            Importação e Consulta de Tabelas (Excel)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Selecione o empreendimento na lista suspensa, importe a planilha oficial e consulte dados de unidades.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-1.5">
            <FileCheck className="w-4 h-4 text-emerald-600" />
            <span>Formatos: .XLSX, .XLS, .CSV</span>
          </span>
        </div>
      </div>

      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        
        {/* SELETOR DE EMPREENDIMENTO */}
        <div className="bg-morar-50/60 p-4 rounded-xl border border-morar-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1">
            <label className="block text-xs font-bold text-morar-600 uppercase tracking-wider mb-1.5">
              Selecione o Empreendimento para Importar / Consultar Tabela
            </label>
            <select
              value={activeImportProductId}
              onChange={(e) => onSelectImportProduct(e.target.value)}
              className="w-full bg-white font-bold text-slate-900 border border-slate-300 rounded-xl py-2.5 px-3.5 focus:outline-none focus:border-morar-600 text-xs shadow-xs cursor-pointer"
            >
              {products.map(p => {
                const isActive = Boolean(p.tableInfo && p.tableInfo.active);
                const isVencida = isActive && isTabelaVencida(p.tableInfo?.validTo, currentDate);
                const rotulo = !isActive ? ' — ⚠️ Sem Tabela Ativa' : isVencida ? ' — ⏰ Tabela Vencida' : ' — ✓ Tabela Vigente';
                return (
                  <option key={p.id} value={p.id}>
                    {p.name}{rotulo}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="self-end sm:self-center shrink-0 flex items-center gap-2">
            {hasTable && tabelaVencida ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                  <AlertTriangle className="w-3.5 h-3.5" /> Tabela Vencida desde {formatDateBr(activeProd?.tableInfo?.validTo)} ({activeProd?.tableInfo?.rows?.length || 0} unid.)
                </span>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="text-xs text-rose-700 hover:text-white hover:bg-rose-600 font-bold flex items-center gap-1.5 bg-rose-50 px-3.5 py-1.5 rounded-xl border border-rose-200 transition-all shadow-2xs shrink-0 cursor-pointer"
                  title="Excluir todas as unidades deste empreendimento no Supabase e na aplicação"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Unidades Existentes</span>
                </button>
              </div>
            ) : hasTable ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                  <CheckCircle className="w-3.5 h-3.5" /> Tabela Vigente ({activeProd?.tableInfo?.rows?.length || 0} unid.)
                </span>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="text-xs text-rose-700 hover:text-white hover:bg-rose-600 font-bold flex items-center gap-1.5 bg-rose-50 px-3.5 py-1.5 rounded-xl border border-rose-200 transition-all shadow-2xs shrink-0 cursor-pointer"
                  title="Excluir todas as unidades deste empreendimento no Supabase e na aplicação"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Unidades Existentes</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
                  <AlertCircle className="w-3.5 h-3.5" /> Sem Tabela Ativa
                </span>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="text-xs text-slate-600 hover:text-rose-700 hover:bg-rose-50 font-semibold flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200 transition-all shadow-2xs shrink-0 cursor-pointer"
                  title="Limpar quaisquer unidades residuais no Supabase"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>Limpar Unidades no Banco</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {tabelaVencida && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-3 shadow-sm">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-lg shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-rose-900">Tabela vencida — simulações bloqueadas</h4>
              <p className="text-xs font-medium text-rose-800 mt-0.5">
                A validade desta tabela terminou em {formatDateBr(activeProd?.tableInfo?.validTo)}. Enquanto uma tabela
                nova não for importada, o Simulador não deixa escolher Torre/Unidade deste empreendimento, para
                evitar simular com preços desatualizados.
              </p>
            </div>
          </div>
        )}

        {/* FORMULÁRIO DE IMPORTAÇÃO DA TABELA */}
        <form onSubmit={handleSaveTable} className="space-y-5 text-xs">
          
          {/* PERÍODO DE VALIDADE DA TABELA */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-morar-600" />
              <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                Vigência e Validade da Tabela
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Data Inicial (Início da Validade) *
                </label>
                <input
                  type="date"
                  required
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:outline-none focus:border-morar-600 cursor-pointer"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Data Final (Término da Validade) *
                </label>
                <input
                  type="date"
                  required
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:outline-none focus:border-morar-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* ARQUIVO DO EXCEL (DROPZONE) */}
          <div className="space-y-2">
            <label className="block font-semibold text-slate-700">
              Arquivo da Tabela de Vendas (Excel / CSV) *
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-morar-200 bg-morar-50/20 hover:bg-morar-50/50 rounded-2xl p-6 text-center transition-all cursor-pointer relative"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-12 h-12 mx-auto rounded-xl bg-morar-100 text-morar-600 flex items-center justify-center mb-3">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-900">
                {currentFileName ? currentFileName : "Clique para selecionar ou arraste a planilha aqui"}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Formatos aceitos: Microsoft Excel (.xlsx, .xls) ou CSV — Leitura da aba Estudo (Status)
              </p>
            </div>
          </div>

          {/* CAMPO DE CONSULTA POR TORRE E UNIDADE */}
          <div className="bg-gradient-to-r from-morar-50/80 via-slate-50 to-white p-4 rounded-2xl border border-morar-100 space-y-3">
            <div className="flex items-center justify-between border-b border-morar-100/80 pb-2">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-morar-600" />
                <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  Consultar Unidade na Tabela
                </span>
              </div>
              <button
                type="button"
                onClick={() => { setLookupTorre(''); setLookupUnidade(''); }}
                className="text-[10px] font-semibold text-slate-500 hover:text-morar-600 flex items-center gap-1 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" /> Limpar Filtros
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Torre / Bloco
                </label>
                <input
                  type="text"
                  value={lookupTorre}
                  onChange={(e) => setLookupTorre(e.target.value)}
                  placeholder="Ex: Torre A, Bloco 1..."
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-morar-600 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Unidade
                </label>
                <input
                  type="text"
                  value={lookupUnidade}
                  onChange={(e) => setLookupUnidade(e.target.value)}
                  placeholder="Ex: 101, 202, 304..."
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl font-bold text-morar-600 focus:outline-none focus:border-morar-600 text-xs"
                />
              </div>
            </div>

            {/* PAINEL RESULTADO DA CONSULTA DE UNIDADE */}
            {(lookupTorre || lookupUnidade) && (
              <div className="bg-white p-3.5 rounded-xl border border-morar-200 space-y-2 mt-2 shadow-2xs">
                {displayRows.length === 1 ? (
                  <div>
                    <div className="flex items-center justify-between border-b border-morar-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-morar-600 bg-morar-100 px-2.5 py-0.5 rounded-md uppercase">
                          {displayRows[0][1] || 'Torre'}
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          Unidade {displayRows[0][2] || '-'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          ({displayRows[0][0] || '1ª Fase'})
                        </span>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Localizada na Tabela
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px]">
                      <div>
                        <span className="block text-[10px] text-slate-400 font-medium">Preço Tabela:</span>
                        <strong className="text-slate-900 font-bold">{formatCurrency(typeof displayRows[0][7] === 'number' ? displayRows[0][7] : 0)}</strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 font-medium">Avaliação Banco:</span>
                        <strong className="text-emerald-600 font-bold">{formatCurrency(typeof displayRows[0][6] === 'number' ? displayRows[0][6] : 0)}</strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 font-medium">ITBI + Reg. 1º Imóvel:</span>
                        <strong className="text-morar-600 font-bold">{formatCurrency(typeof displayRows[0][8] === 'number' ? displayRows[0][8] : 0)}</strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 font-medium">ITBI + Reg. 2º Imóvel:</span>
                        <strong className="text-amber-700 font-bold">{formatCurrency(typeof displayRows[0][9] === 'number' ? displayRows[0][9] : 0)}</strong>
                      </div>
                    </div>
                  </div>
                ) : displayRows.length > 1 ? (
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Busca encontrou <strong className="text-morar-600 font-bold">{displayRows.length} unidades</strong> correspondentes.</span>
                    <span className="text-[10px] text-slate-400">Refine a Unidade para ver a ficha detalhada</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-rose-600 font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Nenhuma unidade encontrada para os filtros especificadas.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PRÉ-VISUALIZAÇÃO DA TABELA IMPORTADA & BOTÕES DE AÇÃO NO TOPO */}
          {currentHeaders.length > 0 && currentRows.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <TableIcon className="w-4 h-4 text-emerald-600" />
                    Pré-visualização do Conteúdo Importado ({displayRows.length} de {currentRows.length} unidades)
                  </span>
                  {currentFileName && (
                    <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                      Arquivo: {currentFileName}
                    </span>
                  )}
                </div>

                {/* BOTÕES DE AÇÃO NO TOPO DA PRÉ-VISUALIZAÇÃO */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleClear}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-semibold text-xs transition-all cursor-pointer"
                  >
                    Limpar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 bg-morar-600 hover:bg-morar-700 text-white rounded-xl font-semibold text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>{isSaving ? 'Salvando...' : 'Salvar e Ativar Tabela'}</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white max-h-[480px]">
                <table className="w-full text-left text-[11px] text-slate-700">
                  <thead className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase sticky top-0 shadow-2xs z-10">
                    <tr>
                      {currentHeaders.map((h, i) => (
                        <th key={i} className="p-2.5 font-bold border-b border-slate-200 whitespace-nowrap bg-slate-100 text-slate-700">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-morar-50/50 transition-colors">
                        {currentHeaders.map((headerName, cIdx) => {
                          let val = row[cIdx] !== undefined && row[cIdx] !== null ? row[cIdx] : '';
                          const hUpper = headerName.toUpperCase();
                          const isCurrencyCol = hUpper.includes('PREÇO') || hUpper.includes('PRECO') || hUpper.includes('AVALIAÇÃO') || hUpper.includes('AVALIACAO') || hUpper.includes('ITBI');
                          const isAreaCol = hUpper.includes('ÁREA') || hUpper.includes('AREA') || hUpper.includes('PRIVATIVA') || hUpper.includes('QUINTAL');

                          if (isCurrencyCol) {
                            if (typeof val === 'number') {
                              val = formatCurrency(val);
                            } else if (typeof val === 'string' && val && !val.includes('R$')) {
                              const num = parseCurrency(val);
                              if (!isNaN(num) && num > 0) {
                                val = formatCurrency(num);
                              }
                            }
                          } else if (isAreaCol) {
                            val = formatArea(val);
                          }

                          let cellClass = "p-2.5 font-medium border-b border-slate-100 whitespace-nowrap";
                          if (hUpper.includes('UNIDADE')) cellClass += " font-bold text-morar-600";
                          if (hUpper.includes('TORRE')) cellClass += " font-semibold text-slate-800";
                          if (isCurrencyCol) cellClass += " font-semibold text-slate-900";

                          return (
                            <td key={cIdx} className={cellClass}>
                              {String(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CASO NÃO HAJA CONTEÚDO DE PRÉ-VISUALIZAÇÃO, MOSTRAR OS BOTÕES ABAIXO TAMBÉM */}
          {(!currentHeaders.length || !currentRows.length) && (
            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-all cursor-pointer"
              >
                Limpar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-morar-600 hover:bg-morar-700 text-white rounded-xl font-semibold text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{isSaving ? 'Salvando...' : 'Salvar e Ativar Tabela'}</span>
              </button>
            </div>
          )}

        </form>
      </div>

      {/* TABELAS ARQUIVADAS: versões antigas substituídas por uma nova importação, para
          consulta e exclusão pelo usuário. */}
      {activeProd && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setArquivadasAbertas(v => !v)}
            className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 hover:bg-slate-50/80 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-slate-100 text-slate-600 rounded-lg shrink-0">
                <Archive className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="font-bold text-slate-900 text-xs block">Tabelas Arquivadas</span>
                <span className="text-[11px] text-slate-500">
                  Versões anteriores da tabela de vendas de {activeProd.name}, substituídas por uma importação mais nova.
                </span>
              </div>
            </div>
            {arquivadasAbertas ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
          </button>

          {arquivadasAbertas && (
            <div className="border-t border-slate-200 p-4 sm:p-5">
              {carregandoArquivadas ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-4 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando tabelas arquivadas...
                </div>
              ) : arquivadas.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  Nenhuma tabela arquivada para este empreendimento ainda. Toda vez que uma tabela de vendas vigente é
                  substituída por uma nova importação, a versão anterior aparece aqui.
                </p>
              ) : (
                <div className="space-y-2">
                  {arquivadas.map((a) => (
                    <div
                      role="button"
                      tabIndex={0}
                      key={a.id}
                      onClick={() => { setVisualizandoArquivada(a); setLookupArquivadaTorre(''); setLookupArquivadaUnidade(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setVisualizandoArquivada(a); setLookupArquivadaTorre(''); setLookupArquivadaUnidade(''); } }}
                      className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/80 hover:bg-morar-50/60 border border-slate-200 hover:border-morar-200 rounded-xl p-3 transition-all cursor-pointer text-left"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-900 font-mono block truncate">{a.file_name || 'Arquivo sem nome'}</span>
                        <span className="text-[11px] text-slate-500">
                          Vigência: {formatDateBr(a.valid_from)} a {formatDateBr(a.valid_to)} · {Array.isArray(a.rows) ? a.rows.length : 0} unid. · Arquivada em {a.arquivado_em ? new Date(a.arquivado_em).toLocaleString('pt-BR') : '-'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <span className="text-xs text-morar-700 font-semibold flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-morar-200 shadow-2xs">
                          <Search className="w-3.5 h-3.5" />
                          <span>Visualizar</span>
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); setExcluirArquivadaId(a.id); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setExcluirArquivadaId(a.id); } }}
                          className="text-xs text-rose-700 hover:text-white hover:bg-rose-600 font-semibold flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-rose-200 transition-all shadow-2xs cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Excluir</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL DE VISUALIZAÇÃO DE TABELA ARQUIVADA */}
      {visualizandoArquivada && (() => {
        const rowsArquivada: (string | number)[][] = Array.isArray(visualizandoArquivada.rows) ? visualizandoArquivada.rows : [];
        const headersArquivada = COLUMN_DEFINITIONS.map(d => d.label);
        const linhasFiltradas = rowsArquivada.filter(row => {
          const torreCell = String(row[1] || '').toLowerCase();
          const unidadeCell = String(row[2] || '').toLowerCase();
          const matchesTorre = !lookupArquivadaTorre || torreCell.includes(lookupArquivadaTorre.toLowerCase().trim());
          const matchesUnidade = !lookupArquivadaUnidade || unidadeCell.includes(lookupArquivadaUnidade.toLowerCase().trim());
          return matchesTorre && matchesUnidade;
        });
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200">
              <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5" /> Tabela Arquivada
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 font-mono truncate">{visualizandoArquivada.file_name || 'Arquivo sem nome'}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {visualizandoArquivada.nome_empreendimento || activeProd?.name} · Vigência: {formatDateBr(visualizandoArquivada.valid_from)} a {formatDateBr(visualizandoArquivada.valid_to)} · {rowsArquivada.length} unidades · Arquivada em {visualizandoArquivada.arquivado_em ? new Date(visualizandoArquivada.arquivado_em).toLocaleString('pt-BR') : '-'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVisualizandoArquivada(null)}
                  className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1.5 transition-all cursor-pointer shrink-0"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  value={lookupArquivadaTorre}
                  onChange={(e) => setLookupArquivadaTorre(e.target.value)}
                  placeholder="Filtrar por Torre/Bloco..."
                  className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:outline-none focus:border-morar-600 text-xs"
                />
                <input
                  type="text"
                  value={lookupArquivadaUnidade}
                  onChange={(e) => setLookupArquivadaUnidade(e.target.value)}
                  placeholder="Filtrar por Unidade..."
                  className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-morar-600 focus:outline-none focus:border-morar-600 text-xs"
                />
              </div>

              <div className="overflow-auto flex-1">
                {rowsArquivada.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">Esta tabela arquivada não tem unidades registradas.</p>
                ) : (
                  <table className="w-full text-left text-[11px] text-slate-700">
                    <thead className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase sticky top-0 shadow-2xs z-10">
                      <tr>
                        {headersArquivada.map((h, i) => (
                          <th key={i} className="p-2.5 font-bold border-b border-slate-200 whitespace-nowrap bg-slate-100 text-slate-700">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {linhasFiltradas.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-morar-50/50 transition-colors">
                          {headersArquivada.map((headerName, cIdx) => {
                            let val = row[cIdx] !== undefined && row[cIdx] !== null ? row[cIdx] : '';
                            const hUpper = headerName.toUpperCase();
                            const isCurrencyCol = hUpper.includes('PREÇO') || hUpper.includes('PRECO') || hUpper.includes('AVALIAÇÃO') || hUpper.includes('AVALIACAO') || hUpper.includes('ITBI');
                            const isAreaCol = hUpper.includes('ÁREA') || hUpper.includes('AREA') || hUpper.includes('PRIVATIVA') || hUpper.includes('QUINTAL');

                            if (isCurrencyCol) {
                              if (typeof val === 'number') {
                                val = formatCurrency(val);
                              } else if (typeof val === 'string' && val && !val.includes('R$')) {
                                const num = parseCurrency(val);
                                if (!isNaN(num) && num > 0) {
                                  val = formatCurrency(num);
                                }
                              }
                            } else if (isAreaCol) {
                              val = formatArea(val);
                            }

                            let cellClass = "p-2.5 font-medium border-b border-slate-100 whitespace-nowrap";
                            if (hUpper.includes('UNIDADE')) cellClass += " font-bold text-morar-600";
                            if (hUpper.includes('TORRE')) cellClass += " font-semibold text-slate-800";
                            if (isCurrencyCol) cellClass += " font-semibold text-slate-900";

                            return (
                              <td key={cIdx} className={cellClass}>
                                {String(val)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE TABELA ARQUIVADA */}
      {excluirArquivadaId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 font-heading">Excluir tabela arquivada?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Esta ação é permanente e não pode ser desfeita. A tabela arquivada será removida definitivamente.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={excluindoArquivada}
                onClick={() => setExcluirArquivadaId(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={excluindoArquivada}
                onClick={handleConfirmDeleteArquivada}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {excluindoArquivada ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE UNIDADES NO SUPABASE */}
      {isDeleteModalOpen && (
        <div 
          id="modal-confirm-delete-units"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 font-heading">
                Excluir Unidades de {activeProd?.name || 'Empreendimento'}?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Esta ação irá remover <strong>todas as unidades cadastradas</strong> deste empreendimento na tabela <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-700 font-mono text-[11px]">unidades</code> do Supabase e desativar a tabela de vendas atual.
              </p>
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-left mt-3">
                <p className="text-[11px] text-amber-800 font-medium flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Recomendado antes de importar uma nova versão da planilha para evitar unidades duplicadas ou dados desatualizados.
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteUnits}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Excluindo no Banco...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirmar e Excluir Unidades</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
