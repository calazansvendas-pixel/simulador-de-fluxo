import { initializeApp } from 'firebase/app';
import { browserSessionPersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Variáveis de ambiente Vite (import.meta.env) obrigatórias: não há credenciais
// embutidas no código, para que este clone nunca conecte em outro projeto por engano.
const metaEnv = (import.meta as any).env || {};

const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: metaEnv.VITE_FIREBASE_APP_ID as string | undefined
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
  throw new Error(
    'Firebase não configurado: defina as variáveis VITE_FIREBASE_* no arquivo .env (ou nas variáveis de ambiente do deploy).'
  );
}

export const app = initializeApp(firebaseConfig);

// Sessão de login guardada por aba (sessionStorage), não persistente: a pessoa
// continua logada enquanto a aba/navegador estiver aberto, mas fechar o
// navegador exige um novo login — comportamento pedido explicitamente para
// este app (era assim também com o Supabase).
export const auth = initializeAuth(app, {
  persistence: browserSessionPersistence
});

export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
});
