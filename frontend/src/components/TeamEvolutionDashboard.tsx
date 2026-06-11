import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend, Line,
} from 'recharts';
import { startOfWeek, subWeeks, isWithinInterval, format, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { WorkItem } from '../types';
import { COMPLETED_STATES, IN_PROGRESS_STATES } from '../utils/metrics';

interface TeamEvolutionDashboardProps {
  data: WorkItem[];
}

// ── helpers ─────────────────────────────────────────────────────────────────

function countWorkingDays(from: Date, to: Date): number {
  let count = 0;
  const d = new Date(from);
  while (d <= to) {
    const dow = getDay(d);
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, count);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.ceil(sorted.length * p) - 1, sorted.length - 1);
  return Math.round(sorted[Math.max(0, idx)] * 10) / 10;
}

type TrendDir = 'up' | 'down' | 'same';
function trendDir(curr: number, prev: number): TrendDir {
  if (prev === 0 || curr === 0) return 'same';
  const pct = (curr - prev) / prev;
  if (Math.abs(pct) < 0.06) return 'same';
  return curr > prev ? 'up' : 'down';
}

const TrendIcon: React.FC<{ curr: number; prev: number; higherIsBetter: boolean }> = ({ curr, prev, higherIsBetter }) => {
  const dir = trendDir(curr, prev);
  if (dir === 'same') return <span className="text-ds-muted text-xs ml-1">→</span>;
  const good = (dir === 'up') === higherIsBetter;
  return (
    <span className={`text-xs font-bold ml-1 ${good ? 'text-green-400' : 'text-red-400'}`}>
      {dir === 'up' ? '▲' : '▼'}
    </span>
  );
};

const TYPE_COLORS: Record<string, string> = {
  'Bug': 'bg-red-500/20 text-red-400 border-red-500/30',
  'Issue': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'User Story': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Task': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Feature': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};
const typeColor = (t: string) => TYPE_COLORS[t] ?? 'bg-ds-border/30 text-ds-text border-ds-border/40';

const C = { grid: '#2d3748', text: '#64748b', green: '#7FD320', blue: '#60A5FA', yellow: '#F59E0B', red: '#EF4444' };

// ── modal ────────────────────────────────────────────────────────────────────

interface ModalData { title: string; items: WorkItem[] }
const AZURE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

// ── type dropdown ─────────────────────────────────────────────────────────
const TypeDropdown: React.FC<{
  allTypes: string[];
  selectedTypes: string[];
  onToggle: (t: string) => void;
  onClear: () => void;
}> = ({ allTypes, selectedTypes, onToggle, onClear }) => {
  const [open, setOpen] = useState(false);
  const label = selectedTypes.length === 0
    ? 'Todos os tipos'
    : selectedTypes.length === 1
      ? selectedTypes[0]
      : `${selectedTypes.length} tipos`;
  return (
    <div className="relative flex items-center gap-2">
      <label className="text-ds-text text-sm font-semibold">🏷️ Tipo:</label>
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="bg-ds-navy border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green flex items-center gap-2 min-w-[160px]"
        >
          <span className="flex-1 text-left truncate">{label}</span>
          <span className="text-ds-muted text-xs">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 bg-ds-dark-blue border border-ds-border rounded-lg shadow-xl z-50 min-w-[180px] py-1">
            {allTypes.map(t => (
              <button
                key={t}
                onClick={() => onToggle(t)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-ds-navy transition-colors text-left"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selectedTypes.includes(t) ? 'bg-ds-green border-ds-green' : 'border-ds-border'}`}>
                  {selectedTypes.includes(t) && <span className="text-ds-dark-blue text-xs font-bold">✓</span>}
                </span>
                <span className="text-ds-light-text">{t}</span>
              </button>
            ))}
            {selectedTypes.length > 0 && (
              <>
                <div className="border-t border-ds-border my-1" />
                <button
                  onClick={() => { onClear(); setOpen(false); }}
                  className="w-full px-3 py-2 text-xs text-ds-muted hover:text-red-400 text-left transition-colors"
                >
                  ✕ Limpar seleção
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-ds-dark-blue border border-ds-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ds-border bg-ds-navy rounded-t-xl">
          <h3 className="text-ds-light-text font-bold text-sm flex-1">{data.title}</h3>
          <span className="text-ds-muted text-xs mr-4">{data.items.length} item{data.items.length !== 1 ? 's' : ''}</span>
          <button onClick={onClose} className="text-ds-muted hover:text-ds-light-text text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-ds-border/30">
          {data.items.length === 0 && <div className="p-6 text-center text-ds-muted">Nenhum item.</div>}
          {data.items.map(item => (
            <a key={item.workItemId} href={`${AZURE_URL}/${item.workItemId}`} target="_blank" rel="noreferrer"
              className="px-5 py-3 flex items-start gap-3 hover:bg-ds-navy/60 cursor-pointer transition-colors block">
              <span className="text-ds-green text-xs font-mono shrink-0 mt-0.5">#{item.workItemId}</span>
              <div className="flex-1 min-w-0">
                <div className="text-ds-light-text text-sm leading-snug hover:underline">{item.title}</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {item.assignedTo && <span className="text-ds-muted text-xs">&#x1F464; {item.assignedTo}</span>}
                  {item.state && <span className="text-ds-muted text-xs">&#x25CF; {item.state}</span>}
                  {item.cycleTime != null && Number(item.cycleTime) > 0 && <span className="text-ds-muted text-xs">&#x23F1; {item.cycleTime}d CT</span>}
                  {item.priority && <span className="text-ds-muted text-xs">P{item.priority}</span>}
                </div>
              </div>
              <span className="text-ds-muted text-xs shrink-0 mt-0.5 opacity-50">↗</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── main component ───────────────────────────────────────────────────────────

const TeamEvolutionDashboard: React.FC<TeamEvolutionDashboardProps> = ({ data }) => {
  const teams = useMemo(() => {
    const s = new Set<string>();
    data.forEach(item => { if (item.team) s.add(item.team); });
    return Array.from(s).sort();
  }, [data]);

  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const effectiveTeam = selectedTeam || teams[0] || '';

  const allTypes = useMemo(() => {
    const s = new Set<string>();
    data.filter(i => i.team === (effectiveTeam)).forEach(i => { if (i.type) s.add(i.type); });
    return Array.from(s).sort();
  }, [data, effectiveTeam]);

  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const toggleType = (t: string) =>
    setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  // 4 weekly windows: [3w ago, 2w ago, last week, this week (partial)]
  const weeks = useMemo(() => {
    const now = new Date();
    const thisMonday = startOfWeek(now, { weekStartsOn: 1 });
    return [3, 2, 1, 0].map(ago => {
      const start = subWeeks(thisMonday, ago);
      const isCurrent = ago === 0;
      const end = isCurrent
        ? now
        : new Date(subWeeks(thisMonday, ago - 1).getTime() - 1);
      const startFmt = format(start, 'dd/MM', { locale: ptBR });
      const endFmt = isCurrent ? 'hoje' : format(end, 'dd/MM', { locale: ptBR });
      return {
        start, end, isCurrent,
        label: `${startFmt}–${endFmt}`,
        shortLabel: isCurrent ? 'Esta semana' : startFmt,
      };
    });
  }, []);

  const teamItems = useMemo(
    () => data.filter(item =>
      item.team === effectiveTeam &&
      (selectedTypes.length === 0 || selectedTypes.includes(item.type || ''))
    ),
    [data, effectiveTeam, selectedTypes],
  );

  const stats = useMemo(() => {
    return weeks.map(week => {
      // ── completed no range ──────────────────────────────────────────────
      const completed = teamItems.filter(item => {
        if (!COMPLETED_STATES.includes(item.state)) return false;
        const d = item.closedDate
          ? new Date(item.closedDate as string)
          : item.changedDate ? new Date(item.changedDate as string) : null;
        return d && !isNaN(d.getTime()) && isWithinInterval(d, { start: week.start, end: week.end });
      });

      // ── throughput ──────────────────────────────────────────────────────
      const throughput = completed.length;

      // ── cycle time ─────────────────────────────────────────────────────
      const ctSorted = completed
        .map(i => Number(i.cycleTime) || 0)
        .filter(v => v > 0)
        .sort((a, b) => a - b);
      const avgCT = ctSorted.length
        ? Math.round((ctSorted.reduce((a, b) => a + b, 0) / ctSorted.length) * 10) / 10
        : 0;
      const p85CT = percentile(ctSorted, 0.85);

      // ── lead time ──────────────────────────────────────────────────────
      const ltValues = completed
        .map(i => Number(i.leadTime) || 0)
        .filter(v => v > 0);
      const avgLT = ltValues.length
        ? Math.round((ltValues.reduce((a, b) => a + b, 0) / ltValues.length) * 10) / 10
        : 0;

      // ── WIP ────────────────────────────────────────────────────────────
      let wipItemsList: WorkItem[];
      if (week.isCurrent) {
        wipItemsList = teamItems.filter(item => IN_PROGRESS_STATES.includes(item.state));
      } else {
        // proxy: items with changedDate in range, excluding those closed before range
        wipItemsList = teamItems.filter(item => {
          const d = item.changedDate ? new Date(item.changedDate as string) : null;
          if (!d || isNaN(d.getTime())) return false;
          if (!isWithinInterval(d, { start: week.start, end: week.end })) return false;
          if (COMPLETED_STATES.includes(item.state)) {
            const closed = item.closedDate ? new Date(item.closedDate as string) : null;
            return closed && closed >= week.start;
          }
          return true;
        });
      }
      const wip = wipItemsList.length;

      // ── impedimentos ───────────────────────────────────────────────────
      const impedimentosList = teamItems.filter(item => {
        const tags = Array.isArray(item.tags)
          ? item.tags as string[]
          : item.tags ? String(item.tags).split(';').map(t => t.trim()) : [];
        const flagged =
          item.state.toLowerCase().includes('impedi') ||
          tags.some(t => t.toUpperCase().includes('IMPEDIMENTO'));
        if (!flagged) return false;
        if (week.isCurrent) return !COMPLETED_STATES.includes(item.state);
        const d = item.changedDate ? new Date(item.changedDate as string) : null;
        return d && !isNaN(d.getTime()) && isWithinInterval(d, { start: week.start, end: week.end });
      });
      const impedimentos = impedimentosList.length;

      // ── tipos entregues ────────────────────────────────────────────────
      const typeCount: Record<string, number> = {};
      completed.forEach(i => {
        const t = i.type || 'Outro';
        typeCount[t] = (typeCount[t] || 0) + 1;
      });
      const typesSorted = Object.entries(typeCount)
        .sort((a, b) => b[1] - a[1]);

      // ── P1/P2 resolvidos ───────────────────────────────────────────────
      const criticalDoneItems = completed.filter(i => {
        const p = Number(i.priority);
        return p === 1 || p === 2;
      });
      const criticalDone = criticalDoneItems.length;

      // ── taxa de retrabalho ─────────────────────────────────────────────
      const reworkItems = completed.filter(i => {
        const r = Number(i.reincidencia);
        return !isNaN(r) && r > 0;
      });
      const reworkCount = reworkItems.length;
      const reworkPct = completed.length > 0
        ? Math.round((reworkCount / completed.length) * 100)
        : 0;

      // ── gargalo por status ─────────────────────────────────────────────
      const wipItems = week.isCurrent
        ? teamItems.filter(item => IN_PROGRESS_STATES.includes(item.state))
        : teamItems.filter(item => {
            const d = item.changedDate ? new Date(item.changedDate as string) : null;
            return d && !isNaN(d.getTime()) && isWithinInterval(d, { start: week.start, end: week.end });
          });
      const statusAccum: Record<string, { total: number; count: number }> = {};
      const statusItemsMap: Record<string, WorkItem[]> = {};
      [...completed, ...wipItems].forEach(item => {
        if (!item.timeInStatusDays) return;
        Object.entries(item.timeInStatusDays as Record<string, number>).forEach(([status, days]) => {
          if (!statusAccum[status]) { statusAccum[status] = { total: 0, count: 0 }; statusItemsMap[status] = []; }
          statusAccum[status].total += days;
          statusAccum[status].count += 1;
          statusItemsMap[status].push(item);
        });
      });
      const topStatuses = Object.entries(statusAccum)
        .map(([status, { total, count }]) => ({
          status,
          avg: Math.round((total / count) * 10) / 10,
        }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 3);

      // ── projeção (semana atual) ─────────────────────────────────────────
      let projectedThroughput: number | null = null;
      if (week.isCurrent && throughput > 0) {
        const elapsed = countWorkingDays(week.start, week.end);
        projectedThroughput = Math.round((throughput / elapsed) * 5);
      }

      return {
        ...week,
        throughput, avgCT, p85CT, avgLT,
        wip, impedimentos,
        typesSorted, criticalDone, reworkPct, reworkCount,
        topStatuses, projectedThroughput,
        completedItems: completed,
        wipItemsList,
        impedimentosList,
        criticalDoneItems,
        reworkItems,
        statusItemsMap,
      };
    });
  }, [teamItems, weeks]);

  // fallback CT = avg of past 3 weeks (for projection label)
  const fallbackCT = useMemo(() => {
    const vals = stats.slice(0, 3).map(s => s.avgCT).filter(v => v > 0);
    return vals.length
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      : null;
  }, [stats]);

  const currentWeek = stats[3];

  const chartData = stats.map(s => ({
    name: s.shortLabel,
    throughput: s.throughput,
    ct: s.avgCT || null,
    lt: s.avgLT || null,
    wip: s.wip,
  }));

  const [modalData, setModalData] = useState<ModalData | null>(null);
  const openModal = (title: string, items: WorkItem[]) => { if (items.length > 0) setModalData({ title, items }); };

  if (!effectiveTeam) {
    return (
      <div className="text-center p-10 text-ds-muted">
        Nenhum time encontrado nos dados.
      </div>
    );
  }

  const reworkColor = (pct: number) =>
    pct === 0 ? 'text-green-400' : pct <= 10 ? 'text-yellow-400' : 'text-red-400';

  const cwCls = 'bg-ds-green/5';

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <>
    <ItemListModal data={modalData} onClose={() => setModalData(null)} />
    <div className="space-y-6">

      {/* Header + seletor ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-ds-light-text">📅 Evolução do Time</h2>
          <p className="text-ds-muted text-xs mt-0.5">
            Resumo semanal simplificado · últimas 3 semanas completas + semana atual em andamento
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          <div className="flex items-center gap-2">
            <label className="text-ds-text text-sm font-semibold">👥 Time:</label>
            <select
              value={effectiveTeam}
              onChange={e => { setSelectedTeam(e.target.value); setSelectedTypes([]); }}
              className="bg-ds-navy border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green"
            >
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {allTypes.length > 0 && (
            <TypeDropdown
              allTypes={allTypes}
              selectedTypes={selectedTypes}
              onToggle={toggleType}
              onClear={() => setSelectedTypes([])}
            />
          )}
        </div>
      </div>

      {/* Tabela principal ───────────────────────────────────────────────── */}
      <div className="bg-ds-navy rounded-lg border border-ds-border overflow-hidden">
        <div className="px-4 py-3 border-b border-ds-border">
          <span className="text-ds-light-text font-bold text-sm">{effectiveTeam}</span>
          <span className="text-ds-muted text-xs ml-3">
            {currentWeek.throughput} iten{currentWeek.throughput !== 1 ? 's' : ''} concluído{currentWeek.throughput !== 1 ? 's' : ''} esta semana
            {currentWeek.projectedThroughput !== null && (
              <span className="text-ds-green ml-2">· projeção: ~{currentWeek.projectedThroughput} até sexta</span>
            )}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ds-border text-ds-text">
                <th className="text-left px-4 py-3 font-semibold w-52">Métrica</th>
                {stats.map((s, i) => (
                  <th key={i} className={`text-center px-4 py-3 font-semibold ${s.isCurrent ? `${cwCls} text-ds-green` : ''}`}>
                    {s.isCurrent && <span className="mr-1">📍</span>}
                    <span className="text-xs">{s.label}</span>
                  </th>
                ))}
                <th className="text-center px-4 py-3 font-semibold text-ds-muted min-w-[7rem]">
                  <div className="text-xs">🔮 Projeção</div>
                  <div className="text-[10px] text-ds-muted/70">fim da semana</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-border/30">

              {/* Throughput */}
              <tr className="hover:bg-ds-dark-blue/40">
                <td className="px-4 py-3">
                  <div className="text-ds-light-text font-medium">✅ Throughput</div>
                  <div className="text-ds-muted text-xs">itens concluídos</div>
                </td>
                {stats.map((s, i) => {
                  const prev = i > 0 ? stats[i - 1].throughput : null;
                  return (
                    <td key={i} className={`text-center px-4 py-3 ${s.isCurrent ? cwCls : ''} ${s.throughput > 0 ? 'cursor-pointer hover:bg-ds-green/10' : ''}`}
                      onClick={() => s.throughput > 0 && openModal(`✅ Throughput — ${s.label}`, s.completedItems)}>
                      <span className="text-ds-light-text font-bold text-2xl">{s.throughput}</span>
                      {prev !== null && <TrendIcon curr={s.throughput} prev={prev} higherIsBetter />}
                    </td>
                  );
                })}
                <td className="text-center px-4 py-3">
                  {currentWeek.projectedThroughput !== null
                    ? <span className="text-ds-green font-bold text-2xl">~{currentWeek.projectedThroughput}</span>
                    : <span className="text-ds-muted">—</span>}
                </td>
              </tr>

              {/* Cycle Time médio */}
              <tr className="hover:bg-ds-dark-blue/40">
                <td className="px-4 py-3">
                  <div className="text-ds-light-text font-medium">⏱️ Cycle Time médio</div>
                  <div className="text-ds-muted text-xs">dias por item entregue</div>
                </td>
                {stats.map((s, i) => {
                  const prev = i > 0 ? stats[i - 1].avgCT : null;
                  return (
                    <td key={i} className={`text-center px-4 py-3 ${s.isCurrent ? cwCls : ''} ${s.avgCT > 0 ? 'cursor-pointer hover:bg-blue-500/5' : ''}`}
                      onClick={() => s.avgCT > 0 && openModal(`⏱️ Cycle Time — ${s.label}`, s.completedItems.filter(x => (Number(x.cycleTime) || 0) > 0))}>
                      {s.avgCT > 0
                        ? <><span className="text-ds-light-text font-bold text-2xl">{s.avgCT}</span><span className="text-ds-muted text-xs ml-0.5">d</span>
                            {prev !== null && prev > 0 && <TrendIcon curr={s.avgCT} prev={prev} higherIsBetter={false} />}</>
                        : <span className="text-ds-muted">—</span>}
                    </td>
                  );
                })}
                <td className="text-center px-4 py-3 text-ds-muted text-sm">
                  {currentWeek.avgCT > 0
                    ? <>{currentWeek.avgCT}<span className="text-xs ml-0.5">d</span></>
                    : fallbackCT
                      ? <span className="text-ds-muted text-xs">~{fallbackCT}d <span className="text-[10px]">(média 3 sem.)</span></span>
                      : '—'}
                </td>
              </tr>

              {/* P85 */}
              <tr className="hover:bg-ds-dark-blue/40">
                <td className="px-4 py-3">
                  <div className="text-ds-light-text font-medium">📊 P85 Cycle Time</div>
                  <div className="text-ds-muted text-xs">85% das entregas abaixo de</div>
                </td>
                {stats.map((s, i) => {
                  const prev = i > 0 ? stats[i - 1].p85CT : null;
                  return (
                    <td key={i} className={`text-center px-4 py-3 ${s.isCurrent ? cwCls : ''} ${s.p85CT > 0 ? 'cursor-pointer hover:bg-blue-500/5' : ''}`}
                      onClick={() => s.p85CT > 0 && openModal(`📊 P85 CT — ${s.label}`, s.completedItems.filter(x => (Number(x.cycleTime) || 0) > 0))}>
                      {s.p85CT > 0
                        ? <><span className="text-ds-light-text font-bold text-2xl">{s.p85CT}</span><span className="text-ds-muted text-xs ml-0.5">d</span>
                            {prev !== null && prev > 0 && <TrendIcon curr={s.p85CT} prev={prev} higherIsBetter={false} />}</>
                        : <span className="text-ds-muted">—</span>}
                    </td>
                  );
                })}
                <td className="text-center px-4 py-3 text-ds-muted text-sm">
                  {currentWeek.p85CT > 0 ? <>{currentWeek.p85CT}<span className="text-xs ml-0.5">d</span></> : '—'}
                </td>
              </tr>

              {/* Lead Time */}
              <tr className="hover:bg-ds-dark-blue/40">
                <td className="px-4 py-3">
                  <div className="text-ds-light-text font-medium">🏃 Lead Time médio</div>
                  <div className="text-ds-muted text-xs">do pedido até a entrega</div>
                </td>
                {stats.map((s, i) => {
                  const prev = i > 0 ? stats[i - 1].avgLT : null;
                  return (
                    <td key={i} className={`text-center px-4 py-3 ${s.isCurrent ? cwCls : ''} ${s.avgLT > 0 ? 'cursor-pointer hover:bg-yellow-500/5' : ''}`}
                      onClick={() => s.avgLT > 0 && openModal(`🏃 Lead Time — ${s.label}`, s.completedItems.filter(x => (Number(x.leadTime) || 0) > 0))}>
                      {s.avgLT > 0
                        ? <><span className="text-ds-light-text font-bold text-2xl">{s.avgLT}</span><span className="text-ds-muted text-xs ml-0.5">d</span>
                            {prev !== null && prev > 0 && <TrendIcon curr={s.avgLT} prev={prev} higherIsBetter={false} />}</>
                        : <span className="text-ds-muted">—</span>}
                    </td>
                  );
                })}
                <td className="text-center px-4 py-3 text-ds-muted text-sm">
                  {currentWeek.avgLT > 0 ? <>{currentWeek.avgLT}<span className="text-xs ml-0.5">d</span></> : '—'}
                </td>
              </tr>

              {/* WIP */}
              <tr className="hover:bg-ds-dark-blue/40">
                <td className="px-4 py-3">
                  <div className="text-ds-light-text font-medium">🔄 WIP</div>
                  <div className="text-ds-muted text-xs">itens em andamento</div>
                </td>
                {stats.map((s, i) => {
                  const prev = i > 0 ? stats[i - 1].wip : null;
                  return (
                    <td key={i} className={`text-center px-4 py-3 ${s.isCurrent ? cwCls : ''} ${s.wip > 0 ? 'cursor-pointer hover:bg-blue-500/5' : ''}`}
                      onClick={() => s.wip > 0 && openModal(`🔄 WIP — ${s.label}`, s.wipItemsList)}>
                      <span className="text-ds-light-text font-bold text-2xl">{s.wip}</span>
                      {prev !== null && <TrendIcon curr={s.wip} prev={prev} higherIsBetter={false} />}
                    </td>
                  );
                })}
                <td className="text-center px-4 py-3 text-ds-muted text-sm">
                  {currentWeek.wip} agora
                </td>
              </tr>

              {/* Impedimentos */}
              <tr className="hover:bg-ds-dark-blue/40">
                <td className="px-4 py-3">
                  <div className="text-ds-light-text font-medium">🚧 Impedimentos</div>
                  <div className="text-ds-muted text-xs">itens bloqueados</div>
                </td>
                {stats.map((s, i) => (
                  <td key={i} className={`text-center px-4 py-3 ${s.isCurrent ? cwCls : ''} ${s.impedimentos > 0 ? 'cursor-pointer hover:bg-red-500/5' : ''}`}
                    onClick={() => s.impedimentos > 0 && openModal(`🚧 Impedimentos — ${s.label}`, s.impedimentosList)}>
                    <span className={`font-bold text-2xl ${s.impedimentos > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {s.impedimentos}
                    </span>
                  </td>
                ))}
                <td className="text-center px-4 py-3">
                  <span className={`font-bold text-2xl ${currentWeek.impedimentos > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {currentWeek.impedimentos}
                  </span>
                </td>
              </tr>

              {/* Tipos entregues */}
              <tr className="hover:bg-ds-dark-blue/40">
                <td className="px-4 py-3">
                  <div className="text-ds-light-text font-medium">📦 Tipos entregues</div>
                  <div className="text-ds-muted text-xs">composição das entregas</div>
                </td>
                {stats.map((s, i) => (
                  <td key={i} className={`px-4 py-3 ${s.isCurrent ? cwCls : ''}`}>
                    {s.typesSorted.length > 0
                      ? <div className="flex flex-wrap gap-1 justify-center">
                          {s.typesSorted.map(([type, count]) => (
                            <span key={type} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium cursor-pointer hover:opacity-80 ${typeColor(type)}`}
                              onClick={() => openModal(`📦 ${type} — ${s.label}`, s.completedItems.filter(x => x.type === type))}>
                              {count} {type}
                            </span>
                          ))}
                        </div>
                      : <span className="text-ds-muted text-sm block text-center">—</span>}
                  </td>
                ))}
                <td className="px-4 py-3">
                  {currentWeek.typesSorted.length > 0
                    ? <div className="flex flex-wrap gap-1 justify-center">
                        {currentWeek.typesSorted.map(([type, count]) => (
                          <span key={type} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium cursor-pointer hover:opacity-80 ${typeColor(type)}`}
                            onClick={() => openModal(`📦 ${type} — ${currentWeek.label}`, currentWeek.completedItems.filter(x => x.type === type))}>
                            {count} {type}
                          </span>
                        ))}
                      </div>
                    : <span className="text-ds-muted text-sm block text-center">—</span>}
                </td>
              </tr>

              {/* P1/P2 resolvidos */}
              <tr className="hover:bg-ds-dark-blue/40">
                <td className="px-4 py-3">
                  <div className="text-ds-light-text font-medium">🎯 P1/P2 resolvidos</div>
                  <div className="text-ds-muted text-xs">itens críticos fechados</div>
                </td>
                {stats.map((s, i) => {
                  const prev = i > 0 ? stats[i - 1].criticalDone : null;
                  return (
                    <td key={i} className={`text-center px-4 py-3 ${s.isCurrent ? cwCls : ''} ${s.criticalDone > 0 ? 'cursor-pointer hover:bg-ds-green/10' : ''}`}
                      onClick={() => s.criticalDone > 0 && openModal(`🎯 P1/P2 — ${s.label}`, s.criticalDoneItems)}>
                      <span className={`font-bold text-2xl ${s.criticalDone > 0 ? 'text-ds-green' : 'text-ds-muted'}`}>
                        {s.criticalDone}
                      </span>
                      {prev !== null && <TrendIcon curr={s.criticalDone} prev={prev} higherIsBetter />}
                    </td>
                  );
                })}
                <td className="text-center px-4 py-3 text-ds-muted text-sm">—</td>
              </tr>

              {/* Retrabalho */}
              <tr className="hover:bg-ds-dark-blue/40">
                <td className="px-4 py-3">
                  <div className="text-ds-light-text font-medium">🔁 Retrabalho</div>
                  <div className="text-ds-muted text-xs">% de entregas com reincidência</div>
                </td>
                {stats.map((s, i) => {
                  const prev = i > 0 ? stats[i - 1].reworkPct : null;
                  return (
                    <td key={i} className={`text-center px-4 py-3 ${s.isCurrent ? cwCls : ''} ${s.reworkCount > 0 ? 'cursor-pointer hover:bg-red-500/5' : ''}`}
                      onClick={() => s.reworkCount > 0 && openModal(`🔁 Retrabalho — ${s.label}`, s.reworkItems)}>
                      {s.throughput > 0
                        ? <><span className={`font-bold text-2xl ${reworkColor(s.reworkPct)}`}>{s.reworkPct}%</span>
                            {prev !== null && <TrendIcon curr={s.reworkPct} prev={prev} higherIsBetter={false} />}</>
                        : <span className="text-ds-muted">—</span>}
                    </td>
                  );
                })}
                <td className="text-center px-4 py-3 text-ds-muted text-sm">—</td>
              </tr>

              {/* Maior gargalo */}
              <tr className="hover:bg-ds-dark-blue/40">
                <td className="px-4 py-3">
                  <div className="text-ds-light-text font-medium">🐢 Maior gargalo</div>
                  <div className="text-ds-muted text-xs">status com mais tempo parado</div>
                </td>
                {stats.map((s, i) => (
                  <td key={i} className={`text-center px-4 py-3 ${s.isCurrent ? cwCls : ''} ${s.topStatuses[0] ? 'cursor-pointer hover:bg-yellow-500/5' : ''}`}
                    onClick={() => s.topStatuses[0] && openModal(`🐢 Gargalo (${s.topStatuses[0].status}) — ${s.label}`, s.statusItemsMap[s.topStatuses[0].status] ?? [])}>
                    {s.topStatuses[0]
                      ? <div>
                          <div className="text-yellow-400 font-semibold text-xs leading-tight">{s.topStatuses[0].status}</div>
                          <div className="text-ds-muted text-xs">{s.topStatuses[0].avg}d méd.</div>
                        </div>
                      : <span className="text-ds-muted text-xs">—</span>}
                  </td>
                ))}
                <td className="text-center px-4 py-3">
                  {currentWeek.topStatuses[0]
                    ? <div>
                        <div className="text-yellow-400 font-semibold text-xs">{currentWeek.topStatuses[0].status}</div>
                        <div className="text-ds-muted text-xs">{currentWeek.topStatuses[0].avg}d</div>
                      </div>
                    : <span className="text-ds-muted text-xs">—</span>}
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </div>

      {/* Gráficos ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Throughput */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h4 className="text-ds-light-text font-semibold text-sm mb-3">✅ Throughput semanal</h4>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="name" stroke={C.text} tick={{ fontSize: 10 }} />
              <YAxis stroke={C.text} tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1a2744', border: '1px solid #2d3748', fontSize: 11 }}
                formatter={(v: number) => [`${v} itens`, 'Throughput']}
              />
              <Bar dataKey="throughput" radius={[4, 4, 0, 0]} cursor="pointer"
                onClick={(_: unknown, idx: number) => openModal(`✅ Throughput — ${stats[idx].label}`, stats[idx].completedItems)}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={i === chartData.length - 1 ? `${C.green}88` : C.green} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* CT + LT */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h4 className="text-ds-light-text font-semibold text-sm mb-3">⏱️ Cycle Time vs Lead Time (dias)</h4>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}
              onClick={(payload) => {
                if (!payload || payload.activeTooltipIndex === undefined) return;
                const weekStat = stats[payload.activeTooltipIndex];
                if (weekStat) openModal(`⏱️ CT/LT — ${weekStat.label}`, weekStat.completedItems);
              }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="name" stroke={C.text} tick={{ fontSize: 10 }} />
              <YAxis stroke={C.text} tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#1a2744', border: '1px solid #2d3748', fontSize: 11 }}
                formatter={(v: number, name: string) => [`${v} dias`, name === 'ct' ? 'Cycle Time' : 'Lead Time']}
              />
              <Legend
                formatter={(value) => value === 'ct' ? 'Cycle Time' : 'Lead Time'}
                wrapperStyle={{ fontSize: 10, color: C.text }}
              />
              <Bar dataKey="ct" name="ct" fill={`${C.blue}44`} radius={[3, 3, 0, 0]} cursor="pointer" legendType="none" />
              <Bar dataKey="lt" name="lt" fill={`${C.yellow}44`} radius={[3, 3, 0, 0]} cursor="pointer" legendType="none" />
              <Line type="monotone" dataKey="ct" name="ct" stroke={C.blue} strokeWidth={2} dot={{ r: 4 }} connectNulls />
              <Line type="monotone" dataKey="lt" name="lt" stroke={C.yellow} strokeWidth={2} dot={{ r: 4 }} connectNulls strokeDasharray="4 2" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* WIP */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h4 className="text-ds-light-text font-semibold text-sm mb-3">🔄 WIP semanal</h4>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="name" stroke={C.text} tick={{ fontSize: 10 }} />
              <YAxis stroke={C.text} tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1a2744', border: '1px solid #2d3748', fontSize: 11 }}
                formatter={(v: number) => [`${v} itens`, 'WIP']}
              />
              <Bar dataKey="wip" radius={[4, 4, 0, 0]} cursor="pointer"
                onClick={(_: unknown, idx: number) => openModal(`🔄 WIP — ${stats[idx].label}`, stats[idx].wipItemsList)}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={i === chartData.length - 1 ? `${C.blue}88` : C.blue} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cards de gargalo — semana atual ───────────────────────────────── */}
      {currentWeek.topStatuses.length > 0 && (
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h4 className="text-ds-light-text font-semibold text-sm mb-3">
            🐢 Onde os itens ficaram mais tempo parados — esta semana
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {currentWeek.topStatuses.map((s, i) => {
              const style = [
                { border: 'border-red-500/30', bg: 'bg-red-500/5', color: '#EF4444', badge: '🔴 1º lugar' },
                { border: 'border-yellow-500/30', bg: 'bg-yellow-500/5', color: '#F59E0B', badge: '🟡 2º lugar' },
                { border: 'border-blue-500/30', bg: 'bg-blue-500/5', color: '#60A5FA', badge: '🔵 3º lugar' },
              ][i];
              return (
                <button key={i} className={`p-4 rounded-lg border ${style.border} ${style.bg} text-left w-full cursor-pointer hover:opacity-90 transition-opacity`}
                  onClick={() => openModal(`🐢 ${s.status} — esta semana`, currentWeek.statusItemsMap[s.status] ?? [])}>
                  <div className="text-ds-muted text-xs mb-1">{style.badge}</div>
                  <div className="text-ds-light-text font-semibold">{s.status}</div>
                  <div className="font-bold text-3xl mt-1" style={{ color: style.color }}>{s.avg}d</div>
                  <div className="text-ds-muted text-xs mt-1">tempo médio neste status</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Rodapé ─────────────────────────────────────────────────────────── */}
      <div className="text-ds-muted text-xs bg-ds-navy/40 rounded-lg px-4 py-3 border border-ds-border/40 leading-relaxed">
        <span className="font-semibold text-ds-text">Como ler: </span>
        <strong className="text-ds-text">Cycle Time</strong> = dias entre início e entrega do item ·{' '}
        <strong className="text-ds-text">Lead Time</strong> = dias do pedido até a entrega (inclui fila) ·{' '}
        <strong className="text-ds-text">WIP</strong> de semanas passadas é aproximado via última movimentação (changedDate) ·{' '}
        <strong className="text-ds-text">Projeção</strong> = ritmo atual ÷ dias úteis decorridos × 5 dias úteis ·{' '}
        <strong className="text-ds-text">Retrabalho</strong> = itens com campo reincidência {'>'} 0 ·{' '}
        <strong className="text-ds-text">Gargalo</strong> calculado via tempo registrado em cada status (timeInStatusDays).
      </div>
    </div>
    </>
  );
};

export default TeamEvolutionDashboard;
