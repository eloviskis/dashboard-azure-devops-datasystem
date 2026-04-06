import React, { useMemo } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import ChartInfoLamp from './ChartInfoLamp';
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts';

interface TeamPercentilesHistogramProps {
  data: WorkItem[];
  dateRange: { start: Date; end: Date };
}

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

const TeamPercentilesHistogram: React.FC<TeamPercentilesHistogramProps> = ({ data, dateRange }) => {
  const percentile = (arr: number[], p: number): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * (p / 100)) - 1;
    return sorted[Math.max(0, idx)] || 0;
  };

  const teamData = useMemo(() => {
    const teamMap: Record<string, number[]> = {};

    data.forEach(item => {
      if (!COMPLETED_STATES.includes(item.state)) return;
      if (!item.closedDate || item.cycleTime == null) return;
      const team = item.team || 'Sem Time';

      const closedDate = new Date(item.closedDate);
      if (closedDate < dateRange.start || closedDate > dateRange.end) return;

      if (!teamMap[team]) teamMap[team] = [];
      teamMap[team].push(item.cycleTime as number);
    });

    return Object.entries(teamMap)
      .filter(([_, times]) => times.length >= 3)
      .map(([team, times]) => ({
        team,
        p50: Math.round(percentile(times, 50) * 10) / 10,
        p85: Math.round(percentile(times, 85) * 10) / 10,
        p95: Math.round(percentile(times, 95) * 10) / 10,
        count: times.length,
      }))
      .sort((a, b) => a.p85 - b.p85);
  }, [data, dateRange]);

  if (teamData.length === 0) {
    return (
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-2">📊 Histograma de Percentis: P50, P85 e P95 por Time</h3>
        <p className="text-ds-text text-center py-8">Sem dados suficientes (mínimo 3 itens por time).</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 shadow-lg">
        <p className="text-ds-light-text font-bold mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          <p className="text-cyan-400"><strong>P50 - Mediana:</strong> {d.p50} dias</p>
          <p className="text-yellow-400"><strong>P85:</strong> {d.p85} dias</p>
          <p className="text-red-400"><strong>P95:</strong> {d.p95} dias</p>
          <p className="text-ds-text"><strong>Itens:</strong> {d.count}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-ds-light-text font-bold text-lg mb-1">📊 Histograma de Percentis: P50, P85 e P95 por Time</h3>
          <ChartInfoLamp info="Comparação dos percentis P50 (mediana), P85 e P95 de Cycle Time por time. P85 é a métrica recomendada para SLAs. Times com mínimo de 3 itens." />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={teamData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="team"
            stroke={CHART_COLORS.text}
            tick={{ fontSize: 10 }}
            angle={-35}
            textAnchor="end"
            height={80}
            interval={0}
          />
          <YAxis
            stroke={CHART_COLORS.text}
            tick={{ fontSize: 11 }}
            label={{ value: 'Dias', angle: -90, position: 'insideLeft', style: { fill: CHART_COLORS.text } }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '10px' }} />
          <Bar dataKey="p50" name="P50 - Mediana (50%)" fill="#47C5FB" radius={[4, 4, 0, 0]} />
          <Bar dataKey="p85" name="P85 (85%)" fill="#FFB86C" radius={[4, 4, 0, 0]} />
          <Bar dataKey="p95" name="P95 (95%)" fill="#F56565" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Summary table below chart */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="text-ds-light-text border-b border-ds-border">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2 text-right">P50 (dias)</th>
              <th className="px-3 py-2 text-right">P85 (dias)</th>
              <th className="px-3 py-2 text-right">P95 (dias)</th>
              <th className="px-3 py-2 text-right">Itens</th>
            </tr>
          </thead>
          <tbody className="text-ds-text">
            {teamData.map((row, idx) => (
              <tr key={idx} className="border-b border-ds-border/50 hover:bg-ds-bg/50">
                <td className="px-3 py-2 font-medium text-ds-light-text">{row.team}</td>
                <td className="px-3 py-2 text-right text-cyan-400">{row.p50}</td>
                <td className="px-3 py-2 text-right text-yellow-400 font-semibold">{row.p85}</td>
                <td className="px-3 py-2 text-right text-red-400">{row.p95}</td>
                <td className="px-3 py-2 text-right">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TeamPercentilesHistogram;
