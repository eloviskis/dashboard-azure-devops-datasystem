import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface ThroughputBreakdownChartProps {
  data: WorkItem[];
  groupBy: 'assignedTo' | 'type';
}

const ThroughputBreakdownChart: React.FC<ThroughputBreakdownChartProps> = ({ data, groupBy }) => {
  const chartData = useMemo(() => {
    const completed = data.filter(item => COMPLETED_STATES.includes(item.state) && item[groupBy]);

    const counts = completed.reduce((acc, item) => {
      const key = item[groupBy]!;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => (b.value as number) - (a.value as number))
      .slice(0, 10);
  }, [data, groupBy]);

  if (chartData.length === 0) {
    return <EmptyState message={`Nenhum item concluído para detalhar a vazão por ${groupBy === 'assignedTo' ? 'responsável' : 'tipo'}.`} />;
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis type="number" stroke={CHART_COLORS.text} />
        <YAxis type="category" dataKey="name" stroke={CHART_COLORS.text} width={100} fontSize={12} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
          labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
          itemStyle={{ color: '#e6f1ff' }}
          formatter={(value: number) => [value, 'Itens Concluídos']}
        />
        <Bar dataKey="value" name="Itens Concluídos" fill={groupBy === 'assignedTo' ? CHART_COLORS.primary : CHART_COLORS.secondary} label={{ position: 'top', fill: groupBy === 'assignedTo' ? CHART_COLORS.primary : CHART_COLORS.secondary, fontSize: 10, fontWeight: 'bold' }} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ThroughputBreakdownChart;
