import React from 'react';
import logoMorar from '../../assets/brand';

interface AuthLayoutProps {
  children: React.ReactNode;
}

// Casca visual compartilhada pelas telas de Login e Criar conta: mesma marca e
// paleta do resto do app (ver Header.tsx), mas sem os controles de navegação —
// ninguém vê o Simulador antes de logar.
export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col text-slate-900 bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-morar-50 border border-morar-200 flex items-center justify-center shadow-xs">
              <img src={logoMorar} alt="Morar" className="w-6 h-6 object-contain" />
            </div>
            <span className="text-xl text-slate-900 font-bold tracking-tight">Simulador & Políticas Comerciais</span>
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
};
