import React from 'react';
import { X } from 'lucide-react';
import { ActiveTab } from '../types';
import { ConditionKind } from '../utils/calculations';
import { TELAS_APP } from '../config/telasApp';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab, variant?: ConditionKind) => void;
  isCollapsed: boolean;
  // Condição comercial atualmente ativa: necessário porque "Sinal c/ Banco
  // Direto" e "Parcelamento Morar" compartilham a mesma aba ('details'), então
  // só o activeTab não basta para saber qual dos dois itens do menu destacar.
  activeConditionKind?: ConditionKind;
  // Chaves de TELAS_APP liberadas para o usuário logado. undefined = mostra
  // tudo (compatibilidade/uso sem login ainda ligado); Administrador também
  // sempre vê tudo, independente do que estiver na lista.
  telasLiberadas?: string[];
  // Controla a gaveta (drawer) do menu em telas menores que md — abaixo desse
  // breakpoint o menu deixa de ser a faixa lateral estática e passa a ser um
  // painel fixo que desliza da esquerda por cima do conteúdo, com fundo
  // escurecido atrás. A partir de md ele volta ao comportamento de sempre
  // (estático, só alternando largura via isCollapsed) e estas duas props não
  // têm efeito visual algum.
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  activeConditionKind,
  telasLiberadas,
  isMobileOpen = false,
  onCloseMobile
}) => {
  // Fonte única das telas (src/config/telasApp.ts) — o mesmo painel de
  // permissões do Administrador lê essa lista, então uma aba nova cadastrada
  // ali aparece aqui automaticamente, sem precisar tocar neste arquivo.
  const navItems = telasLiberadas
    ? TELAS_APP.filter(t => telasLiberadas.includes(t.key))
    : TELAS_APP;

  const inactiveClass = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all text-left cursor-pointer";
  const activeClass = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-morar-50 text-morar-600 border border-morar-100 transition-all text-left cursor-pointer shadow-2xs";

  // isCollapsed (modo ícone) só existe como conceito em telas médias/grandes —
  // no celular a gaveta é sempre exibida por extenso, então qualquer classe
  // que dependa de isCollapsed leva o prefixo "md:" para só valer a partir daí.
  const hideOnCollapse = isCollapsed ? 'md:hidden' : '';

  return (
    <>
      {/* Fundo escurecido atrás da gaveta, só existe (e só é clicável) em
          telas pequenas quando o menu está aberto — em md+ nunca aparece. */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:static md:z-20 md:translate-x-0 md:w-auto ${
          isCollapsed ? 'md:w-16' : 'md:w-64'
        } bg-white border-r border-slate-200 flex-shrink-0 transition-all duration-300 ease-in-out flex flex-col p-4 shadow-xs overflow-y-auto`}
      >
        <div className="space-y-6">
          <div>
            <div className={`flex items-center justify-between mb-2 ${hideOnCollapse}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3">
                Navegação
              </span>
              <button
                type="button"
                onClick={onCloseMobile}
                className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                title="Fechar menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="space-y-1">
              {navItems.map((item, idx) => {
                const Icon = item.icon;
                // Itens com "variant" compartilham a aba 'details' com outro item
                // (Sinal c/ Banco Direto x Parcelamento Morar) — só fica ativo o
                // que também bate com a condição comercial selecionada no momento.
                const isActive = item.variant
                  ? activeTab === item.tab && activeConditionKind === item.variant
                  : activeTab === item.tab;
                return (
                  <button
                    key={`${item.tab}-${item.variant || idx}`}
                    onClick={() => {
                      onSelectTab(item.tab, item.variant);
                      // Fecha a gaveta ao navegar — inócuo em md+, onde o menu
                      // não é uma gaveta e esta prop não afeta nada visualmente.
                      onCloseMobile?.();
                    }}
                    className={isActive ? activeClass : inactiveClass}
                    title={item.label}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-morar-600' : 'text-morar-600/80'}`} />
                    <span className={`truncate ${hideOnCollapse}`}>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
};
