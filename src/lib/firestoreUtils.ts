import { writeBatch, type WriteBatch } from 'firebase/firestore';
import { db } from './firebaseClient';

// O Firestore não aceita arrays dentro de arrays (ex.: as linhas de uma tabela
// de vendas) e rejeita campos `undefined`. Estruturas livres (política de
// crédito, dados de uma simulação, linhas de tabela) são guardadas como texto
// JSON e voltam a objeto na leitura, mantendo o formato que o app já usa.
export function empacotarJson(valor: unknown): string {
  return JSON.stringify(valor ?? null);
}

export function desempacotarJson<T = any>(texto: unknown): T | null {
  if (typeof texto !== 'string') return null;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return null;
  }
}

// Um WriteBatch do Firestore aceita no máximo 500 operações.
// Limite do Firestore: 500 operações por WriteBatch. 250 deixa folga de segurança.
const TAMANHO_LOTE = 250;

export async function commitEmLotes<T>(itens: T[], aplicar: (batch: WriteBatch, item: T) => void): Promise<void> {
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
    const batch = writeBatch(db);
    itens.slice(i, i + TAMANHO_LOTE).forEach(item => aplicar(batch, item));
    await batch.commit();
  }
}

// Ids de documento não podem conter "/".
export function idSeguro(...partes: (string | number)[]): string {
  return partes.map(p => String(p).trim().replace(/\//g, '-')).join('__');
}

export function mensagemDeErro(e: unknown, padrao: string): string {
  const err = e as { code?: string; message?: string } | undefined;
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'E-mail ou senha incorretos.';
    case 'auth/invalid-email':
      return 'E-mail inválido.';
    case 'auth/email-already-in-use':
      return 'Já existe uma conta com este e-mail.';
    case 'auth/weak-password':
      return 'A senha é muito fraca. Use ao menos 6 caracteres.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    case 'auth/network-request-failed':
      return 'Falha de conexão. Verifique sua internet.';
    case 'auth/user-disabled':
      return 'Esta conta foi desativada.';
    case 'permission-denied':
      return 'Sem permissão para esta operação.';
    default:
      return err?.message || padrao;
  }
}
