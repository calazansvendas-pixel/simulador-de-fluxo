import React, { useEffect, useState } from 'react';
import { LayoutGrid, ShieldAlert, Save, Loader2 } from 'lucide-react';
import { Cargo, PdfConditionKind, TelaVisibilitySettings, TelaVisibilitySettingsByKind } from '../types';
import { DEFAULT_TELA_VISIBILITY_SETTINGS } from '../utils/telaVisibility';
import { telaVisibilidadeService } from '../services/telaVisibilidadeService';
import { CARGOS } from '../config/telasApp';
import { KIND_META } from '../config/blocosMeta';

interface TelaVisibilitySettingsViewProps {
  onShowToast: (message: string) => void;
  // Só o Administrador consegue de fato gravar (o banco também barra — ver
  // RLS em telaVisibilidadeService.ts); aqui é só pra já mostrar a tela como
  // somente-leitura pra quem não pode editar, sem precisar tentar salvar.
  podeEditar: boolean;
}

const Toggle: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={onChange}
    className={`relative w-[38px] h-[22px] rounded-full transition-colors shrink-0 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${
      checked ? 'bg-morar-600' : 'bg-slate-300'
    }`}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${
        checked ? 'translate-x-[16px]' : 'translate-x-0'
      }`}
    />
  </button>
);

const SettingRow: React.FC<{
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}> = ({ title, description, checked, onChange, disabled }) => (
  <div className="flex items-center justify-between gap-4 py-3 px-3.5 border-b border-slate-100 last:border-b-0">
    <div className="min-w-0">
      <p className="text-xs font-bold text-slate-800">{title}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
    </div>
    <Toggle checked={checked} onChange={onChange} disabled={disabled} />
  </div>
);

export const TelaVisibilitySettingsView: React.FC<TelaVisibilitySettingsViewProps> = ({ onShowToast, podeEditar }) => {
  const [carregando, setCarregando] = useState(true);
  const [todasConfiguracoes, setTodasConfiguracoes] = useState<Partial<Record<Cargo, TelaVisibilitySettingsByKind>>>({});
  const [activeCargo, setActiveCargo] = useState<Cargo>('Corretor');
  const [activeKind, setActiveKind] = useState<PdfConditionKind>('banco-direto');
  const [salvando, setSalvando] = useState(false);
  const [alteracoesPendentes, setAlteracoesPendentes] = useState(false);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      const dados = await telaVisibilidadeService.carregarTodasAsConfiguracoes();
      setTodasConfiguracoes(dados);
      setCarregando(false);
    })();
  }, []);

  const activeMeta = KIND_META.find(m => m.kind === activeKind)!;
  // Condições em que existe o gráfico controlado pela chave "Comprometimento por Série": só "Sinal c/
  // Morar" (e Comissão Apartada) e "Parcelamento Morar". Nas demais o toggle seria enganoso, então some.
  const temChaveComprometimento = ['sinal-morar', 'sinal-morar-comissao-apartada', 'parcelamento-morar'].includes(activeKind);
  const ehParcelamentoMorar = activeKind === 'parcelamento-morar';
  // Em "Sinal c/ Morar" o gráfico de comprometimento saiu do Bloco 2 (agora tem chave própria abaixo),
  // então o texto do Bloco 2 na TELA descreve só o que sobra. (O PDF segue usando blocosMeta.ts como está.)
  const ehSinalMorar = activeKind === 'sinal-morar' || activeKind === 'sinal-morar-comissao-apartada';
  const bloco2Titulo = ehSinalMorar ? 'Bloco 2 — Fluxo de Entrada e Parcelas' : activeMeta.bloco2.title;
  const bloco2Descricao = ehSinalMorar
    ? 'Fluxo de entrada c/ construtora e parcelas. Hoje este switch não oculta nenhum quadro nesta condição na tela.'
    : activeMeta.bloco2.description;
  const activeSettings: TelaVisibilitySettings = todasConfiguracoes[activeCargo]?.[activeKind] ?? DEFAULT_TELA_VISIBILITY_SETTINGS;

  const trocarCargo = (cargo: Cargo) => {
    setActiveCargo(cargo);
    setAlteracoesPendentes(false);
  };

  const trocarCondicao = (kind: PdfConditionKind) => {
    setActiveKind(kind);
    setAlteracoesPendentes(false);
  };

  const updateSetting = (field: keyof TelaVisibilitySettings, value: boolean) => {
    if (!podeEditar) return;
    const novoSettings: TelaVisibilitySettings = { ...activeSettings, [field]: value };
    setTodasConfiguracoes(prev => ({
      ...prev,
      [activeCargo]: { ...(prev[activeCargo] || {}), [activeKind]: novoSettings } as TelaVisibilitySettingsByKind
    }));
    setAlteracoesPendentes(true);
  };

  const handleSalvar = async () => {
    if (!podeEditar) return;
    setSalvando(true);
    const res = await telaVisibilidadeService.salvarConfiguracaoDoCargo(activeCargo, activeKind, activeSettings);
    setSalvando(false);
    if (res.success) {
      setAlteracoesPendentes(false);
      onShowToast(`Configuração de tela salva para ${activeCargo}.`);
    } else {
      onShowToast(`Erro ao salvar: ${res.error || 'erro desconhecido'}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-10">
      {/* CABEÇALHO */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-morar-100 text-morar-700">
          <LayoutGrid className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Configurar Visibilidade dos Quadros</h1>
          <p className="text-xs text-slate-500 font-medium">
            Escolha, por cargo e por condição comercial, quais quadros aparecem NA TELA durante a simulação — independente do que sai no PDF exportado.
          </p>
        </div>
      </div>

      {!podeEditar && (
        <div className="p-3.5 rounded-xl border bg-amber-50 border-amber-200 text-amber-800 flex items-start gap-2.5 text-xs">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Só Administradores podem alterar essa configuração. Você pode visualizar o que está definido para cada cargo.</span>
        </div>
      )}

      {/* SELETOR DE CARGO */}
      <div>
        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 px-1">Cargo</label>
        <select
          value={activeCargo}
          onChange={e => trocarCargo(e.target.value as Cargo)}
          className="w-full sm:w-64 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white shadow-xs"
        >
          {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* SELETOR DE CONDIÇÃO COMERCIAL */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap gap-2">
        {KIND_META.map(meta => {
          const Icon = meta.icon;
          const isActive = meta.kind === activeKind;
          return (
            <button
              key={meta.kind}
              type="button"
              onClick={() => trocarCondicao(meta.kind)}
              className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-morar-50 text-morar-700 border border-morar-200 shadow-2xs'
                  : 'text-slate-500 hover:bg-slate-50 border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>

      {carregando ? (
        <div className="p-10 text-center text-sm text-slate-400">Carregando configurações...</div>
      ) : (
        <>
          {/* BLOCO: SEÇÕES DA TELA */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-3.5 pt-3 pb-1">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quadros na Tela</h2>
            </div>
            <SettingRow
              title={activeMeta.bloco1.title}
              description={activeMeta.bloco1.description}
              checked={activeSettings.mostrarBloco1}
              onChange={() => updateSetting('mostrarBloco1', !activeSettings.mostrarBloco1)}
              disabled={!podeEditar}
            />
            <SettingRow
              title={bloco2Titulo}
              description={bloco2Descricao}
              checked={activeSettings.mostrarBloco2}
              onChange={() => updateSetting('mostrarBloco2', !activeSettings.mostrarBloco2)}
              disabled={!podeEditar}
            />
            <SettingRow
              title={activeMeta.bloco3.title}
              description={activeMeta.bloco3.description}
              checked={activeSettings.mostrarBloco3}
              onChange={() => updateSetting('mostrarBloco3', !activeSettings.mostrarBloco3)}
              disabled={!podeEditar}
            />
            <SettingRow
              title={activeMeta.bloco4.title}
              description={activeMeta.bloco4.description}
              checked={activeSettings.mostrarBloco4}
              onChange={() => updateSetting('mostrarBloco4', !activeSettings.mostrarBloco4)}
              disabled={!podeEditar}
            />
            {temChaveComprometimento && (
              <SettingRow
                title={ehParcelamentoMorar ? 'Percentuais de Comprometimento' : 'Comprometimento por Série (Parcela / Renda)'}
                description={ehParcelamentoMorar
                  ? 'Exibe o gráfico de barras com o percentual de cada componente (sinal, mensais, intermediárias, chaves e pós-obra) sobre o imóvel e a renda. Soma-se ao Bloco 4: só aparece com os dois ligados.'
                  : 'Exibe o gráfico de barras horizontais com o percentual de comprometimento da renda em cada série e no ITBI.'}
                checked={activeSettings.mostrarComprometimentoPorSerie ?? true}
                onChange={() => updateSetting('mostrarComprometimentoPorSerie', !(activeSettings.mostrarComprometimentoPorSerie ?? true))}
                disabled={!podeEditar}
              />
            )}
            <SettingRow
              title="Rateio de ITBI e Parcela Bruta nas Séries"
              description="Exibe o acréscimo de '+ ITBI: R$ ...' e o valor total da 'Parcela Bruta: R$ .../mês' abaixo de cada linha de série nas fases de Obra e Pós-Obra."
              checked={activeSettings.mostrarRateioItbiParcelaBruta ?? true}
              onChange={() => updateSetting('mostrarRateioItbiParcelaBruta', !(activeSettings.mostrarRateioItbiParcelaBruta ?? true))}
              disabled={!podeEditar}
            />
          </div>

          {podeEditar && (
            <div className="flex items-center justify-between gap-3 pt-1 px-1">
              <p className="text-[11px] text-slate-400">
                {alteracoesPendentes
                  ? 'Você tem alterações não salvas nesta tela.'
                  : `Configuração salva para o cargo ${activeCargo} nesta condição comercial.`}
              </p>
              <button
                type="button"
                onClick={handleSalvar}
                disabled={salvando || !alteracoesPendentes}
                className="px-5 py-2.5 bg-morar-600 hover:bg-morar-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-xs shadow-xs transition-all flex items-center gap-2 cursor-pointer shrink-0"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{salvando ? 'Salvando...' : 'Salvar Alterações'}</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
