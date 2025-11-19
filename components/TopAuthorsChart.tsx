
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PullRequest } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';

interface TopAuthorsChartProps {
  data: PullRequest[];
}

const TopAuthorsChart: React.FC<TopAuthorsChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const authorCounts = data.reduce((acc: Record<string, number>, pr) => {
      acc[pr.author] = (acc[pr.author] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(authorCounts)
      .map(([name, prs]) => ({ name, prs }))
      // Fix: Cast 'prs' property to number to allow sorting, as it's inferred as 'unknown'.
      .sort((a, b) => (b.prs as number) - (a.prs as number))
      .slice(0, 10);
  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum dado de autor de PR para exibir." />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis type="number" stroke={CHART_COLORS.text} />
        <YAxis type="category" dataKey="name" stroke={CHART_COLORS.text} width={80} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        <Bar dataKey="prs" name="Pull Requests" fill={CHART_COLORS.primary} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TopAuthorsChart;