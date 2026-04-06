import React, { useState, useMemo } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import ChartInfoLamp from './ChartInfoLamp';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine
} from 'recharts';
import { eachMonthOfInterval, endOfMonth, isWithinInterval, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PercentilP85ChartProps {
  data: WorkItem[];
  dateRange: { start: Date; end: Date };
}

const PercentilP85Chart: React.FC<PercentilP85ChartProps> = ({ data, dateRange }) => {
  const [excludeBugFeatureTask, setExcludeBugFeatureTask] = useState(true);
  const [chartMode, setChartMode] = useState<'line' | 'bar'>('line');

  const percentile = (arr: number[], p: number): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * (p / 100)) - 1;
    return sorted[Math.max(0, idx)] || 0;
  };

  const mean = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };

  const monthlyData = useMemo(() => {
    // Bundle original filtrava apenas state === "Closed" (não todos os COMPLETED_STATES)
    const completed = data.filter(item =>
      item.state === 'Closed' &&
      item.cycleTime !== null &&
      item.cycleTime !== undefined
    );

    const filtered = excludeBugFeatureTask
      ? completed.filter(item => !['Bug', 'Feature', 'Task'].includes(item.type))
      : completed;

    try {
      return eachMonthOfInterval({ start: dateRange.start, end: dateRange.end }).map(monthStart => {
        const monthEnd = endOfMonth(monthStart);
        const cycleTimes = filtered
          .filter(item => {
            const closed = new Date(item.closedDate!);
            return isWithinInterval(closed, { start: monthStart, end: monthEnd });
          })
          .map(item => item.cycleTime as number);

        if (cycleTimes.length === 0) {
          return {
            label: format(monthStart, 'MMM/yy', { locale: ptBR }),
            p85: null,
            mean: null,
            p50: null,
            p75: null,
            p90: null,
            p95: null,
            count: 0,
          };
        }

        return {
          label: format(monthStart, 'MMM/yy', { locale: ptBR }),
          p85: Math.round(percentile(cycleTimes, 85) * 10) / 10,
          mean: Math.round(mean(cycleTimes) * 10) / 10,
          p50: Math.round(percentile(cycleTimes, 50) * 10) / 10,
          p75: Math.round(percentile(cycleTimes, 75) * 10) / 10,
          p90: Math.round(percentile(cycleTimes, 90) * 10) / 10,
          p95: Math.round(percentile(cycleTimes, 95) * 10) / 10,
          count: cycleTimes.length,
        };
      }).filter(d => d.count > 0);
    } catch {
      return [];
    }
  }, [data, dateRange, excludeBugFeatureTask]);

  const summary = useMemo(() => {
    const withData = monthlyData.filter(d => d.p85 !== null);
    if (withData.length === 0) return { avgP85: 0, avgMean: 0 };
    const avgP85 = withData.reduce((s, d) => s + (d.p85 || 0), 0) / withData.length;
    const avgMean = withData.reduce((s, d) => s + (d.mean || 0), 0) / withData.length;
    return {
      avgP85: Math.round(avgP85 * 10) / 10,
      avgMean: Math.round(avgMean * 10) / 10,
    };
  }, [monthlyData]);

  if (monthlyData.length === 0) {
    return (
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-2">📊 Percentil 85 do Cycle Time</h3>
        <p className="text-ds-text text-center py-8">Sem dados suficientes para o período selecionado.</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 shadow-lg">
        <p className="text-ds-light-text font-bold mb-2">{d.label}</p>
        <div className="space-y-1 text-sm">
          <p className="text-yellow-400"><strong>P85:</strong> {d.p85}d</p>
          <p className="text-ds-green"><strong>Média:</strong> {d.mean}d</p>
          <p className="text-cyan-400"><strong>P50:</strong> {d.p50}d</p>
          <p className="text-ds-text"><strong>Itens:</strong> {d.count}</p>
        </div>
        <div className="mt-2 pt-2 border-t border-ds-border text-xs text-ds-text">
          {d.p85 < d.mean
            ? <p>✅ P85 menor que média (bom!)</p>
            : <p>⚠️ P85 maior que média</p>
          }
        </div>
      </div>
    );
  };

  return (
    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3">
        <div>
          <h3 className="text-ds-light-text font-bold text-lg mb-1">📊 Percentil 85 do Cycle Time</h3>
          <ChartInfoLamp info="P85 = 85% dos itens foram concluídos neste tempo ou menos. Métrica usada pela GetNaves e recomendada para SLAs (mais realista que média)." />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeBugFeatureTask}
              onChange={e => setExcludeBugFeatureTask(e.target.checked)}
              className="w-4 h-4 accent-ds-green"
            />
            <span className="text-sm text-ds-text">
              Excluir Bug/Feature/Task
              {excludeBugFeatureTask && <span className="ml-1 text-ds-green">✔</span>}
            </span>
          </label>
          <div className="flex bg-ds-bg rounded-lg p-1 gap-1">
            <button
              onClick={() => setChartMode('line')}
              className={`px-3 py-1 rounded text-xs transition-colors ${chartMode === 'line' ? 'bg-ds-green text-ds-dark-blue font-semibold' : 'text-ds-text hover:text-ds-light-text'}`}
            >
              Linha
            </button>
            <button
              onClick={() => setChartMode('bar')}
              className={`px-3 py-1 rounded text-xs transition-colors ${chartMode === 'bar' ? 'bg-ds-green text-ds-dark-blue font-semibold' : 'text-ds-text hover:text-ds-light-text'}`}
            >
              Barras
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-ds-bg p-3 rounded-lg border border-ds-border">
          <p className="text-ds-text text-xs mb-1">P85 Médio</p>
          <p className="text-2xl font-bold text-yellow-400">{summary.avgP85}d</p>
        </div>
        <div className="bg-ds-bg p-3 rounded-lg border border-ds-border">
          <p className="text-ds-text text-xs mb-1">Média Geral</p>
          <p className="text-2xl font-bold text-ds-green">{summary.avgMean}d</p>
        </div>
        <div className="bg-ds-bg p-3 rounded-lg border border-ds-border">
          <p className="text-ds-text text-xs mb-1">Diferença</p>
          <p className="text-2xl font-bold text-cyan-400">{Math.abs(summary.avgP85 - summary.avgMean).toFixed(1)}d</p>
        </div>
        <div className="bg-ds-bg p-3 rounded-lg border border-ds-border">
          <p className="text-ds-text text-xs mb-1">Total Períodos</p>
          <p className="text-2xl font-bold text-ds-light-text">{monthlyData.length}</p>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={350}>
        {chartMode === 'line' ? (
          <LineChart data={monthlyData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="label" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
            <YAxis stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />
            <ReferenceLine
              y={summary.avgP85}
              stroke="#FFB86C"
              strokeDasharray="5 5"
              label={{ value: `P85 médio: ${summary.avgP85}d`, position: 'insideTopRight', fill: '#FFB86C', fontSize: 10 }}
            />
            <Line type="monotone" dataKey="p85" name="P85" stroke="#FFB86C" strokeWidth={3} dot={{ fill: '#FFB86C', r: 5 }} activeDot={{ r: 7 }} />
            <Line type="monotone" dataKey="mean" name="Média" stroke="#64FFDA" strokeWidth={2} dot={{ fill: '#64FFDA', r: 4 }} strokeDasharray="5 5" />
            <Line type="monotone" dataKey="p50" name="P50" stroke="#47C5FB" strokeWidth={1.5} dot={{ fill: '#47C5FB', r: 3 }} strokeDasharray="3 3" />
          </LineChart>
        ) : (
          <BarChart data={monthlyData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="label" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
            <YAxis stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />
            <ReferenceLine
              y={summary.avgP85}
              stroke="#FFB86C"
              strokeDasharray="5 5"
              label={{ value: `P85 médio: ${summary.avgP85}d`, position: 'insideTopRight', fill: '#FFB86C', fontSize: 10 }}
            />
            <Bar dataKey="p85" name="P85" fill="#FFB86C" radius={[4, 4, 0, 0]} />
            <Bar dataKey="mean" name="Média" fill="#64FFDA" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>

      {/* "Por que P85?" section */}
      <div className="mt-4 p-3 bg-ds-bg rounded-lg border border-ds-border">
        <p className="text-xs text-ds-text mb-2">
          <strong className="text-ds-light-text">💡 Por que P85?</strong>
        </p>
        <ul className="text-xs text-ds-text space-y-1 ml-4">
          <li>✅ Mais realista que a média (não afetado por outliers extremos)</li>
          <li>✅ Usado pela GetNaves e outras ferramentas de analytics</li>
          <li>✅ Ideal para definir SLAs: "85% dos itens entregues em até X dias"</li>
          <li>✅ <strong>Excluir Bugs melhora precisão em 58.3%</strong> (validado vs GetNaves)</li>
        </ul>
      </div>

      {/* Detailed Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="text-ds-light-text border-b border-ds-border">
            <tr>
              <th className="px-3 py-2">Período</th>
              <th className="px-3 py-2 text-right">P85</th>
              <th className="px-3 py-2 text-right">Média</th>
              <th className="px-3 py-2 text-right">P50</th>
              <th className="px-3 py-2 text-right">P75</th>
              <th className="px-3 py-2 text-right">P90</th>
              <th className="px-3 py-2 text-right">P95</th>
              <th className="px-3 py-2 text-right">Itens</th>
            </tr>
          </thead>
          <tbody className="text-ds-text">
            {monthlyData.map((row, idx) => (
              <tr key={idx} className="border-b border-ds-border/50 hover:bg-ds-bg/50">
                <td className="px-3 py-2 font-medium">{row.label}</td>
                <td className="px-3 py-2 text-right text-yellow-400 font-semibold">{row.p85}d</td>
                <td className="px-3 py-2 text-right text-ds-green">{row.mean}d</td>
                <td className="px-3 py-2 text-right text-cyan-400">{row.p50}d</td>
                <td className="px-3 py-2 text-right">{row.p75}d</td>
                <td className="px-3 py-2 text-right">{row.p90}d</td>
                <td className="px-3 py-2 text-right text-red-400">{row.p95}d</td>
                <td className="px-3 py-2 text-right">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PercentilP85Chart;
