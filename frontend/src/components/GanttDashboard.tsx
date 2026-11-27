import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Gantt, ViewMode, Task } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import './GanttDashboard.css';
import { format } from 'date-fns';
import { WorkItem } from '../types';
import { exportItemsXlsx, getWorkItemColumns } from '../utils/exportXlsx';

interface GanttDashboardProps {
  data: WorkItem[];
}

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

const GANTT_COLORS = {
  navy: '#0A1E35',
  darkBlue: '#061526',
  lightText: '#D8EBF5',
  mutedText: '#7A9EB8',
  border: '#163050',
  green: '#7FD320',
};

type StatusCategory = 'done' | 'overdue' | 'ontrack';

// Situação da tarefa: fechada, atrasada (passou da Target Date e não fechou) ou em andamento no prazo.
function statusCategory(item: WorkItem): StatusCategory {
  if (COMPLETED_STATES.includes(item.state)) return 'done';
  const target = item.targetDate ? new Date(item.targetDate) : null;
  if (target && target.getTime() < Date.now()) return 'overdue';
  return 'ontrack';
}

function barColor(item: WorkItem): string {
  const cat = statusCategory(item);
  if (cat === 'done') return '#64FFDA';
  if (cat === 'overdue') return '#F56565';
  return '#47C5FB';
}

// Cabeçalho da tabela à esquerda (Item/Início/Fim), tema escuro — substitui o padrão claro da lib.
const DarkTaskListHeader: React.FC<{
  headerHeight: number;
  rowWidth: string;
  fontFamily: string;
  fontSize: string;
}> = ({ headerHeight, rowWidth, fontFamily, fontSize }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1fr',
      alignItems: 'center',
      height: headerHeight,
      width: rowWidth,
      background: GANTT_COLORS.navy,
      borderBottom: `1px solid ${GANTT_COLORS.border}`,
      color: GANTT_COLORS.lightText,
      fontFamily,
      fontSize,
      fontWeight: 600,
      boxSizing: 'border-box',
    }}
  >
    <div style={{ paddingLeft: 12 }}>Item</div>
    <div>Início</div>
    <div>Fim</div>
  </div>
);

// Corpo da tabela à esquerda, tema escuro — substitui o padrão claro (zebra branco/cinza ilegível no dark theme).
const DarkTaskListTable: React.FC<{
  rowHeight: number;
  rowWidth: string;
  fontFamily: string;
  fontSize: string;
  locale: string;
  tasks: Task[];
  selectedTaskId: string;
  setSelectedTask: (taskId: string) => void;
  onExpanderClick: (task: Task) => void;
}> = ({ rowHeight, rowWidth, fontFamily, fontSize, locale, tasks, selectedTaskId, setSelectedTask, onExpanderClick }) => (
  <div style={{ width: rowWidth, fontFamily, fontSize }}>
    {tasks.map((t, idx) => {
      const hasChildren = t.type === 'project';
      const isSelected = t.id === selectedTaskId;
      return (
        <div
          key={t.id}
          onClick={() => setSelectedTask(t.id)}
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            alignItems: 'center',
            height: rowHeight,
            background: isSelected ? GANTT_COLORS.border : idx % 2 === 0 ? GANTT_COLORS.navy : GANTT_COLORS.darkBlue,
            color: GANTT_COLORS.lightText,
            borderBottom: `1px solid ${GANTT_COLORS.border}`,
            cursor: 'pointer',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {hasChildren ? (
              <span
                onClick={e => { e.stopPropagation(); onExpanderClick(t); }}
                style={{ color: GANTT_COLORS.green, cursor: 'pointer', width: 14, flexShrink: 0, fontSize: '0.8em' }}
              >
                {t.hideChildren ? '▸' : '▾'}
              </span>
            ) : (
              <span style={{ width: 14, flexShrink: 0 }} />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.name}>{t.name}</span>
          </div>
          <div style={{ color: GANTT_COLORS.mutedText, fontSize: '0.85em' }}>{t.start.toLocaleDateString(locale)}</div>
          <div style={{ color: GANTT_COLORS.mutedText, fontSize: '0.85em' }}>{t.end.toLocaleDateString(locale)}</div>
        </div>
      );
    })}
  </div>
);

const GanttDashboard: React.FC<GanttDashboardProps> = ({ data }) => {
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week);
  const [periodFrom, setPeriodFrom] = useState<string>('');
  const [periodTo, setPeriodTo] = useState<string>('');
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  const [filterAssignees, setFilterAssignees] = useState<string[]>([]);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);

  const [filterStatus, setFilterStatus] = useState<'all' | StatusCategory>('all');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setShowTypeDropdown(false);
      }
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(e.target as Node)) {
        setShowAssigneeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setFilterTypes([]);
    setFilterAssignees([]);
    setFilterStatus('all');
    setSearchText('');
  }, [selectedTeam]);

  const availableTeams = useMemo(() => {
    return [...new Set(data.map(i => i.team).filter(Boolean) as string[])].sort();
  }, [data]);

  const teamItems = useMemo(() => {
    if (!selectedTeam) return [];
    return data.filter(i => i.team === selectedTeam);
  }, [data, selectedTeam]);

  const availableTypes = useMemo(() => [...new Set(teamItems.map(i => i.type).filter(Boolean) as string[])].sort(), [teamItems]);
  const availableAssignees = useMemo(() => [...new Set(teamItems.map(i => i.assignedTo).filter(Boolean) as string[])].sort(), [teamItems]);

  // Filtro de período: aplicado sobre a Target Date — só entra na árvore quem tem alvo dentro do intervalo
  // (item sem Target Date não é afetado aqui, é tratado à parte no aviso "sem Target Date").
  const periodFilteredItems = useMemo(() => {
    if (!periodFrom && !periodTo) return teamItems;
    const fromTime = periodFrom ? new Date(periodFrom).getTime() : -Infinity;
    const toTime = periodTo ? new Date(periodTo).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity;
    return teamItems.filter(i => {
      if (!i.targetDate) return false;
      const t = new Date(i.targetDate).getTime();
      return t >= fromTime && t <= toTime;
    });
  }, [teamItems, periodFrom, periodTo]);

  const itemsConsidered = (periodFrom || periodTo) ? periodFilteredItems : teamItems;
  const itemsWithDate = useMemo(() => itemsConsidered.filter(i => !!i.targetDate), [itemsConsidered]);
  const itemsWithoutDate = itemsConsidered.length - itemsWithDate.length;

  // Monta a árvore Feature > User Story/Issue > Task (ou qualquer outra hierarquia real do Azure DevOps,
  // via parent_id) — clicar num item com filhos expande/recolhe, nativo da biblioteca. Item sem Target Date
  // própria mas com descendente que tem é mantido só como "moldura" (datas calculadas a partir dos filhos),
  // pra não perder o encadeamento; item sem Target Date e sem descendente com Target Date simplesmente some.
  const tasks: Task[] = useMemo(() => {
    if (itemsWithDate.length === 0) return [];

    const itemsById = new Map(itemsConsidered.map(i => [i.workItemId, i]));
    const childrenByParent = new Map<number, WorkItem[]>();
    const roots: WorkItem[] = [];
    itemsConsidered.forEach(item => {
      const parentId = item.parentId;
      if (parentId && itemsById.has(parentId)) {
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId)!.push(item);
      } else {
        roots.push(item);
      }
    });

    // Decide (recursivamente) se um item deve aparecer: tem Target Date própria, ou algum descendente tem.
    const hasDateCache = new Map<number, boolean>();
    function subtreeHasDate(item: WorkItem, visited = new Set<number>()): boolean {
      if (hasDateCache.has(item.workItemId)) return hasDateCache.get(item.workItemId)!;
      if (visited.has(item.workItemId)) return false; // guarda contra ciclo de parent_id corrompido
      visited.add(item.workItemId);
      const own = !!item.targetDate;
      const children = childrenByParent.get(item.workItemId) || [];
      const result = own || children.some(c => subtreeHasDate(c, visited));
      hasDateCache.set(item.workItemId, result);
      return result;
    }

    // Mesmo padrão acima, mas pros filtros de tipo/responsável/situação/busca: um item aparece se ele mesmo
    // combina com o filtro OU algum descendente combina (mantém a hierarquia intacta em vez de cortar no meio).
    const filtersActive = filterTypes.length > 0 || filterAssignees.length > 0 || filterStatus !== 'all' || searchText.trim().length > 0;
    const searchQuery = searchText.trim().toLowerCase();
    function matchesOwnFilters(item: WorkItem): boolean {
      if (filterTypes.length > 0 && !filterTypes.includes(item.type || '')) return false;
      if (filterAssignees.length > 0 && !filterAssignees.includes(item.assignedTo || '')) return false;
      if (filterStatus !== 'all' && statusCategory(item) !== filterStatus) return false;
      if (searchQuery && !(`${item.workItemId}`.includes(searchQuery) || (item.title || '').toLowerCase().includes(searchQuery))) return false;
      return true;
    }
    const matchesFilterCache = new Map<number, boolean>();
    function subtreeMatchesFilters(item: WorkItem, visited = new Set<number>()): boolean {
      if (!filtersActive) return true;
      if (matchesFilterCache.has(item.workItemId)) return matchesFilterCache.get(item.workItemId)!;
      if (visited.has(item.workItemId)) return false;
      visited.add(item.workItemId);
      const children = childrenByParent.get(item.workItemId) || [];
      const result = matchesOwnFilters(item) || children.some(c => subtreeMatchesFilters(c, visited));
      matchesFilterCache.set(item.workItemId, result);
      return result;
    }

    const result: Task[] = [];
    function addNode(item: WorkItem, projectParentId: string | undefined, visited: Set<number>): { start: number; end: number; doneRatio: number } | null {
      if (visited.has(item.workItemId)) return null;
      visited.add(item.workItemId);
      if (!subtreeHasDate(item, new Set()) || !subtreeMatchesFilters(item, new Set())) return null;

      const children = (childrenByParent.get(item.workItemId) || [])
        .filter(c => subtreeHasDate(c, new Set()) && subtreeMatchesFilters(c, new Set()));
      const id = `item-${item.workItemId}`;
      const isDone = COMPLETED_STATES.includes(item.state);

      let start: number, end: number;
      if (item.targetDate) {
        end = new Date(item.targetDate).getTime();
        const startRaw = item.startDate || item.createdDate;
        const startCandidate = startRaw ? new Date(startRaw as string).getTime() : NaN;
        start = (!isNaN(startCandidate) && startCandidate < end) ? startCandidate : end - 24 * 60 * 60 * 1000;
      } else {
        // Sem Target Date própria — vira só uma "moldura" com o intervalo dos filhos, calculado depois.
        start = Infinity;
        end = -Infinity;
      }

      result.push({
        id,
        type: children.length > 0 ? 'project' : 'task',
        name: `#${item.workItemId} · ${item.type || 'Sem tipo'} · ${item.title}`,
        start: new Date(0), // placeholder, corrigido depois de processar os filhos
        end: new Date(0),
        progress: isDone ? 100 : 0,
        project: projectParentId,
        hideChildren: children.length > 0 ? true : undefined,
        styles: { backgroundColor: barColor(item), backgroundSelectedColor: barColor(item) },
      });
      const nodeIndex = result.length - 1;

      let doneCount = isDone ? 1 : 0;
      let totalCount = 1;
      children.forEach(child => {
        const childRange = addNode(child, id, visited);
        if (childRange) {
          start = Math.min(start, childRange.start);
          end = Math.max(end, childRange.end);
          doneCount += childRange.doneRatio;
          totalCount += 1;
        }
      });

      if (!isFinite(start) || !isFinite(end)) { start = Date.now(); end = Date.now() + 24 * 60 * 60 * 1000; }
      result[nodeIndex] = { ...result[nodeIndex], start: new Date(start), end: new Date(end), progress: Math.round((doneCount / totalCount) * 100) };

      return { start, end, doneRatio: doneCount / totalCount };
    }

    roots
      .filter(r => subtreeHasDate(r, new Set()) && subtreeMatchesFilters(r, new Set()))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
      .forEach(root => addNode(root, undefined, new Set()));

    return result;
  }, [itemsConsidered, itemsWithDate.length, filterTypes, filterAssignees, filterStatus, searchText]);

  const itemsById = useMemo(() => new Map(itemsConsidered.map(i => [i.workItemId, i])), [itemsConsidered]);

  const handleTaskClick = (task: Task) => {
    const workItemId = Number(task.id.replace('item-', ''));
    const item = itemsById.get(workItemId);
    window.open(item?.url || `${AZURE_DEVOPS_BASE_URL}/${workItemId}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <label htmlFor="gantt-team" className="text-ds-text text-sm mb-1 block">Time:</label>
            <select id="gantt-team" value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
              <option value="">Selecione um time</option>
              {availableTeams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="gantt-view" className="text-ds-text text-sm mb-1 block">Zoom:</label>
            <select id="gantt-view" value={viewMode} onChange={e => setViewMode(e.target.value as ViewMode)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
              <option value={ViewMode.Day}>Dia</option>
              <option value={ViewMode.Week}>Semana</option>
              <option value={ViewMode.Month}>Mês</option>
            </select>
          </div>
          <div>
            <label htmlFor="gantt-from" className="text-ds-text text-sm mb-1 block">Período (Target Date) de:</label>
            <input id="gantt-from" type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2" />
          </div>
          <div>
            <label htmlFor="gantt-to" className="text-ds-text text-sm mb-1 block">até:</label>
            <input id="gantt-to" type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2" />
          </div>
          {(periodFrom || periodTo) && (
            <div className="flex items-end pb-2">
              <button type="button" onClick={() => { setPeriodFrom(''); setPeriodTo(''); }}
                className="text-xs text-ds-green hover:underline">Limpar período</button>
            </div>
          )}
          <div className="relative" ref={typeDropdownRef}>
            <label className="text-ds-text text-sm mb-1 block">Tipo de item:</label>
            <button type="button" onClick={() => setShowTypeDropdown(v => !v)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 min-w-40 text-left flex items-center justify-between gap-2">
              <span>{filterTypes.length === 0 ? 'Todos' : `${filterTypes.length} selecionado${filterTypes.length > 1 ? 's' : ''}`}</span>
              <span className="text-ds-text text-xs">▾</span>
            </button>
            {showTypeDropdown && (
              <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto bg-ds-navy border border-ds-border rounded-md shadow-xl p-2">
                <div className="flex items-center justify-between mb-2 px-1">
                  <button type="button" onClick={() => setFilterTypes([])} className="text-xs text-ds-green hover:underline">Todos</button>
                  <button type="button" onClick={() => setFilterTypes(availableTypes)} className="text-xs text-ds-green hover:underline">Marcar todos</button>
                </div>
                {availableTypes.map(t => (
                  <label key={t} className="flex items-center gap-2 px-1 py-1 text-sm text-ds-light-text hover:bg-ds-muted/20 rounded cursor-pointer">
                    <input type="checkbox" checked={filterTypes.includes(t)}
                      onChange={() => setFilterTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                      className="accent-ds-green" />
                    {t}
                  </label>
                ))}
                {availableTypes.length === 0 && <p className="text-xs text-ds-text px-1 py-1">Nenhum tipo encontrado.</p>}
              </div>
            )}
          </div>
          <div className="relative" ref={assigneeDropdownRef}>
            <label className="text-ds-text text-sm mb-1 block">Responsável:</label>
            <button type="button" onClick={() => setShowAssigneeDropdown(v => !v)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 min-w-40 text-left flex items-center justify-between gap-2">
              <span>{filterAssignees.length === 0 ? 'Todos' : `${filterAssignees.length} selecionado${filterAssignees.length > 1 ? 's' : ''}`}</span>
              <span className="text-ds-text text-xs">▾</span>
            </button>
            {showAssigneeDropdown && (
              <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto bg-ds-navy border border-ds-border rounded-md shadow-xl p-2">
                <div className="flex items-center justify-between mb-2 px-1">
                  <button type="button" onClick={() => setFilterAssignees([])} className="text-xs text-ds-green hover:underline">Todos</button>
                  <button type="button" onClick={() => setFilterAssignees(availableAssignees)} className="text-xs text-ds-green hover:underline">Marcar todos</button>
                </div>
                {availableAssignees.map(a => (
                  <label key={a} className="flex items-center gap-2 px-1 py-1 text-sm text-ds-light-text hover:bg-ds-muted/20 rounded cursor-pointer">
                    <input type="checkbox" checked={filterAssignees.includes(a)}
                      onChange={() => setFilterAssignees(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])}
                      className="accent-ds-green" />
                    {a}
                  </label>
                ))}
                {availableAssignees.length === 0 && <p className="text-xs text-ds-text px-1 py-1">Nenhum responsável encontrado.</p>}
              </div>
            )}
          </div>
          <div>
            <label className="text-ds-text text-sm mb-1 block">Situação:</label>
            <div className="flex gap-1">
              {([
                { key: 'all', label: 'Todas' },
                { key: 'ontrack', label: 'No prazo' },
                { key: 'overdue', label: 'Atrasada' },
                { key: 'done', label: 'Concluída' },
              ] as const).map(opt => (
                <button key={opt.key} type="button" onClick={() => setFilterStatus(opt.key)}
                  className={`text-xs px-2 py-2 rounded-md border ${filterStatus === opt.key ? 'bg-ds-green/20 border-ds-green text-ds-green' : 'bg-ds-navy border-ds-border text-ds-text'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="gantt-search" className="text-ds-text text-sm mb-1 block">Buscar (ID ou título):</label>
            <input id="gantt-search" type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder="Ex: 87295 ou XML"
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 w-48" />
          </div>
          {selectedTeam && (
            <div className="text-ds-green text-xs flex items-center gap-2 mt-6">
              <span>🏷️</span> {itemsWithDate.length} tarefa(s) com Target Date no Gantt
              {itemsWithoutDate > 0 && (
                <span className="ml-2 px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400 text-xs border border-yellow-500/30">
                  ⚠️ {itemsWithoutDate} tarefa(s) sem Target Date não aparecem — preencha no Azure DevOps
                </span>
              )}
            </div>
          )}
          {selectedTeam && (
            <div className="flex items-end mt-6 ml-auto">
              <button
                onClick={async () => {
                  if (itemsConsidered.length === 0) return;
                  setExportingXlsx(true);
                  try {
                    await exportItemsXlsx(itemsConsidered, getWorkItemColumns(), `Gantt_${selectedTeam}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
                  } finally {
                    setExportingXlsx(false);
                  }
                }}
                disabled={exportingXlsx || itemsConsidered.length === 0}
                className="px-3 py-2 text-xs rounded-md font-medium bg-ds-green text-ds-dark-blue hover:bg-ds-green/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Exporta os itens do time/período selecionado para .xlsx"
              >
                {exportingXlsx ? 'Exportando…' : `📥 .xlsx (${itemsConsidered.length})`}
              </button>
            </div>
          )}
        </div>
      </div>

      {!selectedTeam && (
        <div className="bg-ds-navy p-8 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-lg">Selecione um time pra ver o Gantt.</p>
        </div>
      )}

      {selectedTeam && tasks.length === 0 && (
        <div className="bg-ds-navy p-8 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-lg">Nenhuma tarefa do time <strong>{selectedTeam}</strong> tem Target Date preenchida{(periodFrom || periodTo) ? ' no período selecionado' : ''}.</p>
          <p className="text-ds-text text-sm mt-2">Preencha o campo Target Date no Azure DevOps pra elas aparecerem aqui.</p>
        </div>
      )}

      {selectedTeam && tasks.length > 0 && (
        <div className="bg-ds-navy rounded-lg border border-ds-border overflow-x-auto">
          <Gantt
            tasks={tasks}
            viewMode={viewMode}
            viewDate={new Date()}
            locale="pt-BR"
            listCellWidth="260px"
            columnWidth={viewMode === ViewMode.Month ? 250 : viewMode === ViewMode.Week ? 150 : 60}
            todayColor="rgba(100, 255, 218, 0.15)"
            barBackgroundColor="#47C5FB"
            projectBackgroundColor="#8892B0"
            projectProgressColor="#64FFDA"
            TaskListHeader={DarkTaskListHeader}
            TaskListTable={DarkTaskListTable}
            onClick={handleTaskClick}
          />
        </div>
      )}

      <div className="bg-ds-navy/50 p-4 rounded-lg border border-ds-border/50">
        <h4 className="text-ds-light-text font-semibold mb-2">📚 Legenda</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-ds-text">
          <p><span style={{ color: '#64FFDA' }}>●</span> Concluída</p>
          <p><span style={{ color: '#F56565' }}>●</span> Atrasada (passou da Target Date, ainda aberta)</p>
          <p><span style={{ color: '#47C5FB' }}>●</span> Em andamento, dentro do prazo</p>
        </div>
        <p className="text-[11px] text-ds-text mt-2">
          Hierarquia real do Azure DevOps: clique no ▸/▾ ao lado do nome pra expandir/recolher o que está dentro dela. Clique na barra pra abrir o item no Azure DevOps em uma nova aba. Cada barra vai do início planejado (Start Date, ou data de criação se não houver) até a data alvo (Target Date). Item sem Target Date própria mas com filhos que têm aparece como "moldura", cobrindo o intervalo deles. Somente leitura — para editar, use o Azure DevOps.
        </p>
      </div>
    </div>
  );
};

export default GanttDashboard;
