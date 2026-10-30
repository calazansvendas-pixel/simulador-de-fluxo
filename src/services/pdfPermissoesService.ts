import { supabase } from '../lib/supabaseClient';
import { Cargo, PdfConditionKind, PdfExportSettings, PdfExportSettingsByKind } from '../types';
import { DEFAULT_PDF_EXPORT_SETTINGS, DEFAULT_PDF_EXPORT_SETTINGS_BY_KIND } from '../utils/pdfExport';

/*
 * SQL DE CRIAÇÃO DO BANCO DE DADOS — CONFIGURAÇÃO DE EXPORTAÇÃO DE PDF POR CARGO
 * ================================================================================
 * Execute no SQL Editor do seu projeto Supabase — seguro rodar a qualquer
 * momento (só cria uma tabela nova; nada do app atual depende dela ainda).
 * A configuração deixa de morar no navegador de cada um (era localStorage) e
 * passa a valer de verdade pra todo mundo: o Administrador define, por cargo
 * e por tipo de condição comercial, o que aparece no PDF exportado.
 *
 * CREATE TABLE IF NOT EXISTS pdf_export_settings_por_cargo (
 *   cargo TEXT NOT NULL,
 *   condicao TEXT NOT NULL,
 *   mostrar_valores BOOLEAN NOT NULL DEFAULT true,
 *   mostrar_cliente BOOLEAN NOT NULL DEFAULT true,
 *   mostrar_imobiliaria BOOLEAN NOT NULL DEFAULT true,
 *   mostrar_data_simulacao BOOLEAN NOT NULL DEFAULT true,
 *   mostrar_bloco1 BOOLEAN NOT NULL DEFAULT true,
 *   mostrar_bloco2 BOOLEAN NOT NULL DEFAULT true,
 *   mostrar_bloco3 BOOLEAN NOT NULL DEFAULT true,
 *   mostrar_bloco4 BOOLEAN NOT NULL DEFAULT true,
 *   atualizado_em TIMESTAMPTZ DEFAULT now(),
 *   PRIMARY KEY (cargo, condicao)
 * );
 *
 * -- Qualquer pessoa logada precisa conseguir LER (é o que decide o que ela
 * -- mesma vê ao exportar um PDF); só o Administrador pode gravar. Um cargo
 * -- sem linha aqui ainda simplesmente mostra tudo (ver DEFAULT_PDF_EXPORT_SETTINGS
 * -- em src/utils/pdfExport.ts) — não é preciso pré-cadastrar todos os cargos.
 * ALTER TABLE pdf_export_settings_por_cargo ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "logados_leem_pdf_settings" ON pdf_export_settings_por_cargo
 *   FOR SELECT USING (auth.role() = 'authenticated');
 * CREATE POLICY "admin_grava_pdf_settings" ON pdf_export_settings_por_cargo
 *   FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
 */

interface PdfSettingsRow {
  cargo: Cargo;
  condicao: PdfConditionKind;
  mostrar_valores: boolean;
  mostrar_cliente: boolean;
  mostrar_imobiliaria: boolean;
  mostrar_data_simulacao: boolean;
  mostrar_bloco1: boolean;
  mostrar_bloco2: boolean;
  mostrar_bloco3: boolean;
  mostrar_bloco4: boolean;
}

function rowParaSettings(row: PdfSettingsRow): PdfExportSettings {
  return {
    mostrarValores: row.mostrar_valores,
    mostrarCliente: row.mostrar_cliente,
    mostrarImobiliaria: row.mostrar_imobiliaria,
    mostrarDataSimulacao: row.mostrar_data_simulacao,
    mostrarBloco1: row.mostrar_bloco1,
    mostrarBloco2: row.mostrar_bloco2,
    mostrarBloco3: row.mostrar_bloco3,
    mostrarBloco4: row.mostrar_bloco4
  };
}

export const pdfPermissoesService = {
  // Usado no momento de exportar: o que este cargo pode ver no PDF desta
  // condição. Sem linha configurada ainda para o cargo/condição, mostra tudo.
  async carregarConfiguracaoParaExportar(cargo: Cargo, condicao: PdfConditionKind): Promise<PdfExportSettings> {
    const { data, error } = await supabase
      .from('pdf_export_settings_por_cargo')
      .select('*')
      .eq('cargo', cargo)
      .eq('condicao', condicao)
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_PDF_EXPORT_SETTINGS };
    return rowParaSettings(data as PdfSettingsRow);
  },

  // Usado na tela "Configurar Exportação PDF": todas as configurações já
  // salvas, para todos os cargos e condições, numa única consulta — o que
  // não veio do banco preenche com o padrão (mostra tudo).
  async carregarTodasAsConfiguracoes(): Promise<Partial<Record<Cargo, PdfExportSettingsByKind>>> {
    const { data, error } = await supabase.from('pdf_export_settings_por_cargo').select('*');
    if (error || !data) return {};
    const resultado: Partial<Record<Cargo, PdfExportSettingsByKind>> = {};
    (data as PdfSettingsRow[]).forEach(row => {
      if (!resultado[row.cargo]) resultado[row.cargo] = { ...DEFAULT_PDF_EXPORT_SETTINGS_BY_KIND };
      resultado[row.cargo]![row.condicao] = rowParaSettings(row);
    });
    return resultado;
  },

  // Grava a configuração de um cargo/condição — só o Administrador consegue
  // de verdade (RLS acima); qualquer outra conta recebe erro aqui.
  async salvarConfiguracaoDoCargo(cargo: Cargo, condicao: PdfConditionKind, settings: PdfExportSettings): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.from('pdf_export_settings_por_cargo').upsert({
      cargo,
      condicao,
      mostrar_valores: settings.mostrarValores,
      mostrar_cliente: settings.mostrarCliente,
      mostrar_imobiliaria: settings.mostrarImobiliaria,
      mostrar_data_simulacao: settings.mostrarDataSimulacao,
      mostrar_bloco1: settings.mostrarBloco1,
      mostrar_bloco2: settings.mostrarBloco2,
      mostrar_bloco3: settings.mostrarBloco3,
      mostrar_bloco4: settings.mostrarBloco4,
      atualizado_em: new Date().toISOString()
    }, { onConflict: 'cargo,condicao' });
    return { success: !error, error: error?.message };
  }
};
