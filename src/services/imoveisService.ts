import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData
} from 'firebase/firestore';
import { auth, db } from '../lib/firebaseClient';
import { commitEmLotes, desempacotarJson, empacotarJson, idSeguro, mensagemDeErro } from '../lib/firestoreUtils';
import { INITIAL_PRODUCTS } from '../data/initialProducts';
import { parseM2Number, parseCurrency, formatArea } from '../utils/formatters';

/*
 * ESTRUTURA DO FIRESTORE — EMPREENDIMENTOS, UNIDADES E SIMULAÇÕES
 * ===============================================================
 * O Firestore não precisa de script de criação: as coleções nascem no primeiro
 * documento gravado. As regras de segurança ficam em `firestore.rules`.
 *
 * empreendimentos/{id}       nome, delivery_date_phase1/2, is_featured,
 *                            conditions_json (política de crédito),
 *                            tabela_valid_from/to/file_name (vigência da tabela)
 * unidades/{emp__torre__un}  uma por unidade (id determinístico, então regravar a
 *                            mesma torre/unidade atualiza em vez de duplicar):
 *                            empreendimento_id, torre, unidade, tipologia,
 *                            area_privativa, quintal, preco_tabela,
 *                            avaliacao_bancaria, itbi_*, status
 * tabelas_arquivadas/{auto}  tabela de vendas anterior, guardada antes de ser
 *                            sobrescrita por uma nova importação (rows_json)
 * simulacoes/{auto}          propostas salvas: cliente_nome, renda, dados_json,
 *                            criado_por, ancestrais_criador (cadeia de superiores do
 *                            criador no momento em que salvou — é o que permite ao
 *                            Gerente/Diretor ver a equipe), created_at
 *
 * Estruturas livres (conditions, dados, rows) são guardadas como texto JSON porque
 * o Firestore não aceita arrays dentro de arrays.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function comId(snap: { id: string; data: () => DocumentData }): any {
  return { id: snap.id, ...snap.data() };
}

function idDaUnidade(u: { empreendimento_id: string; torre: string; unidade: string }): string {
  return idSeguro(u.empreendimento_id, u.torre, u.unidade);
}

export const imoveisService = {
  // Converte unidades do formato do banco para linhas de tabela (tableInfo.rows)
  converterUnidadesParaLinhas(unidades: any[]): (string | number)[][] {
    if (!unidades || unidades.length === 0) return [];
    return unidades.map(u => [
      u.status || '1ª Fase',
      String(u.torre || '').trim(),
      String(u.unidade || '').trim(),
      formatArea(u.area_privativa),
      formatArea(u.quintal),
      u.tipologia || '2 Quartos',
      Number(u.avaliacao_bancaria || 0),
      Number(u.preco_tabela || 0),
      Number(u.itbi_primeiro_imovel !== undefined && u.itbi_primeiro_imovel !== null ? u.itbi_primeiro_imovel : (u.itbi_total || 0)),
      Number(u.itbi_segundo_imovel !== undefined && u.itbi_segundo_imovel !== null ? u.itbi_segundo_imovel : (u.itbi_total || u.itbi_primeiro_imovel || 0))
    ]);
  },

  // Converte linhas de tabela (tableInfo.rows) para o formato de unidades esperado
  // pelo banco (inverso de converterUnidadesParaLinhas). Compartilhado entre a
  // importação de planilha (ImportTableView) e a migração automática de
  // empreendimentos com id legado incompatível com o formato de id do banco.
  converterLinhasParaUnidades(empId: string, rows: (string | number)[][]): any[] {
    return rows.map(row => {
      const areaPriv = parseM2Number(row[3]);
      const areaQuintal = parseM2Number(row[4]);
      const avaliacao = parseCurrency(row[6]);
      const preco = parseCurrency(row[7]);
      let itbi1 = parseCurrency(row[8]);
      let itbi2 = parseCurrency(row[9]) || itbi1;

      // Garantia de isolamento das taxas de ITBI / Registro (nunca embutir preço de apartamento)
      if (preco > 50000 && itbi1 > preco) {
        itbi1 = Math.max(0, Math.round((itbi1 - preco) * 100) / 100);
      }
      if (preco > 50000 && itbi2 > preco) {
        itbi2 = Math.max(0, Math.round((itbi2 - preco) * 100) / 100);
      }

      return {
        empreendimento_id: empId,
        status: String(row[0] || '1ª Fase').trim(),
        torre: String(row[1] || '').trim(),
        unidade: String(row[2] || '').trim(),
        area_privativa: areaPriv,
        quintal: areaQuintal,
        tipologia: String(row[5] || '').trim() || '2 Quartos',
        avaliacao_bancaria: avaliacao,
        preco_tabela: preco,
        itbi_primeiro_imovel: itbi1,
        itbi_segundo_imovel: itbi2,
        itbi_total: itbi2
      };
    }).filter(u => u.torre !== '' && u.unidade !== '');
  },

  // Lista todos os empreendimentos (Tenta Firestore, cai para Mock Local)
  async listarEmpreendimentos() {
    try {
      const snap = await getDocs(collection(db, 'empreendimentos'));

      if (snap.empty) {
        console.warn('Firestore sem dados de empreendimentos. Usando Mock (INITIAL_PRODUCTS).');
        return INITIAL_PRODUCTS; // Fallback
      }
      return snap.docs.map(d => {
        const { conditions_json, ...resto } = d.data();
        const conditions = desempacotarJson(conditions_json);
        return { id: d.id, ...resto, ...(conditions !== null ? { conditions } : {}) };
      });
    } catch (e) {
      console.warn('Erro ao conectar com o Firestore. Usando Mock (INITIAL_PRODUCTS).');
      return INITIAL_PRODUCTS; // Fallback
    }
  },

  // Garante que o empreendimento exista no Firestore (nome, datas de entrega) e, quando
  // fornecida, grava também a política de crédito (conditions), o destaque (is_featured) e
  // a vigência da tabela de vendas atual (tabela_valid_from/to/file_name) — para que essas
  // informações fiquem compartilhadas entre todos os usuários, em vez de cada um ficar com
  // seu próprio valor local.
  async sincronizarEmpreendimento(emp: {
    id: string;
    nome: string;
    delivery_date_phase1?: string;
    delivery_date_phase2?: string;
    conditions?: unknown;
    is_featured?: boolean;
    tabela_valid_from?: string;
    tabela_valid_to?: string;
    tabela_file_name?: string;
    tabela_total_unidades?: number;
    tabela_ativa?: boolean;
    data_importacao_tabela?: string;
    atualizado_em?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      if (!UUID_REGEX.test(emp.id)) return { success: false, error: 'id não é um UUID válido' };

      const payload: Record<string, unknown> = {
        nome: emp.nome,
        delivery_date_phase1: emp.delivery_date_phase1 || null,
        delivery_date_phase2: emp.delivery_date_phase2 || null
      };
      if (emp.conditions !== undefined) payload.conditions_json = empacotarJson(emp.conditions);
      if (emp.is_featured !== undefined) payload.is_featured = emp.is_featured;
      // valid_from/valid_to espelham tabela_valid_from/to (o App lê os tabela_*).
      if (emp.tabela_valid_from !== undefined) { payload.tabela_valid_from = emp.tabela_valid_from; payload.valid_from = emp.tabela_valid_from; payload.vigencia_inicio = emp.tabela_valid_from; }
      if (emp.tabela_valid_to !== undefined) { payload.tabela_valid_to = emp.tabela_valid_to; payload.valid_to = emp.tabela_valid_to; payload.vigencia_fim = emp.tabela_valid_to; }
      if (emp.tabela_file_name !== undefined) payload.tabela_file_name = emp.tabela_file_name;
      if (emp.tabela_total_unidades !== undefined) { payload.tabela_total_unidades = emp.tabela_total_unidades; payload.unidades_count = emp.tabela_total_unidades; }
      if (emp.atualizado_em !== undefined) payload.atualizado_em = emp.atualizado_em;
      if (emp.tabela_ativa !== undefined) payload.tabela_ativa = emp.tabela_ativa;
      if (emp.data_importacao_tabela !== undefined) payload.data_importacao_tabela = emp.data_importacao_tabela;

      // merge: true = comportamento de upsert (campos não enviados ficam como estão).
      await setDoc(doc(db, 'empreendimentos', emp.id), payload, { merge: true });
      return { success: true };
    } catch (e: any) {
      console.warn('Aviso ao sincronizar empreendimento no Firestore:', e);
      return { success: false, error: mensagemDeErro(e, 'Erro ao sincronizar com o banco') };
    }
  },

  // Salva lote de unidades no Firestore e recarrega a lista atualizada
  async salvarUnidadesLote(empId: string, unidades: any[]) {
    if (!unidades || unidades.length === 0) {
      return { success: true, data: [] };
    }

    try {
      await commitEmLotes(unidades, (batch, u) => {
        batch.set(doc(db, 'unidades', idDaUnidade({ ...u, empreendimento_id: u.empreendimento_id || empId })), u, { merge: true });
      });

      // Recarrega unidades diretamente do banco para garantir consistência
      try {
        const fresh = await getDocs(query(collection(db, 'unidades'), where('empreendimento_id', '==', empId)));
        return { success: true, data: fresh.docs.map(comId) };
      } catch (fetchErr) {
        console.warn('Aviso ao recarregar unidades após gravar:', fetchErr);
        return { success: true, data: unidades };
      }
    } catch (e: any) {
      console.error('Erro no salvamento em lote de unidades no Firestore:', e);
      return { success: false, error: mensagemDeErro(e, 'Erro ao sincronizar com o banco') };
    }
  },

  // Substitui por completo a tabela de vendas de um empreendimento (usado pela importação):
  //  a) grava em lote (WriteBatch) todas as unidades novas, sobrescrevendo as de mesmo id;
  //  b) exclui em lote as unidades antigas que não existem na nova tabela;
  //  c) atualiza o documento do empreendimento (vigência, nº de unidades, tabela ativa).
  // As unidades novas são gravadas ANTES de apagar as antigas: se a conexão cair no meio, o
  // empreendimento fica com a tabela antiga + parte da nova, nunca com zero unidades. Ao final,
  // as unidades do empreendimento são exatamente as da nova tabela (as antigas de mesma
  // torre/unidade são sobrescritas, as demais excluídas).
  async substituirTabelaEmpreendimento(
    emp: {
      id: string;
      nome: string;
      delivery_date_phase1?: string;
      delivery_date_phase2?: string;
      tabela_valid_from: string;
      tabela_valid_to: string;
      tabela_file_name: string;
    },
    unidades: any[]
  ): Promise<{ success: boolean; error?: string; data?: any[]; removidas?: number }> {
    try {
      if (!UUID_REGEX.test(emp.id)) return { success: false, error: 'id do empreendimento não é um UUID válido' };
      if (!unidades || unidades.length === 0) return { success: false, error: 'a nova tabela não tem unidades' };

      const idsNovos = new Set(unidades.map(u => idDaUnidade({ ...u, empreendimento_id: emp.id })));
      const existentes = await getDocs(query(collection(db, 'unidades'), where('empreendimento_id', '==', emp.id)));
      const obsoletas = existentes.docs.filter(d => !idsNovos.has(d.id));

      // set sem merge: a unidade antiga é substituída inteira, sem sobrar campo velho.
      await commitEmLotes(unidades, (batch, u) => {
        batch.set(doc(db, 'unidades', idDaUnidade({ ...u, empreendimento_id: emp.id })), { ...u, empreendimento_id: emp.id });
      });
      await commitEmLotes(obsoletas, (batch, d) => batch.delete(d.ref));

      const meta = await this.sincronizarEmpreendimento({
        ...emp,
        tabela_total_unidades: unidades.length,
        tabela_ativa: true,
        data_importacao_tabela: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      });
      if (!meta.success) return { success: false, error: meta.error };

      let data: any[] = unidades;
      try {
        const fresh = await getDocs(query(collection(db, 'unidades'), where('empreendimento_id', '==', emp.id)));
        data = fresh.docs.map(comId);
      } catch (fetchErr) {
        console.warn('Aviso ao recarregar unidades após substituir a tabela:', fetchErr);
      }
      return { success: true, data, removidas: existentes.size };
    } catch (e: any) {
      console.error('Erro ao substituir a tabela no Firestore:', e);
      return { success: false, error: mensagemDeErro(e, 'Erro ao substituir a tabela no banco') };
    }
  },

  // Limpa/Exclui todas as unidades vinculadas a um empreendimento específico
  async limparUnidadesEmpreendimento(empId: string) {
    try {
      const snap = await getDocs(query(collection(db, 'unidades'), where('empreendimento_id', '==', empId)));
      await commitEmLotes(snap.docs, (batch, d) => batch.delete(d.ref));
      return { success: true };
    } catch (e: any) {
      console.error('Exceção ao excluir unidades:', e);
      return { success: false, error: mensagemDeErro(e, 'Falha ao limpar unidades no banco') };
    }
  },

  // Exclui um empreendimento, suas unidades e suas tabelas arquivadas (o que o
  // ON DELETE CASCADE fazia no banco anterior). Sem isso, excluir um
  // empreendimento pelo app removia só localmente — o registro continuava no
  // banco e podia "voltar" na próxima sincronização de outro navegador.
  async excluirEmpreendimento(empId: string) {
    try {
      if (!UUID_REGEX.test(empId)) return { success: true }; // id local nunca sincronizado, nada a excluir no banco

      const [unidades, arquivadas] = await Promise.all([
        getDocs(query(collection(db, 'unidades'), where('empreendimento_id', '==', empId))),
        getDocs(query(collection(db, 'tabelas_arquivadas'), where('empreendimento_id', '==', empId)))
      ]);
      await commitEmLotes([...unidades.docs, ...arquivadas.docs], (batch, d) => batch.delete(d.ref));
      await deleteDoc(doc(db, 'empreendimentos', empId));
      return { success: true };
    } catch (e: any) {
      console.error('Exceção ao excluir empreendimento:', e);
      return { success: false, error: mensagemDeErro(e, 'Falha ao excluir empreendimento no banco') };
    }
  },

  // Lista unidades por empreendimento (Tenta Firestore, se falhar tenta Mock)
  async listarUnidadesPorEmpreendimento(empId: string) {
    try {
      const snap = await getDocs(query(collection(db, 'unidades'), where('empreendimento_id', '==', empId)));

      if (snap.empty) {
        throw new Error('Fallback para Mock local');
      }
      return snap.docs.map(comId).map((u: any) => ({
        ...u,
        area_privativa: parseM2Number(u.area_privativa),
        quintal: parseM2Number(u.quintal),
        preco_tabela: parseCurrency(u.preco_tabela),
        avaliacao_bancaria: parseCurrency(u.avaliacao_bancaria),
        itbi_primeiro_imovel: parseCurrency(u.itbi_primeiro_imovel !== undefined && u.itbi_primeiro_imovel !== null ? u.itbi_primeiro_imovel : u.itbi_total),
        itbi_segundo_imovel: parseCurrency(u.itbi_segundo_imovel !== undefined && u.itbi_segundo_imovel !== null ? u.itbi_segundo_imovel : u.itbi_total),
        itbi_total: parseCurrency(u.itbi_segundo_imovel !== undefined && u.itbi_segundo_imovel !== null ? u.itbi_segundo_imovel : u.itbi_total)
      }));
    } catch (e) {
      // Tenta achar o empreendimento nos mocks
      const prod = INITIAL_PRODUCTS.find(p => p.id === empId) || INITIAL_PRODUCTS[0];
      if (prod && prod.tableInfo && prod.tableInfo.rows) {
        // Mapeia o array do CSV (rows) para o formato de objetos que a interface entende
        return prod.tableInfo.rows.map((row: any[]) => {
          // O formato padrão do CSV no Mock:
          // 0=Fase, 1=Torre, 2=Unidade, 3=Area Priv, 4=Area Quintal, 5=Tipologia, 6=Avaliacao, 7=PrecoTabela, 8=ITBI (1o), 9=ITBI (2o)
          const itbi1 = parseCurrency(row[8]);
          const itbi2 = parseCurrency(row[9]) || itbi1;
          return {
            id: `${row[1]}-${row[2]}`,
            empreendimento_id: empId,
            torre: row[1]?.trim() || '',
            unidade: row[2]?.trim() || '',
            tipologia: row[5] || '2 Quartos',
            area_privativa: parseM2Number(row[3]),
            quintal: parseM2Number(row[4]),
            preco_tabela: parseCurrency(row[7]),
            avaliacao_bancaria: parseCurrency(row[6]),
            itbi_primeiro_imovel: itbi1,
            itbi_segundo_imovel: itbi2,
            itbi_total: itbi2,
            status: row[0] || '1ª Fase'
          };
        }).filter(u => u.torre !== '' && u.unidade !== '');
      }
      return [];
    }
  },

  // Salvar Simulação
  async salvarSimulacao(dadosProposta: {
    cliente_nome?: string;
    renda?: number;
    empreendimento_id?: string;
    dados: any;
  }) {
    try {
      const payload: Record<string, unknown> = {
        cliente_nome: dadosProposta.cliente_nome || 'Cliente Não Informado',
        renda: Number(dadosProposta.renda || 0),
        dados_json: empacotarJson(dadosProposta.dados),
        created_at: new Date().toISOString()
      };

      // Marca quem criou a proposta — é o que permite, junto das regras de
      // segurança do Firestore, cada usuário ver as próprias simulações e
      // (quando liberado) as da equipe abaixo dele na hierarquia. Guarda
      // também a cadeia de superiores do criador nesse momento
      // (`ancestrais_criador`), que é o que dá ao Gerente/Diretor acesso.
      const uid = auth.currentUser?.uid;
      if (uid) {
        payload.criado_por = uid;
        const meuPublico = await getDoc(doc(db, 'perfis_publicos', uid));
        payload.ancestrais_criador = meuPublico.exists() ? (meuPublico.data().ancestrais || []) : [];
      }

      // Só vincula ao empreendimento se o id tiver o formato de id do banco
      if (UUID_REGEX.test(dadosProposta.empreendimento_id || '')) {
        payload.empreendimento_id = dadosProposta.empreendimento_id;
      }

      const ref = await addDoc(collection(db, 'simulacoes'), payload);
      const { dados_json, ...resto } = payload;
      return { success: true, data: [{ id: ref.id, ...resto, dados: dadosProposta.dados }] };
    } catch (e: any) {
      console.warn('Erro ao salvar simulação:', e);
      return { success: false, error: mensagemDeErro(e, 'Erro de conexão') };
    }
  },

  // Atualiza uma simulação já existente (usado pelo salvamento automático: em
  // vez de criar um documento novo a cada ajuste que a pessoa faz na mesma
  // simulação, atualiza o mesmo até ela mudar de torre/unidade/cliente).
  async atualizarSimulacao(id: string, dadosProposta: { cliente_nome?: string; renda?: number; empreendimento_id?: string; dados: any }) {
    try {
      const payload: Record<string, unknown> = {
        cliente_nome: dadosProposta.cliente_nome || 'Cliente Não Informado',
        renda: Number(dadosProposta.renda || 0),
        dados_json: empacotarJson(dadosProposta.dados)
      };
      if (UUID_REGEX.test(dadosProposta.empreendimento_id || '')) {
        payload.empreendimento_id = dadosProposta.empreendimento_id;
      }
      await updateDoc(doc(db, 'simulacoes', id), payload);
      const { dados_json, ...resto } = payload;
      return { success: true, data: [{ id, ...resto, dados: dadosProposta.dados }] };
    } catch (e: any) {
      return { success: false, error: mensagemDeErro(e, 'Erro de conexão') };
    }
  },

  // Lista as simulações salvas que a pessoa logada pode ver (mais recentes
  // primeiro). A ordenação é feita no cliente por dados.salvo_em (sempre
  // presente em toda simulação salva pela Ficha Sinal c/ Morar ou Sinal c/
  // Banco Direto).
  async listarSimulacoes() {
    try {
      interface InfoCriador { nome: string; cargo: string; imobiliaria: string; superiorId: string | null }
      const paraInfo = (p: any): InfoCriador => ({ nome: p.nome_completo, cargo: p.cargo, imobiliaria: p.imobiliaria, superiorId: p.superior_id ?? null });

      const uid = auth.currentUser?.uid;
      if (!uid) return { success: true, data: [] as any[] };

      // As regras do Firestore já restringem o que cada um consegue ler;
      // aqui as consultas pedem exatamente o que a pessoa tem direito de ver.
      // Administrador vê tudo; cada um vê as próprias; quem tem "ver propostas
      // da equipe" ligado também vê as de quem está abaixo dele na hierarquia.
      const meuPerfilSnap = await getDoc(doc(db, 'perfis', uid));
      const meuPerfil = meuPerfilSnap.exists() ? meuPerfilSnap.data() : null;

      const simulacoesPorId = new Map<string, any>();
      const juntar = (snap: { docs: { id: string; data: () => DocumentData }[] }) => snap.docs.forEach(d => simulacoesPorId.set(d.id, comId(d)));
      let infoPorId: Record<string, InfoCriador> = {};

      if (!meuPerfil) {
        // Não deu pra confirmar quem é: por segurança, só mostra as próprias.
        juntar(await getDocs(query(collection(db, 'simulacoes'), where('criado_por', '==', uid))));
      } else if (meuPerfil.cargo === 'Administrador') {
        juntar(await getDocs(collection(db, 'simulacoes')));
        const publicos = await getDocs(collection(db, 'perfis_publicos'));
        publicos.forEach(p => { infoPorId[p.id] = paraInfo(p.data()); });
      } else {
        // Quem não é Administrador só lê o espelho público (nome/cargo/
        // imobiliária/superior) de quem está abaixo — nada de CPF/telefone/e-mail.
        const meuPublico = await getDoc(doc(db, 'perfis_publicos', uid));
        infoPorId = { [uid]: paraInfo(meuPublico.exists() ? meuPublico.data() : meuPerfil) };
        juntar(await getDocs(query(collection(db, 'simulacoes'), where('criado_por', '==', uid))));
        if (meuPerfil.ver_propostas_equipe) {
          try {
            juntar(await getDocs(query(collection(db, 'simulacoes'), where('ancestrais_criador', 'array-contains', uid))));
            const subordinados = await getDocs(query(collection(db, 'perfis_publicos'), where('ancestrais', 'array-contains', uid)));
            subordinados.forEach(s => { infoPorId[s.id] = paraInfo(s.data()); });
          } catch (equipeErr) {
            console.warn('Aviso: não foi possível buscar as propostas da equipe (a pessoa vai ver só as próprias por enquanto):', equipeErr);
          }
        }
      }

      const comCriador = Array.from(simulacoesPorId.values()).map((s: any) => {
        const { dados_json, ...resto } = s;
        const info = s.criado_por ? infoPorId[s.criado_por] : null;
        const gerenteInfo = info?.superiorId ? infoPorId[info.superiorId] : null;
        return {
          ...resto,
          dados: desempacotarJson(dados_json) ?? {},
          criado_por_nome: info?.nome || null,
          criado_por_cargo: info?.cargo || null,
          criado_por_imobiliaria: info?.imobiliaria || null,
          criado_por_gerente_nome: gerenteInfo?.nome || null
        };
      });

      const ordenadas = comCriador.slice().sort((a: any, b: any) => {
        const dataA = a?.dados?.salvo_em || '';
        const dataB = b?.dados?.salvo_em || '';
        return dataB.localeCompare(dataA);
      });
      return { success: true, data: ordenadas };
    } catch (e: any) {
      console.warn('Erro ao listar simulações:', e);
      return { success: false, error: mensagemDeErro(e, 'Erro de conexão'), data: [] as any[] };
    }
  },

  // Exclui uma simulação salva pelo id
  async excluirSimulacao(id: string) {
    try {
      await deleteDoc(doc(db, 'simulacoes', id));
      return { success: true };
    } catch (e: any) {
      console.warn('Erro ao excluir simulação:', e);
      return { success: false, error: mensagemDeErro(e, 'Erro de conexão') };
    }
  },

  // Exclui várias simulações salvas de uma vez (seleção em lote na tela de
  // Simulações Salvas). As regras do Firestore restringem quais documentos cada
  // usuário pode de fato apagar (a própria, ou qualquer uma se Administrador)
  // — por isso cada exclusão é tentada separadamente e devolvemos quantas
  // foram realmente excluídas, para avisar quando o lote pedido for maior que
  // o permitido.
  async excluirSimulacoesEmLote(ids: string[]) {
    if (ids.length === 0) return { success: true, excluidas: 0 };
    try {
      const resultados = await Promise.allSettled(ids.map(id => deleteDoc(doc(db, 'simulacoes', id))));
      return { success: true, excluidas: resultados.filter(r => r.status === 'fulfilled').length };
    } catch (e: any) {
      console.warn('Erro ao excluir simulações em lote:', e);
      return { success: false, error: mensagemDeErro(e, 'Erro de conexão') };
    }
  },

  // Guarda a tabela de vendas atualmente vigente de um empreendimento em
  // `tabelas_arquivadas`, antes que ela seja sobrescrita por uma nova importação
  // (ImportTableView.handleSaveTable chama isto logo antes de gravar a tabela nova).
  // Falha em arquivar não deve travar a importação da tabela nova — por isso não
  // lança, apenas devolve { success: false } para o chamador decidir se avisa o usuário.
  async arquivarTabelaAtual(
    empId: string,
    nomeEmpreendimento: string,
    tableInfo: { fileName?: string; validFrom?: string; validTo?: string; rows?: (string | number)[][] }
  ): Promise<{ success: boolean; error?: string }> {
    if (!tableInfo?.rows || tableInfo.rows.length === 0) {
      return { success: true };
    }
    try {
      await addDoc(collection(db, 'tabelas_arquivadas'), {
        empreendimento_id: empId,
        nome_empreendimento: nomeEmpreendimento,
        file_name: tableInfo.fileName || null,
        valid_from: tableInfo.validFrom || null,
        valid_to: tableInfo.validTo || null,
        rows_json: empacotarJson(tableInfo.rows),
        arquivado_em: new Date().toISOString(),
        arquivado_por: auth.currentUser?.uid || null
      });
      return { success: true };
    } catch (e: any) {
      console.warn('Erro ao arquivar tabela de vendas anterior:', e);
      return { success: false, error: mensagemDeErro(e, 'Erro de conexão') };
    }
  },

  // Lista as tabelas de vendas arquivadas (mais recentes primeiro). Quando `empId` é
  // informado, restringe ao empreendimento; caso contrário lista de todos (tela geral).
  async listarTabelasArquivadas(empId?: string): Promise<any[]> {
    try {
      const base = collection(db, 'tabelas_arquivadas');
      const snap = await getDocs(empId ? query(base, where('empreendimento_id', '==', empId)) : base);
      return snap.docs
        .map(d => {
          const { rows_json, ...resto } = d.data();
          return { id: d.id, ...resto, rows: desempacotarJson(rows_json) ?? [] };
        })
        .sort((a: any, b: any) => String(b.arquivado_em || '').localeCompare(String(a.arquivado_em || '')));
    } catch (e) {
      console.warn('Erro ao listar tabelas arquivadas:', e);
      return [];
    }
  },

  // Exclui definitivamente uma tabela arquivada.
  async excluirTabelaArquivada(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await deleteDoc(doc(db, 'tabelas_arquivadas', id));
      return { success: true };
    } catch (e: any) {
      console.warn('Erro ao excluir tabela arquivada:', e);
      return { success: false, error: mensagemDeErro(e, 'Erro de conexão') };
    }
  },

  // Rotina de Inicialização Automática (insere dados iniciais se o banco estiver vazio).
  // A antiga verificação que relia TODAS as unidades a cada abertura do app, para
  // corrigir áreas sem ponto decimal vindas de importações antigas, não foi mantida: no
  // Firestore cobra-se por documento lido, e um banco novo não tem esse legado (a
  // importação já normaliza as áreas com parseM2Number).
  async inicializarBancoSeNecessario() {
    try {
      const emps = await getDocs(query(collection(db, 'empreendimentos'), limit(1)));

      if (!emps.empty) return;

      console.log('Coleção de empreendimentos vazia. Iniciando carga automática dos dados iniciais...');

      const empId = '11111111-1111-1111-1111-111111111111';

      await setDoc(doc(db, 'empreendimentos', empId), {
        nome: 'Vista dos Colibris',
        delivery_date_phase1: '2026-02-28',
        delivery_date_phase2: '2027-02-28'
      }, { merge: true });

      const { success: insertSuccess, error: insertUnitsErr } = await this.salvarUnidadesLote(empId, [
        { empreendimento_id: empId, torre: 'D', unidade: '303', tipologia: '2Q', area_privativa: 44.02, quintal: 0.00, preco_tabela: 241902.00, avaliacao_bancaria: 218000.00, itbi_total: 19230.00, itbi_primeiro_imovel: 4806.00, itbi_segundo_imovel: 19230.00, status: 'DISPONÍVEL' },
        { empreendimento_id: empId, torre: 'D', unidade: '801', tipologia: '2Q', area_privativa: 42.14, quintal: 0.00, preco_tabela: 246902.00, avaliacao_bancaria: 218000.00, itbi_total: 19230.00, itbi_primeiro_imovel: 4806.00, itbi_segundo_imovel: 19230.00, status: 'DISPONÍVEL' },
        { empreendimento_id: empId, torre: 'C', unidade: '304', tipologia: '2Q', area_privativa: 44.02, quintal: 0.00, preco_tabela: 239902.00, avaliacao_bancaria: 218000.00, itbi_total: 19230.00, itbi_primeiro_imovel: 4806.00, itbi_segundo_imovel: 19230.00, status: 'DISPONÍVEL' },
        { empreendimento_id: empId, torre: 'C', unidade: '308', tipologia: '2Q', area_privativa: 43.50, quintal: 0.00, preco_tabela: 241902.00, avaliacao_bancaria: 218000.00, itbi_total: 19230.00, itbi_primeiro_imovel: 4806.00, itbi_segundo_imovel: 19230.00, status: 'DISPONÍVEL' }
      ]);

      if (!insertSuccess) {
        console.error('Erro ao inserir unidades de teste:', insertUnitsErr);
      } else {
        console.log('Carga inicial concluída com sucesso! (Vista dos Colibris)');
      }
    } catch (err) {
      console.warn('Falha silenciosa na rotina de inicialização do banco.', err);
    }
  }
};
