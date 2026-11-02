import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  type WriteBatch
} from 'firebase/firestore';
import { auth, db } from '../lib/firebaseClient';
import { commitEmLotes, mensagemDeErro } from '../lib/firestoreUtils';
import { Cargo, PerfilUsuario, StatusConta } from '../types';

/*
 * ESTRUTURA DO FIRESTORE — ACESSO & PERMISSÕES
 * =============================================
 * As regras de segurança ficam em `firestore.rules` (na raiz do projeto) e
 * precisam ser publicadas no Firebase (Console > Firestore > Regras, ou
 * `firebase deploy --only firestore:rules`). Coleções usadas aqui:
 *
 * perfis/{uid}                    Dados privados do usuário (e-mail, CPF, telefone,
 *                                 cargo, status, permissões...). O id é o uid do
 *                                 Firebase Auth. A senha fica só no Firebase Auth.
 * perfis_publicos/{uid}           Espelho SEM dados sensíveis (nome, cargo, imobiliária,
 *                                 superior, empreendimentos liberados e `ancestrais`).
 *                                 É o que substitui as funções SQL subordinados_de /
 *                                 nomes_subordinados_de / empreendimentos_liberados_efetivos:
 *                                 `ancestrais` guarda a cadeia de superiores (do direto ao
 *                                 topo), mantida por este arquivo sempre que o superior muda.
 * permissoes_padrao_por_cargo/{cargo}
 * empreendimentos_padrao_por_cargo/{cargo}
 *
 * Particularidades do Firebase:
 *  - criar conta já deixa a pessoa logada (não há trava de "confirmar e-mail"); o
 *    acesso continua barrado pelo status 'pendente' até o Administrador aprovar;
 *  - excluir um usuário apaga o perfil, mas o login no Firebase Auth só pode ser
 *    removido pelo Console ou por um backend (Admin SDK);
 *  - o primeiro Administrador/proprietário precisa ser definido manualmente no
 *    Console (editar perfis/{uid}: cargo='Administrador', status='ativo',
 *    proprietario=true) — não há trigger de banco criando isso.
 */

interface PerfilRow {
  id: string;
  email: string;
  nome_completo: string;
  telefone: string;
  cpf: string;
  imobiliaria: string;
  creci: string | null;
  cargo: Cargo;
  superior_id: string | null;
  ancestrais?: string[];
  status: StatusConta;
  telas_liberadas: string[] | null;
  condicoes_liberadas: string[] | null;
  ver_propostas_equipe: boolean | null;
  campos_editaveis_equipe: string[] | null;
  empreendimentos_liberados: string[] | null;
  proprietario: boolean | null;
  created_at?: string;
}

// Campos de `perfis` que também existem no espelho público.
const CAMPOS_PUBLICOS = ['nome_completo', 'cargo', 'imobiliaria', 'superior_id', 'ancestrais', 'empreendimentos_liberados'] as const;

const TODAS_AS_CONDICOES_PADRAO = [
  'sinal-morar', 'simulador-simplificado', 'sinal-morar-comissao-apartada',
  'simulador-simplificado-comissao-apartada', 'banco-direto',
  'banco-direto-comissao-apartada', 'parcelamento-morar'
];

// O cargo "Corretor Novato" foi renomeado para "Corretor Parceiro" só no
// código (types.ts/telasApp.ts) — linhas gravadas antes dessa mudança
// continuam com a string antiga até alguém atualizar o documento. Normaliza
// aqui, na fronteira leitura-do-banco, para que a label exibida (cabeçalho,
// listagens de equipe etc.) já saia corrigida.
function normalizarCargoLegado(cargo: Cargo): Cargo {
  return (cargo as string) === 'Corretor Novato' ? 'Corretor Parceiro' : cargo;
}

function rowParaPerfil(row: PerfilRow): PerfilUsuario {
  return {
    id: row.id,
    email: row.email,
    nomeCompleto: row.nome_completo,
    telefone: row.telefone,
    cpf: row.cpf,
    imobiliaria: row.imobiliaria,
    creci: row.creci || undefined,
    cargo: normalizarCargoLegado(row.cargo),
    superiorId: row.superior_id,
    status: row.status,
    telasLiberadas: row.telas_liberadas || [],
    condicoesLiberadas: row.condicoes_liberadas || [],
    verPropostasEquipe: !!row.ver_propostas_equipe,
    camposEditaveisEquipe: row.campos_editaveis_equipe || [],
    empreendimentosLiberados: row.empreendimentos_liberados ?? null,
    proprietario: !!row.proprietario,
    createdAt: row.created_at
  };
}

function docParaRow(snap: { id: string; data: () => any }): PerfilRow {
  return { id: snap.id, ...snap.data() } as PerfilRow;
}

export interface MembroEquipeEditavel {
  id: string;
  nomeCompleto: string;
  telefone: string;
  cpf: string;
  imobiliaria: string;
  creci?: string;
  cargo: Cargo;
  superiorId: string | null;
  telasLiberadas: string[];
  empreendimentosLiberados: string[] | null;
}

export interface DadosCadastro {
  nomeCompleto: string;
  telefone: string;
  email: string;
  cpf: string;
  imobiliaria: string;
  creci?: string;
  cargo: Cargo;
  senha: string;
}

// Enquanto o cadastro grava o perfil, quem carrega o perfil (AuthContext, que
// dispara assim que a conta é criada e a pessoa fica logada) espera terminar —
// senão leria "sem perfil" por um instante.
let cadastroEmAndamento: Promise<unknown> | null = null;

// Cadeia de superiores de alguém cujo superior direto é `superiorId`:
// [superior, superior do superior, ...] (limite de 20 níveis, proteção contra
// um ciclo acidental — a tela de Administrador já evita criar ciclos).
async function cadeiaDoSuperior(superiorId: string | null): Promise<string[]> {
  if (!superiorId) return [];
  const snap = await getDoc(doc(db, 'perfis_publicos', superiorId));
  const ancestraisDoSuperior: string[] = snap.exists() ? (snap.data().ancestrais || []) : [];
  return [superiorId, ...ancestraisDoSuperior].slice(0, 20);
}

// Atualiza `perfis` e o espelho `perfis_publicos` juntos.
function atualizarPerfilNoLote(batch: WriteBatch, id: string, mudancas: Record<string, unknown>) {
  batch.update(doc(db, 'perfis', id), mudancas);
  const publicas: Record<string, unknown> = {};
  CAMPOS_PUBLICOS.forEach(campo => {
    if (campo in mudancas) publicas[campo] = mudancas[campo];
  });
  if (Object.keys(publicas).length > 0) batch.update(doc(db, 'perfis_publicos', id), publicas);
}

// Troca o superior de `id` e reescreve `ancestrais` dele e de todos os
// subordinados (diretos e indiretos) — o equivalente da árvore recursiva que
// o SQL calculava na hora da consulta.
async function mudarSuperiorNoLote(batch: WriteBatch, id: string, novoSuperiorId: string | null) {
  const novaCadeia = await cadeiaDoSuperior(novoSuperiorId);
  atualizarPerfilNoLote(batch, id, { superior_id: novoSuperiorId, ancestrais: novaCadeia });

  const descendentes = await getDocs(query(collection(db, 'perfis_publicos'), where('ancestrais', 'array-contains', id)));
  descendentes.forEach(d => {
    const antigas: string[] = d.data().ancestrais || [];
    const posicao = antigas.indexOf(id);
    if (posicao < 0) return;
    const ancestraisAtualizadas = [...antigas.slice(0, posicao + 1), ...novaCadeia].slice(0, 20);
    atualizarPerfilNoLote(batch, d.id, { ancestrais: ancestraisAtualizadas });
  });
}

export const authService = {
  // Cria o usuário no Firebase Auth e grava o perfil (status 'pendente') nas
  // coleções `perfis` e `perfis_publicos`. As regras do Firestore só deixam a
  // própria pessoa criar o PRÓPRIO perfil, e sempre como pendente (impede
  // alguém de se autoaprovar mandando status=ativo).
  async cadastrar(dados: DadosCadastro): Promise<{ success: boolean; error?: string }> {
    const executar = async (): Promise<{ success: boolean; error?: string }> => {
      const credencial = await createUserWithEmailAndPassword(auth, dados.email, dados.senha);
      const uid = credencial.user.uid;
      const batch = writeBatch(db);
      batch.set(doc(db, 'perfis', uid), {
        email: dados.email,
        nome_completo: dados.nomeCompleto,
        telefone: dados.telefone,
        cpf: dados.cpf,
        imobiliaria: dados.imobiliaria,
        creci: dados.creci || null,
        cargo: dados.cargo,
        superior_id: null,
        ancestrais: [],
        status: 'pendente',
        telas_liberadas: [],
        condicoes_liberadas: TODAS_AS_CONDICOES_PADRAO,
        ver_propostas_equipe: false,
        campos_editaveis_equipe: [],
        empreendimentos_liberados: null,
        proprietario: false,
        created_at: new Date().toISOString()
      });
      batch.set(doc(db, 'perfis_publicos', uid), {
        nome_completo: dados.nomeCompleto,
        cargo: dados.cargo,
        imobiliaria: dados.imobiliaria,
        superior_id: null,
        ancestrais: [],
        empreendimentos_liberados: null
      });
      await batch.commit();
      return { success: true };
    };

    const tarefa = executar();
    cadastroEmAndamento = tarefa.catch(() => null);
    try {
      return await tarefa;
    } catch (e: any) {
      return { success: false, error: mensagemDeErro(e, 'Erro ao criar o cadastro.') };
    } finally {
      cadastroEmAndamento = null;
    }
  },

  async entrar(email: string, senha: string): Promise<{ success: boolean; error?: string }> {
    try {
      await signInWithEmailAndPassword(auth, email, senha);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: mensagemDeErro(e, 'Não foi possível entrar.') };
    }
  },

  async sair(): Promise<void> {
    await signOut(auth);
  },

  async recuperarSenha(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: mensagemDeErro(e, 'Não foi possível enviar o e-mail de recuperação.') };
    }
  },

  async meuPerfil(userId: string): Promise<PerfilUsuario | null> {
    if (cadastroEmAndamento) await cadastroEmAndamento;
    try {
      const snap = await getDoc(doc(db, 'perfis', userId));
      if (!snap.exists()) return null;
      return rowParaPerfil(docParaRow(snap));
    } catch (e) {
      console.warn('Erro ao carregar o perfil:', e);
      return null;
    }
  },

  // --- Painel do Administrador ---------------------------------------------

  async listarPendentes(): Promise<PerfilUsuario[]> {
    try {
      const snap = await getDocs(query(collection(db, 'perfis'), where('status', '==', 'pendente')));
      return snap.docs
        .map(docParaRow)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
        .map(rowParaPerfil);
    } catch {
      return [];
    }
  },

  async listarAtivosEPausados(): Promise<PerfilUsuario[]> {
    try {
      const snap = await getDocs(query(collection(db, 'perfis'), where('status', 'in', ['ativo', 'pausado'])));
      return snap.docs
        .map(docParaRow)
        .sort((a, b) => (a.nome_completo || '').localeCompare(b.nome_completo || ''))
        .map(rowParaPerfil);
    } catch {
      return [];
    }
  },

  // Aprova um cadastro pendente, já definindo cargo/superior/telas confirmados
  // pelo Administrador (que pode corrigir o que a pessoa indicou no cadastro).
  async aprovarUsuario(id: string, ajustes: {
    cargo: Cargo; superiorId: string | null; telasLiberadas: string[]; condicoesLiberadas: string[]; verPropostasEquipe: boolean;
    camposEditaveisEquipe?: string[];
  }) {
    try {
      const batch = writeBatch(db);
      atualizarPerfilNoLote(batch, id, {
        status: 'ativo',
        cargo: ajustes.cargo,
        telas_liberadas: ajustes.telasLiberadas,
        condicoes_liberadas: ajustes.condicoesLiberadas,
        ver_propostas_equipe: ajustes.verPropostasEquipe,
        campos_editaveis_equipe: ajustes.camposEditaveisEquipe ?? []
      });
      await mudarSuperiorNoLote(batch, id, ajustes.superiorId);
      await batch.commit();
      return { success: true as const, error: undefined };
    } catch (e: any) {
      return { success: false as const, error: mensagemDeErro(e, 'Erro ao aprovar o usuário.') };
    }
  },

  async recusarUsuario(id: string) {
    return this.excluirUsuario(id);
  },

  async editarCargoEPermissoes(id: string, ajustes: {
    cargo: Cargo; superiorId: string | null; telasLiberadas: string[]; condicoesLiberadas: string[]; verPropostasEquipe: boolean;
    nomeCompleto: string; telefone: string; cpf: string; imobiliaria: string; creci?: string;
    camposEditaveisEquipe: string[]; empreendimentosLiberados: string[] | null;
  }) {
    try {
      const batch = writeBatch(db);
      atualizarPerfilNoLote(batch, id, {
        cargo: ajustes.cargo,
        telas_liberadas: ajustes.telasLiberadas,
        condicoes_liberadas: ajustes.condicoesLiberadas,
        ver_propostas_equipe: ajustes.verPropostasEquipe,
        nome_completo: ajustes.nomeCompleto,
        telefone: ajustes.telefone,
        cpf: ajustes.cpf,
        imobiliaria: ajustes.imobiliaria,
        creci: ajustes.creci || null,
        campos_editaveis_equipe: ajustes.camposEditaveisEquipe,
        empreendimentos_liberados: ajustes.empreendimentosLiberados
      });
      const atual = await getDoc(doc(db, 'perfis', id));
      if ((atual.data()?.superior_id ?? null) !== ajustes.superiorId) {
        await mudarSuperiorNoLote(batch, id, ajustes.superiorId);
      }
      await batch.commit();
      return { success: true as const, error: undefined };
    } catch (e: any) {
      return { success: false as const, error: mensagemDeErro(e, 'Erro ao salvar as alterações.') };
    }
  },

  // `error` só vem preenchido numa falha real de leitura — nesse caso `dados`
  // volta vazio e quem chama decide se avisa o Administrador, em vez de a tela
  // cair nos padrões de fábrica sem explicação nenhuma.
  async carregarPermissoesPadraoPorCargo(): Promise<{
    dados: Partial<Record<Cargo, {
      telasLiberadas: string[]; condicoesLiberadas: string[]; verPropostasEquipe: boolean; camposEditaveisEquipe: string[];
    }>>;
    error?: string;
  }> {
    try {
      const snap = await getDocs(collection(db, 'permissoes_padrao_por_cargo'));
      const resultado: Partial<Record<Cargo, { telasLiberadas: string[]; condicoesLiberadas: string[]; verPropostasEquipe: boolean; camposEditaveisEquipe: string[] }>> = {};
      snap.forEach(d => {
        const row = d.data();
        resultado[(row.cargo || d.id) as Cargo] = {
          telasLiberadas: row.telas_liberadas || [],
          condicoesLiberadas: row.condicoes_liberadas || [],
          verPropostasEquipe: !!row.ver_propostas_equipe,
          camposEditaveisEquipe: row.campos_editaveis_equipe || []
        };
      });
      return { dados: resultado };
    } catch (e: any) {
      return { dados: {}, error: mensagemDeErro(e, 'Erro ao carregar as permissões padrão.') };
    }
  },

  // Aplica a mesma política de permissões (telas liberadas, ver propostas da
  // equipe, campos editáveis da equipe) para TODO MUNDO que tem este cargo
  // hoje (ativo ou pausado) — sobrescrevendo qualquer ajuste individual — E
  // grava a mesma configuração como o padrão deste cargo em
  // permissoes_padrao_por_cargo, para que cadastros futuros aprovados com este
  // cargo já nasçam com essas regras. As duas gravações sempre acontecem
  // juntas, mesmo quando não há NENHUMA conta com o cargo hoje (afetados = 0).
  async aplicarPermissoesPorCargo(cargo: Cargo, ajustes: {
    telasLiberadas: string[]; condicoesLiberadas: string[]; verPropostasEquipe: boolean; camposEditaveisEquipe: string[];
  }): Promise<{ success: boolean; error?: string; afetados?: number }> {
    try {
      const snap = await getDocs(query(
        collection(db, 'perfis'),
        where('cargo', '==', cargo),
        where('status', 'in', ['ativo', 'pausado'])
      ));
      const batch = writeBatch(db);
      batch.set(doc(db, 'permissoes_padrao_por_cargo', cargo), {
        cargo,
        telas_liberadas: ajustes.telasLiberadas,
        condicoes_liberadas: ajustes.condicoesLiberadas,
        ver_propostas_equipe: ajustes.verPropostasEquipe,
        campos_editaveis_equipe: ajustes.camposEditaveisEquipe,
        atualizado_em: new Date().toISOString()
      });
      await batch.commit();
      await commitEmLotes(snap.docs, (lote, d) => {
        lote.update(d.ref, {
          telas_liberadas: ajustes.telasLiberadas,
          condicoes_liberadas: ajustes.condicoesLiberadas,
          ver_propostas_equipe: ajustes.verPropostasEquipe,
          campos_editaveis_equipe: ajustes.camposEditaveisEquipe
        });
      });
      return { success: true, afetados: snap.size };
    } catch (e: any) {
      return { success: false, error: mensagemDeErro(e, 'Erro ao aplicar as permissões do cargo.'), afetados: 0 };
    }
  },

  // --- Edição do cadastro da equipe (Diretor/Gerente autorizado) -----------

  // Lista os subordinados de `usuarioId` com os dados necessários para montar
  // o formulário de edição — só retorna algo se o próprio usuário logado tiver
  // ao menos um campo autorizado em `camposEditaveisEquipe` (as regras do
  // Firestore também barram a leitura de quem não tem).
  async listarEquipeParaEdicao(usuarioId: string): Promise<{ dados: MembroEquipeEditavel[]; error?: string }> {
    try {
      if (usuarioId !== auth.currentUser?.uid) return { dados: [], error: 'Só é possível consultar a própria equipe.' };
      const meu = await getDoc(doc(db, 'perfis', usuarioId));
      if (!meu.exists() || !((meu.data().campos_editaveis_equipe || []).length > 0)) return { dados: [] };

      const snap = await getDocs(query(collection(db, 'perfis'), where('ancestrais', 'array-contains', usuarioId)));
      return {
        dados: snap.docs.map(d => {
          const row = docParaRow(d);
          return {
            id: row.id,
            nomeCompleto: row.nome_completo,
            telefone: row.telefone,
            cpf: row.cpf,
            imobiliaria: row.imobiliaria,
            creci: row.creci || undefined,
            cargo: normalizarCargoLegado(row.cargo),
            superiorId: row.superior_id,
            telasLiberadas: row.telas_liberadas || [],
            empreendimentosLiberados: row.empreendimentos_liberados ?? null
          };
        })
      };
    } catch (e: any) {
      return { dados: [], error: mensagemDeErro(e, 'Erro ao carregar a equipe.') };
    }
  },

  // Aplica a edição de um subordinado, campo a campo — só os campos
  // efetivamente enviados (não-undefined) são gravados. A autorização de cada
  // campo é revalidada aqui e, de novo, pelas regras do Firestore.
  async editarCadastroSubordinado(subordinadoId: string, ajustes: {
    nomeCompleto?: string; telefone?: string; cpf?: string; imobiliaria?: string;
    creci?: string | null; cargo?: Cargo; superiorId?: string | null; telasLiberadas?: string[];
    empreendimentosLiberados?: string[] | null;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return { success: false, error: 'Sessão expirada. Entre novamente.' };

      const [meu, alvoPublico] = await Promise.all([
        getDoc(doc(db, 'perfis', uid)),
        getDoc(doc(db, 'perfis_publicos', subordinadoId))
      ]);
      const permissoes: string[] = meu.data()?.campos_editaveis_equipe || [];
      const naHierarquia = alvoPublico.exists() && ((alvoPublico.data().ancestrais || []) as string[]).includes(uid);
      if (!naHierarquia) return { success: false, error: 'Esse usuário não está na sua hierarquia.' };

      const exigir = (chave: string, rotulo: string) => {
        if (!permissoes.includes(chave)) throw new Error(`Sem permissão para editar ${rotulo}.`);
      };

      const mudancas: Record<string, unknown> = {};
      if (ajustes.nomeCompleto !== undefined) { exigir('nome', 'o nome'); mudancas.nome_completo = ajustes.nomeCompleto; }
      if (ajustes.telefone !== undefined) { exigir('telefone', 'o telefone'); mudancas.telefone = ajustes.telefone; }
      if (ajustes.cpf !== undefined) { exigir('cpf', 'o CPF'); mudancas.cpf = ajustes.cpf; }
      if (ajustes.imobiliaria !== undefined) { exigir('imobiliaria', 'a imobiliária'); mudancas.imobiliaria = ajustes.imobiliaria; }
      if (ajustes.creci !== undefined) { exigir('creci', 'o CRECI'); mudancas.creci = ajustes.creci || null; }
      if (ajustes.cargo !== undefined) { exigir('cargo', 'o cargo'); mudancas.cargo = ajustes.cargo; }
      if (ajustes.telasLiberadas !== undefined) { exigir('telas', 'as telas liberadas'); mudancas.telas_liberadas = ajustes.telasLiberadas; }
      if (ajustes.empreendimentosLiberados !== undefined) {
        exigir('empreendimentos', 'os empreendimentos liberados');
        mudancas.empreendimentos_liberados = ajustes.empreendimentosLiberados;
      }
      if (ajustes.superiorId !== undefined) exigir('superior', 'o superior hierárquico');

      const batch = writeBatch(db);
      if (Object.keys(mudancas).length > 0) atualizarPerfilNoLote(batch, subordinadoId, mudancas);
      if (ajustes.superiorId !== undefined) await mudarSuperiorNoLote(batch, subordinadoId, ajustes.superiorId);
      await batch.commit();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: mensagemDeErro(e, 'Erro ao editar o cadastro.') };
    }
  },

  async definirStatus(id: string, status: StatusConta) {
    try {
      await setDoc(doc(db, 'perfis', id), { status }, { merge: true });
      return { success: true as const, error: undefined };
    } catch (e: any) {
      return { success: false as const, error: mensagemDeErro(e, 'Erro ao alterar o status.') };
    }
  },

  // Remove o acesso da pessoa em definitivo (apaga o perfil, então ela some do
  // app e de qualquer hierarquia). O login dela em si (Firebase Auth) só é
  // apagado de fato pelo Console do Firebase ou por um backend (Admin SDK) —
  // não é algo possível de fazer com a chave pública usada aqui.
  async excluirUsuario(id: string) {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'perfis', id));
      batch.delete(doc(db, 'perfis_publicos', id));
      await batch.commit();
      return { success: true as const, error: undefined };
    } catch (e: any) {
      return { success: false as const, error: mensagemDeErro(e, 'Erro ao excluir o usuário.') };
    }
  },

  // --- Propriedade do aplicativo ---------------------------------------

  // Só quem já é o proprietário atual consegue (as regras do Firestore também
  // exigem isso). `novoProprietarioId` precisa ser um Administrador ativo.
  async transferirPropriedade(novoProprietarioId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return { success: false, error: 'Sessão expirada. Entre novamente.' };
      if (novoProprietarioId === uid) return { success: false, error: 'Escolha outra pessoa para receber a propriedade.' };

      const [eu, alvo] = await Promise.all([
        getDoc(doc(db, 'perfis', uid)),
        getDoc(doc(db, 'perfis', novoProprietarioId))
      ]);
      if (!eu.data()?.proprietario) return { success: false, error: 'Só o proprietário atual pode transferir a propriedade.' };
      if (!(alvo.data()?.cargo === 'Administrador' && alvo.data()?.status === 'ativo')) {
        return { success: false, error: 'O novo proprietário precisa ser um Administrador ativo.' };
      }

      const batch = writeBatch(db);
      batch.update(doc(db, 'perfis', uid), { proprietario: false });
      batch.update(doc(db, 'perfis', novoProprietarioId), { proprietario: true });
      await batch.commit();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: mensagemDeErro(e, 'Erro ao transferir a propriedade.') };
    }
  },

  // --- Empreendimentos liberados (acesso por hierarquia) --------------------

  // Resolve, em tempo real, a lista efetiva de empreendimentos que o próprio
  // usuário logado pode ver: sobe a árvore de `superior_id` até achar a
  // primeira trava manual (lista não-nula); se chegar ao topo sem achar
  // nenhuma, cai no padrão do cargo de quem está no topo. `null` de volta (ou
  // qualquer erro de rede/consulta) significa "sem restrição configurada", o
  // mesmo default seguro usado em todo o app.
  async empreendimentosLiberadosEfetivos(usuarioId: string): Promise<string[] | null> {
    try {
      let atualId: string | null = usuarioId;
      for (let profundidade = 0; atualId && profundidade < 20; profundidade++) {
        const snap = await getDoc(doc(db, 'perfis_publicos', atualId));
        if (!snap.exists()) return null;
        const dados = snap.data();
        if (dados.empreendimentos_liberados != null) return dados.empreendimentos_liberados as string[];
        if (!dados.superior_id) {
          const padrao = await getDoc(doc(db, 'empreendimentos_padrao_por_cargo', String(dados.cargo)));
          return padrao.exists() ? ((padrao.data().empreendimentos_liberados as string[]) ?? null) : null;
        }
        atualId = dados.superior_id as string;
      }
      return null;
    } catch {
      return null;
    }
  },

  // Lê o padrão de empreendimentos liberados configurado para cada cargo (usado
  // só quando a hierarquia não encontra nenhuma trava manual no caminho). Um
  // cargo sem documento não aparece no resultado — o chamador deve tratar
  // isso como "sem restrição", que não é a mesma coisa que uma lista vazia.
  async listarEmpreendimentosPadraoPorCargo(): Promise<Record<string, string[]>> {
    try {
      const snap = await getDocs(collection(db, 'empreendimentos_padrao_por_cargo'));
      const resultado: Record<string, string[]> = {};
      snap.forEach(d => {
        resultado[d.data().cargo || d.id] = (d.data().empreendimentos_liberados as string[]) || [];
      });
      return resultado;
    } catch {
      return {};
    }
  },

  async salvarEmpreendimentosPadraoPorCargo(cargo: Cargo, empreendimentosLiberados: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      await setDoc(doc(db, 'empreendimentos_padrao_por_cargo', cargo), { cargo, empreendimentos_liberados: empreendimentosLiberados });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: mensagemDeErro(e, 'Erro ao salvar o padrão do cargo.') };
    }
  },

  // Remove a trava do cargo (volta a "sem restrição" — o mesmo que nunca ter
  // sido configurado).
  async removerEmpreendimentosPadraoPorCargo(cargo: Cargo): Promise<{ success: boolean; error?: string }> {
    try {
      await deleteDoc(doc(db, 'empreendimentos_padrao_por_cargo', cargo));
      return { success: true };
    } catch (e: any) {
      return { success: false, error: mensagemDeErro(e, 'Erro ao remover o padrão do cargo.') };
    }
  }
};
