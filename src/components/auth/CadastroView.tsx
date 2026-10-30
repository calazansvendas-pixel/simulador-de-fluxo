import React, { useState } from 'react';
import { Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { CARGOS } from '../../config/telasApp';
import { Cargo } from '../../types';
import { AuthLayout } from './AuthLayout';

interface CadastroViewProps {
  onSwitchToLogin: () => void;
}

export const CadastroView: React.FC<CadastroViewProps> = ({ onSwitchToLogin }) => {
  const { cadastrar } = useAuth();
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [imobiliaria, setImobiliaria] = useState('');
  const [creci, setCreci] = useState('');
  const [cargo, setCargo] = useState<Cargo | ''>('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!nomeCompleto || !telefone || !cpf || !email || !imobiliaria || !cargo || !senha) {
      setErro('Preencha todos os campos obrigatórios.');
      return;
    }
    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (senha !== confirmarSenha) {
      setErro('As senhas não coincidem.');
      return;
    }

    setEnviando(true);
    const res = await cadastrar({
      nomeCompleto,
      telefone,
      cpf,
      email: email.trim(),
      imobiliaria,
      creci: creci || undefined,
      cargo,
      senha
    });
    setEnviando(false);

    if (!res.success) {
      setErro(/already registered|already exists/i.test(res.error || '') ? 'Já existe uma conta com este e-mail.' : (res.error || 'Não foi possível criar o cadastro.'));
      return;
    }
    setEtapa(2);
  };

  if (etapa === 2) {
    return (
      <AuthLayout>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-morar-50 text-morar-600 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-2">Cadastro enviado</h1>
          <p className="text-xs text-slate-500 leading-relaxed mb-1">
            Recebemos os dados de <b className="text-slate-700">{email}</b>.
          </p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Um administrador vai revisar seu cadastro e liberar seu cargo e permissões em breve. Você já pode fazer login normalmente — vamos avisar que seu cadastro está em análise até lá.
          </p>
          <button type="button" onClick={onSwitchToLogin} className="mt-5 text-xs font-semibold text-morar-600 hover:underline cursor-pointer">
            Voltar para o login
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-8">
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold text-slate-900">Criar sua conta</h1>
          <p className="text-xs text-slate-500 mt-1">Preencha seus dados. Um administrador revisa e libera seu acesso.</p>
        </div>

        {erro && (
          <div className="flex items-start gap-2 bg-rose-50 text-rose-700 text-xs rounded-lg px-3 py-2.5 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{erro}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Campo label="Nome completo" obrigatorio value={nomeCompleto} onChange={setNomeCompleto} placeholder="Ex.: Marina Cordeiro" />
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Telefone" obrigatorio value={telefone} onChange={setTelefone} placeholder="(27) 99999-0000" />
            <Campo label="CPF" obrigatorio value={cpf} onChange={setCpf} placeholder="000.000.000-00" />
          </div>
          <Campo label="E-mail" obrigatorio type="email" value={email} onChange={setEmail} placeholder="voce@imobiliaria.com.br" />
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nome da imobiliária" obrigatorio value={imobiliaria} onChange={setImobiliaria} placeholder="Ex.: Cordeiro Imóveis" />
            <Campo label="CRECI" opcional value={creci} onChange={setCreci} placeholder="ES-00000" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Cargo<span className="text-rose-500 ml-0.5">*</span>
            </label>
            <select
              value={cargo}
              onChange={e => setCargo(e.target.value as Cargo)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-morar-100 focus:border-morar-400"
            >
              <option value="">Selecione seu cargo</option>
              {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mt-1.5">O administrador confirma esse cargo antes de liberar seu acesso.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Senha" obrigatorio type="password" value={senha} onChange={setSenha} placeholder="Crie uma senha" />
            <Campo label="Confirmar senha" obrigatorio type="password" value={confirmarSenha} onChange={setConfirmarSenha} placeholder="Repita a senha" />
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="w-full py-2.5 rounded-lg bg-morar-600 hover:bg-morar-700 text-white text-sm font-bold transition-all cursor-pointer disabled:opacity-60"
          >
            {enviando ? 'Criando conta…' : 'Criar conta'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-5">
          Já tem conta?{' '}
          <button type="button" onClick={onSwitchToLogin} className="font-semibold text-morar-600 hover:underline cursor-pointer">
            Entrar
          </button>
        </p>
      </div>
    </AuthLayout>
  );
};

interface CampoProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  obrigatorio?: boolean;
  opcional?: boolean;
}

const Campo: React.FC<CampoProps> = ({ label, value, onChange, placeholder, type = 'text', obrigatorio, opcional }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
      {label}
      {obrigatorio && <span className="text-rose-500 ml-0.5">*</span>}
      {opcional && <span className="text-slate-400 font-normal ml-1">(opcional)</span>}
    </label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-morar-100 focus:border-morar-400"
    />
  </div>
);
