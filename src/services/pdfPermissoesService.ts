import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebaseClient';
import { idSeguro, mensagemDeErro } from '../lib/firestoreUtils';
import { Cargo, PdfConditionKind, PdfExportSettings, PdfExportSettingsByKind } from '../types';
import { DEFAULT_PDF_EXPORT_SETTINGS, DEFAULT_PDF_EXPORT_SETTINGS_BY_KIND } from '../utils/pdfExport';

/*
 * ESTRUTURA DO FIRESTORE — CONFIGURAÇÃO DE EXPORTAÇÃO DE PDF POR CARGO
 * ================================================================================
 * Coleção pdf_export_settings_por_cargo, um documento por cargo+condição (id
 * "<cargo>__<condicao>"). O Administrador define, por cargo e por tipo de
 * condição comercial, o que aparece no PDF exportado. Qualquer pessoa logada
 * pode LER (é o que decide o que ela mesma vê ao exportar); só o Administrador
 * grava (ver firestore.rules). Um cargo sem documento ainda mostra tudo (ver
 * DEFAULT_PDF_EXPORT_SETTINGS em src/utils/pdfExport.ts).
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
  // condição. Sem documento configurado ainda para o cargo/condição, mostra tudo.
  async carregarConfiguracaoParaExportar(cargo: Cargo, condicao: PdfConditionKind): Promise<PdfExportSettings> {
    try {
      const snap = await getDoc(doc(db, 'pdf_export_settings_por_cargo', idSeguro(cargo, condicao)));
      if (!snap.exists()) return { ...DEFAULT_PDF_EXPORT_SETTINGS };
      return rowParaSettings(snap.data() as PdfSettingsRow);
    } catch {
      return { ...DEFAULT_PDF_EXPORT_SETTINGS };
    }
  },

  // Usado na tela "Configurar Exportação PDF": todas as configurações já
  // salvas, para todos os cargos e condições, numa única consulta — o que
  // não veio do banco preenche com o padrão (mostra tudo).
  async carregarTodasAsConfiguracoes(): Promise<Partial<Record<Cargo, PdfExportSettingsByKind>>> {
    try {
      const snap = await getDocs(collection(db, 'pdf_export_settings_por_cargo'));
      const resultado: Partial<Record<Cargo, PdfExportSettingsByKind>> = {};
      snap.forEach(d => {
        const row = d.data() as PdfSettingsRow;
        if (!resultado[row.cargo]) resultado[row.cargo] = { ...DEFAULT_PDF_EXPORT_SETTINGS_BY_KIND };
        resultado[row.cargo]![row.condicao] = rowParaSettings(row);
      });
      return resultado;
    } catch {
      return {};
    }
  },

  // Grava a configuração de um cargo/condição — só o Administrador consegue
  // de verdade (regras do Firestore); qualquer outra conta recebe erro aqui.
  async salvarConfiguracaoDoCargo(cargo: Cargo, condicao: PdfConditionKind, settings: PdfExportSettings): Promise<{ success: boolean; error?: string }> {
    try {
      await setDoc(doc(db, 'pdf_export_settings_por_cargo', idSeguro(cargo, condicao)), {
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
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: mensagemDeErro(e, 'Erro ao salvar a configuração.') };
    }
  }
};
