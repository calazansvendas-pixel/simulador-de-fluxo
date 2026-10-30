import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebaseClient';
import { idSeguro, mensagemDeErro } from '../lib/firestoreUtils';
import { Cargo, PdfConditionKind, TelaVisibilitySettings, TelaVisibilitySettingsByKind } from '../types';
import {
  DEFAULT_TELA_VISIBILITY_SETTINGS,
  DEFAULT_TELA_VISIBILITY_SETTINGS_BY_KIND,
  cadeiaHierarquicaDeCargos,
  aplicarHerancaHierarquicaDeVisibilidade
} from '../utils/telaVisibility';

/*
 * ESTRUTURA DO FIRESTORE — VISIBILIDADE DOS QUADROS NA TELA POR CARGO
 * ================================================================================
 * Coleção tela_visibilidade_por_cargo, um documento por cargo+condição (id
 * "<cargo>__<condicao>"). O Administrador define, por cargo e por tipo de
 * condição comercial, quais dos 4 blocos de conteúdo aparecem NA TELA enquanto
 * a pessoa monta a simulação — independente do que sai no PDF exportado.
 * Qualquer pessoa logada pode LER; só o Administrador grava (ver
 * firestore.rules). Um cargo sem documento ainda mostra tudo (ver
 * DEFAULT_TELA_VISIBILITY_SETTINGS em src/utils/telaVisibility.ts).
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
  // quadros desta condição. Sem documento configurado ainda, mostra tudo.
  //
  // Cargos com um superior mapeado em CARGO_SUPERIOR_HIERARQUICO (hoje,
  // Corretor e Corretor Parceiro — ambos sob Gerente) têm a própria
  // configuração restringida em cascata pela do superior: a permissão do
  // Gerente atua como teto (ver aplicarHerancaHierarquicaDeVisibilidade).
  // Cargos sem superior mapeado (Gerente incluso) seguem o comportamento
  // de sempre — só a própria configuração.
  async carregarConfiguracaoParaTela(cargo: Cargo, condicao: PdfConditionKind): Promise<TelaVisibilitySettings> {
    const cadeia = cadeiaHierarquicaDeCargos(cargo);

    try {
      // Busca a configuração de todos os cargos da cadeia (o próprio + cada superior).
      const docs = await Promise.all(
        cadeia.map(c => getDoc(doc(db, 'tela_visibilidade_por_cargo', idSeguro(c, condicao))))
      );

      if (cadeia.length === 1) {
        return docs[0].exists() ? rowParaSettings(docs[0].data() as TelaVisibilityRow) : { ...DEFAULT_TELA_VISIBILITY_SETTINGS };
      }

      const configsPorCargo: Partial<Record<Cargo, TelaVisibilitySettings>> = {};
      docs.forEach(d => {
        if (!d.exists()) return;
        const row = d.data() as TelaVisibilityRow;
        configsPorCargo[row.cargo] = rowParaSettings(row);
      });

      return aplicarHerancaHierarquicaDeVisibilidade(configsPorCargo, cadeia);
    } catch {
      return { ...DEFAULT_TELA_VISIBILITY_SETTINGS };
    }
  },

  // Usado na tela "Configurar Visibilidade dos Quadros": todas as
  // configurações já salvas, para todos os cargos e condições, numa única
  // consulta — o que não veio do banco preenche com o padrão (mostra tudo).
  async carregarTodasAsConfiguracoes(): Promise<Partial<Record<Cargo, TelaVisibilitySettingsByKind>>> {
    try {
      const snap = await getDocs(collection(db, 'tela_visibilidade_por_cargo'));
      const resultado: Partial<Record<Cargo, TelaVisibilitySettingsByKind>> = {};
      snap.forEach(d => {
        const row = d.data() as TelaVisibilityRow;
        if (!resultado[row.cargo]) resultado[row.cargo] = { ...DEFAULT_TELA_VISIBILITY_SETTINGS_BY_KIND };
        resultado[row.cargo]![row.condicao] = rowParaSettings(row);
      });
      return resultado;
    } catch {
      return {};
    }
  },

  // Grava a configuração de um cargo/condição — só o Administrador consegue
  // de verdade (regras do Firestore); qualquer outra conta recebe erro aqui.
  async salvarConfiguracaoDoCargo(cargo: Cargo, condicao: PdfConditionKind, settings: TelaVisibilitySettings): Promise<{ success: boolean; error?: string }> {
    try {
      await setDoc(doc(db, 'tela_visibilidade_por_cargo', idSeguro(cargo, condicao)), {
        cargo,
        condicao,
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
