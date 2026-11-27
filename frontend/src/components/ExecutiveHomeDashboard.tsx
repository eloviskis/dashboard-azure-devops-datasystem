import React, { useMemo, useState } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import ChartInfoLamp from './ChartInfoLamp';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { format, subDays, subMonths, eachWeekOfInterval, endOfWeek, eachMonthOfInterval, endOfMonth, eachYearOfInterval, endOfYear, isWithinInterval, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { computeTopBottlenecksByTeam } from '../utils/bottleneckTop.ts';
import { EmptyState } from './ChartStates.tsx';

interface Props { data: WorkItem[]; }

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-ds-navy border border-ds-border rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 rounded-t-lg flex justify-between items-center" style={{ backgroundColor: data.color }}>
          <h2 className="text-white font-bold text-lg">{data.title}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl font-bold leading-none">×</button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <div className="text-ds-text mb-3 text-sm">
            Total: <span className="font-bold text-white">{data.items.length}</span> itens
          </div>
          {data.items.length === 0 ? (
            <div className="text-ds-text text-center py-8">Nenhum item encontrado</div>
          ) : (
            <ul className="space-y-2">
              {data.items.map((item, idx) => (
                <li key={item.workItemId || idx} className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 hover:border-ds-green transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono px-2 py-1 rounded shrink-0 text-white" style={{ backgroundColor: data.color }}>
                      #{item.workItemId}
                    </span>
                    <div className="flex-1 min-w-0">
                      <a href={item.url || `${AZURE_DEVOPS_BASE_URL}/${item.workItemId}`} target="_blank" rel="noopener noreferrer" className="text-white hover:text-ds-green font-medium block truncate mb-1" title={item.title}>
                        {item.title}
                      </a>
                      <div className="grid grid-cols-2 gap-1 text-xs text-ds-text">
                        <div>👤 {item.assignedTo || 'Não atribuído'}</div>
                        <div>👥 {item.team || 'Sem time'}</div>
                        <div>🏷️ {item.type}</div>
                        <div>📊 {item.state}</div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-4 border-t border-ds-border">
          <button onClick={onClose} className="w-full bg-ds-border hover:bg-ds-green text-white py-2 px-4 rounded-lg transition-colors">Fechar</button>
        </div>
      </div>
    </div>
  );
};
const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
const IN_PROGRESS_STATES = ['Active', 'Ativo', 'Em Progresso', 'Para Desenvolver', 'Aguardando Code Review', 'Fazendo Code Review', 'Aguardando QA', 'Testando QA'];

const TEAM_COLORS = ['#64FFDA', '#47C5FB', '#F6E05E', '#B794F4', '#F56565', '#ED8936', '#68D391', '#FC8181', '#63B3ED', '#D6BCFA'];

type ThroughputGroupMode = 'weekly' | 'biweekly' | 'monthly' | 'yearly';

const ExecutiveHomeDashboard: React.FC<Props> = ({ data }) => {
  const [throughputGroupMode, setThroughputGroupMode] = useState<ThroughputGroupMode>('weekly');
  const [modalData, setModalData] = useState<ModalData | null>(null);

  // Todos os status de gargalo por time (média de dias por item concluído; pós-entrega fora)
  const bottleneckAll = useMemo(() => computeTopBottlenecksByTeam(data, Number.MAX_SAFE_INTEGER), [data]);

  // Status observados no período, do que mais pesa pro que menos pesa. A cor de cada status é fixa por
  // esta ordem, então não muda quando o filtro esconde outros status.
  const gargaloStatuses = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of bottleneckAll) for (const s of t.top) totals.set(s.status, (totals.get(s.status) || 0) + s.avgDays);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [bottleneckAll]);
  const gargaloColor = (status: string) => CHART_COLORS.palette[gargaloStatuses.indexOf(status) % CHART_COLORS.palette.length];

  // Filtro: guarda só os status ESCONDIDOS. Vazio = todos aparecem, e status novos entram sozinhos.
  const [hiddenGargaloStatuses, setHiddenGargaloStatuses] = useState<Set<string>>(new Set());
  const visibleGargaloStatuses = useMemo(
    () => gargaloStatuses.filter(s => !hiddenGargaloStatuses.has(s)),
    [gargaloStatuses, hiddenGargaloStatuses]
  );
  const toggleGargaloStatus = (status: string) => setHiddenGargaloStatuses(prev => {
    const next = new Set(prev);
    if (next.has(status)) next.delete(status); else next.add(status);
    return next;
  });

  // Times observados nos gargalos, em ordem alfabética (lista do filtro).
  const gargaloTeams = useMemo(
    () => [...new Set(bottleneckAll.map(t => t.team))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [bottleneckAll]
  );
  // Filtro de time: guarda só os times ESCONDIDOS. Vazio = todos aparecem, time novo entra sozinho.
  const [hiddenGargaloTeams, setHiddenGargaloTeams] = useState<Set<string>>(new Set());
  const toggleGargaloTeam = (team: string) => setHiddenGargaloTeams(prev => {
    const next = new Set(prev);
    if (next.has(team)) next.delete(team); else next.add(team);
    return next;
  });

  // Uma linha por time com a média de cada status visível; times ordenados pelo total visível
  const gargaloChartData = useMemo(() => bottleneckAll
    .filter(t => !hiddenGargaloTeams.has(t.team))
    .map(t => {
      const row: Record<string, any> = { team: t.team, count: t.count, items: t.items, total: 0 };
      for (const s of t.top) {
        if (hiddenGargaloStatuses.has(s.status)) continue;
        row[s.status] = s.avgDays;
        row.total += s.avgDays;
      }
      return row;
    })
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total),
  [bottleneckAll, hiddenGargaloStatuses, hiddenGargaloTeams]);

  // Clique num segmento: itens concluídos do time que de fato passaram pelo status clicado
  const openGargaloModal = (d: any, status: string) => {
    const row = d.payload ?? d;
    const items = ((row.items || []) as WorkItem[]).filter(i => (i.timeInStatusDays?.[status] || 0) > 0);
    setModalData({ title: `Gargalo "${status}" — ${row.team}`, items, color: gargaloColor(status) });
  };

  const GargaloTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const rows = visibleGargaloStatuses
      .filter(s => (d[s] || 0) > 0)
      .map(s => ({ s, days: d[s] as number }))
      .sort((a, b) => b.days - a.days);
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-title">{d.team}</p>
        {rows.map(r => (
          <p key={r.s} style={{ color: gargaloColor(r.s) }}>{r.s}: <strong>{r.days} dias/item</strong></p>
        ))}
        <p className="chart-tooltip-subtle">{d.count} itens concluídos no período — clique num segmento para ver os itens</p>
      </div>
    );
  };

  // Health Score per team
  const teamHealth = useMemo(() => {
    const teams: Record<string, WorkItem[]> = {};
    data.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!teams[team]) teams[team] = [];
      teams[team].push(item);
    });

    return Object.entries(teams).map(([team, items]) => {
      const completed = items.filter(i => COMPLETED_STATES.includes(i.state));
      const inProg = items.filter(i => IN_PROGRESS_STATES.includes(i.state));
      const bugs = items.filter(i => i.type === 'Bug');
      const withCT = completed.filter(i => i.cycleTime != null);
      const avgCT = withCT.length > 0 ? withCT.reduce((s, i) => s + (i.cycleTime as number), 0) / withCT.length : 0;
      const throughput = completed.length;
      const wip = inProg.length;
      const bugRate = items.length > 0 ? (bugs.length / items.length) * 100 : 0;
      const completionRate = items.length > 0 ? (completed.length / items.length) * 100 : 0;

      // Health score: throughput (25%) + low CT (25%) + low bug rate (25%) + completion rate (25%)
      const ctScore = avgCT <= 3 ? 100 : avgCT <= 7 ? 80 : avgCT <= 14 ? 50 : 20;
      const bugScore = bugRate <= 5 ? 100 : bugRate <= 15 ? 70 : bugRate <= 30 ? 40 : 10;
      const completionScore = completionRate >= 80 ? 100 : completionRate >= 60 ? 70 : completionRate >= 40 ? 40 : 10;
      const throughputScore = throughput >= 20 ? 100 : throughput >= 10 ? 70 : throughput >= 5 ? 40 : 10;
      const healthScore = Math.round((ctScore + bugScore + completionScore + throughputScore) / 4);

      return {
        team,
        throughput,
        wip,
        avgCT: Math.round(avgCT * 10) / 10,
        bugRate: Math.round(bugRate * 10) / 10,
        completionRate: Math.round(completionRate * 10) / 10,
        healthScore,
        total: items.length,
        items,
      };
    }).sort((a, b) => b.healthScore - a.healthScore);
  }, [data]);

  // Overall KPIs
  const kpis = useMemo(() => {
    const total = data.length;
    const completedItems = data.filter(i => COMPLETED_STATES.includes(i.state));
    const wipItems = data.filter(i => IN_PROGRESS_STATES.includes(i.state));
    const bugItems = data.filter(i => i.type === 'Bug');
    const withCT = data.filter(i => COMPLETED_STATES.includes(i.state) && i.cycleTime != null);
    const avgCT = withCT.length > 0 ? withCT.reduce((s, i) => s + (i.cycleTime as number), 0) / withCT.length : 0;
    const teams = new Set(data.map(i => i.team)).size;
    return {
      total, completed: completedItems.length, wip: wipItems.length, bugs: bugItems.length,
      completedItems, wipItems, bugItems, ctItems: withCT,
      avgCT: Math.round(avgCT * 10) / 10,
      completionRate: total > 0 ? Math.round((completedItems.length / total) * 1000) / 10 : 0,
      bugRate: total > 0 ? Math.round((bugItems.length / total) * 1000) / 10 : 0,
      teams,
    };
  }, [data]);

  // Throughput trend (configurable period)
  const throughputTrend = useMemo(() => {
    const now = new Date();
    
    if (throughputGroupMode === 'weekly') {
      const start = subDays(now, 56);
      const weeks = eachWeekOfInterval({ start, end: now }, { weekStartsOn: 1 });
      return weeks.map(weekStart => {
        const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        const completedInWeek = data.filter(item => {
          if (!COMPLETED_STATES.includes(item.state)) return false;
          const closed = item.closedDate ? new Date(item.closedDate as string) : null;
          return closed && closed >= weekStart && closed <= wEnd;
        });
        return { period: format(weekStart, 'dd/MM', { locale: ptBR }), throughput: completedInWeek.length, items: completedInWeek };
      });
    }

    if (throughputGroupMode === 'biweekly') {
      const start = subMonths(now, 6);
      const periods: { start: Date; end: Date }[] = [];
      let cursor = new Date(start);
      while (cursor < now) {
        const periodEnd = addDays(cursor, 13);
        periods.push({ start: new Date(cursor), end: periodEnd > now ? now : periodEnd });
        cursor = addDays(cursor, 14);
      }
      return periods.map(({ start, end }) => {
        const completedInPeriod = data.filter(item => {
          if (!COMPLETED_STATES.includes(item.state)) return false;
          const closed = item.closedDate ? new Date(item.closedDate as string) : null;
          return closed && isWithinInterval(closed, { start, end });
        });
        return { period: `${format(start, 'dd/MM')}-${format(end, 'dd/MM')}`, throughput: completedInPeriod.length, items: completedInPeriod };
      });
    }

    if (throughputGroupMode === 'monthly') {
      const start = subMonths(now, 12);
      const months = eachMonthOfInterval({ start, end: now });
      return months.map(monthStart => {
        const monthEnd = endOfMonth(monthStart);
        const completedInMonth = data.filter(item => {
          if (!COMPLETED_STATES.includes(item.state)) return false;
          const closed = item.closedDate ? new Date(item.closedDate as string) : null;
          return closed && isWithinInterval(closed, { start: monthStart, end: monthEnd });
        });
        return { period: format(monthStart, 'MMM/yy', { locale: ptBR }), throughput: completedInMonth.length, items: completedInMonth };
      });
    }

    // yearly
    const start = subMonths(now, 36);
    try {
      const years = eachYearOfInterval({ start, end: now });
      return years.map(yearStart => {
        const yearEnd = endOfYear(yearStart);
        const completedInYear = data.filter(item => {
          if (!COMPLETED_STATES.includes(item.state)) return false;
          const closed = item.closedDate ? new Date(item.closedDate as string) : null;
          return closed && isWithinInterval(closed, { start: yearStart, end: yearEnd });
        });
        return { period: format(yearStart, 'yyyy'), throughput: completedInYear.length, items: completedInYear };
      });
    } catch { return []; }
  }, [data, throughputGroupMode]);

  // Type distribution
  const typeDistribution = useMemo(() => {
    const map: Record<string, WorkItem[]> = {};
    data.forEach(item => { if (!map[item.type]) map[item.type] = []; map[item.type].push(item); });
    const colors: Record<string, string> = {
      'Product Backlog Item': '#64FFDA', Bug: '#F56565', Task: '#47C5FB',
      'User Story': '#B794F4', Feature: '#F6E05E', Eventuality: '#ED8936', Issue: '#FC8181',
    };
    return Object.entries(map).map(([type, items]) => ({ type, count: items.length, color: colors[type] || '#8892B0', items })).sort((a, b) => b.count - a.count);
  }, [data]);

  // Radar data for top 5 teams
  const radarData = useMemo(() => {
    const top5 = teamHealth.slice(0, 5);
    const metrics = ['Health Score', 'Throughput', 'Cycle Time', 'Bug Rate', 'Completion %'];
    return metrics.map(metric => {
      const entry: Record<string, any> = { metric };
      top5.forEach(t => {
        if (metric === 'Health Score') entry[t.team] = t.healthScore;
        else if (metric === 'Throughput') entry[t.team] = Math.min(t.throughput, 100);
        else if (metric === 'Cycle Time') entry[t.team] = Math.max(0, 100 - t.avgCT * 5);
        else if (metric === 'Bug Rate') entry[t.team] = Math.max(0, 100 - t.bugRate * 2);
        else if (metric === 'Completion %') entry[t.team] = t.completionRate;
      });
      return entry;
    });
  }, [teamHealth]);

  const top5Teams = teamHealth.slice(0, 5);

  return (
    <div className="space-y-6">
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
      {/* Executive KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {[
          { label: 'Total de Itens', value: kpis.total, color: 'text-ds-light-text', items: data, modalColor: '#8892B0' },
          { label: 'Concluídos', value: kpis.completed, color: 'text-ds-green', items: kpis.completedItems, modalColor: '#64FFDA' },
          { label: 'Em Progresso', value: kpis.wip, color: 'text-blue-400', items: kpis.wipItems, modalColor: '#47C5FB' },
          { label: 'Bugs', value: kpis.bugs, color: 'text-red-400', items: kpis.bugItems, modalColor: '#F56565' },
          { label: 'Cycle Time', value: `${kpis.avgCT}d`, color: 'text-yellow-400', items: kpis.ctItems, modalColor: '#F6E05E' },
          { label: 'Conclusão', value: `${kpis.completionRate}%`, color: kpis.completionRate >= 60 ? 'text-green-400' : 'text-orange-400', items: kpis.completedItems, modalColor: '#64FFDA' },
          { label: 'Bug Rate', value: `${kpis.bugRate}%`, color: kpis.bugRate <= 15 ? 'text-green-400' : 'text-red-400', items: kpis.bugItems, modalColor: '#F56565' },
          { label: 'Times', value: kpis.teams, color: 'text-ds-light-text', items: null, modalColor: '#8892B0' },
        ].map((kpi, i) => (
          <div
            key={i}
            className={`bg-ds-navy p-3 rounded-lg border border-ds-border text-center ${kpi.items ? 'cursor-pointer hover:border-ds-green transition-colors' : ''}`}
            onClick={() => kpi.items && setModalData({ title: kpi.label, items: kpi.items, color: kpi.modalColor })}
          >
            <p className="text-ds-text text-xs">{kpi.label}</p>
            <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Throughput Trend */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">📈 Throughput
            {throughputGroupMode === 'weekly' && ' Semanal'}
            {throughputGroupMode === 'biweekly' && ' Quinzenal'}
            {throughputGroupMode === 'monthly' && ' Mensal'}
            {throughputGroupMode === 'yearly' && ' Anual'}
          </h3>
          <ChartInfoLamp info="Tendência de itens concluídos no período selecionado. Permite identificar aceleração ou desaceleração das entregas." />
          <div className="flex items-center gap-2 mb-4">
            {[
              { value: 'weekly' as ThroughputGroupMode, label: 'Semanal' },
              { value: 'biweekly' as ThroughputGroupMode, label: 'Quinzenal' },
              { value: 'monthly' as ThroughputGroupMode, label: 'Mensal' },
              { value: 'yearly' as ThroughputGroupMode, label: 'Anual' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setThroughputGroupMode(opt.value)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${throughputGroupMode === opt.value ? 'bg-ds-green text-ds-dark-blue' : 'bg-ds-muted/20 text-ds-text hover:bg-ds-muted/40'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart
              data={throughputTrend}
              className="cursor-pointer"
              onClick={(e: any) => {
                const p = e?.activePayload?.[0]?.payload;
                if (p?.items?.length) setModalData({ title: `Itens concluídos — ${p.period}`, items: p.items, color: '#64FFDA' });
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="period" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
              <YAxis stroke={CHART_COLORS.text} />
              <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
              <Line type="monotone" dataKey="throughput" name="Itens Concluídos" stroke="#64FFDA" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Type Distribution */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">📦 Distribuição por Tipo</h3>
          <ChartInfoLamp info="Distribuição dos work items por tipo (PBI, Bug, Issue, Task, etc.). Mostra o perfil das demandas do período. Clique numa fatia pra ver os itens." />
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={typeDistribution} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={90}
                cursor="pointer"
                onClick={(entry: any) => setModalData({ title: `Itens do tipo ${entry.type}`, items: entry.items, color: entry.color })}
                label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}>
                {typeDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Radar Chart - Top 5 Teams */}
      {top5Teams.length > 1 && (
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">🎯 Radar de Saúde − Top {top5Teams.length} Times</h3>
          <ChartInfoLamp info="Radar comparativo dos melhores times em 5 dimensões: Health Score, Throughput, Cycle Time, Bug Rate e Conclusão. Permite comparar forças e fraquezas." />
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={CHART_COLORS.grid} />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#CCD6F6', fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: '#8892B0', fontSize: 10 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
              <Legend />
              {top5Teams.map((team, i) => (
                <Radar key={team.team} name={team.team} dataKey={team.team} stroke={TEAM_COLORS[i]} fill={TEAM_COLORS[i]} fillOpacity={0.15} />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gargalos por time e status — todos os status, com filtro */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">⏳ Gargalos por time e status</h3>
        <ChartInfoLamp info="Por time, quanto tempo os itens concluídos no período ficaram em cada status — média de dias por item (soma dos dias no status ÷ total de itens concluídos do time). Filas de espera contam como gargalo; status pós-entrega (Finished, Closed, Resolved...) não entram. Use os botões para escolher quais status aparecem." />
        <div className="flex flex-wrap gap-2 mb-4">
          <details className="relative inline-block">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none px-3 py-1.5 rounded-md border border-ds-border text-xs text-ds-light-text hover:bg-ds-border/50 transition-colors">
              Status: {visibleGargaloStatuses.length} de {gargaloStatuses.length} ▾
            </summary>
            <div className="absolute z-20 mt-2 w-72 max-h-80 overflow-y-auto bg-ds-navy border border-ds-border rounded-lg shadow-xl p-3">
              <div className="flex gap-4 mb-2 pb-2 border-b border-ds-border text-xs">
                <button type="button" onClick={() => setHiddenGargaloStatuses(new Set())} className="text-ds-green hover:underline">Marcar todos</button>
                <button type="button" onClick={() => setHiddenGargaloStatuses(new Set(gargaloStatuses))} className="text-ds-text hover:underline">Desmarcar todos</button>
              </div>
              {gargaloStatuses.map(s => (
                <label key={s} className="flex items-center gap-2 py-1 text-xs text-ds-light-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!hiddenGargaloStatuses.has(s)}
                    onChange={() => toggleGargaloStatus(s)}
                    className="accent-ds-green w-4 h-4 shrink-0"
                  />
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: gargaloColor(s) }} />
                  <span className="truncate">{s}</span>
                </label>
              ))}
            </div>
          </details>
          <details className="relative inline-block">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none px-3 py-1.5 rounded-md border border-ds-border text-xs text-ds-light-text hover:bg-ds-border/50 transition-colors">
              Time: {gargaloTeams.length - hiddenGargaloTeams.size} de {gargaloTeams.length} ▾
            </summary>
            <div className="absolute z-20 mt-2 w-64 max-h-80 overflow-y-auto bg-ds-navy border border-ds-border rounded-lg shadow-xl p-3">
              <div className="flex gap-4 mb-2 pb-2 border-b border-ds-border text-xs">
                <button type="button" onClick={() => setHiddenGargaloTeams(new Set())} className="text-ds-green hover:underline">Marcar todos</button>
                <button type="button" onClick={() => setHiddenGargaloTeams(new Set(gargaloTeams))} className="text-ds-text hover:underline">Desmarcar todos</button>
              </div>
              {gargaloTeams.map(t => (
                <label key={t} className="flex items-center gap-2 py-1 text-xs text-ds-light-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!hiddenGargaloTeams.has(t)}
                    onChange={() => toggleGargaloTeam(t)}
                    className="accent-ds-green w-4 h-4 shrink-0"
                  />
                  <span className="truncate">{t}</span>
                </label>
              ))}
            </div>
          </details>
        </div>
        {visibleGargaloStatuses.length === 0 ? (
          <EmptyState message="Selecione pelo menos um status para ver os gargalos." />
        ) : gargaloTeams.length - hiddenGargaloTeams.size === 0 ? (
          <EmptyState message="Selecione pelo menos um time para ver os gargalos." />
        ) : gargaloChartData.length === 0 ? (
          <EmptyState message="Nenhum time com itens concluídos suficientes no período (mínimo de 3 por time)." />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(260, gargaloChartData.length * 40)}>
            <BarChart data={gargaloChartData} layout="vertical" margin={{ left: 110, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis type="number" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} unit=" d" />
              <YAxis type="category" dataKey="team" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} width={105} />
              <Tooltip content={<GargaloTooltip />} cursor={{ fill: 'rgba(100, 255, 218, 0.06)' }} />
              {visibleGargaloStatuses.map(s => (
                <Bar key={s} dataKey={s} name={s} stackId="g" fill={gargaloColor(s)} cursor="pointer" onClick={(d: any) => openGargaloModal(d, s)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Team Health Table */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">🏥 Health Score por Time</h3>
        <ChartInfoLamp info="Health Score é composto por 4 indicadores (25% cada): throughput, cycle time, bug rate e taxa de conclusão. Quanto maior, mais saudável o time." />
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-ds-text">
            <thead className="text-xs text-ds-light-text uppercase bg-ds-navy/50">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">Throughput</th>
                <th className="px-4 py-3">WIP</th>
                <th className="px-4 py-3">CT Médio</th>
                <th className="px-4 py-3">Bug Rate</th>
                <th className="px-4 py-3">Conclusão</th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {teamHealth.map((team, idx) => (
                <tr
                  key={idx}
                  className="border-b border-ds-border hover:bg-ds-muted/20 cursor-pointer"
                  onClick={() => setModalData({ title: `Itens do time ${team.team}`, items: team.items, color: '#64FFDA' })}
                >
                  <td className="px-4 py-3 font-medium text-ds-light-text">{team.team}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-ds-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${team.healthScore}%`,
                          backgroundColor: team.healthScore >= 70 ? '#64FFDA' : team.healthScore >= 45 ? '#F6E05E' : '#F56565',
                        }}></div>
                      </div>
                      <span className={`text-xs font-bold ${team.healthScore >= 70 ? 'text-green-400' : team.healthScore >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {team.healthScore}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ds-green font-semibold">{team.throughput}</td>
                  <td className="px-4 py-3">{team.wip}</td>
                  <td className="px-4 py-3">{team.avgCT}d</td>
                  <td className="px-4 py-3"><span className={team.bugRate <= 15 ? 'text-green-400' : 'text-red-400'}>{team.bugRate}%</span></td>
                  <td className="px-4 py-3"><span className={team.completionRate >= 60 ? 'text-green-400' : 'text-orange-400'}>{team.completionRate}%</span></td>
                  <td className="px-4 py-3">{team.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveHomeDashboard;
