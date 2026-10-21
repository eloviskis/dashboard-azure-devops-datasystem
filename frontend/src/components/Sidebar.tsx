import React, { useState, useEffect, useMemo } from 'react';

interface TabItem {
  id: string;
  label: string;
}

interface SidebarProps {
  visibleTabs: TabItem[];
  activeTab: string;
  onTabClick: (tabId: string) => void;
  isAdmin: boolean;
  onOpenTabsConfig: () => void;
}

// Mesma organização temática que já existia como comentários em DEFAULT_TAB_CONFIG (App.tsx) —
// só um mapa estático de exibição, não persiste em lugar nenhum (tabsConfig continua {id,label,visible}).
const TAB_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Camada Executiva', ids: ['performance', 'executive', 'team-insights', 'team-evolution', 'metas', 'sla'] },
  { label: 'Fluxo e Entregas', ids: ['kanban', 'cycle-analytics', 'detailed-throughput', 'po-analysis', 'backlog', 'montecarlo'] },
  { label: 'Riscos e Bloqueios', ids: ['bottlenecks', 'impedimentos'] },
  { label: 'Qualidade e Engenharia', ids: ['quality', 'rootcause', 'period-comparison', 'pull-requests', 'dora', 'tags'] },
  { label: 'Visões Específicas', ids: ['clients', 'scrum-ctc', 'gantt', 'team-comparison'] },
  { label: 'Operacional / Dados Brutos', ids: ['item-list'] },
  { label: 'Suporte e Governança', ids: ['documentation'] },
  { label: 'Gestão do Time', ids: ['devtracker'] },
  { label: 'Governança Ágil', ids: ['rituals'] },
  { label: 'Qualidade', ids: ['qa-tracker'] },
  { label: 'Painel por Time', ids: ['painel-mensal'] },
];

const COLLAPSED_KEY = 'sidebar-collapsed';

const SidebarComponent: React.FC<SidebarProps> = ({ visibleTabs, activeTab, onTabClick, isAdmin, onOpenTabsConfig }) => {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [mobileOpen]);

  // visibleTabs mantém a mesma referência entre re-renders do App não relacionados (filtros, sync, etc.),
  // então isso só recalcula quando as abas visíveis realmente mudam — não a cada render do pai.
  const groups = useMemo(() => {
    const visibleById = new Map(visibleTabs.map(t => [t.id, t]));
    return TAB_GROUPS
      .map(g => ({ label: g.label, tabs: g.ids.map(id => visibleById.get(id)).filter((t): t is TabItem => !!t) }))
      .filter(g => g.tabs.length > 0);
  }, [visibleTabs]);

  const handleTabClick = (tabId: string) => {
    onTabClick(tabId);
    setMobileOpen(false);
  };

  const renderGroups = (isCollapsed: boolean) => (
    <nav className="flex-1 overflow-y-auto py-2">
      {groups.map((group, idx) => (
        <div key={group.label} className={idx > 0 ? 'mt-2 pt-2 border-t border-ds-border/50' : ''}>
          {!isCollapsed && (
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ds-text/70">
              {group.label}
            </div>
          )}
          {group.tabs.map(tab => {
            const isActive = tab.id === activeTab;
            const [icon, ...rest] = tab.label.split(' ');
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                title={isCollapsed ? tab.label : undefined}
                className={`w-full flex items-center gap-2.5 py-2 text-sm transition-colors border-l-2 ${
                  isCollapsed ? 'justify-center px-0' : 'px-3'
                } ${
                  isActive
                    ? 'border-ds-green bg-ds-muted/40 text-ds-green font-medium'
                    : 'border-transparent text-ds-text hover:text-ds-light-text hover:bg-ds-muted/20'
                }`}
              >
                <span>{icon}</span>
                {!isCollapsed && <span className="truncate">{rest.join(' ')}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Gatilho mobile — em fluxo normal, não sobrepõe o Header */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden flex items-center gap-2 mb-4 px-3 py-2 text-sm text-ds-text hover:text-ds-light-text bg-ds-navy border border-ds-border rounded-lg"
      >
        <span>☰</span> Menu
      </button>

      {/* Sidebar desktop */}
      <aside
        className={`hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen shrink-0 bg-ds-navy border-r border-ds-border transition-all duration-200 relative ${
          collapsed ? 'md:w-16' : 'md:w-64'
        }`}
      >
        <button
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="absolute -right-3 top-6 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-ds-navy border border-ds-border text-ds-text text-xs hover:text-ds-green hover:border-ds-green transition-colors shadow-md"
        >
          {collapsed ? '»' : '«'}
        </button>
        {renderGroups(collapsed)}
        {isAdmin && (
          <div className="border-t border-ds-border p-2">
            <button
              onClick={onOpenTabsConfig}
              title="Configurar Abas"
              className={`w-full flex items-center gap-2.5 py-2 text-sm text-ds-text hover:text-ds-green transition-colors ${collapsed ? 'justify-center px-0' : 'px-3'}`}
            >
              <span>⚙️</span>
              {!collapsed && <span>Configurar Abas</span>}
            </button>
          </div>
        )}
      </aside>

      {/* Gaveta mobile */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-ds-navy border-r border-ds-border md:hidden">
            <div className="flex items-center justify-between p-3 border-b border-ds-border">
              <span className="text-ds-light-text font-semibold text-sm">Navegação</span>
              <button onClick={() => setMobileOpen(false)} className="text-ds-text hover:text-ds-light-text text-lg leading-none">✕</button>
            </div>
            {renderGroups(false)}
            {isAdmin && (
              <div className="border-t border-ds-border p-2">
                <button
                  onClick={() => { onOpenTabsConfig(); setMobileOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ds-text hover:text-ds-green transition-colors"
                >
                  <span>⚙️</span> Configurar Abas
                </button>
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
};

// App.tsx re-renderiza com frequência (filtros, sync, troca de aba) por motivos que não mudam
// visibleTabs/activeTab/isAdmin — memo evita refazer a lista de 28 botões nesses casos.
const Sidebar = React.memo(SidebarComponent);

export default Sidebar;
