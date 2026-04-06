import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Feature {
  work_item_id: number;
  title: string;
  state: string;
  assigned_to: string | null;
  team: string | null;
  area_path: string | null;
  created_date: string | null;
  changed_date: string | null;
  closed_date: string | null;
  first_activation_date: string | null;
  story_points: number | null;
  tags: string | null;
  custom_tags: string[];
  priority: string | null;
  url: string | null;
}

interface Developer {
  id: number;
  name: string;
  role: string;
  email: string | null;
  category: 'paydev' | 'nao-aderencia' | 'demandas-internas';
  client: string | null;
  active: boolean;
  custom_tags: string[];
  projects: any[];
}

interface ActiveTask {
  work_item_id: number;
  title: string;
  state: string;
  type: string;
  assigned_to: string;
  po: string | null;
  qa: string | null;
  first_activation_date: string | null;
  created_date: string | null;
  priority: string | null;
  story_points: number | null;
  url: string | null;
  feature_title: string | null;
  feature_id: number | null;
  avatar_url: string | null;
  po_avatar_url: string | null;
  qa_avatar_url: string | null;
  impedimento: string | null;
  categoria: string | null;
  area_path: string | null;
}

type SubView = 'overview' | 'developers' | 'features';

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

const CATEGORY_LABEL: Record<string, string> = {
  'paydev': 'PayDev',
  'nao-aderencia': 'Não Aderência',
  'demandas-internas': 'Demandas Internas',
};

const CATEGORY_DOT_CLASS: Record<string, string> = {
  'paydev': 'bg-ds-cyan',
  'nao-aderencia': 'bg-amber-400',
  'demandas-internas': 'bg-ds-green',
};

const CATEGORY_BADGE_CLASS: Record<string, string> = {
  'paydev': 'text-ds-cyan border-ds-cyan/30 bg-ds-cyan/10',
  'nao-aderencia': 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  'demandas-internas': 'text-ds-green border-ds-green/30 bg-ds-green/10',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

function isCompleted(f: Feature): boolean {
  return COMPLETED_STATES.includes(f.state);
}

function daysActive(f: Feature): number | null {
  const start = f.first_activation_date || f.created_date;
  if (!start) return null;
  const end = isCompleted(f) && f.closed_date ? f.closed_date : today();
  return Math.abs(daysBetween(start, end) ?? 0);
}

function getDelayClass(days: number | null, completed: boolean): string {
  if (completed || days === null) return 'text-ds-text';
  if (days > 30) return 'text-red-400';
  if (days > 15) return 'text-amber-400';
  return 'text-ds-green';
}

function getDelayBarClass(days: number | null, completed: boolean): string {
  if (completed || days === null) return 'bg-ds-muted';
  if (days > 30) return 'bg-red-500';
  if (days > 15) return 'bg-amber-400';
  return 'bg-ds-green';
}

function parseAdoTags(tagsStr: string | null): string[] {
  if (!tagsStr) return [];
  return tagsStr.split(/[;,]/).map(t => t.trim()).filter(Boolean);
}

function getStateBadgeClass(state: string): string {
  if (COMPLETED_STATES.includes(state)) return 'text-ds-text bg-ds-muted/60 border-ds-border';
  if (['Active', 'Ativo'].includes(state)) return 'text-ds-green bg-ds-green/10 border-ds-green/30';
  if (['Para Desenvolver', 'New', 'Novo'].includes(state)) return 'text-ds-cyan bg-ds-cyan/10 border-ds-cyan/30';
  if (state.includes('Code Review') || state.includes('QA')) return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
  return 'text-ds-text bg-ds-muted/40 border-ds-border';
}

function getPriorityClass(p: string | null): string {
  if (!p) return 'text-ds-text';
  const n = parseInt(p);
  if (n === 1 || p === '1') return 'text-red-400';
  if (n === 2 || p === '2') return 'text-amber-400';
  return 'text-ds-text';
}

function getPriorityLabel(p: string | null): string {
  if (!p) return '';
  const n = parseInt(p);
  if (n === 1) return 'Crítica';
  if (n === 2) return 'Alta';
  if (n === 3) return 'Média';
  if (n === 4) return 'Baixa';
  return p;
}

function matchDevToFeature(dev: Developer, feature: Feature): boolean {
  if (!feature.assigned_to) return false;
  const assigned = feature.assigned_to.toLowerCase();
  const name = dev.name.toLowerCase();
  return assigned.includes(name) || name.includes(assigned.split(' ')[0]);
}

// ─── UI Primitives ────────────────────────────────────────────────────────────

const Badge: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${className}`}>{text}</span>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
    <div className="bg-ds-navy border border-ds-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between p-5 border-b border-ds-border">
        <h3 className="text-base font-semibold text-ds-light-text">{title}</h3>
        <button onClick={onClose} className="text-ds-text hover:text-ds-light-text text-xl leading-none transition-colors">&times;</button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

const InputField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, ...props }) => (
  <div>
    <label className="block text-xs font-medium text-ds-text mb-1">{label}</label>
    <input className="w-full bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm placeholder:text-ds-text/50 focus:outline-none focus:border-ds-green focus:ring-1 focus:ring-ds-green/30 transition-colors" {...props} />
  </div>
);

const SelectField: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: React.ReactNode }> = ({ label, children, ...props }) => (
  <div>
    <label className="block text-xs font-medium text-ds-text mb-1">{label}</label>
    <select className="w-full bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green focus:ring-1 focus:ring-ds-green/30 transition-colors" {...props}>
      {children}
    </select>
  </div>
);

// ─── Tag Editor ───────────────────────────────────────────────────────────────

const TagEditor: React.FC<{
  adoTags?: string[];
  customTags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}> = ({ adoTags = [], customTags, onAdd, onRemove }) => {
  const [inputVisible, setInputVisible] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const tag = inputVal.trim();
    if (tag && !customTags.includes(tag)) {
      onAdd(tag);
    }
    setInputVal('');
    setInputVisible(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') { setInputVisible(false); setInputVal(''); }
  };

  useEffect(() => { if (inputVisible) inputRef.current?.focus(); }, [inputVisible]);

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {adoTags.map(tag => (
        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-ds-muted text-ds-text border border-ds-border" title="Tag do Azure DevOps">
          {tag}
        </span>
      ))}
      {customTags.map(tag => (
        <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-ds-cyan/10 text-ds-cyan border border-ds-cyan/30">
          {tag}
          <button onClick={() => onRemove(tag)} className="hover:text-red-400 transition-colors leading-none ml-0.5">×</button>
        </span>
      ))}
      {inputVisible ? (
        <input
          ref={inputRef}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleAdd}
          className="text-xs bg-ds-dark-blue border border-ds-cyan/50 text-ds-light-text rounded-full px-2 py-0.5 w-24 focus:outline-none focus:border-ds-cyan"
          placeholder="nova tag"
        />
      ) : (
        <button
          onClick={() => setInputVisible(true)}
          className="text-xs px-2 py-0.5 rounded-full border border-dashed border-ds-border text-ds-text hover:border-ds-cyan hover:text-ds-cyan transition-colors"
        >
          + tag
        </button>
      )}
    </div>
  );
};

// ─── Dev Avatar ───────────────────────────────────────────────────────────────

const DevAvatar: React.FC<{ name: string; avatarUrl: string | null; size?: string }> = ({ name, avatarUrl, size = 'w-10 h-10' }) => {
  const [imgError, setImgError] = useState(false);
  const initial = name.charAt(0).toUpperCase();
  const colors = ['bg-ds-cyan/20 text-ds-cyan', 'bg-ds-green/20 text-ds-green', 'bg-amber-400/20 text-amber-400', 'bg-purple-400/20 text-purple-400'];
  const color = colors[name.charCodeAt(0) % colors.length];

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        className={`${size} rounded-full object-cover border border-ds-border shrink-0`}
      />
    );
  }
  return (
    <div className={`${size} rounded-full flex items-center justify-center font-semibold text-sm shrink-0 border border-ds-border ${color}`}>
      {initial}
    </div>
  );
};

// ─── Overview View ────────────────────────────────────────────────────────────

function taskDaysActive(task: ActiveTask): number {
  const start = task.first_activation_date || task.created_date;
  if (!start) return 0;
  return Math.abs(daysBetween(start, today()) ?? 0);
}

/** Verifica se todos os tokens do nome do dev estão presentes no assignedTo (case-insensitive) */
function devMatchesAssignedTo(devName: string, assignedTo: string | null): boolean {
  if (!assignedTo) return false;
  const assigned = assignedTo.toLowerCase();
  return devName.toLowerCase().split(/\s+/).filter(Boolean).every(p => assigned.includes(p));
}

// ─── Feature Tasks Modal ──────────────────────────────────────────────────────

interface ModalContext { featureId: number | null; featureTitle: string | null; devName: string; allTasks: ActiveTask[]; }

const FeatureTasksModal: React.FC<{ ctx: ModalContext; onClose: () => void }> = ({ ctx, onClose }) => {
  const [filterState, setFilterState] = useState('');
  const [filterPerson, setFilterPerson] = useState('');

  // Tarefas da feature (ou todas do dev se sem feature)
  const featureTasks = ctx.featureId
    ? ctx.allTasks.filter(t => t.feature_id === ctx.featureId)
    : ctx.allTasks.filter(t => t.assigned_to?.toLowerCase().includes(ctx.devName.split(' ')[0].toLowerCase()));

  const states = Array.from(new Set(featureTasks.map(t => t.state))).sort();
  const people = Array.from(new Set(featureTasks.map(t => t.assigned_to).filter(Boolean))).sort();

  const filtered = featureTasks.filter(t => {
    if (filterState && t.state !== filterState) return false;
    if (filterPerson && t.assigned_to !== filterPerson) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-ds-navy border border-ds-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-ds-border shrink-0">
          <div className="min-w-0 pr-4">
            <p className="text-xs text-ds-text mb-0.5">Feature</p>
            <h3 className="font-semibold text-ds-light-text text-sm leading-snug">
              {ctx.featureTitle ?? `Tarefas de ${ctx.devName}`}
            </h3>
            <p className="text-xs text-ds-text mt-1">{featureTasks.length} tarefas no total · {filtered.length} exibidas</p>
          </div>
          <button onClick={onClose} className="text-ds-text hover:text-ds-light-text text-xl leading-none shrink-0">&times;</button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 p-4 border-b border-ds-border shrink-0">
          <select value={filterState} onChange={e => setFilterState(e.target.value)}
            className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-ds-cyan transition-colors">
            <option value="">Todos os estados</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)}
            className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-ds-cyan transition-colors">
            <option value="">Todas as pessoas</option>
            {people.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(filterState || filterPerson) && (
            <button onClick={() => { setFilterState(''); setFilterPerson(''); }}
              className="text-xs text-ds-text hover:text-red-400 transition-colors px-2">✕ limpar</button>
          )}
        </div>

        {/* Lista de tarefas */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {filtered.length === 0 && (
            <p className="text-center text-ds-text text-sm py-8">Nenhuma tarefa encontrada.</p>
          )}
          {filtered.map(task => {
            const days = taskDaysActive(task);
            const isDelayed = days > 30;
            const textClass = getDelayClass(days, false);
            const barClass = getDelayBarClass(days, false);
            return (
              <div key={task.work_item_id} className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-ds-text/60 shrink-0">{task.type}</span>
                      <Badge text={task.state} className={getStateBadgeClass(task.state)} />
                      {task.priority && <span className={`text-xs font-medium ${getPriorityClass(task.priority)}`}>P{task.priority}</span>}
                    </div>
                    {task.url ? (
                      <a href={task.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-ds-light-text font-medium leading-snug hover:text-ds-green transition-colors block">
                        {task.title}
                      </a>
                    ) : (
                      <p className="text-sm text-ds-light-text font-medium leading-snug">{task.title}</p>
                    )}
                  </div>
                </div>

                {/* Responsáveis */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <DevAvatar name={task.assigned_to} avatarUrl={task.avatar_url} size="w-6 h-6" />
                    <span className="text-xs text-ds-light-text">{task.assigned_to}</span>
                  </span>
                  {task.po && (
                    <span className="flex items-center gap-1" title={`PO: ${task.po}`}>
                      <DevAvatar name={task.po} avatarUrl={task.po_avatar_url} size="w-6 h-6" />
                      <span className="text-xs text-ds-cyan/80">PO: {task.po.split(' ')[0]}</span>
                    </span>
                  )}
                  {task.qa && (
                    <span className="flex items-center gap-1" title={`QA: ${task.qa}`}>
                      <DevAvatar name={task.qa} avatarUrl={task.qa_avatar_url} size="w-6 h-6" />
                      <span className="text-xs text-amber-400/80">QA: {task.qa.split(' ')[0]}</span>
                    </span>
                  )}
                </div>

                {/* Tempo + barra */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold flex items-center gap-1 ${textClass}`}>
                      🕐 {days}d na tarefa
                      {isDelayed && <span className="text-red-400 ml-1">⚠️ +{days - 30}d de atraso</span>}
                    </span>
                    {task.story_points && <span className="text-ds-text">{task.story_points} pts</span>}
                  </div>
                  <div className="w-full bg-ds-muted rounded-full h-1">
                    <div className={`h-1 rounded-full transition-all ${barClass}`}
                      style={{ width: `${Math.min(100, (days / 45) * 100)}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Overview View ─────────────────────────────────────────────────────────────

/** Groups tasks by feature for a developer */
function groupTasksByFeature(tasks: ActiveTask[]): { featureId: number | null; featureTitle: string | null; tasks: ActiveTask[] }[] {
  const map = new Map<number | null, { featureTitle: string | null; tasks: ActiveTask[] }>();
  for (const t of tasks) {
    const key = t.feature_id ?? null;
    if (!map.has(key)) map.set(key, { featureTitle: t.feature_title ?? null, tasks: [] });
    map.get(key)!.tasks.push(t);
  }
  // Sort: features with ids first (by oldest task), then null-feature group
  return Array.from(map.entries())
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : 0))
    .map(([featureId, v]) => ({ featureId, featureTitle: v.featureTitle, tasks: v.tasks }));
}

function featureOldestDays(tasks: ActiveTask[]): number {
  return Math.max(...tasks.map(t => taskDaysActive(t)), 0);
}

const OverviewView: React.FC<{ developers: Developer[]; activeTasks: ActiveTask[]; features: Feature[] }> = ({ developers, activeTasks, features }) => {
  const activeDevs = developers.filter(d => d.active);
  const activeFeatures = features.filter(f => !isCompleted(f));

  // Filtros
  const [searchDev, setSearchDev] = useState('');
  const [filterCat, setFilterCat] = useState<'' | 'paydev' | 'nao-aderencia' | 'demandas-internas'>('');
  const [filterState, setFilterState] = useState('');
  const [filterAlloc, setFilterAlloc] = useState<'all' | 'allocated' | 'idle'>('all');
  const [filterDelay, setFilterDelay] = useState<'all' | 'delayed' | 'attention'>('all');
  const [filterAreaPath, setFilterAreaPath] = useState('');
  const [filterImpedimento, setFilterImpedimento] = useState(false);

  // Feature expand state (gavetinhas): key = `${devId}-${featureId}`
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());

  const toggleFeature = (key: string) => {
    setExpandedFeatures(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Unique states & area paths for filter dropdowns
  const allStates = Array.from(new Set(activeTasks.map(t => t.state).filter(Boolean))).sort();
  const allAreaPaths = Array.from(new Set(activeTasks.map(t => t.area_path).filter(Boolean))).sort() as string[];

  const allocatedDevIds = new Set(
    activeDevs.filter(dev => activeTasks.some(t => devMatchesAssignedTo(dev.name, t.assigned_to))).map(d => d.id)
  );
  const delayedTasksCount = activeTasks.filter(t => taskDaysActive(t) > 30).length;

  function getDevAvatar(dev: Developer): string | null {
    return activeTasks.find(t => devMatchesAssignedTo(dev.name, t.assigned_to))?.avatar_url ?? null;
  }

  function getDevTasks(dev: Developer): ActiveTask[] {
    let tasks = activeTasks.filter(t => devMatchesAssignedTo(dev.name, t.assigned_to));
    if (filterState) tasks = tasks.filter(t => t.state === filterState);
    if (filterAreaPath) tasks = tasks.filter(t => t.area_path === filterAreaPath);
    if (filterImpedimento) tasks = tasks.filter(t => t.impedimento && t.impedimento !== '');
    return tasks;
  }

  function filterDev(dev: Developer): boolean {
    if (searchDev && !dev.name.toLowerCase().includes(searchDev.toLowerCase())) return false;
    if (filterAlloc === 'allocated' && !allocatedDevIds.has(dev.id)) return false;
    if (filterAlloc === 'idle' && allocatedDevIds.has(dev.id)) return false;
    if (filterDelay === 'delayed' && !getDevTasks(dev).some(t => taskDaysActive(t) > 30)) return false;
    if (filterDelay === 'attention' && !getDevTasks(dev).some(t => taskDaysActive(t) > 15)) return false;
    return true;
  }

  const CATEGORIES: Array<'paydev' | 'nao-aderencia' | 'demandas-internas'> = ['paydev', 'nao-aderencia', 'demandas-internas'];
  const activeCats = filterCat ? [filterCat] : CATEGORIES;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Devs Ativos', value: activeDevs.length, icon: '👤', color: 'text-ds-cyan' },
          { label: 'Projetos Ativos', value: activeFeatures.length, icon: '📁', color: 'text-ds-green' },
          { label: 'Em Atraso (>30d)', value: delayedTasksCount, icon: '⚠️', color: 'text-red-400' },
        ].map(card => (
          <div key={card.label} className="bg-ds-navy border border-ds-border rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">{card.icon}</span>
            <div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              <p className="text-xs text-ds-text">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={searchDev}
          onChange={e => setSearchDev(e.target.value)}
          placeholder="Buscar pessoa..."
          className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-1.5 text-sm w-40 placeholder:text-ds-text/50 focus:outline-none focus:border-ds-cyan transition-colors"
        />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value as any)}
          className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-ds-cyan transition-colors">
          <option value="">Todas as categorias</option>
          <option value="paydev">PayDev</option>
          <option value="nao-aderencia">Não Aderência</option>
          <option value="demandas-internas">Demandas Internas</option>
        </select>
        <select value={filterState} onChange={e => setFilterState(e.target.value)}
          className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-ds-cyan transition-colors">
          <option value="">Estado tarefa</option>
          {allStates.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterAlloc} onChange={e => setFilterAlloc(e.target.value as any)}
          className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-ds-cyan transition-colors">
          <option value="all">Todos os devs</option>
          <option value="allocated">Alocados</option>
          <option value="idle">Sem projeto</option>
        </select>
        <select value={filterDelay} onChange={e => setFilterDelay(e.target.value as any)}
          className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-ds-cyan transition-colors">
          <option value="all">Qualquer prazo</option>
          <option value="attention">Atenção (&gt;15d)</option>
          <option value="delayed">Em atraso (&gt;30d)</option>
        </select>
        {allAreaPaths.length > 0 && (
          <select value={filterAreaPath} onChange={e => setFilterAreaPath(e.target.value)}
            className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-ds-cyan transition-colors">
            <option value="">Time (Area Path)</option>
            {allAreaPaths.map(ap => <option key={ap} value={ap}>{ap.split('\\').pop()}</option>)}
          </select>
        )}
        <button
          onClick={() => setFilterImpedimento(!filterImpedimento)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            filterImpedimento
              ? 'bg-red-500/20 border-red-500/40 text-red-400'
              : 'bg-ds-dark-blue border-ds-border text-ds-text hover:text-ds-light-text'
          }`}
        >
          ⭐ Impedimento
        </button>
        {(searchDev || filterCat || filterState || filterAlloc !== 'all' || filterDelay !== 'all' || filterAreaPath || filterImpedimento) && (
          <button onClick={() => { setSearchDev(''); setFilterCat(''); setFilterState(''); setFilterAlloc('all'); setFilterDelay('all'); setFilterAreaPath(''); setFilterImpedimento(false); }}
            className="text-xs text-ds-text hover:text-red-400 transition-colors px-2">✕ limpar filtros</button>
        )}
      </div>

      {/* Dev cards by category — 2-column grid */}
      {activeCats.map(cat => {
        const devsInCat = activeDevs.filter(d => d.category === cat && filterDev(d));
        if (devsInCat.length === 0) return null;
        const allocatedInCat = devsInCat.filter(d => allocatedDevIds.has(d.id)).length;
        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2.5 h-2.5 rounded-full ${CATEGORY_DOT_CLASS[cat]}`} />
              <h3 className="font-semibold text-ds-light-text text-sm">{CATEGORY_LABEL[cat]}</h3>
              <span className="text-xs text-ds-text">{devsInCat.length} devs • {allocatedInCat} alocados</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {devsInCat.map(dev => {
                const devTasks = getDevTasks(dev);
                const avatarUrl = getDevAvatar(dev);
                const featureGroups = groupTasksByFeature(devTasks);

                return (
                  <div key={dev.id} className="bg-ds-navy border border-ds-border rounded-xl p-4 space-y-3">
                    {/* Dev header */}
                    <div className="flex items-center gap-3">
                      <DevAvatar name={dev.name} avatarUrl={avatarUrl} />
                      <div className="min-w-0">
                        <p className="font-semibold text-ds-light-text text-sm leading-tight">{dev.name}</p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-xs text-ds-text">{dev.role}</span>
                          {dev.client && <Badge text={dev.client} className="text-ds-text border-ds-border bg-ds-muted/30" />}
                        </div>
                      </div>
                    </div>

                    {/* Feature gavetinhas */}
                    {featureGroups.length > 0 ? (
                      <div className="space-y-2">
                        {featureGroups.map(fg => {
                          const fKey = `${dev.id}-${fg.featureId ?? 'none'}`;
                          const isOpen = expandedFeatures.has(fKey);
                          const days = featureOldestDays(fg.tasks);
                          const isDelayed = days > 30;
                          const textClass = getDelayClass(days, false);
                          const categoria = fg.tasks[0]?.categoria;
                          const hasImpedimento = fg.tasks.some(t => t.impedimento && t.impedimento !== '');

                          return (
                            <div key={fKey}>
                              {/* Feature row (gavetinha) */}
                              <button
                                onClick={() => toggleFeature(fKey)}
                                className={`w-full text-left rounded-lg p-2.5 transition-colors cursor-pointer bg-ds-dark-blue hover:bg-ds-dark-blue/80 ${
                                  isDelayed ? 'border-l-[3px] border-l-red-500 border-r border-t border-b border-r-ds-border border-t-ds-border border-b-ds-border' : 'border border-ds-border'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-amber-400 shrink-0">⭐</span>
                                  <p className="flex-1 min-w-0 text-xs text-ds-light-text font-medium truncate">
                                    {fg.featureTitle ?? 'Sem feature vinculada'}
                                  </p>
                                  <span className="text-xs text-ds-text shrink-0">{fg.tasks.length}</span>
                                  <svg className={`w-4 h-4 text-ds-text shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                                <div className="flex items-center gap-2 mt-1.5 ml-6 flex-wrap">
                                  <span className={`flex items-center gap-1 text-xs font-semibold ${textClass}`}>
                                    <span className={`w-2 h-2 rounded-full ${isDelayed ? 'bg-red-500' : days > 15 ? 'bg-amber-400' : 'bg-ds-green'}`} />
                                    {days}d
                                  </span>
                                  {isDelayed && <span className="text-red-400 text-xs">⚠️</span>}
                                  {categoria && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-ds-muted/50 text-ds-text border border-ds-border truncate max-w-[100px]" title={categoria}>
                                      {categoria}
                                    </span>
                                  )}
                                  {hasImpedimento && <span className="text-xs" title="Impedimento">💬</span>}
                                </div>
                              </button>

                              {/* Expanded tasks (gavetinha aberta) */}
                              {isOpen && (
                                <div className="mt-1 space-y-1 ml-4">
                                  {fg.tasks.map(task => {
                                    const tDays = taskDaysActive(task);
                                    return (
                                      <div
                                        key={task.work_item_id}
                                        className="flex items-center gap-2 bg-ds-dark-blue/50 border border-ds-border/40 rounded-lg px-3 py-2 text-xs"
                                      >
                                        <span className="text-ds-text/60 shrink-0">📋</span>
                                        <p className="flex-1 min-w-0 text-ds-light-text truncate">
                                          {task.url ? (
                                            <a href={task.url} target="_blank" rel="noopener noreferrer" className="hover:text-ds-green transition-colors">{task.title}</a>
                                          ) : task.title}
                                        </p>
                                        <Badge text={task.state} className={getStateBadgeClass(task.state)} />
                                        <span className={`font-medium shrink-0 ${getDelayClass(tDays, false)}`}>{tDays}d</span>
                                        {task.qa && (
                                          <span className="flex items-center gap-1 shrink-0">
                                            <DevAvatar name={task.qa} avatarUrl={task.qa_avatar_url} size="w-5 h-5" />
                                            <span className="text-amber-400/80">QA</span>
                                          </span>
                                        )}
                                        {task.po && (
                                          <span className="flex items-center gap-1 shrink-0">
                                            <DevAvatar name={task.po} avatarUrl={task.po_avatar_url} size="w-5 h-5" />
                                            <span className="text-ds-cyan/80">PO</span>
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-ds-text italic">Sem projeto atribuído</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Developers View ──────────────────────────────────────────────────────────

interface AdoMember { name: string; avatar_url: string | null; task_count: number; }

const DevelopersView: React.FC<{
  developers: Developer[];
  features: Feature[];
  onRefresh: () => void;
  apiUrl: string;
  token: string | null;
}> = ({ developers, features, onRefresh, apiUrl, token }) => {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingDev, setEditingDev] = useState<Developer | null>(null);
  const [form, setForm] = useState({ name: '', role: 'Dev Pleno', email: '', category: 'paydev', client: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Import from ADO
  const [showImport, setShowImport] = useState(false);
  const [adoMembers, setAdoMembers] = useState<AdoMember[]>([]);
  const [loadingAdo, setLoadingAdo] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [importCategory, setImportCategory] = useState('paydev');
  const [importRole, setImportRole] = useState('Dev Pleno');
  const [importing, setImporting] = useState(false);
  const [importSearch, setImportSearch] = useState('');

  const h = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const openCreate = () => {
    setEditingDev(null);
    setForm({ name: '', role: 'Dev Pleno', email: '', category: 'paydev', client: '' });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (dev: Developer) => {
    setEditingDev(dev);
    setForm({ name: dev.name, role: dev.role, email: dev.email || '', category: dev.category, client: dev.client || '' });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name) { setFormError('Nome é obrigatório'); return; }
    setSaving(true); setFormError('');
    try {
      const body = { name: form.name, role: form.role, email: form.email || null, category: form.category, client: form.client || null, active: true };
      const url = editingDev ? `${apiUrl}/api/devtracker/developers/${editingDev.id}` : `${apiUrl}/api/devtracker/developers`;
      const res = await fetch(url, { method: editingDev ? 'PUT' : 'POST', headers: h, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); setFormError(d.error || 'Erro ao salvar'); return; }
      setShowForm(false); onRefresh();
    } catch { setFormError('Erro de conexão'); } finally { setSaving(false); }
  };

  const handleToggle = async (dev: Developer) => {
    if (dev.active) {
      await fetch(`${apiUrl}/api/devtracker/developers/${dev.id}`, { method: 'DELETE', headers: h });
    } else {
      await fetch(`${apiUrl}/api/devtracker/developers/${dev.id}`, { method: 'PUT', headers: h, body: JSON.stringify({ name: dev.name, role: dev.role, email: dev.email, category: dev.category, client: dev.client, active: true }) });
    }
    onRefresh();
  };

  const addTag = async (dev: Developer, tag: string) => {
    await fetch(`${apiUrl}/api/devtracker/tags`, { method: 'POST', headers: h, body: JSON.stringify({ entity_type: 'developer', entity_id: dev.id, tag }) });
    onRefresh();
  };

  const removeTag = async (dev: Developer, tag: string) => {
    await fetch(`${apiUrl}/api/devtracker/tags`, { method: 'DELETE', headers: h, body: JSON.stringify({ entity_type: 'developer', entity_id: dev.id, tag }) });
    onRefresh();
  };

  const openImport = async () => {
    setShowImport(true);
    setLoadingAdo(true);
    setImportSearch('');
    setSelectedMembers(new Set());
    try {
      const res = await fetch(`${apiUrl}/api/devtracker/ado-members`, { headers: h });
      const data: AdoMember[] = await res.json();
      // Pré-seleciona quem ainda não está cadastrado
      const registeredNames = new Set(developers.map(d => d.name.toLowerCase()));
      const newOnes = new Set(data.filter(m => !registeredNames.has(m.name.toLowerCase())).map(m => m.name));
      setAdoMembers(data);
      setSelectedMembers(newOnes);
    } catch { /* ignore */ } finally { setLoadingAdo(false); }
  };

  const toggleMember = (name: string) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handleImport = async () => {
    if (selectedMembers.size === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`${apiUrl}/api/devtracker/import-from-ado`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ members: Array.from(selectedMembers), category: importCategory, role: importRole }),
      });
      const data = await res.json();
      setShowImport(false);
      onRefresh();
      alert(`✅ ${data.imported} importados, ${data.skipped} já existiam.`);
    } catch { /* ignore */ } finally { setImporting(false); }
  };

  const filtered = developers.filter(d => {
    if (!showInactive && !d.active) return false;
    return d.name.toLowerCase().includes(search.toLowerCase()) || (d.client || '').toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm w-64 placeholder:text-ds-text/50 focus:outline-none focus:border-ds-green focus:ring-1 focus:ring-ds-green/30 transition-colors"
          placeholder="Buscar desenvolvedor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-ds-text cursor-pointer select-none">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
          Mostrar inativos
        </label>
        <div className="ml-auto flex gap-2">
          <button
            onClick={openImport}
            className="bg-ds-cyan/10 text-ds-cyan border border-ds-cyan/30 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-ds-cyan/20 transition-colors"
          >
            ⬇ Importar do Azure DevOps
          </button>
          <button
            onClick={openCreate}
            className="bg-ds-green text-ds-dark-blue text-sm font-semibold px-4 py-2 rounded-lg hover:bg-ds-green/80 transition-colors"
          >
            + Novo Dev
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map(dev => {
          const devFeatures = features.filter(f => matchDevToFeature(dev, f) && !isCompleted(f));
          return (
            <div key={dev.id} className={`bg-ds-navy border border-ds-border rounded-xl px-4 py-3 transition-colors hover:border-ds-muted ${!dev.active ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-ds-muted flex items-center justify-center text-ds-text font-semibold text-sm shrink-0 mt-0.5">
                  {dev.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ds-light-text text-sm">{dev.name}</span>
                    <Badge text={CATEGORY_LABEL[dev.category]} className={CATEGORY_BADGE_CLASS[dev.category]} />
                    {!dev.active && <Badge text="Inativo" className="text-ds-text bg-ds-muted/40 border-ds-border" />}
                    {devFeatures.length > 0 && (
                      <span className="text-xs text-ds-text">{devFeatures.length} feature(s) ativa(s)</span>
                    )}
                  </div>
                  <p className="text-xs text-ds-text mt-0.5">{dev.role}{dev.email ? ` · ${dev.email}` : ''}</p>
                  <TagEditor
                    customTags={dev.custom_tags || []}
                    onAdd={tag => addTag(dev, tag)}
                    onRemove={tag => removeTag(dev, tag)}
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(dev)} className="p-2 text-ds-text hover:text-ds-cyan transition-colors" title="Editar">✏️</button>
                  <button onClick={() => handleToggle(dev)} className={`p-2 transition-colors ${dev.active ? 'text-ds-text hover:text-red-400' : 'text-ds-text hover:text-ds-green'}`} title={dev.active ? 'Inativar' : 'Reativar'}>
                    {dev.active ? '🚫' : '✅'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-ds-text text-sm">Nenhum desenvolvedor encontrado.</div>
        )}
      </div>

      {showForm && (
        <Modal title={editingDev ? 'Editar Desenvolvedor' : 'Novo Desenvolvedor'} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            {formError && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3">{formError}</p>}
            <InputField label="Nome *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <SelectField label="Cargo" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {['Dev Júnior', 'Dev Pleno', 'Dev Sênior', 'Tech Lead', 'Analista', 'QA', 'PO', 'Scrum Master'].map(r => <option key={r}>{r}</option>)}
            </SelectField>
            <InputField label="E-mail" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="dev@empresa.com" />
            <SelectField label="Categoria *" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              <option value="paydev">PayDev</option>
              <option value="nao-aderencia">Não Aderência</option>
              <option value="demandas-internas">Demandas Internas</option>
            </SelectField>
            <InputField label="Equipe / Cliente" value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="ex: Wakanda, Gotham" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-ds-muted/40 text-ds-text text-sm py-2 rounded-lg hover:bg-ds-muted transition-colors border border-ds-border">Cancelar</button>
              {editingDev && (
                <button
                  onClick={async () => { await handleToggle(editingDev); setShowForm(false); }}
                  className="flex-1 bg-red-500/10 text-red-400 border border-red-500/30 text-sm py-2 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                  {editingDev.active ? 'Inativar' : 'Reativar'}
                </button>
              )}
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-ds-green text-ds-dark-blue font-semibold text-sm py-2 rounded-lg hover:bg-ds-green/80 transition-colors disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ds-navy border border-ds-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-ds-border shrink-0">
              <div>
                <h3 className="text-base font-semibold text-ds-light-text">Importar pessoas do Azure DevOps</h3>
                <p className="text-xs text-ds-text mt-0.5">
                  {loadingAdo ? 'Carregando...' : `${adoMembers.length} pessoas encontradas · ${selectedMembers.size} selecionadas`}
                </p>
              </div>
              <button onClick={() => setShowImport(false)} className="text-ds-text hover:text-ds-light-text text-xl leading-none">&times;</button>
            </div>

            <div className="p-4 border-b border-ds-border shrink-0 space-y-3">
              <input
                className="w-full bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm placeholder:text-ds-text/50 focus:outline-none focus:border-ds-cyan transition-colors"
                placeholder="Filtrar por nome..."
                value={importSearch}
                onChange={e => setImportSearch(e.target.value)}
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-ds-text mb-1">Categoria padrão</label>
                  <select value={importCategory} onChange={e => setImportCategory(e.target.value)}
                    className="w-full bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-cyan transition-colors">
                    <option value="paydev">PayDev</option>
                    <option value="nao-aderencia">Não Aderência</option>
                    <option value="demandas-internas">Demandas Internas</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-ds-text mb-1">Cargo padrão</label>
                  <select value={importRole} onChange={e => setImportRole(e.target.value)}
                    className="w-full bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-cyan transition-colors">
                    {['Dev Júnior', 'Dev Pleno', 'Dev Sênior', 'Tech Lead', 'Analista', 'QA', 'PO', 'Scrum Master'].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setSelectedMembers(new Set(adoMembers.map(m => m.name)))} className="text-ds-cyan hover:underline">Selecionar todos</button>
                <span className="text-ds-border">·</span>
                <button onClick={() => setSelectedMembers(new Set())} className="text-ds-text hover:underline">Desmarcar todos</button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-2">
              {loadingAdo ? (
                <p className="text-center text-ds-text py-8 text-sm">Carregando pessoas do Azure DevOps...</p>
              ) : (
                <div className="space-y-1">
                  {adoMembers
                    .filter(m => m.name.toLowerCase().includes(importSearch.toLowerCase()))
                    .map(member => {
                      const isRegistered = developers.some(d => d.name.toLowerCase() === member.name.toLowerCase());
                      const isSelected = selectedMembers.has(member.name);
                      return (
                        <button
                          key={member.name}
                          onClick={() => !isRegistered && toggleMember(member.name)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors
                            ${isRegistered ? 'opacity-40 cursor-default' : 'cursor-pointer hover:bg-ds-muted/40'}
                            ${isSelected && !isRegistered ? 'bg-ds-cyan/10 border border-ds-cyan/20' : 'border border-transparent'}`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected && !isRegistered ? 'bg-ds-cyan border-ds-cyan' : 'border-ds-border'}`}>
                            {(isSelected || isRegistered) && <span className="text-ds-dark-blue text-xs font-bold">✓</span>}
                          </div>
                          <DevAvatar name={member.name} avatarUrl={member.avatar_url} size="w-7 h-7" />
                          <span className="flex-1 text-sm text-ds-light-text">{member.name}</span>
                          {isRegistered && <span className="text-xs text-ds-text">já cadastrado</span>}
                          <span className="text-xs text-ds-text/60">{member.task_count} tarefas</span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-ds-border shrink-0 flex gap-2">
              <button onClick={() => setShowImport(false)} className="flex-1 bg-ds-muted/40 text-ds-text text-sm py-2 rounded-lg hover:bg-ds-muted transition-colors border border-ds-border">Cancelar</button>
              <button onClick={handleImport} disabled={importing || selectedMembers.size === 0}
                className="flex-1 bg-ds-cyan text-ds-dark-blue font-semibold text-sm py-2 rounded-lg hover:bg-ds-cyan/80 transition-colors disabled:opacity-50">
                {importing ? 'Importando...' : `Importar ${selectedMembers.size} pessoa(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Features View ────────────────────────────────────────────────────────────

const FeaturesView: React.FC<{
  features: Feature[];
  onRefresh: () => void;
  apiUrl: string;
  token: string | null;
}> = ({ features, onRefresh, apiUrl, token }) => {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'active' | 'completed'>('active');
  const [teamFilter, setTeamFilter] = useState('');

  const h = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const addTag = async (feature: Feature, tag: string) => {
    await fetch(`${apiUrl}/api/devtracker/tags`, { method: 'POST', headers: h, body: JSON.stringify({ entity_type: 'feature', entity_id: feature.work_item_id, tag }) });
    onRefresh();
  };

  const removeTag = async (feature: Feature, tag: string) => {
    await fetch(`${apiUrl}/api/devtracker/tags`, { method: 'DELETE', headers: h, body: JSON.stringify({ entity_type: 'feature', entity_id: feature.work_item_id, tag }) });
    onRefresh();
  };

  const teams = Array.from(new Set(features.map(f => f.team).filter(Boolean))) as string[];

  const filtered = features.filter(f => {
    const completedF = isCompleted(f);
    if (stateFilter === 'active' && completedF) return false;
    if (stateFilter === 'completed' && !completedF) return false;
    if (teamFilter && f.team !== teamFilter) return false;
    const q = search.toLowerCase();
    if (q && !f.title.toLowerCase().includes(q) && !(f.assigned_to || '').toLowerCase().includes(q)) return false;
    return true;
  });

  const activeCount = features.filter(f => !isCompleted(f)).length;
  const delayedCount = features.filter(f => !isCompleted(f) && (daysActive(f) ?? 0) > 30).length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm w-64 placeholder:text-ds-text/50 focus:outline-none focus:border-ds-green focus:ring-1 focus:ring-ds-green/30 transition-colors"
          placeholder="Buscar feature ou dev..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex rounded-lg overflow-hidden border border-ds-border text-sm">
          {(['all', 'active', 'completed'] as const).map(s => (
            <button key={s} onClick={() => setStateFilter(s)}
              className={`px-3 py-1.5 transition-colors ${stateFilter === s ? 'bg-ds-green text-ds-dark-blue font-semibold' : 'bg-ds-dark-blue text-ds-text hover:text-ds-light-text'}`}>
              {s === 'all' ? 'Todas' : s === 'active' ? `Ativas (${activeCount})` : 'Concluídas'}
            </button>
          ))}
        </div>
        {teams.length > 0 && (
          <select
            className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green transition-colors"
            value={teamFilter}
            onChange={e => setTeamFilter(e.target.value)}
          >
            <option value="">Todos os times</option>
            {teams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {delayedCount > 0 && (
          <span className="ml-auto text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-full px-3 py-1">
            ⚠️ {delayedCount} feature(s) com mais de 30 dias em progresso
          </span>
        )}
      </div>

      {/* Feature cards */}
      <div className="space-y-2">
        {filtered.map(f => {
          const days = daysActive(f);
          const completed = isCompleted(f);
          const delayTextClass = getDelayClass(days, completed);
          const delayBarClass = getDelayBarClass(days, completed);
          const adoTags = parseAdoTags(f.tags);
          const isDelayed = !completed && (days ?? 0) > 30;

          return (
            <div key={f.work_item_id} className={`bg-ds-navy border rounded-xl p-4 hover:border-ds-muted transition-colors ${isDelayed ? 'border-red-500/30' : 'border-ds-border'}`}>
              <div className="flex items-start gap-4">
                {/* Days indicator */}
                <div className={`shrink-0 w-14 text-center pt-0.5 ${completed ? 'opacity-40' : ''}`}>
                  <p className={`text-2xl font-bold leading-none ${delayTextClass}`}>{days ?? '—'}</p>
                  <p className="text-xs text-ds-text mt-0.5">dias</p>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start gap-2 mb-1.5">
                    {f.url ? (
                      <a href={f.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-semibold text-ds-light-text hover:text-ds-green transition-colors leading-snug line-clamp-2 flex-1">
                        {f.title}
                      </a>
                    ) : (
                      <span className="text-sm font-semibold text-ds-light-text leading-snug line-clamp-2 flex-1">{f.title}</span>
                    )}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isDelayed && <Badge text="EM ATRASO" className="text-red-400 border-red-400/30 bg-red-400/10" />}
                      <Badge text={f.state} className={getStateBadgeClass(f.state)} />
                      {f.priority && (
                        <span className={`text-xs font-medium ${getPriorityClass(f.priority)}`}>
                          {getPriorityLabel(f.priority)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-ds-text mb-2">
                    {f.assigned_to && (
                      <span className="flex items-center gap-1">
                        <span className="text-ds-text/60">👤</span>
                        {f.assigned_to}
                      </span>
                    )}
                    {f.team && (
                      <span className="flex items-center gap-1">
                        <span className="text-ds-text/60">🏷️</span>
                        {f.team}
                      </span>
                    )}
                    {f.story_points !== null && f.story_points !== undefined && (
                      <span className="flex items-center gap-1">
                        <span className="text-ds-text/60">◈</span>
                        {f.story_points} pts
                      </span>
                    )}
                    {f.first_activation_date && !completed && (
                      <span className="text-ds-text/60">
                        Início: {new Date(f.first_activation_date).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                    {completed && f.closed_date && (
                      <span className="text-ds-text/60">
                        Concluída: {new Date(f.closed_date).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>

                  {/* Progress bar — only for active */}
                  {!completed && days !== null && (
                    <div className="w-full bg-ds-muted rounded-full h-1 mb-2">
                      <div className={`h-1 rounded-full transition-all ${delayBarClass}`}
                        style={{ width: `${Math.min(100, (days / 45) * 100)}%` }} />
                    </div>
                  )}

                  {/* Tags */}
                  <TagEditor
                    adoTags={adoTags}
                    customTags={f.custom_tags || []}
                    onAdd={tag => addTag(f, tag)}
                    onRemove={tag => removeTag(f, tag)}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-ds-text text-sm">Nenhuma feature encontrada.</div>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const DevTrackerDashboard: React.FC = () => {
  const { token } = useAuth();
  const [view, setView] = useState<SubView>('overview');
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || '';

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [devsRes, featRes, tasksRes] = await Promise.all([
        fetch(`${API_URL}/api/devtracker/developers`, { headers }),
        fetch(`${API_URL}/api/devtracker/features`, { headers }),
        fetch(`${API_URL}/api/devtracker/active-tasks`, { headers }),
      ]);
      if (!devsRes.ok || !featRes.ok || !tasksRes.ok) throw new Error('Erro ao carregar dados');
      setDevelopers(await devsRes.json());
      setFeatures(await featRes.json());
      setActiveTasks(await tasksRes.json());
    } catch (e: any) {
      setError(e.message || 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, [token, API_URL]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeFeatures = features.filter(f => !isCompleted(f));

  const NAV: Array<{ id: SubView; label: string; count?: number }> = [
    { id: 'overview', label: '📊 Visão Geral' },
    { id: 'developers', label: '👤 Desenvolvedores', count: developers.filter(d => d.active).length },
    { id: 'features', label: '📁 Features (Azure DevOps)', count: activeFeatures.length },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ds-light-text">DevTracker</h2>
          <p className="text-sm text-ds-text mt-0.5">Acompanhe devs e features do time</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-ds-text hover:text-ds-light-text border border-ds-border rounded-lg px-3 py-2 transition-colors hover:border-ds-muted disabled:opacity-50"
        >
          <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>
          Atualizar
        </button>
      </div>

      {/* Sub-navigation */}
      <div className="flex gap-1 border-b border-ds-border">
        {NAV.map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              view === tab.id
                ? 'bg-ds-navy border border-b-ds-navy border-ds-border text-ds-green -mb-px'
                : 'text-ds-text hover:text-ds-light-text'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${view === tab.id ? 'bg-ds-green/20 text-ds-green' : 'bg-ds-muted text-ds-text'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-ds-green" />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-red-400 text-sm bg-red-400/5 rounded-xl border border-red-400/20">{error}</div>
      ) : (
        <>
          {view === 'overview' && <OverviewView developers={developers} activeTasks={activeTasks} features={features} />}
          {view === 'developers' && <DevelopersView developers={developers} features={features} onRefresh={fetchData} apiUrl={API_URL} token={token} />}
          {view === 'features' && <FeaturesView features={features} onRefresh={fetchData} apiUrl={API_URL} token={token} />}
        </>
      )}
    </div>
  );
};

export default DevTrackerDashboard;
