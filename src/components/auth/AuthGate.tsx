import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PerfilUsuario } from '../../types';
import { LoginView } from './LoginView';
import { CadastroView } from './CadastroView';
import { AccountStatusView } from './AccountStatusView';

interface AuthGateProps {
  // Só renderiza o app de verdade (via children) quando existe sessão E o
  // perfil está com status 'ativo'; até lá, mostra Login/Cadastro ou a tela de
  // status (pendente/pausado/sem-perfil). Isso mantém toda a lógica pesada do
  // App (sincronização com Supabase etc.) fora da árvore de componentes
  // enquanto ninguém autorizado estiver logado.
  children: (ctx: { perfil: PerfilUsuario; onSair: () => void }) => React.ReactNode;
}

const CarregandoTela: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center text-sm text-slate-400 bg-slate-50">
    Carregando...
  </div>
);

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const { session, perfil, carregandoSessao, carregandoPerfil, sair } = useAuth();
  const [tela, setTela] = useState<'login' | 'cadastro'>('login');

  if (carregandoSessao) return <CarregandoTela />;

  if (!session) {
    return tela === 'login'
      ? <LoginView onSwitchToCadastro={() => setTela('cadastro')} />
      : <CadastroView onSwitchToLogin={() => setTela('login')} />;
  }

  if (carregandoPerfil) return <CarregandoTela />;

  if (!perfil) return <AccountStatusView status="sem-perfil" onSair={sair} />;
  if (perfil.status === 'pendente') return <AccountStatusView status="pendente" onSair={sair} />;
  if (perfil.status === 'pausado') return <AccountStatusView status="pausado" onSair={sair} />;

  return <>{children({ perfil, onSair: sair })}</>;
};
