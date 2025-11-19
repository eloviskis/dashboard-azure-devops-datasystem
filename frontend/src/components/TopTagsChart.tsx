
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';

interface TopTagsChartProps {
  data: WorkItem[];
}

const TopTagsChart: React.FC<TopTagsChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const tagCounts = data.flatMap(item => item.tags).reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(tagCounts)
      .map(([name, value]) => ({ name, value }))
      // Fix: Cast 'value' property to number to allow sorting, as it's inferred as 'unknown'.
      .sort((a, b) => (b.value as number) - (a.value as number))
      .slice(0, 10);
  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhuma tag encontrada nos itens de trabalho." />;
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis type="number" stroke={CHART_COLORS.text} allowDecimals={false} />
        <YAxis type="category" dataKey="name" stroke={CHART_COLORS.text} width={100} fontSize={12} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
          formatter={(value: number) => [value, 'Ocorrências']}
        />
        <Bar dataKey="value" name="Ocorrências" fill={CHART_COLORS.primary} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TopTagsChart;
