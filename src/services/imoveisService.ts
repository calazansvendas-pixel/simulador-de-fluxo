import { supabase } from '../lib/supabaseClient';
import { INITIAL_PRODUCTS } from '../data/initialProducts';
import { parseM2Number, parseCurrency, formatArea } from '../utils/formatters';

/*
 * SQL DE CRIAÇÃO DO BANCO DE DADOS SUPABASE
 * =========================================
 * Execute este script no SQL Editor do seu projeto Supabase para criar as tabelas
 *
 * -- Tabela de Empreendimentos
 * CREATE TABLE empreendimentos (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   nome TEXT NOT NULL,
 *   delivery_date_phase1 TEXT,
 *   delivery_date_phase2 TEXT
 * );
 *
 * -- Tabela de Unidades
 * CREATE TABLE unidades (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   empreendimento_id UUID REFERENCES empreendimentos(id) ON DELETE CASCADE,
 *   torre TEXT NOT NULL,
 *   unidade TEXT NOT NULL,
 *   tipologia TEXT,
 *   area_privativa NUMERIC,
 *   quintal NUMERIC,
 *   preco_tabela NUMERIC,
 *   avaliacao_bancaria NUMERIC,
 *   itbi_total NUMERIC,
 *   itbi_primeiro_imovel NUMERIC,
 *   itbi_segundo_imovel NUMERIC,
 *   status TEXT
 * );
 *
 * -- Se sua tabela unidades já existir, execute para adicionar as colunas opcionais:
 * -- ALTER TABLE unidades ADD COLUMN IF NOT EXISTS itbi_primeiro_imovel NUMERIC;
 * -- ALTER TABLE unidades ADD COLUMN IF NOT EXISTS itbi_segundo_imovel NUMERIC;
 *
 * -- Se sua tabela empreendimentos já existir, execute para adicionar as colunas de
 * -- política de crédito (necessário para que a política configurada em "Políticas &
 * -- Empreendimentos" fique compartilhada entre todos os usuários, em vez de ficar
 * -- salva apenas no navegador de quem editou):
 * -- ALTER TABLE empreendimentos ADD COLUMN IF NOT EXISTS conditions JSONB;
 * -- ALTER TABLE empreendimentos ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
 *
 * -- Colunas de vigência da tabela de vendas (necessário para que o status "Tabela
 * -- Vigente / Vencida" e o nome do arquivo importado fiquem compartilhados entre
 * -- todos os usuários, em vez de cada navegador calcular seu próprio valor):
 * -- ALTER TABLE empreendimentos ADD COLUMN IF NOT EXISTS tabela_valid_from TEXT;
 * -- ALTER TABLE empreendimentos ADD COLUMN IF NOT EXISTS tabela_valid_to TEXT;
 * -- ALTER TABLE empreendimentos ADD COLUMN IF NOT EXISTS tabela_file_name TEXT;
 *
 * -- Tabela de Tabelas de Vendas Arquivadas. Toda vez que uma nova tabela de vendas é
 * -- importada por cima de uma já vigente (ImportTableView), a tabela antiga (unidades +
 * -- vigência) é guardada aqui antes de ser sobrescrita, para consulta e exclusão
 * -- posterior em "Tabelas Arquivadas".
 * CREATE TABLE IF NOT EXISTS tabelas_arquivadas (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   empreendimento_id UUID REFERENCES empreendimentos(id) ON DELETE CASCADE,
 *   nome_empreendimento TEXT,
 *   file_name TEXT,
 *   valid_from TEXT,
 *   valid_to TEXT,
 *   rows JSONB,
 *   arquivado_em TIMESTAMPTZ DEFAULT now(),
 *   arquivado_por UUID
 * );
 * ALTER TABLE tabelas_arquivadas ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "logados_leem_tabelas_arquivadas" ON tabelas_arquivadas FOR SELECT USING (auth.role() = 'authenticated');
 * CREATE POLICY "logados_gravam_tabelas_arquivadas" ON tabelas_arquivadas FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
 *
 * -- Tabela de Simulações Salvas (propostas). Usada pelo botão "Salvar Simulação"
 * -- nas fichas Sinal c/ Morar e Sinal c/ Banco Direto, e pela tela "Simulações
 * -- Salvas" (visualizar / editar / excluir).
 * CREATE TABLE simulacoes (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   cliente_nome TEXT,
 *   renda NUMERIC,
 *   empreendimento_id UUID REFERENCES empreendimentos(id) ON DELETE SET NULL,
 *   dados JSONB,
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 */

export const imoveisService = {
  // Converte unidades do formato Supabase para linhas de tabela (tableInfo.rows)
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
  // pelo Supabase (inverso de converterUnidadesParaLinhas). Compartilhado entre a
  // importação de planilha (ImportTableView) e a migração automática de
  // empreendimentos com id legado incompatível com o tipo UUID do banco.
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

  // Lista todos os empreendimentos (Tenta Supabase, cai para Mock Local)
  async listarEmpreendimentos() {
    try {
      const { data, error } = await supabase.from('empreendimentos').select('*');
      
      if (error || !data || data.length === 0) {
        console.warn('Supabase não configurado ou sem dados. Usando Mock (INITIAL_PRODUCTS).');
        return INITIAL_PRODUCTS; // Fallback
      }
      return data;
    } catch (e) {
      console.warn('Erro ao conectar com Supabase. Usando Mock (INITIAL_PRODUCTS).');
      return INITIAL_PRODUCTS; // Fallback
    }
  },

  // Garante que o empreendimento exista no Supabase (nome, datas de entrega) e, quando
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
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(emp.id);
      if (!isUUID) return { success: false, error: 'id não é um UUID válido' };

      const payload: Record<string, unknown> = {
        id: emp.id,
        nome: emp.nome,
        delivery_date_phase1: emp.delivery_date_phase1 || null,
        delivery_date_phase2: emp.delivery_date_phase2 || null
      };
      if (emp.conditions !== undefined) payload.conditions = emp.conditions;
      if (emp.is_featured !== undefined) payload.is_featured = emp.is_featured;
      if (emp.tabela_valid_from !== undefined) payload.tabela_valid_from = emp.tabela_valid_from;
      if (emp.tabela_valid_to !== undefined) payload.tabela_valid_to = emp.tabela_valid_to;
      if (emp.tabela_file_name !== undefined) payload.tabela_file_name = emp.tabela_file_name;

      // Colunas opcionais que podem ainda não existir no schema do Supabase (quem estiver
      // rodando um banco mais antigo ainda não rodou o ALTER TABLE indicado no topo deste
      // arquivo). Tenta gravar tudo; se o Supabase reclamar de alguma coluna específica por
      // não existir, remove só ela do payload e tenta de novo — assim o que já existir no
      // schema não deixa de ser sincronizado por causa de uma coluna nova ainda pendente.
      const colunasOpcionais = ['conditions', 'is_featured', 'tabela_valid_from', 'tabela_valid_to', 'tabela_file_name'];
      let lastError: { code?: string; message?: string } | null = null;
      for (let tentativa = 0; tentativa <= colunasOpcionais.length; tentativa++) {
        const { error } = await supabase.from('empreendimentos').upsert([payload], { onConflict: 'id' });
        if (!error) return { success: true };

        const isMissingColumn = error.code === 'PGRST204' || /column .* does not exist/i.test(String(error.message || ''));
        if (!isMissingColumn) {
          return { success: false, error: error.message };
        }

        const colunaFaltante = colunasOpcionais.find(c => c in payload && new RegExp(c, 'i').test(String(error.message || '')));
        if (!colunaFaltante) {
          // Não conseguimos identificar qual coluna está faltando pela mensagem — remove
          // todas as opcionais ainda presentes de uma vez, para não ficar em loop.
          const restantes = colunasOpcionais.filter(c => c in payload);
          if (restantes.length === 0) {
            return { success: false, error: error.message };
          }
          restantes.forEach(c => delete payload[c]);
          lastError = error;
          continue;
        }
        console.warn(`Aviso: coluna "${colunaFaltante}" não encontrada no Supabase. Rode o ALTER TABLE indicado em imoveisService.ts. Gravando os demais campos por enquanto.`);
        delete payload[colunaFaltante];
        lastError = error;
      }
      return { success: false, error: lastError?.message || 'Erro ao sincronizar com o banco' };
    } catch (e: any) {
      console.warn('Aviso ao sincronizar empreendimento no Supabase:', e);
      return { success: false, error: e?.message || 'Erro ao sincronizar com o banco' };
    }
  },

  // Salva lote de unidades no Supabase e recarrega a lista atualizada com suporte resiliente a esquemas legados
  async salvarUnidadesLote(empId: string, unidades: any[]) {
    if (!unidades || unidades.length === 0) {
      return { success: true, data: [] };
    }

    // Helper para tentar upsert
    const tryUpsert = async (payload: any[]) => {
      return await supabase
        .from('unidades')
        .upsert(payload, {
          onConflict: 'empreendimento_id, torre, unidade'
        });
    };

    try {
      // 1. Tenta salvar com todas as colunas
      let { error } = await tryUpsert(unidades);

      // 2. Se a coluna 'itbi_segundo_imovel' ou 'itbi_primeiro_imovel' não existir no schema cache do Supabase
      if (error && (error.code === 'PGRST204' || String(error.message || '').includes('itbi_segundo_imovel'))) {
        console.warn('Aviso: Coluna itbi_segundo_imovel não encontrada no Supabase. Removendo do payload e tentando novamente...');
        const payloadSemItbi2 = unidades.map(u => {
          const { itbi_segundo_imovel, ...rest } = u;
          return {
            ...rest,
            itbi_total: u.itbi_segundo_imovel || u.itbi_total || u.itbi_primeiro_imovel
          };
        });
        const res2 = await tryUpsert(payloadSemItbi2);
        error = res2.error;

        // Se ainda falhar por falta de itbi_primeiro_imovel
        if (error && (error.code === 'PGRST204' || String(error.message || '').includes('itbi_primeiro_imovel'))) {
          console.warn('Aviso: Coluna itbi_primeiro_imovel não encontrada no Supabase. Removendo do payload...');
          const payloadBase = payloadSemItbi2.map(u => {
            const { itbi_primeiro_imovel, ...rest } = u;
            return rest;
          });
          const res3 = await tryUpsert(payloadBase);
          error = res3.error;
        }
      } else if (error && (error.code === 'PGRST204' || String(error.message || '').includes('itbi_primeiro_imovel'))) {
        console.warn('Aviso: Coluna itbi_primeiro_imovel não encontrada no Supabase. Removendo do payload...');
        const payloadSemItbi1 = unidades.map(u => {
          const { itbi_primeiro_imovel, ...rest } = u;
          return rest;
        });
        const res3 = await tryUpsert(payloadSemItbi1);
        error = res3.error;
      }

      if (error) {
        throw error;
      }

      // Recarrega unidades diretamente do banco para garantir consistência
      const { data: freshUnits, error: fetchErr } = await supabase
        .from('unidades')
        .select('*')
        .eq('empreendimento_id', empId);

      if (fetchErr) {
        console.warn('Aviso ao recarregar unidades após upsert:', fetchErr);
        return { success: true, data: unidades };
      }

      return { success: true, data: freshUnits || unidades };
    } catch (e: any) {
      console.error('Erro no salvamento em lote de unidades no Supabase:', e);
      return { success: false, error: e?.message || 'Erro ao sincronizar com o banco' };
    }
  },

  // Limpa/Exclui todas as unidades vinculadas a um empreendimento específico no Supabase
  async limparUnidadesEmpreendimento(empId: string) {
    try {
      const { error } = await supabase
        .from('unidades')
        .delete()
        .eq('empreendimento_id', empId);

      if (error) {
        console.error('Erro ao excluir unidades do empreendimento no Supabase:', error);
        throw error;
      }

      return { success: true };
    } catch (e: any) {
      console.error('Exceção ao excluir unidades:', e);
      return { success: false, error: e?.message || 'Falha ao limpar unidades no banco' };
    }
  },

  // Exclui um empreendimento e suas unidades do Supabase. Sem isso, excluir um
  // empreendimento pelo app removia só localmente — o registro continuava no
  // banco e podia "voltar" na próxima sincronização de outro navegador.
  async excluirEmpreendimento(empId: string) {
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(empId);
      if (!isUUID) return { success: true }; // id local nunca sincronizado, nada a excluir no banco

      // Remove as unidades primeiro (redundante se houver ON DELETE CASCADE na FK,
      // mas seguro mesmo se a constraint não existir no schema do usuário).
      await supabase.from('unidades').delete().eq('empreendimento_id', empId);

      const { error } = await supabase.from('empreendimentos').delete().eq('id', empId);
      if (error) {
        console.error('Erro ao excluir empreendimento no Supabase:', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e: any) {
      console.error('Exceção ao excluir empreendimento:', e);
      return { success: false, error: e?.message || 'Falha ao excluir empreendimento no banco' };
    }
  },

  // Lista unidades por empreendimento (Tenta Supabase, se falhar tenta Mock)
  async listarUnidadesPorEmpreendimento(empId: string) {
    try {
      const { data, error } = await supabase
        .from('unidades')
        .select('*')
        .eq('empreendimento_id', empId);
      
      if (error || !data || data.length === 0) {
        throw new Error('Fallback para Mock local');
      }
      return data.map(u => ({
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
      const payload: any = {
        cliente_nome: dadosProposta.cliente_nome || 'Cliente Não Informado',
        renda: Number(dadosProposta.renda || 0),
        dados: dadosProposta.dados
      };

      // Marca quem criou a proposta — é o que permite, junto das regras de
      // segurança (RLS) do Supabase, cada usuário ver as próprias simulações
      // e (quando liberado) as da equipe abaixo dele na hierarquia.
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        payload.criado_por = userData.user.id;
      }

      // Validar se o empreendimento_id é um UUID válido para o Supabase
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dadosProposta.empreendimento_id || '');
      if (isUUID) {
        payload.empreendimento_id = dadosProposta.empreendimento_id;
      }

      let { data, error } = await supabase
        .from('simulacoes')
        .insert([payload])
        .select();

      // Se a coluna criado_por ainda não existir (usuário não rodou a
      // migração de Acesso & Permissões), grava ao menos sem o dono, para não
      // perder a simulação enquanto isso.
      if (error && (error.code === 'PGRST204' || /criado_por/i.test(String(error.message || '')))) {
        console.warn('Aviso: coluna criado_por não encontrada em `simulacoes`. Rode o SQL indicado em authService.ts para habilitar a visão de propostas por hierarquia. Salvando sem o dono por enquanto.');
        const { criado_por, ...payloadSemDono } = payload;
        const res2 = await supabase.from('simulacoes').insert([payloadSemDono]).select();
        data = res2.data;
        error = res2.error;
      }

      if (error) {
        console.error('Erro ao salvar no Supabase, salvando apenas no console/storage:', error);
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (e: any) {
      console.warn('Simulação salva em modo offline (Mock):', dadosProposta);
      return { success: false, error: e?.message || 'Erro de conexão' };
    }
  },

  // Atualiza uma simulação já existente (usado pelo salvamento automático: em
  // vez de criar uma linha nova a cada ajuste que a pessoa faz na mesma
  // simulação, atualiza a mesma linha até ela mudar de torre/unidade/cliente).
  async atualizarSimulacao(id: string, dadosProposta: { cliente_nome?: string; renda?: number; empreendimento_id?: string; dados: any }) {
    try {
      const payload: any = {
        cliente_nome: dadosProposta.cliente_nome || 'Cliente Não Informado',
        renda: Number(dadosProposta.renda || 0),
        dados: dadosProposta.dados
      };
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dadosProposta.empreendimento_id || '');
      if (isUUID) {
        payload.empreendimento_id = dadosProposta.empreendimento_id;
      }
      const { data, error } = await supabase.from('simulacoes').update(payload).eq('id', id).select();
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Erro de conexão' };
    }
  },

  // Lista todas as simulações salvas (mais recentes primeiro). A ordenação é feita
  // no cliente por dados.salvo_em (sempre presente em toda simulação salva pela
  // Ficha Sinal c/ Morar ou Sinal c/ Banco Direto), já que o esquema da tabela
  // `simulacoes` não tem uma coluna de data garantida em todos os projetos.
  async listarSimulacoes() {
    try {
      const { data, error } = await supabase.from('simulacoes').select('*');
      if (error) {
        console.error('Erro ao listar simulações do Supabase:', error);
        return { success: false, error: error.message, data: [] as any[] };
      }

      // Filtra por hierarquia aqui no app (a mesma regra que a Parte 2 do SQL
      // reforça direto no banco quando for ligada, no dia do lançamento —
      // até lá, essa é a única camada que impede um Corretor de ver a
      // simulação de outro). Administrador vê tudo; cada um vê as próprias;
      // quem tem "ver propostas da equipe" ligado também vê as de quem está
      // de fato abaixo dele na hierarquia (via a função subordinados_de).
      interface InfoCriador { nome: string; cargo: string; imobiliaria: string; superiorId: string | null }
      let visiveis = data || [];
      let infoPorId: Record<string, InfoCriador> = {};
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (uid) {
        const { data: meuPerfil, error: perfilError } = await supabase.from('perfis').select('id, nome_completo, cargo, imobiliaria, superior_id, ver_propostas_equipe').eq('id', uid).maybeSingle();
        if (perfilError) {
          console.warn('Aviso: não foi possível confirmar o perfil de quem está logado ao listar simulações (mostrando só as próprias, por segurança):', perfilError);
        }
        if (!meuPerfil) {
          // Não deu pra confirmar quem é: por segurança, só mostra as próprias.
          visiveis = visiveis.filter((s: any) => s.criado_por === uid);
        } else if (meuPerfil.cargo === 'Administrador') {
          // Administrador já tem leitura livre de `perfis` pela RLS — busca
          // os dados direto, é mais simples e cobre qualquer criador.
          const idsCriadores = Array.from(new Set(visiveis.map((s: any) => s.criado_por).filter(Boolean)));
          if (idsCriadores.length > 0) {
            const { data: perfis } = await supabase.from('perfis').select('id, nome_completo, cargo, imobiliaria, superior_id').in('id', idsCriadores);
            infoPorId = Object.fromEntries((perfis || []).map((p: any) => [p.id, { nome: p.nome_completo, cargo: p.cargo, imobiliaria: p.imobiliaria, superiorId: p.superior_id }]));

            // Busca também o nome de quem é superior de algum criador, caso
            // esse superior não tenha feito nenhuma simulação (por isso não
            // estaria na lista acima) — é o que permite o filtro "Gerente
            // responsável" encontrar o Gerente mesmo que ele mesmo nunca
            // tenha salvo uma proposta.
            const idsSuperioresFaltando = Array.from(new Set(
              Object.values(infoPorId).map(i => i.superiorId).filter((sid): sid is string => !!sid && !infoPorId[sid])
            ));
            if (idsSuperioresFaltando.length > 0) {
              const { data: superiores } = await supabase.from('perfis').select('id, nome_completo, cargo, imobiliaria, superior_id').in('id', idsSuperioresFaltando);
              (superiores || []).forEach((p: any) => {
                infoPorId[p.id] = { nome: p.nome_completo, cargo: p.cargo, imobiliaria: p.imobiliaria, superiorId: p.superior_id };
              });
            }
          }
        } else {
          // Quem não é Administrador não tem permissão de ler o perfil de
          // outras pessoas direto na tabela — por isso os dados da equipe vêm
          // da função nomes_subordinados_de (só id/nome/cargo/imobiliária/
          // superior, nada de CPF/telefone/e-mail).
          infoPorId = { [uid]: { nome: meuPerfil.nome_completo, cargo: meuPerfil.cargo, imobiliaria: meuPerfil.imobiliaria, superiorId: meuPerfil.superior_id } };
          const idsPermitidos = new Set<string>([uid]);
          if (meuPerfil.ver_propostas_equipe) {
            const { data: subordinados, error: rpcError } = await supabase.rpc('nomes_subordinados_de', { usuario_id: uid });
            if (rpcError) {
              console.warn('Aviso: não foi possível buscar os subordinados ao listar simulações (a pessoa vai ver só as próprias propostas por enquanto):', rpcError);
            }
            (subordinados || []).forEach((s: any) => {
              idsPermitidos.add(s.id);
              infoPorId[s.id] = { nome: s.nome_completo, cargo: s.cargo, imobiliaria: s.imobiliaria, superiorId: s.superior_id };
            });
          }
          visiveis = visiveis.filter((s: any) => s.criado_por && idsPermitidos.has(s.criado_por));
        }
      }

      const comCriador = visiveis.map((s: any) => {
        const info = s.criado_por ? infoPorId[s.criado_por] : null;
        const gerenteInfo = info?.superiorId ? infoPorId[info.superiorId] : null;
        return {
          ...s,
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
      return { success: false, error: e?.message || 'Erro de conexão', data: [] as any[] };
    }
  },

  // Exclui uma simulação salva pelo id
  async excluirSimulacao(id: string) {
    try {
      const { error } = await supabase.from('simulacoes').delete().eq('id', id);
      if (error) {
        console.error('Erro ao excluir simulação no Supabase:', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e: any) {
      console.warn('Erro ao excluir simulação:', e);
      return { success: false, error: e?.message || 'Erro de conexão' };
    }
  },

  // Exclui várias simulações salvas de uma vez (seleção em lote na tela de
  // Simulações Salvas). O RLS de `simulacoes` já restringe quais linhas cada
  // usuário pode de fato apagar (a própria, ou qualquer uma se Administrador)
  // — por isso devolvemos quantas foram realmente excluídas (via `.select()`
  // no delete), para avisar quando o lote pedido for maior que o permitido.
  async excluirSimulacoesEmLote(ids: string[]) {
    if (ids.length === 0) return { success: true, excluidas: 0 };
    try {
      const { data, error } = await supabase.from('simulacoes').delete().in('id', ids).select('id');
      if (error) {
        console.error('Erro ao excluir simulações em lote no Supabase:', error);
        return { success: false, error: error.message };
      }
      return { success: true, excluidas: data?.length ?? 0 };
    } catch (e: any) {
      console.warn('Erro ao excluir simulações em lote:', e);
      return { success: false, error: e?.message || 'Erro de conexão' };
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
      const { data: userData } = await supabase.auth.getUser();
      const payload: Record<string, unknown> = {
        empreendimento_id: empId,
        nome_empreendimento: nomeEmpreendimento,
        file_name: tableInfo.fileName || null,
        valid_from: tableInfo.validFrom || null,
        valid_to: tableInfo.validTo || null,
        rows: tableInfo.rows,
        arquivado_por: userData?.user?.id || null
      };
      const { error } = await supabase.from('tabelas_arquivadas').insert([payload]);
      if (error) {
        console.warn('Aviso ao arquivar tabela de vendas anterior:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e: any) {
      console.warn('Erro ao arquivar tabela de vendas anterior:', e);
      return { success: false, error: e?.message || 'Erro de conexão' };
    }
  },

  // Lista as tabelas de vendas arquivadas (mais recentes primeiro). Quando `empId` é
  // informado, restringe ao empreendimento; caso contrário lista de todos (tela geral).
  async listarTabelasArquivadas(empId?: string): Promise<any[]> {
    try {
      let query = supabase.from('tabelas_arquivadas').select('*').order('arquivado_em', { ascending: false });
      if (empId) query = query.eq('empreendimento_id', empId);
      const { data, error } = await query;
      if (error) {
        console.warn('Aviso ao listar tabelas arquivadas:', error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      console.warn('Erro ao listar tabelas arquivadas:', e);
      return [];
    }
  },

  // Exclui definitivamente uma tabela arquivada.
  async excluirTabelaArquivada(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.from('tabelas_arquivadas').delete().eq('id', id);
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e: any) {
      console.warn('Erro ao excluir tabela arquivada:', e);
      return { success: false, error: e?.message || 'Erro de conexão' };
    }
  },

  // Rotina de Inicialização Automática (Verifica e insere dados iniciais se vazio)
  async inicializarBancoSeNecessario() {
    try {
      // 1. Verifica se a tabela 'empreendimentos' existe e se tem dados
      const { data: emps, error: errEmp } = await supabase.from('empreendimentos').select('id').limit(1);
      
      if (errEmp) {
        console.warn('As tabelas do Supabase ainda não existem. Por favor, execute o script SQL de criação no Supabase Editor.', errEmp.message);
        return;
      }

      // Se a tabela estiver vazia, faz o Seed inicial
      if (!emps || emps.length === 0) {
        console.log('Tabela de empreendimentos vazia. Iniciando carga automática dos dados iniciais...');
        
        const empId = '11111111-1111-1111-1111-111111111111';
        
        const { error: insertEmpErr } = await supabase.from('empreendimentos').upsert([{
          id: empId,
          nome: 'Vista dos Colibris',
          delivery_date_phase1: '2026-02-28',
          delivery_date_phase2: '2027-02-28'
        }], { onConflict: 'id' });

        if (insertEmpErr && insertEmpErr.code !== '23505') {
          console.error('Erro ao inserir empreendimento de teste:', insertEmpErr);
          return;
        }

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
      } else {
        console.log('Banco de dados já contém dados. Verificando integridade das áreas...');
        try {
          const { data: unitsToFix } = await supabase.from('unidades').select('*');
          if (unitsToFix && unitsToFix.length > 0) {
            const corruptedUnits = unitsToFix.filter(u => Number(u.area_privativa) >= 200 || Number(u.quintal) >= 200);
            if (corruptedUnits.length > 0) {
              const fixedUnits = corruptedUnits.map(u => ({
                ...u,
                area_privativa: parseM2Number(u.area_privativa),
                quintal: parseM2Number(u.quintal)
              }));
              await supabase.from('unidades').upsert(fixedUnits, { onConflict: 'empreendimento_id, torre, unidade' });
              console.log(`Corrigidas ${fixedUnits.length} unidades com área sem ponto decimal no Supabase.`);
            }
          }
        } catch (cleanErr) {
          console.warn('Aviso ao verificar integridade das unidades:', cleanErr);
        }
      }

    } catch (err) {
      console.warn('Falha silenciosa na rotina de inicialização do banco.', err);
    }
  }
};

