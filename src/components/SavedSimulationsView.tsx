import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, Trash2, X, RefreshCw, ClipboardList, AlertTriangle, Building2, User, Filter, ChevronDown, ChevronUp, Search, Users, Save } from 'lucide-react';
import { formatCurrency, parseCurrency, formatForEdit } from '../utils/formatters';
import { imoveisService } from '../services/imoveisService';
import { authService, MembroEquipeEditavel } from '../services/authService';
import { CAMPOS_EDITAVEIS_EQUIPE, CARGOS, TELAS_APP } from '../config/telasApp';
import { Cargo, Product } from '../types';

export interface SavedSimulationRecord {
  id: string;
  cliente_nome?: string;
  renda?: number;
  empreendimento_id?: string;
  dados?: Record<string, any>;
  criado_por?: string | null;
  criado_por_nome?: string | null;
  criado_por_cargo?: string | null;
  criado_por_imobiliaria?: string | null;
  criado_por_gerente_nome?: string | null;
}

interface SavedSimulationsViewProps {
  onEditSimulation: (sim: SavedSimulationRecord) => void;
  onShowToast: (message: string) => void;
  // Só quem enxerga mais de uma equipe (Administrador, Diretor) vê o filtro
  // "Gerente responsável" — pra um Gerente comum, que já só vê a própria
  // equipe, esse filtro seria redundante.
  podeFiltrarPorGerente?: boolean;
  // Id do usuário logado e, se ele tiver, os campos do cadastro da equipe que
  // o Administrador autorizou este usuário a editar (ver Painel do
  // Administrador → Editar → "Pode editar o cadastro da equipe"). Vazio ou
  // ausente = a seção "Editar cadastro da equipe" nem aparece.
  usuarioId: string;
  camposEditaveisEquipe?: string[];
  // Lista completa de empreendimentos, só para montar a grade de checkboxes de
  // "Empreendimentos liberados" quando esse campo estiver autorizado.
  produtos: Pick<Product, 'id' | 'name'>[];
}

interface FiltrosSimulacoes {
  corretorId: string;
  gerenteNome: string;
  empreendimento: string;
  condicao: string;
  torre: string;
  unidade: string;
  tipologia: string;
  cargo: string;
  imobiliaria: string;
  clienteNome: string;
  percFinanciamento: string;
  primeiroImovel: '' | 'sim' | 'nao';
  rendaMin: string; rendaMax: string;
  precoMin: string; precoMax: string;
  avaliacaoMin: string; avaliacaoMax: string;
  financiamentoMin: string; financiamentoMax: string;
  subsidioMin: string; subsidioMax: string;
  fgtsMin: string; fgtsMax: string;
  atoMin: string; atoMax: string;
  dataDe: string; dataAte: string;
}

const FILTROS_VAZIOS: FiltrosSimulacoes = {
  corretorId: '', gerenteNome: '', empreendimento: '', condicao: '', torre: '', unidade: '',
  tipologia: '', cargo: '', imobiliaria: '', clienteNome: '', percFinanciamento: '', primeiroImovel: '',
  rendaMin: '', rendaMax: '', precoMin: '', precoMax: '', avaliacaoMin: '', avaliacaoMax: '',
  financiamentoMin: '', financiamentoMax: '', subsidioMin: '', subsidioMax: '', fgtsMin: '', fgtsMax: '',
  atoMin: '', atoMax: '', dataDe: '', dataAte: ''
};

// min/max chegam como texto em R$ (ex.: "R$ 5.000,00") — parseCurrency já lê
// esse formato (e também números soltos, digitados sem terminar de sair do
// campo ainda).
const dentroDaFaixa = (valor: number, min: string, max: string): boolean => {
  if (min !== '' && valor < parseCurrency(min)) return false;
  if (max !== '' && valor > parseCurrency(max)) return false;
  return true;
};

const contemTexto = (valor: string | undefined | null, busca: string): boolean =>
  !busca || String(valor || '').toLowerCase().includes(busca.toLowerCase());

// Campos conhecidos do snapshot salvo (dados), na ordem de exibição. Cada ficha
// (Sinal c/ Morar / Sinal c/ Banco Direto) salva um subconjunto diferente — só
// os campos presentes na simulação selecionada são exibidos.
const CAMPOS_DETALHE: { key: string; label: string; formato: 'moeda' | 'numero' | 'texto' }[] = [
  { key: 'preco_tabela', label: 'Preço de Tabela', formato: 'moeda' },
  { key: 'avaliacao_bancaria', label: 'Avaliação Bancária', formato: 'moeda' },
  { key: 'itbi_total', label: 'ITBI / Registro Total', formato: 'moeda' },
  { key: 'financiamento_maximo', label: 'Financiamento', formato: 'moeda' },
  { key: 'subsidio', label: 'Subsídio', formato: 'moeda' },
  { key: 'fgts', label: 'FGTS', formato: 'moeda' },
  { key: 'recurso_proprio', label: 'Recurso Próprio', formato: 'moeda' },
  { key: 'ato_bruto', label: 'Ato (Imóvel) Bruto', formato: 'moeda' },
  { key: 'desconto_ato_premiado', label: 'Desconto Ato Premiado', formato: 'moeda' },
  { key: 'ato_liquido', label: 'Ato (Imóvel) Líquido', formato: 'moeda' },
  { key: 'itbi_no_ato', label: 'ITBI no Ato', formato: 'moeda' },
  { key: 'total_obra', label: 'Total Fase Obra (c/ ITBI)', formato: 'moeda' },
  { key: 'total_pos_obra', label: 'Total Fase Pós-Obra (c/ ITBI)', formato: 'moeda' },
  { key: 'mensais_qtd', label: 'Qtd. Mensais', formato: 'numero' },
  { key: 'parcela_mensal', label: 'Parcela Mensal', formato: 'moeda' },
  { key: 'pro_soluto_total', label: 'Pró-Soluto Total', formato: 'moeda' }
];

const formatarValor = (valor: any, formato: 'moeda' | 'numero' | 'texto'): string => {
  if (valor === undefined || valor === null || valor === '') return '-';
  if (formato === 'moeda') return formatCurrency(Number(valor) || 0);
  if (formato === 'numero') return String(valor);
  return String(valor);
};

const formatarData = (isoString?: string): string => {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
};

// Evita, na hora de trocar o "Superior hierárquico" de alguém pela seção de
// edição da equipe, oferecer como opção a própria pessoa ou algum dos seus
// próprios subordinados (o que criaria um ciclo na hierarquia).
function descendentesNaEquipe(id: string, equipe: MembroEquipeEditavel[]): Set<string> {
  const resultado = new Set<string>();
  const fila = [id];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    for (const m of equipe) {
      if (m.superiorId === atual && !resultado.has(m.id)) {
        resultado.add(m.id);
        fila.push(m.id);
      }
    }
  }
  return resultado;
}

export const SavedSimulationsView: React.FC<SavedSimulationsViewProps> = ({ onEditSimulation, onShowToast, podeFiltrarPorGerente, usuarioId, camposEditaveisEquipe, produtos }) => {
  const [simulations, setSimulations] = useState<SavedSimulationRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [viewingSim, setViewingSim] = useState<SavedSimulationRecord | null>(null);
  const [confirmDeleteSim, setConfirmDeleteSim] = useState<SavedSimulationRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Exclusão em lote: seleção sempre restrita ao que está filtrado na tela
  // (`filtradas`) — selecionar/excluir "tudo" nunca alcança simulações fora
  // do filtro aplicado no momento.
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confirmarExclusaoLote, setConfirmarExclusaoLote] = useState(false);
  const [excluindoLote, setExcluindoLote] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState<boolean>(false);
  // Rascunho: o que a pessoa está escolhendo no painel, ainda não aplicado.
  // Aplicados: o que de fato filtra a lista embaixo — só muda quando ela
  // clica em "Filtrar".
  const [filtrosRascunho, setFiltrosRascunho] = useState<FiltrosSimulacoes>(FILTROS_VAZIOS);
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosSimulacoes>(FILTROS_VAZIOS);

  // --- Editar cadastro da equipe (Diretor/Gerente autorizado pelo Administrador) ---
  const camposAutorizados = useMemo(() => new Set(camposEditaveisEquipe || []), [camposEditaveisEquipe]);
  const podeEditarEquipe = camposAutorizados.size > 0;
  const [equipeAberta, setEquipeAberta] = useState(false);
  const [equipe, setEquipe] = useState<MembroEquipeEditavel[]>([]);
  const [carregandoEquipe, setCarregandoEquipe] = useState(false);
  const [membroEditando, setMembroEditando] = useState<MembroEquipeEditavel | null>(null);
  const [salvandoMembro, setSalvandoMembro] = useState(false);
  const [emNome, setEmNome] = useState('');
  const [emTelefone, setEmTelefone] = useState('');
  const [emCpf, setEmCpf] = useState('');
  const [emImobiliaria, setEmImobiliaria] = useState('');
  const [emCreci, setEmCreci] = useState('');
  const [emCargo, setEmCargo] = useState<Cargo>('Corretor');
  const [emSuperiorId, setEmSuperiorId] = useState<string | null>(null);
  const [emTelas, setEmTelas] = useState<Set<string>>(new Set());
  const [emEmpreendimentosModo, setEmEmpreendimentosModo] = useState<'auto' | 'manual'>('auto');
  const [emEmpreendimentosSelecionados, setEmEmpreendimentosSelecionados] = useState<Set<string>>(new Set());

  const carregarEquipe = async () => {
    if (!podeEditarEquipe) return;
    setCarregandoEquipe(true);
    const res = await authService.listarEquipeParaEdicao(usuarioId);
    setEquipe(res.dados);
    setCarregandoEquipe(false);
    if (res.error) {
      onShowToast(`Não foi possível carregar a equipe: ${res.error}`);
    }
  };

  useEffect(() => {
    if (podeEditarEquipe) carregarEquipe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeEditarEquipe, usuarioId]);

  const abrirEdicaoMembro = (m: MembroEquipeEditavel) => {
    setMembroEditando(m);
    setEmNome(m.nomeCompleto);
    setEmTelefone(m.telefone);
    setEmCpf(m.cpf);
    setEmImobiliaria(m.imobiliaria);
    setEmCreci(m.creci || '');
    setEmCargo(m.cargo);
    setEmSuperiorId(m.superiorId);
    setEmTelas(new Set(m.telasLiberadas));
    setEmEmpreendimentosModo(m.empreendimentosLiberados === null ? 'auto' : 'manual');
    setEmEmpreendimentosSelecionados(new Set(m.empreendimentosLiberados || []));
  };

  const descendentesDoMembroEditando = membroEditando ? descendentesNaEquipe(membroEditando.id, equipe) : new Set<string>();

  const salvarEdicaoMembro = async () => {
    if (!membroEditando) return;
    if (camposAutorizados.has('nome') && !emNome.trim()) {
      onShowToast('Nome completo é obrigatório.');
      return;
    }
    setSalvandoMembro(true);
    const res = await authService.editarCadastroSubordinado(membroEditando.id, {
      nomeCompleto: camposAutorizados.has('nome') ? emNome.trim() : undefined,
      telefone: camposAutorizados.has('telefone') ? emTelefone.trim() : undefined,
      cpf: camposAutorizados.has('cpf') ? emCpf.trim() : undefined,
      imobiliaria: camposAutorizados.has('imobiliaria') ? emImobiliaria.trim() : undefined,
      creci: camposAutorizados.has('creci') ? (emCreci.trim() || null) : undefined,
      cargo: camposAutorizados.has('cargo') ? emCargo : undefined,
      superiorId: camposAutorizados.has('superior') ? emSuperiorId : undefined,
      telasLiberadas: camposAutorizados.has('telas') ? Array.from(emTelas) : undefined,
      empreendimentosLiberados: camposAutorizados.has('empreendimentos')
        ? (emEmpreendimentosModo === 'auto' ? null : Array.from(emEmpreendimentosSelecionados))
        : undefined
    });
    setSalvandoMembro(false);
    if (res.success) {
      onShowToast(`Cadastro de ${membroEditando.nomeCompleto} atualizado.`);
      setMembroEditando(null);
      carregarEquipe();
    } else {
      onShowToast(`Erro ao salvar: ${res.error || 'erro desconhecido'}`);
    }
  };

  const setFiltro = <K extends keyof FiltrosSimulacoes>(campo: K, valor: FiltrosSimulacoes[K]) =>
    setFiltrosRascunho(prev => ({ ...prev, [campo]: valor }));

  const aplicarFiltros = () => {
    setFiltrosAplicados(filtrosRascunho);
    setFiltrosAbertos(false);
  };

  const limparFiltros = () => {
    setFiltrosRascunho(FILTROS_VAZIOS);
    setFiltrosAplicados(FILTROS_VAZIOS);
  };

  // Listas de opções pros seletores, derivadas do que já foi carregado — só
  // aparecem opções que realmente existem entre as simulações visíveis.
  const opcoes = useMemo(() => {
    const unico = (valores: (string | undefined | null)[]) =>
      Array.from(new Set(valores.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const corretores = Array.from(
      new Map<string, string>(
        simulations
          .filter(s => s.criado_por && s.criado_por_nome)
          .map(s => [s.criado_por as string, s.criado_por_nome as string])
      ).entries()
    ).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));

    return {
      corretores,
      gerentes: unico(simulations.map(s => s.criado_por_gerente_nome)),
      empreendimentos: unico(simulations.map(s => s.dados?.empreendimento_nome)),
      condicoes: unico(simulations.map(s => s.dados?.condicao_nome)),
      torres: unico(simulations.map(s => s.dados?.torre)).filter(t => t !== 'Não Selecionada'),
      tipologias: unico(simulations.map(s => s.dados?.tipologia)),
      cargos: unico(simulations.map(s => s.criado_por_cargo)),
      imobiliarias: unico(simulations.map(s => s.criado_por_imobiliaria))
    };
  }, [simulations]);

  const filtradas = useMemo(() => simulations.filter(sim => {
    const d = sim.dados || {};
    const f = filtrosAplicados;
    if (f.corretorId && sim.criado_por !== f.corretorId) return false;
    if (f.gerenteNome && sim.criado_por_gerente_nome !== f.gerenteNome) return false;
    if (f.empreendimento && d.empreendimento_nome !== f.empreendimento) return false;
    if (f.condicao && d.condicao_nome !== f.condicao) return false;
    if (f.torre && d.torre !== f.torre) return false;
    if (!contemTexto(d.unidade, f.unidade)) return false;
    if (f.tipologia && d.tipologia !== f.tipologia) return false;
    if (f.cargo && sim.criado_por_cargo !== f.cargo) return false;
    if (f.imobiliaria && sim.criado_por_imobiliaria !== f.imobiliaria) return false;
    if (!contemTexto(sim.cliente_nome || d.cliente_nome, f.clienteNome)) return false;
    if (f.percFinanciamento) {
      const perc = d.simulation_data?.finPercent;
      if (perc === undefined || perc === null || Math.round(Number(perc) * 100) !== Number(f.percFinanciamento)) return false;
    }
    if (f.primeiroImovel) {
      const ehPrimeiro = !!d.simulation_data?.isFirstHome;
      if (f.primeiroImovel === 'sim' && !ehPrimeiro) return false;
      if (f.primeiroImovel === 'nao' && ehPrimeiro) return false;
    }
    if (!dentroDaFaixa(Number(sim.renda ?? d.renda) || 0, f.rendaMin, f.rendaMax)) return false;
    if (!dentroDaFaixa(Number(d.preco_tabela) || 0, f.precoMin, f.precoMax)) return false;
    if (!dentroDaFaixa(Number(d.avaliacao_bancaria) || 0, f.avaliacaoMin, f.avaliacaoMax)) return false;
    if (!dentroDaFaixa(Number(d.financiamento_maximo) || 0, f.financiamentoMin, f.financiamentoMax)) return false;
    if (!dentroDaFaixa(Number(d.subsidio) || 0, f.subsidioMin, f.subsidioMax)) return false;
    if (!dentroDaFaixa(Number(d.fgts) || 0, f.fgtsMin, f.fgtsMax)) return false;
    if (!dentroDaFaixa(Number(d.ato_liquido ?? d.ato_bruto) || 0, f.atoMin, f.atoMax)) return false;
    if (f.dataDe && (!d.salvo_em || d.salvo_em.slice(0, 10) < f.dataDe)) return false;
    if (f.dataAte && (!d.salvo_em || d.salvo_em.slice(0, 10) > f.dataAte)) return false;
    return true;
  }), [simulations, filtrosAplicados]);

  const filtrosAtivos = Object.values(filtrosAplicados).filter(v => v !== '').length;

  const loadSimulations = async () => {
    setIsLoading(true);
    const res = await imoveisService.listarSimulacoes();
    setSimulations(res.data || []);
    setIsLoading(false);
    if (!res.success) {
      onShowToast(`Não foi possível carregar as simulações salvas: ${res.error || 'erro desconhecido'}`);
    }
  };

  useEffect(() => {
    loadSimulations();
  }, []);

  const handleConfirmDelete = async () => {
    if (!confirmDeleteSim) return;
    setDeletingId(confirmDeleteSim.id);
    const res = await imoveisService.excluirSimulacao(confirmDeleteSim.id);
    setDeletingId(null);
    if (res.success) {
      setSimulations(prev => prev.filter(s => s.id !== confirmDeleteSim.id));
      onShowToast('Simulação excluída com sucesso.');
    } else {
      onShowToast(`Erro ao excluir simulação: ${res.error || 'erro desconhecido'}`);
    }
    setConfirmDeleteSim(null);
  };

  const alternarSelecao = (id: string) => {
    setSelecionadas(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const idsFiltradasSelecionadas = filtradas.filter(s => selecionadas.has(s.id)).length;
  const todasFiltradasSelecionadas = filtradas.length > 0 && idsFiltradasSelecionadas === filtradas.length;

  const alternarSelecionarTodas = () => {
    setSelecionadas(prev => {
      if (todasFiltradasSelecionadas) {
        // Desmarca só as que estão filtradas agora — preserva seleção de fora do filtro, se houver.
        const novo = new Set(prev);
        filtradas.forEach(s => novo.delete(s.id));
        return novo;
      }
      const novo = new Set(prev);
      filtradas.forEach(s => novo.add(s.id));
      return novo;
    });
  };

  const handleConfirmDeleteLote = async () => {
    const ids = Array.from<string>(selecionadas);
    if (ids.length === 0) return;
    setExcluindoLote(true);
    const res = await imoveisService.excluirSimulacoesEmLote(ids);
    setExcluindoLote(false);
    setConfirmarExclusaoLote(false);
    if (res.success) {
      const excluidas = res.excluidas ?? 0;
      setSimulations(prev => prev.filter(s => !selecionadas.has(s.id)));
      setSelecionadas(new Set());
      onShowToast(
        excluidas < ids.length
          ? `${excluidas} de ${ids.length} simulações excluídas — as demais não puderam ser removidas (sem permissão).`
          : `${excluidas} simulaç${excluidas === 1 ? 'ão excluída' : 'ões excluídas'} com sucesso.`
      );
    } else {
      onShowToast(`Erro ao excluir simulações: ${res.error || 'erro desconhecido'}`);
    }
  };

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-morar-600 font-bold block">
            Propostas & Simulações
          </span>
          <h1 className="text-xl font-bold font-heading text-slate-900">
            Simulações Salvas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Visualize, edite ou exclua as simulações salvas por você e pela sua equipe.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {podeEditarEquipe && (
            <button
              onClick={() => setEquipeAberta(v => !v)}
              type="button"
              className={`px-4 py-2.5 font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer border ${equipeAberta ? 'bg-morar-50 border-morar-200 text-morar-700' : 'bg-slate-100 border-transparent text-slate-700 hover:bg-slate-200'}`}
            >
              <Users className="w-4 h-4" />
              <span>Editar cadastro da equipe</span>
              {equipeAberta ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={() => setFiltrosAbertos(v => !v)}
            type="button"
            className={`px-4 py-2.5 font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer border ${filtrosAbertos || filtrosAtivos > 0 ? 'bg-morar-50 border-morar-200 text-morar-700' : 'bg-slate-100 border-transparent text-slate-700 hover:bg-slate-200'}`}
          >
            <Filter className="w-4 h-4" />
            <span>Filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ''}</span>
            {filtrosAbertos ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={loadSimulations}
            type="button"
            disabled={isLoading}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {equipeAberta && podeEditarEquipe && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
          <div>
            <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-morar-600" /> Equipe abaixo de você
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Selecione um corretor da sua equipe para corrigir os campos do cadastro que o Administrador autorizou você a editar.
            </p>
          </div>
          {carregandoEquipe ? (
            <div className="py-6 text-center text-xs text-slate-400">Carregando equipe...</div>
          ) : equipe.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">Nenhum corretor abaixo de você na hierarquia ainda.</div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
              {equipe.map(m => (
                membroEditando?.id === m.id ? (
                  <div key={m.id} className="px-4 py-4 bg-white animate-highlight space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Editar cadastro de {membroEditando.nomeCompleto}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Só os campos que o Administrador autorizou você a editar aparecem aqui.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {camposAutorizados.has('nome') && (
                        <div className="col-span-2">
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">Nome completo</label>
                          <input type="text" value={emNome} onChange={e => setEmNome(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs" />
                        </div>
                      )}
                      {camposAutorizados.has('telefone') && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">Telefone</label>
                          <input type="text" value={emTelefone} onChange={e => setEmTelefone(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs" />
                        </div>
                      )}
                      {camposAutorizados.has('cpf') && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">CPF</label>
                          <input type="text" value={emCpf} onChange={e => setEmCpf(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs" />
                        </div>
                      )}
                      {camposAutorizados.has('imobiliaria') && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">Imobiliária</label>
                          <input type="text" value={emImobiliaria} onChange={e => setEmImobiliaria(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs" />
                        </div>
                      )}
                      {camposAutorizados.has('creci') && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 mb-1">CRECI <span className="font-normal text-slate-400">(opcional)</span></label>
                          <input type="text" value={emCreci} onChange={e => setEmCreci(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs" />
                        </div>
                      )}
                    </div>

                    {(camposAutorizados.has('cargo') || camposAutorizados.has('superior')) && (
                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                        {camposAutorizados.has('cargo') && (
                          <div>
                            <label className="block text-[11px] font-bold text-slate-500 mb-1">Cargo</label>
                            <select value={emCargo} onChange={e => setEmCargo(e.target.value as Cargo)} className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs bg-white">
                              {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        )}
                        {camposAutorizados.has('superior') && (
                          <div>
                            <label className="block text-[11px] font-bold text-slate-500 mb-1">Superior hierárquico</label>
                            <select value={emSuperiorId || ''} onChange={e => setEmSuperiorId(e.target.value || null)} className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs bg-white">
                              <option value={usuarioId}>Eu mesmo</option>
                              {equipe.filter(m2 => m2.id !== membroEditando.id && !descendentesDoMembroEditando.has(m2.id)).map(m2 => (
                                <option key={m2.id} value={m2.id}>{m2.nomeCompleto} — {m2.cargo}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {camposAutorizados.has('telas') && (
                      <div className="pt-3 border-t border-slate-100">
                        <p className="text-[11px] font-bold text-slate-500 mb-2">Telas liberadas</p>
                        <div className="grid grid-cols-2 gap-2">
                          {TELAS_APP.map(t => (
                            <label key={t.key} className="flex items-center gap-2 text-xs text-slate-700">
                              <input
                                type="checkbox"
                                checked={emTelas.has(t.key)}
                                onChange={e => {
                                  setEmTelas(prev => {
                                    const novo = new Set(prev);
                                    if (e.target.checked) novo.add(t.key); else novo.delete(t.key);
                                    return novo;
                                  });
                                }}
                                className="w-4 h-4 accent-morar-600"
                              />
                              {t.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {camposAutorizados.has('empreendimentos') && (
                      <div className="pt-3 border-t border-slate-100">
                        <p className="text-[11px] font-bold text-slate-500 mb-1">Empreendimentos liberados</p>
                        <p className="text-[11px] text-slate-400 mb-2">
                          "Automaticamente" acompanha ao vivo o que está definido acima dele na hierarquia (ou o padrão do
                          cargo). "Definir manualmente" trava a lista marcada abaixo.
                        </p>
                        <div className="flex flex-col gap-1.5 mb-2">
                          <label className="flex items-center gap-2 text-xs text-slate-700">
                            <input type="radio" name="em-emp-modo" checked={emEmpreendimentosModo === 'auto'} onChange={() => setEmEmpreendimentosModo('auto')} className="w-3.5 h-3.5 accent-morar-600" />
                            Seguir automaticamente (hierarquia/cargo)
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-700">
                            <input type="radio" name="em-emp-modo" checked={emEmpreendimentosModo === 'manual'} onChange={() => setEmEmpreendimentosModo('manual')} className="w-3.5 h-3.5 accent-morar-600" />
                            Definir manualmente
                          </label>
                        </div>
                        {emEmpreendimentosModo === 'manual' && (
                          <div className="grid grid-cols-2 gap-2 bg-slate-50/60 border border-slate-100 rounded-lg p-2.5">
                            {produtos.map(p => (
                              <label key={p.id} className="flex items-center gap-2 text-xs text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={emEmpreendimentosSelecionados.has(p.id)}
                                  onChange={e => {
                                    setEmEmpreendimentosSelecionados(prev => {
                                      const novo = new Set(prev);
                                      if (e.target.checked) novo.add(p.id); else novo.delete(p.id);
                                      return novo;
                                    });
                                  }}
                                  className="w-4 h-4 accent-morar-600"
                                />
                                {p.name}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                      <button type="button" onClick={() => setMembroEditando(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer">
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={salvandoMembro}
                        onClick={salvarEdicaoMembro}
                        className="px-4 py-2 text-xs font-bold text-white bg-morar-600 hover:bg-morar-700 rounded-xl cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{salvandoMembro ? 'Salvando...' : 'Salvar alterações'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50/60">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{m.nomeCompleto}</p>
                      <p className="text-[11px] text-slate-400">{m.cargo} — {m.imobiliaria}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => abrirEdicaoMembro(m)}
                      className="px-2.5 py-1.5 bg-morar-50 hover:bg-morar-100 text-morar-700 font-semibold rounded-lg text-[11px] transition-all flex items-center gap-1 cursor-pointer border border-morar-100 shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Editar cadastro</span>
                    </button>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      )}

      {/* Enquanto uma edição de cadastro da equipe está aberta acima, o
          restante da tela (filtros e lista de simulações) fica esmaecido em
          tom de cinza claro, sem interação — foco visual no cartão de edição. */}
      <div className={`space-y-6 transition-all duration-300 ${membroEditando ? 'opacity-40 grayscale pointer-events-none select-none' : ''}`}>
      {filtrosAbertos && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <CampoSelect label="Corretor / quem fez" value={filtrosRascunho.corretorId} onChange={v => setFiltro('corretorId', v)}>
              {opcoes.corretores.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </CampoSelect>
            {podeFiltrarPorGerente && (
              <CampoSelect label="Gerente responsável" value={filtrosRascunho.gerenteNome} onChange={v => setFiltro('gerenteNome', v)}>
                {opcoes.gerentes.map(g => <option key={g} value={g}>{g}</option>)}
              </CampoSelect>
            )}
            <CampoSelect label="Cargo" value={filtrosRascunho.cargo} onChange={v => setFiltro('cargo', v)}>
              {opcoes.cargos.map(c => <option key={c} value={c}>{c}</option>)}
            </CampoSelect>
            <CampoSelect label="Imobiliária" value={filtrosRascunho.imobiliaria} onChange={v => setFiltro('imobiliaria', v)}>
              {opcoes.imobiliarias.map(i => <option key={i} value={i}>{i}</option>)}
            </CampoSelect>

            <CampoSelect label="Empreendimento" value={filtrosRascunho.empreendimento} onChange={v => setFiltro('empreendimento', v)}>
              {opcoes.empreendimentos.map(e => <option key={e} value={e}>{e}</option>)}
            </CampoSelect>
            <CampoSelect label="Tipo de condição" value={filtrosRascunho.condicao} onChange={v => setFiltro('condicao', v)}>
              {opcoes.condicoes.map(c => <option key={c} value={c}>{c}</option>)}
            </CampoSelect>
            <CampoSelect label="Torre" value={filtrosRascunho.torre} onChange={v => setFiltro('torre', v)}>
              {opcoes.torres.map(t => <option key={t} value={t}>{t}</option>)}
            </CampoSelect>
            <CampoTexto label="Unidade" value={filtrosRascunho.unidade} onChange={v => setFiltro('unidade', v)} placeholder="Ex.: 404" />

            <CampoSelect label="Tipologia" value={filtrosRascunho.tipologia} onChange={v => setFiltro('tipologia', v)}>
              {opcoes.tipologias.map(t => <option key={t} value={t}>{t}</option>)}
            </CampoSelect>
            <CampoTexto label="Nome do cliente" value={filtrosRascunho.clienteNome} onChange={v => setFiltro('clienteNome', v)} placeholder="Buscar por nome" />
            <CampoSelect label="% de Financiamento" value={filtrosRascunho.percFinanciamento} onChange={v => setFiltro('percFinanciamento', v)}>
              <option value="80">80% (Padrão)</option>
              <option value="90">90% (Máximo)</option>
            </CampoSelect>
            <CampoSelect label="Primeiro imóvel do cliente?" value={filtrosRascunho.primeiroImovel} onChange={v => setFiltro('primeiroImovel', v as '' | 'sim' | 'nao')}>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </CampoSelect>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
            <CampoFaixaMoeda label="Renda" min={filtrosRascunho.rendaMin} max={filtrosRascunho.rendaMax} onChangeMin={v => setFiltro('rendaMin', v)} onChangeMax={v => setFiltro('rendaMax', v)} />
            <CampoFaixaMoeda label="Preço do Imóvel (Tabela)" min={filtrosRascunho.precoMin} max={filtrosRascunho.precoMax} onChangeMin={v => setFiltro('precoMin', v)} onChangeMax={v => setFiltro('precoMax', v)} />
            <CampoFaixaMoeda label="Avaliação Bancária" min={filtrosRascunho.avaliacaoMin} max={filtrosRascunho.avaliacaoMax} onChangeMin={v => setFiltro('avaliacaoMin', v)} onChangeMax={v => setFiltro('avaliacaoMax', v)} />
            <CampoFaixaMoeda label="Financiamento" min={filtrosRascunho.financiamentoMin} max={filtrosRascunho.financiamentoMax} onChangeMin={v => setFiltro('financiamentoMin', v)} onChangeMax={v => setFiltro('financiamentoMax', v)} />
            <CampoFaixaMoeda label="Subsídio" min={filtrosRascunho.subsidioMin} max={filtrosRascunho.subsidioMax} onChangeMin={v => setFiltro('subsidioMin', v)} onChangeMax={v => setFiltro('subsidioMax', v)} />
            <CampoFaixaMoeda label="FGTS" min={filtrosRascunho.fgtsMin} max={filtrosRascunho.fgtsMax} onChangeMin={v => setFiltro('fgtsMin', v)} onChangeMax={v => setFiltro('fgtsMax', v)} />
            <CampoFaixaMoeda label="Ato (Imóvel)" min={filtrosRascunho.atoMin} max={filtrosRascunho.atoMax} onChangeMin={v => setFiltro('atoMin', v)} onChangeMax={v => setFiltro('atoMax', v)} />
            <CampoFaixaData label="Salvo em" min={filtrosRascunho.dataDe} max={filtrosRascunho.dataAte} onChangeMin={v => setFiltro('dataDe', v)} onChangeMax={v => setFiltro('dataAte', v)} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={limparFiltros}
              className="px-3.5 py-2 text-xs font-semibold text-slate-500 hover:text-rose-600 rounded-lg transition-all cursor-pointer"
            >
              Limpar filtros
            </button>
            <button
              type="button"
              onClick={aplicarFiltros}
              className="px-5 py-2 text-xs font-bold text-white bg-morar-600 hover:bg-morar-700 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Filtrar</span>
            </button>
          </div>
        </div>
      )}

      {!filtrosAbertos && filtrosAtivos > 0 && (
        <div className="flex items-center justify-between bg-morar-50 border border-morar-100 rounded-xl px-4 py-2.5">
          <p className="text-xs text-morar-700">
            Mostrando <strong>{filtradas.length}</strong> de {simulations.length} simulaç{simulations.length === 1 ? 'ão' : 'ões'} — {filtrosAtivos} filtro{filtrosAtivos === 1 ? '' : 's'} ativo{filtrosAtivos === 1 ? '' : 's'}
          </p>
          <button type="button" onClick={limparFiltros} className="text-xs font-semibold text-morar-700 hover:underline cursor-pointer shrink-0">
            Limpar filtros
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-slate-400">Carregando simulações...</div>
        ) : simulations.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-500">Nenhuma simulação salva ainda.</p>
            <p className="text-xs text-slate-400">Use o botão "Salvar Simulação" nas fichas de análise para guardar uma proposta aqui.</p>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Filter className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-500">Nenhuma simulação bate com os filtros escolhidos.</p>
            <button type="button" onClick={limparFiltros} className="text-xs font-semibold text-morar-600 hover:underline cursor-pointer">
              Limpar filtros
            </button>
          </div>
        ) : (
          <>
            <div className="px-4 sm:px-5 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={todasFiltradasSelecionadas}
                  onChange={alternarSelecionarTodas}
                  className="w-4 h-4 accent-morar-600 cursor-pointer"
                />
                <span>
                  {selecionadas.size > 0
                    ? `${selecionadas.size} selecionada${selecionadas.size === 1 ? '' : 's'}`
                    : `Selecionar todas (${filtradas.length})`}
                </span>
              </label>
              {selecionadas.size > 0 && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setSelecionadas(new Set())} className="text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer">
                    Limpar seleção
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmarExclusaoLote(true)}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[11px] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir selecionadas ({selecionadas.size})</span>
                  </button>
                </div>
              )}
            </div>
            <div className="divide-y divide-slate-100">
            {filtradas.map((sim) => {
              const d = sim.dados || {};
              return (
                <div key={sim.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-all">
                  <div className="flex items-start gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selecionadas.has(sim.id)}
                      onChange={() => alternarSelecao(sim.id)}
                      className="w-4 h-4 accent-morar-600 cursor-pointer mt-1 shrink-0"
                    />
                    <div className="p-2 rounded-xl bg-morar-50 text-morar-600 shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 truncate">
                          {sim.cliente_nome || d.cliente_nome || 'Cliente Não Informado'}
                        </span>
                        {d.condicao_nome && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-morar-50 text-morar-700 border border-morar-100 shrink-0">
                            {d.condicao_nome}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {d.empreendimento_nome || 'Empreendimento não informado'}
                          {d.torre && d.torre !== 'Não Selecionada' ? ` — Torre ${d.torre}` : ''}
                          {d.unidade && d.unidade !== 'Não Selecionada' ? ` / Unid. ${d.unidade}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 flex-wrap">
                        <span>Renda: <strong className="text-slate-600">{formatCurrency(Number(sim.renda ?? d.renda) || 0)}</strong></span>
                        <span>Salvo em: <strong className="text-slate-600">{formatarData(d.salvo_em)}</strong></span>
                        {sim.criado_por_nome && (
                          <span>
                            Feito por: <strong className="text-slate-600">{sim.criado_por_nome}</strong>
                            {sim.criado_por_cargo && <> — {sim.criado_por_cargo}</>}
                            {sim.criado_por_imobiliaria && <> — {sim.criado_por_imobiliaria}</>}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => setViewingSim(sim)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-[11px] transition-all flex items-center gap-1 cursor-pointer"
                      title="Visualizar detalhes"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Visualizar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditSimulation(sim)}
                      className="px-2.5 py-1.5 bg-morar-50 hover:bg-morar-100 text-morar-700 font-semibold rounded-lg text-[11px] transition-all flex items-center gap-1 cursor-pointer border border-morar-100"
                      title="Editar (abre a ficha com os dados desta simulação)"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteSim(sim)}
                      className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold rounded-lg text-[11px] transition-all flex items-center gap-1 cursor-pointer border border-rose-100"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir</span>
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </>
        )}
      </div>
      </div>

      {/* MODAL: VISUALIZAR DETALHES */}
      {viewingSim && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setViewingSim(null); }}
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 relative">
            <button
              type="button"
              onClick={() => setViewingSim(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="text-base font-bold text-slate-900">
                {viewingSim.dados?.cliente_nome || viewingSim.cliente_nome || 'Cliente Não Informado'}
              </h3>
              <p className="text-xs text-slate-500">
                {viewingSim.dados?.empreendimento_nome} — {viewingSim.dados?.condicao_nome}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Torre {viewingSim.dados?.torre || '-'} / Unidade {viewingSim.dados?.unidade || '-'} • Salvo em {formatarData(viewingSim.dados?.salvo_em)}
                {viewingSim.criado_por_nome && (
                  <>
                    {' '}• Feito por {viewingSim.criado_por_nome}
                    {viewingSim.criado_por_cargo && <> ({viewingSim.criado_por_cargo}{viewingSim.criado_por_imobiliaria ? ` — ${viewingSim.criado_por_imobiliaria}` : ''})</>}
                  </>
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs pt-2 border-t border-slate-100">
              {CAMPOS_DETALHE.filter(c => viewingSim.dados?.[c.key] !== undefined).map(c => (
                <div key={c.key} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">{c.label}</span>
                  <span className="font-bold text-slate-800">{formatarValor(viewingSim.dados?.[c.key], c.formato)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setViewingSim(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => { onEditSimulation(viewingSim); setViewingSim(null); }}
                className="px-4 py-2 text-xs font-semibold text-white bg-morar-600 hover:bg-morar-700 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar esta Simulação</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR EXCLUSÃO — fixo no topo da tela (não no centro do
          viewport) para nunca "sumir" quando a lista está rolada bem para
          baixo: aparece sempre no mesmo lugar, logo abaixo do topo. */}
      {confirmDeleteSim && (
        <div
          className="fixed inset-x-0 top-0 flex justify-center p-4 z-50 animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteSim(null); }}
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-4 mt-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Excluir simulação?</h3>
                <p className="text-xs text-slate-500">
                  {confirmDeleteSim.dados?.cliente_nome || confirmDeleteSim.cliente_nome || 'Esta simulação'} será removida permanentemente para todos os usuários. Essa ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDeleteSim(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingId === confirmDeleteSim.id}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingId === confirmDeleteSim.id ? 'Excluindo...' : 'Excluir'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR EXCLUSÃO EM LOTE — mesmo posicionamento no topo. */}
      {confirmarExclusaoLote && (
        <div
          className="fixed inset-x-0 top-0 flex justify-center p-4 z-50 animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmarExclusaoLote(false); }}
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-4 mt-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Excluir {selecionadas.size} simulaç{selecionadas.size === 1 ? 'ão' : 'ões'}?</h3>
                <p className="text-xs text-slate-500">
                  Serão removidas permanentemente para todos os usuários. Essa ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmarExclusaoLote(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteLote}
                disabled={excluindoLote}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{excluindoLote ? 'Excluindo...' : `Excluir ${selecionadas.size}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const rotuloCampo = 'block text-[11px] font-bold text-slate-500 uppercase mb-1.5';
const estiloInput = 'w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-morar-100 focus:border-morar-400';

const CampoSelect: React.FC<{ label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }> = ({ label, value, onChange, children }) => (
  <div>
    <label className={rotuloCampo}>{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)} className={`${estiloInput} bg-white`}>
      <option value="">Todos</option>
      {children}
    </select>
  </div>
);

const CampoTexto: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
  <div>
    <label className={rotuloCampo}>{label}</label>
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={estiloInput} />
  </div>
);

interface CampoFaixaProps { label: string; min: string; max: string; onChangeMin: (v: string) => void; onChangeMax: (v: string) => void }

// Faixa "de/até" com máscara de moeda (R$), no mesmo padrão de digitação já
// usado no Simulador de Crédito: foca e mostra o número "cru" pra editar
// fácil, sai do campo (blur) e formata como R$ 1.234,56.
const CampoFaixaMoeda: React.FC<CampoFaixaProps> = ({ label, min, max, onChangeMin, onChangeMax }) => {
  const aoFocar = (valor: string, onChange: (v: string) => void) => {
    if (!valor) return;
    onChange(formatForEdit(parseCurrency(valor)));
  };
  const aoSair = (valor: string, onChange: (v: string) => void) => {
    if (!valor) return;
    onChange(formatCurrency(parseCurrency(valor)));
  };
  return (
    <div>
      <label className={rotuloCampo}>{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="text" inputMode="decimal" value={min} placeholder="De"
          onChange={e => onChangeMin(e.target.value)}
          onFocus={() => aoFocar(min, onChangeMin)}
          onBlur={() => aoSair(min, onChangeMin)}
          className={estiloInput}
        />
        <span className="text-slate-400 text-xs shrink-0">até</span>
        <input
          type="text" inputMode="decimal" value={max} placeholder="Até"
          onChange={e => onChangeMax(e.target.value)}
          onFocus={() => aoFocar(max, onChangeMax)}
          onBlur={() => aoSair(max, onChangeMax)}
          className={estiloInput}
        />
      </div>
    </div>
  );
};

// Mesmo padrão visual da faixa de moeda, mas com seletor de data — usa o
// mesmo rótulo/input compartilhado (estiloInput) pra ficar proporcional aos
// outros campos da mesma grade, em vez de destoar.
const CampoFaixaData: React.FC<CampoFaixaProps> = ({ label, min, max, onChangeMin, onChangeMax }) => (
  <div>
    <label className={rotuloCampo}>{label}</label>
    <div className="flex items-center gap-1.5">
      <input type="date" value={min} onChange={e => onChangeMin(e.target.value)} className={`${estiloInput} min-w-0`} />
      <span className="text-slate-400 text-xs shrink-0">até</span>
      <input type="date" value={max} onChange={e => onChangeMax(e.target.value)} className={`${estiloInput} min-w-0`} />
    </div>
  </div>
);
