import { createClient } from '@supabase/supabase-js';

// Variáveis de ambiente Vite (import.meta.env) obrigatórias: não há credenciais
// embutidas no código, para que este clone nunca conecte em outro banco por engano.
const metaEnv = (import.meta as any).env || {};

const supabaseUrl: string | undefined =
  metaEnv.VITE_SUPABASE_URL ||
  metaEnv.NEXT_PUBLIC_SUPABASE_URL;

const supabaseAnonKey: string | undefined =
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  metaEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  metaEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env (ou nas variáveis de ambiente do deploy).'
  );
}

// Sessão de login guardada em sessionStorage (não em localStorage): a pessoa
// continua logada enquanto a aba/navegador estiver aberto, mas fechar o
// navegador exige um novo login — comportamento pedido explicitamente para
// este app.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    persistSession: true,
    autoRefreshToken: true
  }
});

