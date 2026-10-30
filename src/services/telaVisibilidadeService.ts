import { supabase } from '../lib/supabaseClient';
import { Cargo, PdfConditionKind, TelaVisibilitySettings, TelaVisibilitySettingsByKind } from '../types';
import {
  DEFAULT_TELA_VISIBILITY_SETTINGS,
  DEFAULT_TELA_VISIBILITY_SETTINGS_BY_KIND,
  cadeiaHierarquicaDeCargos,
  aplicarHerancaHierarquicaDeVisibilidade
} from '../utils/telaVisibility';

/*
 * SQL DE CRIAÇÃO DO BANCO DE DADOS — VISIBILIDADE DOS QUADROS NA TELA POR CARGO
 * ================================================================================
 * Execute no SQL Editor do seu projeto Supabase — seguro rodar a qualquer
 * momento (só cria uma tabela nova, isolada da de PDF). O Administrador
 * define, por cargo e por tipo de condição comercial, quais dos 4 blocos de
 * conteúdo aparecem NA TELA enquanto a pessoa está montando a simulação —
 * independente do que sai no PDF exportado (essa é outra configuração).
 *
 * CREATE TABLE IF NOT EXISTS tela_visibilidade_por_cargo (
 *   cargo TEXT NOT NULL,
 *   condicao TEXT NOT NULL,
 *   mostrar_bloco1 BOOLEAN NOT NULL DEFAULT true,
 *   mostrar_bloco2 BOOLEAN NOT NULL DEFAULT true,
 *   mostrar_bloco3 BOOLEAN NOT NULL DEFAULT true,
 *   mostrar_bloco4 BOOLEAN NOT NULL DEFAULT true,
 *   atualizado_em TIMESTAMPTZ DEFAULT now(),
 *   PRIMARY KEY (cargo, condicao)
 * );
 *
 * -- Qualquer pessoa logada precisa conseguir LER (é o que decide o que ela
 * -- mesma vê na tela); só o Administrador pode gravar. Um cargo sem linha
 * -- aqui ainda simplesmente mostra tudo (ver DEFAULT_TELA_VISIBILITY_SETTINGS
 * -- em src/utils/telaVisibility.ts) — não é preciso pré-cadastrar todos.
 * ALTER TABLE tela_visibilidade_por_cargo ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "logados_leem_tela_visibilidade" ON tela_visibilidade_por_cargo
 *   FOR SELECT USING (auth.role() = 'authenticated');
 * CREATE POLICY "admin_grava_tela_visibilidade" ON tela_visibilidade_por_cargo
 *   FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
 */

interface TelaVisibilityRow {
  cargo: Cargo;
  condicao: PdfConditionKind;
  mostrar_bloco1: boolean;
  mostrar_bloco2: boolean;
  mostrar_bloco3: boolean;
  mostrar_bloco4: boolean;
}

function rowParaSettings(row: TelaVisibilityRow): TelaVisibilitySettings {
  return {
    mostrarBloco1: row.mostrar_bloco1,
    mostrarBloco2: row.mostrar_bloco2,
    mostrarBloco3: row.mostrar_bloco3,
    mostrarBloco4: row.mostrar_bloco4
  };
}

export const telaVisibilidadeService = {
  // Usado ao abrir a tela de simulação: o que este cargo pode ver nos
  // quadros desta condição. Sem linha configurada ainda, mostra tudo.
  //
  // Cargos com um superior mapeado em CARGO_SUPERIOR_HIERARQUICO (hoje,
  // Corretor e Corretor Parceiro — ambos sob Gerente) têm a própria
  // configuração restringida em cascata pela do superior: a permissão do
  // Gerente atua como teto (ver aplicarHerancaHierarquicaDeVisibilidade).
  // Cargos sem superior mapeado (Gerente incluso) seguem o comportamento
  // de sempre — só a própria configuração.
  async carregarConfiguracaoParaTela(cargo: Cargo, condicao: PdfConditionKind): Promise<TelaVisibilitySettings> {
    const cadeia = cadeiaHierarquicaDeCargos(cargo);

    if (cadeia.length === 1) {
      const { data, error } = await supabase
        .from('tela_visibilidade_por_cargo')
        .select('*')
        .eq('cargo', cargo)
        .eq('condicao', condicao)
        .maybeSingle();
      if (error || !data) return { ...DEFAULT_TELA_VISIBILITY_SETTINGS };
      return rowParaSettings(data as TelaVisibilityRow);
    }

    // Busca a configuração de todos os cargos da cadeia (o próprio + cada
    // superior) numa única consulta.
    const { data, error } = await supabase
      .from('tela_visibilidade_por_cargo')
      .select('*')
      .in('cargo', cadeia)
      .eq('condicao', condicao);
    if (error) return { ...DEFAULT_TELA_VISIBILITY_SETTINGS };

    const configsPorCargo: Partial<Record<Cargo, TelaVisibilitySettings>> = {};
    ((data || []) as TelaVisibilityRow[]).forEach(row => {
      configsPorCargo[row.cargo] = rowParaSettings(row);
    });

    return aplicarHerancaHierarquicaDeVisibilidade(configsPorCargo, cadeia);
  },

  // Usado na tela "Configurar Visibilidade dos Quadros": todas as
  // configurações já salvas, para todos os cargos e condições, numa única
  // consulta — o que não veio do banco preenche com o padrão (mostra tudo).
  async carregarTodasAsConfiguracoes(): Promise<Partial<Record<Cargo, TelaVisibilitySettingsByKind>>> {
    const { data, error } = await supabase.from('tela_visibilidade_por_cargo').select('*');
    if (error || !data) return {};
    const resultado: Partial<Record<Cargo, TelaVisibilitySettingsByKind>> = {};
    (data as TelaVisibilityRow[]).forEach(row => {
      if (!resultado[row.cargo]) resultado[row.cargo] = { ...DEFAULT_TELA_VISIBILITY_SETTINGS_BY_KIND };
      resultado[row.cargo]![row.condicao] = rowParaSettings(row);
    });
    return resultado;
  },

  // Grava a configuração de um cargo/condição — só o Administrador consegue
  // de verdade (RLS acima); qualquer outra conta recebe erro aqui.
  async salvarConfiguracaoDoCargo(cargo: Cargo, condicao: PdfConditionKind, settings: TelaVisibilitySettings): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.from('tela_visibilidade_por_cargo').upsert({
      cargo,
      condicao,
      mostrar_bloco1: settings.mostrarBloco1,
      mostrar_bloco2: settings.mostrarBloco2,
      mostrar_bloco3: settings.mostrarBloco3,
      mostrar_bloco4: settings.mostrarBloco4,
      atualizado_em: new Date().toISOString()
    }, { onConflict: 'cargo,condicao' });
    return { success: !error, error: error?.message };
  }
};
