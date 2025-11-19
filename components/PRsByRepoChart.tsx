
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PullRequest } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';

interface PRsByRepoChartProps {
  data: PullRequest[];
}

const PRsByRepoChart: React.FC<PRsByRepoChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const repoCounts = data.reduce((acc: Record<string, number>, pr) => {
      acc[pr.repository] = (acc[pr.repository] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(repoCounts)
      .map(([name, count]) => ({ name, count }))
      // Fix: Cast 'count' property to number to allow sorting, as it's inferred as 'unknown'.
      .sort((a, b) => (b.count as number) - (a.count as number));
  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum dado de PR por repositório para exibir." />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="name" stroke={CHART_COLORS.text} />
        <YAxis stroke={CHART_COLORS.text} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        <Bar dataKey="count" name="Pull Requests" fill={CHART_COLORS.primary} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default PRsByRepoChart;