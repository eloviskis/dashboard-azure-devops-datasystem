import React, { useState, useMemo } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS, STATUS_COLORS } from '../constants';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell,
  ScatterChart, Scatter, ZAxis, ReferenceLine
} from 'recharts';
import { format, subWeeks, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachWeekOfInterval, eachMonthOfInterval, differenceInDays, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CycleTimeAnalyticsDashboardProps {
  data: WorkItem[];
}

type PeriodType = 'weekly' | 'biweekly' | 'monthly' | 'specific-month' | 'custom';

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

const CycleTimeAnalyticsDashboard: React.FC<CycleTimeAnalyticsDashboardProps> = ({ data }) => {
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const teams = useMemo(() => {
    return [...new Set(data.map(i => i.team).filter(Boolean) as string[])].sort();
  }, [data]);

  const lastMonths = useMemo(() => {
    const months: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = subMonths(now, i);
      const val = format(d, 'yyyy-MM');
      const label = format(d, 'MMMM yyyy', { locale: ptBR });
      months.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return months;
  }, []);

  // Filter completed items
  const completedItems = useMemo(() => {
    return data.filter(item => {
      if (!COMPLETED_STATES.includes(item.state)) return false;
      if (!item.closedDate) return false;
      if (selectedTeam !== 'all' && item.team !== selectedTeam) return false;
      if (item.cycleTime === null || item.cycleTime === undefined) return false;
      return true;
    });
  }, [data, selectedTeam]);

  // Get date range based on period
  const dateRange = useMemo(() => {
    const now = new Date();
    if (periodType === 'specific-month' && selectedMonth) {
      const [year, month] = selectedMonth.split('-').map(Number);
      const start = startOfMonth(new Date(year, month - 1));
      const end = endOfMonth(new Date(year, month - 1));
      return { start, end };
    }
    if (periodType === 'custom' && customStart && customEnd) {
      return { start: new Date(customStart), end: new Date(customEnd) };
    }
    if (periodType === 'weekly') return { start: subWeeks(now, 12), end: now };
    if (periodType === 'biweekly') return { start: subMonths(now, 6), end: now };
    return { start: subMonths(now, 12), end: now };
  }, [periodType, selectedMonth, customStart, customEnd]);

  // Filter by date range
  const filteredItems = useMemo(() => {
    return completedItems.filter(item => {
      const closedDate = new Date(item.closedDate!);
      return isWithinInterval(closedDate, { start: dateRange.start, end: dateRange.end });
    });
  }, [completedItems, dateRange]);

  // Calculate metrics
  const metrics = useMemo(() => {
    if (filteredItems.length === 0) return { avg: 0, median: 0, p50: 0, p85: 0, p95: 0, min: 0, max: 0, count: 0, avgLeadTime: 0 };
    
    const cycleTimes = filteredItems.map(i => i.cycleTime as number).sort((a, b) => a - b);
    const leadTimes = filteredItems.filter(i => i.leadTime != null).map(i => i.leadTime as number);
    
    const sum = cycleTimes.reduce((a, b) => a + b, 0);
    const avg = sum / cycleTimes.length;
    const median = cycleTimes.length % 2 === 0
      ? (cycleTimes[cycleTimes.length / 2 - 1] + cycleTimes[cycleTimes.length / 2]) / 2
      : cycleTimes[Math.floor(cycleTimes.length / 2)];
    const p50Index = Math.ceil(cycleTimes.length * 0.50) - 1;
    const p50 = cycleTimes[Math.max(0, p50Index)] || 0;
    const p85Index = Math.ceil(cycleTimes.length * 0.85) - 1;
    const p85 = cycleTimes[p85Index] || 0;
    const p95Index = Math.ceil(cycleTimes.length * 0.95) - 1;
    const p95 = cycleTimes[p95Index] || 0;
    const avgLeadTime = leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;

    return {
      avg: Math.round(avg * 10) / 10,
      median: Math.round(median * 10) / 10,
      p50: Math.round(p50 * 10) / 10,
      p85: Math.round(p85 * 10) / 10,
      p95: Math.round(p95 * 10) / 10,
      min: cycleTimes[0],
      max: cycleTimes[cycleTimes.length - 1],
      count: cycleTimes.length,
      avgLeadTime: Math.round(avgLeadTime * 10) / 10
    };
  }, [filteredItems]);

  // Trend data
  const trendData = useMemo(() => {
    if (filteredItems.length === 0) return [];

    const getWeeks = () => {
      try {
        const weeks = eachWeekOfInterval({ start: dateRange.start, end: dateRange.end }, { weekStartsOn: 1 });
        return weeks.map((weekStart) => {
          const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
          const itemsInWeek = filteredItems.filter(i => {
            const d = new Date(i.closedDate!);
            return isWithinInterval(d, { start: weekStart, end: weekEnd });
          });
          const cycleTimes = itemsInWeek.filter(i => i.cycleTime != null).map(i => i.cycleTime as number);
          const leadTimes = itemsInWeek.filter(i => i.leadTime != null).map(i => i.leadTime as number);
          return {
            label: format(weekStart, 'dd/MM'),
            cycleTime: cycleTimes.length > 0 ? Math.round((cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) * 10) / 10 : null,
            leadTime: leadTimes.length > 0 ? Math.round((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) * 10) / 10 : null,
            count: itemsInWeek.length,
          };
        });
      } catch { return []; }
    };

    const getMonths = () => {
      try {
        const months = eachMonthOfInterval({ start: dateRange.start, end: dateRange.end });
        return months.map((monthStart) => {
          const monthEnd = endOfMonth(monthStart);
          const itemsInMonth = filteredItems.filter(i => {
            const d = new Date(i.closedDate!);
            return isWithinInterval(d, { start: monthStart, end: monthEnd });
          });
          const cycleTimes = itemsInMonth.filter(i => i.cycleTime != null).map(i => i.cycleTime as number);
          const leadTimes = itemsInMonth.filter(i => i.leadTime != null).map(i => i.leadTime as number);
          return {
            label: format(monthStart, 'MMM/yy', { locale: ptBR }),
            cycleTime: cycleTimes.length > 0 ? Math.round((cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) * 10) / 10 : null,
            leadTime: leadTimes.length > 0 ? Math.round((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) * 10) / 10 : null,
            count: itemsInMonth.length,
          };
        });
      } catch { return []; }
    };

    if (periodType === 'monthly') return getMonths();
    return getWeeks();
  }, [filteredItems, dateRange, periodType]);

  // Team ranking
  const teamRanking = useMemo(() => {
    const teamMap: Record<string, number[]> = {};
    const allCompleted = data.filter(i => COMPLETED_STATES.includes(i.state) && i.closedDate && i.cycleTime != null);
    
    allCompleted.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!teamMap[team]) teamMap[team] = [];
      const closedDate = new Date(item.closedDate!);
      if (isWithinInterval(closedDate, { start: dateRange.start, end: dateRange.end })) {
        teamMap[team].push(item.cycleTime as number);
      }
    });

    return Object.entries(teamMap)
      .filter(([_, times]) => times.length >= 3)
      .map(([team, times]) => {
        const sorted = [...times].sort((a, b) => a - b);
        const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        const median = sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
        const p85Index = Math.ceil(sorted.length * 0.85) - 1;
        return {
          team,
          avg: Math.round(avg * 10) / 10,
          median: Math.round(median * 10) / 10,
          p85: Math.round((sorted[p85Index] || 0) * 10) / 10,
          count: sorted.length
        };
      })
      .sort((a, b) => a.avg - b.avg);
  }, [data, dateRange]);

  // Flow analysis
  const flowAnalysis = useMemo(() => {
    if (filteredItems.length < 5) return null;
    
    const insights: { icon: string; text: string; type: 'good' | 'warning' | 'bad' }[] = [];
    
    if (metrics.avg <= 5) {
      insights.push({ icon: '🚀', text: 'Cycle Time excelente! O fluxo está muito rápido.', type: 'good' });
    } else if (metrics.avg <= 15) {
      insights.push({ icon: '✅', text: 'Cycle Time saudável. O fluxo está dentro do esperado.', type: 'good' });
    } else if (metrics.avg <= 30) {
      insights.push({ icon: '⚠️', text: 'Cycle Time elevado. Considere investigar gargalos.', type: 'warning' });
    } else {
      insights.push({ icon: '🔴', text: 'Cycle Time muito alto! Há impedimentos ou gargalos significativos.', type: 'bad' });
    }

    const variance = metrics.p85 / (metrics.avg || 1);
    if (variance > 2) {
      insights.push({ icon: '📊', text: `P85 é ${variance.toFixed(1)}x a média — há itens outlier levando muito mais tempo.`, type: 'warning' });
    } else {
      insights.push({ icon: '📊', text: 'Distribuição estável: P85 próximo da média, pouca variabilidade.', type: 'good' });
    }

    if (metrics.avgLeadTime > 0 && (metrics.avgLeadTime - metrics.avg) > metrics.avg * 0.5) {
      insights.push({ icon: '⏳', text: `Lead Time é ${Math.round(metrics.avgLeadTime - metrics.avg)} dias maior que Cycle Time — itens ficam parados no backlog.`, type: 'warning' });
    } else if (metrics.avgLeadTime > 0) {
      insights.push({ icon: '✅', text: 'Lead Time próximo do Cycle Time — pouco tempo de espera no backlog.', type: 'good' });
    }

    return insights;
  }, [filteredItems, metrics]);

  return (
    <div className="space-y-6">
      {/* Period Selection */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="text-ds-text text-sm mb-1 block">Período:</label>
            <div className="flex gap-1">
              {[
                { value: 'weekly', label: 'Últ. 12 Semanas' },
                { value: 'biweekly', label: 'Últ. 12 Quinzenas' },
                { value: 'monthly', label: 'Últ. 12 Meses' },
                { value: 'specific-month', label: 'Mês Específico' },
                { value: 'custom', label: 'Personalizado' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPeriodType(opt.value as PeriodType)}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${periodType === opt.value ? 'bg-ds-green text-ds-dark-blue' : 'bg-ds-muted/20 text-ds-text hover:bg-ds-muted/40'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          
          {periodType === 'specific-month' && (
            <div>
              <label className="text-ds-text text-sm mb-1 block">Mês:</label>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2"
              >
                <option value="">Selecione...</option>
                {lastMonths.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          {periodType === 'custom' && (
            <div className="flex gap-2 items-end">
              <div>
                <label className="text-ds-text text-sm mb-1 block">De:</label>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                  className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2" />
              </div>
              <div>
                <label className="text-ds-text text-sm mb-1 block">Até:</label>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                  className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2" />
              </div>
            </div>
          )}

          <div>
            <label className="text-ds-text text-sm mb-1 block">Time:</label>
            <select
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2"
            >
              <option value="all">Todos os Times</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {(periodType === 'specific-month' || periodType === 'custom') && (
            <div className="flex items-end h-full">
              <span className="text-ds-green text-xs">📅 {format(dateRange.start, 'dd/MM/yyyy')} a {format(dateRange.end, 'dd/MM/yyyy')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Itens Concluídos</p>
          <p className="text-2xl font-bold text-ds-light-text">{metrics.count}</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">CT Médio</p>
          <p className="text-2xl font-bold text-ds-green">{metrics.avg} <span className="text-sm">dias</span></p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Mediana</p>
          <p className="text-2xl font-bold text-ds-light-text">{metrics.median} <span className="text-sm">dias</span></p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center relative group">
          <p className="text-ds-text text-xs flex items-center justify-center gap-1">P50 <span className="cursor-help">ℹ️</span></p>
          <p className="text-2xl font-bold text-cyan-400">{metrics.p50} <span className="text-sm">dias</span></p>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-ds-dark-blue border border-ds-border rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
            <p className="text-ds-light-text text-xs"><strong>P50:</strong> 50% dos itens são concluídos em até este tempo.</p>
          </div>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center relative group">
          <p className="text-ds-text text-xs flex items-center justify-center gap-1">
            P85
            <span className="cursor-help">ℹ️</span>
          </p>
          <p className="text-2xl font-bold text-yellow-400">{metrics.p85} <span className="text-sm">dias</span></p>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-ds-dark-blue border border-ds-border rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
            <p className="text-ds-light-text text-xs">
              <strong>P85:</strong> 85% dos itens são concluídos em até este tempo. É uma métrica mais realista que a média.
            </p>
          </div>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center relative group">
          <p className="text-ds-text text-xs flex items-center justify-center gap-1">P95 <span className="cursor-help">ℹ️</span></p>
          <p className="text-2xl font-bold text-red-400">{metrics.p95} <span className="text-sm">dias</span></p>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-ds-dark-blue border border-ds-border rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
            <p className="text-ds-light-text text-xs"><strong>P95:</strong> 95% dos itens são concluídos em até este tempo. Use para compromissos de SLA.</p>
          </div>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Lead Time Médio</p>
          <p className="text-2xl font-bold text-blue-400">{metrics.avgLeadTime} <span className="text-sm">dias</span></p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Min / Max</p>
          <p className="text-2xl font-bold text-ds-light-text">{metrics.min} / {metrics.max}</p>
        </div>
      </div>

      {/* Flow Analysis */}
      {flowAnalysis && (
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-3">🔍 Análise do Fluxo</h3>
          <div className="space-y-2">
            {flowAnalysis.map((insight, i) => (
              <div key={i} className={`p-3 rounded-lg text-sm ${insight.type === 'good' ? 'bg-green-900/20 text-green-300' : insight.type === 'warning' ? 'bg-yellow-900/20 text-yellow-300' : 'bg-red-900/20 text-red-300'}`}>
                {insight.icon} {insight.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="lg:col-span-2 bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">
            Tendência: Cycle Time vs Lead Time
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="label" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
              <YAxis stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
              <Legend />
              <Line type="monotone" dataKey="cycleTime" name="Cycle Time (dias)" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="leadTime" name="Lead Time (dias)" stroke="#60A5FA" strokeWidth={2} dot={{ r: 4 }} />
              <ReferenceLine y={metrics.p85} stroke="#FFB86C" strokeDasharray="5 5" label={{ value: `SLA P85: ${metrics.p85}d`, position: 'insideTopRight', fill: '#FFB86C', fontSize: 11 }} />
              <ReferenceLine y={metrics.p95} stroke="#F56565" strokeDasharray="5 5" label={{ value: `P95: ${metrics.p95}d`, position: 'insideBottomRight', fill: '#F56565', fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Team Ranking */}
        <div className="lg:col-span-2 bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">🏆 Ranking de Times por Cycle Time</h3>
          {teamRanking.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-ds-text">
                <thead className="text-xs text-ds-light-text uppercase bg-ds-navy/50">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">CT Médio (dias)</th>
                    <th className="px-4 py-3">Mediana (dias)</th>
                    <th className="px-4 py-3">P85 (dias)</th>
                    <th className="px-4 py-3">Itens</th>
                    <th className="px-4 py-3">Velocidade</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRanking.map((row, idx) => (
                    <tr key={row.team} className="border-b border-ds-border hover:bg-ds-muted/20">
                      <td className="px-4 py-3 font-bold text-ds-green">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`}</td>
                      <td className="px-4 py-3 font-medium text-ds-light-text">{row.team}</td>
                      <td className="px-4 py-3">{row.avg}</td>
                      <td className="px-4 py-3">{row.median}</td>
                      <td className="px-4 py-3">{row.p85}</td>
                      <td className="px-4 py-3">{row.count}</td>
                      <td className="px-4 py-3">
                        {row.avg <= 5 ? '🚀 Excelente' : row.avg <= 15 ? '✅ Bom' : row.avg <= 30 ? '⚠️ Atenção' : '🔴 Crítico'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-ds-text text-center py-8">Nenhum time com dados suficientes no período selecionado.</p>
          )}
        </div>
      </div>

      {/* Scatter Plot */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">Scatter Plot: Cycle Time por Item</h3>
        <ResponsiveContainer width="100%" height={350}>
          <ScatterChart margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="index" name="Item" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
            <YAxis dataKey="cycleTime" name="Cycle Time" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }}
              formatter={(value: any, name: string) => [name === 'cycleTime' ? `${value} dias` : value, name === 'cycleTime' ? 'Cycle Time' : name]} />
            <Scatter name="Itens" data={filteredItems.map((item, idx) => ({ index: idx + 1, cycleTime: item.cycleTime, title: item.title }))} fill="#64FFDA" />
            <ReferenceLine y={metrics.p50} stroke="#47C5FB" strokeDasharray="5 5" label={{ value: `P50: ${metrics.p50}d`, position: 'insideRight', fill: '#47C5FB', fontSize: 10 }} />
            <ReferenceLine y={metrics.p85} stroke="#FFB86C" strokeDasharray="5 5" label={{ value: `P85: ${metrics.p85}d`, position: 'insideRight', fill: '#FFB86C', fontSize: 10 }} />
            <ReferenceLine y={metrics.p95} stroke="#F56565" strokeDasharray="5 5" label={{ value: `P95: ${metrics.p95}d`, position: 'insideRight', fill: '#F56565', fontSize: 10 }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Cycle Time por Tipo de Item (#11) */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">📊 Cycle Time por Tipo de Item</h3>
        {(() => {
          const typeMap: Record<string, number[]> = {};
          filteredItems.forEach(item => {
            const t = item.type || 'Outros';
            if (!typeMap[t]) typeMap[t] = [];
            typeMap[t].push(item.cycleTime as number);
          });
          const typeData = Object.entries(typeMap).map(([type, times]) => {
            const sorted = [...times].sort((a, b) => a - b);
            const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
            const p85Idx = Math.ceil(sorted.length * 0.85) - 1;
            return { type, avg: Math.round(avg * 10) / 10, p85: Math.round((sorted[p85Idx] || 0) * 10) / 10, count: sorted.length };
          }).sort((a, b) => b.avg - a.avg);
          const typeColors: Record<string, string> = { 'Bug': '#f56565', 'Issue': '#f6e05e', 'Product Backlog Item': '#64FFDA', 'Task': '#47C5FB', 'User Story': '#B794F4', 'Feature': '#FBB6CE', 'Eventuality': '#ED8936' };
          return typeData.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={typeData} layout="vertical" margin={{ left: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                  <XAxis type="number" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="type" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} width={110} />
                  <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} formatter={(v: any) => [`${v} dias`]} />
                  <Legend />
                  <Bar dataKey="avg" name="CT Médio (dias)" fill="#64FFDA" radius={[0, 4, 4, 0]}>
                    {typeData.map((entry) => (
                      <Cell key={entry.type} fill={typeColors[entry.type] || '#64FFDA'} />
                    ))}
                  </Bar>
                  <Bar dataKey="p85" name="P85 (dias)" fill="#FFB86C" radius={[0, 4, 4, 0]} fillOpacity={0.6} />
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                {typeData.map(t => (
                  <div key={t.type} className="p-2 bg-ds-bg rounded text-xs text-center">
                    <span className="text-ds-text">{t.type}</span>
                    <p className="text-ds-light-text font-bold">{t.avg}d avg | {t.p85}d P85</p>
                    <p className="text-ds-text">{t.count} itens</p>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-ds-text text-center py-4">Sem dados suficientes.</p>;
        })()}
      </div>

      {/* Top Outliers (#12) */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">🐌 Top 15 Outliers de Cycle Time</h3>
        {(() => {
          const outliers = [...filteredItems]
            .filter(i => i.cycleTime != null)
            .sort((a, b) => (b.cycleTime as number) - (a.cycleTime as number))
            .slice(0, 15);
          return outliers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-ds-text">
                <thead className="text-xs text-ds-light-text uppercase bg-ds-navy/50">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Título</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">CT (dias)</th>
                    <th className="px-3 py-2">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {outliers.map((item, idx) => (
                    <tr key={item.workItemId} className="border-b border-ds-border hover:bg-ds-muted/20">
                      <td className="px-3 py-2 font-bold text-ds-green">{idx + 1}</td>
                      <td className="px-3 py-2">{item.workItemId}</td>
                      <td className="px-3 py-2 text-ds-light-text max-w-xs truncate">{item.title}</td>
                      <td className="px-3 py-2">{item.type}</td>
                      <td className="px-3 py-2">{item.team}</td>
                      <td className="px-3 py-2 font-bold text-red-400">{item.cycleTime}</td>
                      <td className="px-3 py-2">
                        {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-ds-green hover:underline text-xs">Abrir ↗</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-ds-text text-center py-4">Sem outliers identificados.</p>;
        })()}
      </div>

      {/* Educational info */}
      <div className="bg-ds-navy/50 p-4 rounded-lg border border-ds-border/50">
        <h4 className="text-ds-light-text font-semibold mb-2">📚 Glossário</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-ds-text">
          <p><strong className="text-ds-green">Cycle Time:</strong> Tempo entre o início do trabalho e a conclusão.</p>
          <p><strong className="text-blue-400">Lead Time:</strong> Tempo total desde a criação do item até a conclusão.</p>
          <p><strong className="text-yellow-400">P85:</strong> 85% dos itens foram entregues em até este tempo.</p>
          <p><strong className="text-ds-light-text">Mediana:</strong> Valor central — metade entrega antes, metade depois.</p>
        </div>
      </div>
    </div>
  );
};

export default CycleTimeAnalyticsDashboard;
