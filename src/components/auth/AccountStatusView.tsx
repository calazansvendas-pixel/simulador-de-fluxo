import React from 'react';
import { Clock, Ban, HelpCircle } from 'lucide-react';
import { AuthLayout } from './AuthLayout';

interface AccountStatusViewProps {
  status: 'pendente' | 'pausado' | 'sem-perfil';
  onSair: () => void;
}

const CONTEUDO: Record<AccountStatusViewProps['status'], { icon: React.ReactNode; titulo: string; texto: string; corFundo: string; corTexto: string }> = {
  pendente: {
    icon: <Clock className="w-6 h-6" />,
    titulo: 'Cadastro em análise',
    texto: 'Um administrador vai revisar seus dados e liberar seu cargo e permissões em breve.',
    corFundo: 'bg-amber-50',
    corTexto: 'text-amber-600'
  },
  pausado: {
    icon: <Ban className="w-6 h-6" />,
    titulo: 'Acesso pausado',
    texto: 'Seu acesso foi pausado pelo administrador. Fale com ele se achar que isso é um engano.',
    corFundo: 'bg-slate-100',
    corTexto: 'text-slate-500'
  },
  'sem-perfil': {
    icon: <HelpCircle className="w-6 h-6" />,
    titulo: 'Não encontramos seu cadastro',
    texto: 'Sua conta existe, mas não achamos um cadastro associado a ela. Fale com o administrador para verificar.',
    corFundo: 'bg-rose-50',
    corTexto: 'text-rose-500'
  }
};

export const AccountStatusView: React.FC<AccountStatusViewProps> = ({ status, onSair }) => {
  const c = CONTEUDO[status];
  return (
    <AuthLayout>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-8 text-center">
        <div className={`w-12 h-12 rounded-full ${c.corFundo} ${c.corTexto} flex items-center justify-center mx-auto mb-4`}>
          {c.icon}
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-2">{c.titulo}</h1>
        <p className="text-xs text-slate-500 leading-relaxed">{c.texto}</p>
        <button type="button" onClick={onSair} className="mt-6 text-xs font-semibold text-morar-600 hover:underline cursor-pointer">
          Sair
        </button>
      </div>
    </AuthLayout>
  );
};
