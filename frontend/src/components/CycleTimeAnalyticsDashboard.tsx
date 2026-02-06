import React, { useState, useMemo } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS, STATUS_COLORS } from '../constants';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell,
  ScatterChart, Scatter, ZAxis
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
    if (filteredItems.length === 0) return { avg: 0, median: 0, p85: 0, min: 0, max: 0, count: 0, avgLeadTime: 0 };
    
    const cycleTimes = filteredItems.map(i => i.cycleTime as number).sort((a, b) => a - b);
    const leadTimes = filteredItems.filter(i => i.leadTime != null).map(i => i.leadTime as number);
    
    const sum = cycleTimes.reduce((a, b) => a + b, 0);
    const avg = sum / cycleTimes.length;
    const median = cycleTimes.length % 2 === 0
      ? (cycleTimes[cycleTimes.length / 2 - 1] + cycleTimes[cycleTimes.length / 2]) / 2
      : cycleTimes[Math.floor(cycleTimes.length / 2)];
    const p85Index = Math.ceil(cycleTimes.length * 0.85) - 1;
    const p85 = cycleTimes[p85Index] || 0;
    const avgLeadTime = leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;

    return {
      avg: Math.round(avg * 10) / 10,
      median: Math.round(median * 10) / 10,
      p85: Math.round(p85 * 10) / 10,
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Itens Concluídos</p>
          <p className="text-2xl font-bold text-ds-light-text">{metrics.count}</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Cycle Time Médio</p>
          <p className="text-2xl font-bold text-ds-green">{metrics.avg} <span className="text-sm">dias</span></p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Mediana</p>
          <p className="text-2xl font-bold text-ds-light-text">{metrics.median} <span className="text-sm">dias</span></p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center relative group">
          <p className="text-ds-text text-xs flex items-center justify-center gap-1">
            Cycle Time P85
            <span className="cursor-help">ℹ️</span>
          </p>
          <p className="text-2xl font-bold text-yellow-400">{metrics.p85} <span className="text-sm">dias</span></p>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-ds-dark-blue border border-ds-border rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
            <p className="text-ds-light-text text-xs">
              <strong>O que é P85?</strong><br />
              Percentil 85: 85% dos itens são concluídos em até este tempo. 
              É uma métrica mais realista que a média, pois descarta outliers extremos. 
              Use para dar previsões de entrega com alta confiança.
            </p>
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
