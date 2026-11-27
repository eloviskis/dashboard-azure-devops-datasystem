// Aba Retrô: retrospectivas do EasyRetro → ações acompanhadas → work items no board Kaizen.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { retroApi } from './retroApi.ts';
import type { ActionType, Person, RetroAction, RetroConfig, RetroSummary, RetroTeam } from './retroApi.ts';
import { useToast } from './retroUi.tsx';
import RetroActionsView from './RetroActionsView.tsx';
import RetroRetrosView from './RetroRetrosView.tsx';
import RetroTeamsView from './RetroTeamsView.tsx';
import RetroBoardsView from './RetroBoardsView.tsx';
import { ActionDetailModal, NewActionModal } from './RetroActionModals.tsx';
import type { NewActionPrefill } from './RetroActionModals.tsx';

type SubView = 'acoes' | 'retros' | 'conduzir' | 'times';
const VIEWS: SubView[] = ['acoes', 'retros', 'conduzir', 'times'];

export interface RetroCtx {
  config: RetroConfig;
  types: ActionType[];
  people: Person[];
  byTeam: Record<string, number[]>;
  actions: RetroAction[];
  retros: RetroSummary[];
  reload: () => Promise<void>;
  setTypes: (t: ActionType[]) => void;
  setTeams: (t: RetroTeam[]) => void;
  toast: (text: string, error?: boolean) => void;
  openAction: (id: string) => void;
  newAction: (prefill?: NewActionPrefill) => void;
  teamLabel: (key: string) => string;
  openRetro: (id: string) => void;
}

const readParam = (k: string) => new URLSearchParams(window.location.search).get(k);
const writeParam = (k: string, v: string | null) => {
  const u = new URL(window.location.href);
  if (v) u.searchParams.set(k, v); else u.searchParams.delete(k);
  window.history.replaceState(null, '', u.toString());
};

const RetroDashboard: React.FC = () => {
  const [view, setView] = useState<SubView>(() => (VIEWS.includes(readParam('retroView') as SubView) ? readParam('retroView') as SubView : 'acoes'));
  const [config, setConfig] = useState<RetroConfig | null>(null);
  const [types, setTypes] = useState<ActionType[]>([]);
  const [people, setPeople] = useState<{ people: Person[]; byTeam: Record<string, number[]> }>({ people: [], byTeam: {} });
  const [actions, setActions] = useState<RetroAction[]>([]);
  const [retros, setRetros] = useState<RetroSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => readParam('action'));
  const [newPrefill, setNewPrefill] = useState<NewActionPrefill | null>(null);
  const { toast, toastNode } = useToast();

  const reload = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([retroApi.actions(), retroApi.retros()]);
      setActions(a); setRetros(r); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [c, t, p] = await Promise.all([retroApi.config(), retroApi.types(), retroApi.people()]);
        setConfig(c); setTypes(t); setPeople(p);
        await reload();
      } catch (e) { setError((e as Error).message); }
    })();
  }, [reload]);

  // Enquanto houver envio ao Azure DevOps em andamento, atualiza sozinho pra mostrar o #id quando chegar.
  useEffect(() => {
    if (!actions.some(a => a.azdo.status === 'pendente' || a.azdo.status === 'enviando')) return;
    const t = setTimeout(reload, 4000);
    return () => clearTimeout(t);
  }, [actions, reload]);

  const changeView = (v: SubView) => { setView(v); writeParam('retroView', v); };
  const openAction = useCallback((id: string) => { setOpenId(id); writeParam('action', id); }, []);
  const closeAction = useCallback(() => { setOpenId(null); writeParam('action', null); }, []);
  const teamLabel = useCallback((key: string) => config?.teams.find(t => t.key === key)?.label || key, [config]);

  const ctx: RetroCtx | null = useMemo(() => config && {
    config, types, people: people.people, byTeam: people.byTeam, actions, retros, reload, setTypes, toast,
    setTeams: (teams: RetroTeam[]) => setConfig(c => c && { ...c, teams }),
    openAction, newAction: (p?: NewActionPrefill) => setNewPrefill(p || {}), teamLabel,
    openRetro: (id: string) => { writeParam('board', null); writeParam('retro', id); setView('retros'); writeParam('retroView', 'retros'); },
  }, [config, types, people, actions, retros, reload, toast, openAction, teamLabel]);

  // Contador do menu: sugestões pendentes + (pra liderança) itens esperando validação.
  const pending = actions.filter(a => a.state === 'sugerida').length + (config?.isLeader ? actions.filter(a => a.state === 'validacao').length : 0);
  const NAV: { id: SubView; label: string; count?: number }[] = [
    { id: 'acoes', label: '✅ Ações', count: pending || undefined },
    { id: 'retros', label: '🗒️ Retros', count: retros.length || undefined },
    { id: 'conduzir', label: '🎯 Conduzir' },
    { id: 'times', label: '👥 Times' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ds-light-text">Retrô</h2>
          <p className="text-sm text-ds-text mt-0.5">Retrospectivas viram ações acompanhadas pelos times, com item no board Melhoria Contínua - Kaizen.</p>
        </div>
        {config && !config.azdo.writeEnabled && (
          <span className="text-[11px] text-amber-300 border border-amber-300/40 rounded-full px-2 py-1" title="RETRO_AZDO_WRITE_ENABLED desligado no servidor">
            Azure DevOps em modo simulado
          </span>
        )}
      </div>

      <div className="flex gap-1 border-b border-ds-border overflow-x-auto" role="tablist" aria-label="Seções da Retrô">
        {NAV.map(tab => (
          <button key={tab.id} role="tab" aria-selected={view === tab.id} onClick={() => changeView(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-green ${
              view === tab.id ? 'bg-ds-navy border border-b-ds-navy border-ds-border text-ds-green -mb-px' : 'text-ds-text hover:text-ds-light-text'}`}>
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${view === tab.id ? 'bg-ds-green/20 text-ds-green' : 'bg-ds-muted text-ds-text'}`}
                aria-label={tab.id === 'acoes' ? `${tab.count} pendentes` : undefined}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {error ? (
        <div className="text-center py-16 text-red-300 text-sm bg-red-400/5 rounded-xl border border-red-400/20">
          {error} <button className="underline ml-2" onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      ) : !ctx ? (
        <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-ds-green" /></div>
      ) : (
        <>
          {view === 'acoes' && <RetroActionsView ctx={ctx} />}
          {view === 'retros' && <RetroRetrosView ctx={ctx} />}
          {view === 'conduzir' && <RetroBoardsView ctx={ctx} />}
          {view === 'times' && <RetroTeamsView ctx={ctx} />}
          {openId && <ActionDetailModal ctx={ctx} id={openId} onClose={closeAction} />}
          {newPrefill && <NewActionModal ctx={ctx} prefill={newPrefill} onClose={() => setNewPrefill(null)} />}
        </>
      )}
      {toastNode}
    </div>
  );
};

export default RetroDashboard;
