import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { authService, DadosCadastro } from '../services/authService';
import { PerfilUsuario } from '../types';

interface AuthContextValue {
  // null enquanto a checagem inicial de sessão não termina; depois disso,
  // Session | null indica se há alguém logado.
  session: Session | null | undefined;
  perfil: PerfilUsuario | null;
  carregandoSessao: boolean;
  carregandoPerfil: boolean;
  entrar: (email: string, senha: string) => Promise<{ success: boolean; error?: string }>;
  cadastrar: (dados: DadosCadastro) => Promise<{ success: boolean; error?: string }>;
  sair: () => Promise<void>;
  recarregarPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [carregandoPerfil, setCarregandoPerfil] = useState<boolean>(false);
  const userIdRef = useRef<string | null>(null);

  const carregarPerfil = useCallback(async (userId: string) => {
    setCarregandoPerfil(true);
    const p = await authService.meuPerfil(userId);
    setPerfil(p);
    setCarregandoPerfil(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      const uid = data.session?.user?.id || null;
      userIdRef.current = uid;
      if (uid) carregarPerfil(uid);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      const uid = newSession?.user?.id || null;
      if (uid !== userIdRef.current) {
        userIdRef.current = uid;
        if (uid) {
          carregarPerfil(uid);
        } else {
          setPerfil(null);
        }
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [carregarPerfil]);

  const entrar = useCallback(async (email: string, senha: string) => {
    return authService.entrar(email, senha);
  }, []);

  const cadastrar = useCallback(async (dados: DadosCadastro) => {
    return authService.cadastrar(dados);
  }, []);

  const sair = useCallback(async () => {
    await authService.sair();
    setPerfil(null);
  }, []);

  const recarregarPerfil = useCallback(async () => {
    if (userIdRef.current) await carregarPerfil(userIdRef.current);
  }, [carregarPerfil]);

  return (
    <AuthContext.Provider
      value={{
        session,
        perfil,
        carregandoSessao: session === undefined,
        carregandoPerfil,
        entrar,
        cadastrar,
        sair,
        recarregarPerfil
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa ser usado dentro de <AuthProvider>');
  return ctx;
}
