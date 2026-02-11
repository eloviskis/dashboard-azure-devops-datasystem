import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, ReferenceLine } from 'recharts';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';

interface StoryPointsVsCycleTimeProps {
  data: WorkItem[];
}

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

const StoryPointsVsCycleTimeChart: React.FC<StoryPointsVsCycleTimeProps> = ({ data }) => {
  const analysis = useMemo(() => {
    const items = data.filter(i =>
      COMPLETED_STATES.includes(i.state) &&
      i.cycleTime != null && i.cycleTime > 0 &&
      i.storyPoints != null && i.storyPoints > 0
    );

    if (items.length < 5) return null;

    const scatterData = items.map(i => ({
      sp: i.storyPoints as number,
      ct: i.cycleTime as number,
      title: i.title,
      team: i.team,
      type: i.type,
    }));

    // Média de CT por SP
    const spGroups: Record<number, number[]> = {};
    items.forEach(i => {
      const sp = i.storyPoints as number;
      if (!spGroups[sp]) spGroups[sp] = [];
      spGroups[sp].push(i.cycleTime as number);
    });

    const avgBySP = Object.entries(spGroups)
      .map(([sp, cts]) => ({
        sp: Number(sp),
        avgCT: Math.round((cts.reduce((a, b) => a + b, 0) / cts.length) * 10) / 10,
        count: cts.length,
      }))
      .sort((a, b) => a.sp - b.sp);

    // Correlação (Pearson)
    const n = items.length;
    const sumX = items.reduce((s, i) => s + (i.storyPoints as number), 0);
    const sumY = items.reduce((s, i) => s + (i.cycleTime as number), 0);
    const sumXY = items.reduce((s, i) => s + (i.storyPoints as number) * (i.cycleTime as number), 0);
    const sumX2 = items.reduce((s, i) => s + (i.storyPoints as number) ** 2, 0);
    const sumY2 = items.reduce((s, i) => s + (i.cycleTime as number) ** 2, 0);
    const correlation = (n * sumXY - sumX * sumY) / Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));

    return { scatterData, avgBySP, correlation: isNaN(correlation) ? 0 : Math.round(correlation * 100) / 100, total: items.length };
  }, [data]);

  if (!analysis) {
    return (
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center text-ds-text py-8">
        Sem dados suficientes (são necessários itens concluídos com Story Points e Cycle Time).
      </div>
    );
  }

  const correlationLabel = Math.abs(analysis.correlation) > 0.7 ? 'Forte' : Math.abs(analysis.correlation) > 0.3 ? 'Moderada' : 'Fraca';
  const correlationColor = Math.abs(analysis.correlation) > 0.7 ? 'text-green-400' : Math.abs(analysis.correlation) > 0.3 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Correlação SP × CT</p>
          <p className={`text-2xl font-bold ${correlationColor}`}>{analysis.correlation}</p>
          <p className="text-ds-text text-xs">{correlationLabel}</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Itens Analisados</p>
          <p className="text-2xl font-bold text-ds-light-text">{analysis.total}</p>
        </div>
        <div className="text-xs text-ds-text max-w-sm">
          <p>Correlação próxima de <strong className="text-green-400">1</strong> = estimativas calibradas (mais SP = mais tempo).</p>
          <p>Correlação próxima de <strong className="text-red-400">0</strong> = estimativas não refletem a realidade.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scatter */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">Story Points × Cycle Time</h3>
          <ResponsiveContainer width="100%" height={350}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="sp" name="Story Points" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} label={{ value: 'Story Points', position: 'insideBottom', offset: -5, style: { fill: CHART_COLORS.text, fontSize: 11 } }} />
              <YAxis dataKey="ct" name="Cycle Time" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} label={{ value: 'Cycle Time (dias)', angle: -90, position: 'insideLeft', style: { fill: CHART_COLORS.text, fontSize: 11 } }} />
              <Tooltip
                contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }}
                formatter={(value: any, name: string) => {
                  if (name === 'sp') return [`${value} SP`, 'Story Points'];
                  if (name === 'ct') return [`${value} dias`, 'Cycle Time'];
                  return [value, name];
                }}
                labelFormatter={() => ''}
              />
              <Scatter name="Itens" data={analysis.scatterData} fill="#64FFDA" fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Média de CT por SP */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">CT Médio por Story Points</h3>
          <div className="space-y-2">
            {analysis.avgBySP.map(row => (
              <div key={row.sp} className="flex items-center gap-3 p-2 bg-ds-bg rounded">
                <span className="text-ds-green font-bold text-lg w-10 text-center">{row.sp}</span>
                <span className="text-ds-text text-xs">SP</span>
                <div className="flex-1 bg-ds-navy rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-ds-green rounded-full transition-all"
                    style={{ width: `${Math.min((row.avgCT / (analysis.avgBySP[analysis.avgBySP.length - 1]?.avgCT || 1)) * 100, 100)}%` }}
                  />
                </div>
                <div className="text-right min-w-[80px]">
                  <span className="text-ds-light-text font-bold">{row.avgCT}d</span>
                  <span className="text-ds-text text-xs ml-1">({row.count})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoryPointsVsCycleTimeChart;
