import React from 'react';
import { Calendar, Menu, RotateCcw, LogOut } from 'lucide-react';
import logoMorar from '../assets/brand';

interface HeaderProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  onResetAll: () => void;
  onToggleSidebar: () => void;
  onNavigateHome: () => void;
  // Nome/cargo de quem está logado e ação de sair — opcionais para não quebrar
  // nenhum uso existente do Header antes da tela de login estar ligada.
  usuarioNome?: string;
  usuarioCargo?: string;
  onSair?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentDate,
  onDateChange,
  onResetAll,
  onToggleSidebar,
  onNavigateHome,
  usuarioNome,
  usuarioCargo,
  onSair
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs w-full">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2">

        {/* LOGO E BOTÃO TOGGLE SIDEBAR */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-2 sm:p-2.5 rounded-xl hover:bg-slate-100 text-slate-800 transition-all focus:outline-none cursor-pointer shrink-0"
            title="Alternar Menu Lateral"
          >
            <Menu className="w-5 h-5 text-morar-600" />
          </button>

          <div
            className="flex items-center gap-2 sm:gap-3 cursor-pointer group min-w-0"
            onClick={onNavigateHome}
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-morar-50 border border-morar-200 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
              <img src={logoMorar} alt="Morar" className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
            </div>
            <div className="min-w-0">
              <span className="text-base sm:text-xl text-slate-900 font-bold tracking-tight truncate block">Simulador & Políticas Comerciais</span>
            </div>
          </div>
        </div>

        {/* CONTROLES DO CABEÇALHO */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onResetAll}
            className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-slate-600 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            title="Limpar formulário e iniciar nova simulação"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nova Simulação</span>
          </button>

          <div className="hidden md:flex items-center gap-2 bg-slate-50 px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-morar-600" />
            <span className="font-medium">Hoje é:</span>
            <input
              type="date"
              value={currentDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent border-none text-slate-900 font-semibold focus:outline-none cursor-pointer"
            />
          </div>

          {onSair && (
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200">
              {usuarioNome && (
                <div className="text-right leading-tight">
                  <div className="text-xs font-bold text-slate-800 truncate max-w-[140px]">{usuarioNome}</div>
                  {usuarioCargo && <div className="text-[10px] text-slate-400">{usuarioCargo}</div>}
                </div>
              )}
              <button
                type="button"
                onClick={onSair}
                className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-slate-500 transition-all cursor-pointer"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
