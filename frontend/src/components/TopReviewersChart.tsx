
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
// import { PullRequest } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';

interface TopReviewersChartProps {
  data: any[]; // PullRequest[];
}

const TopReviewersChart: React.FC<TopReviewersChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const reviewerCounts = data.reduce((acc: Record<string, number>, pr) => {
      pr.reviewers.forEach((reviewer:any) => {
        acc[reviewer.name] = (acc[reviewer.name] || 0) + 1;
      });
      return acc;
    }, {});

    return Object.entries(reviewerCounts)
      .map(([name, reviews]) => ({ name, reviews }))
      .sort((a, b) => (b.reviews as number) - (a.reviews as number))
      .slice(0, 10);
  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum dado de revisor de PR para exibir." />;
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
        <Bar dataKey="reviews" name="Revisões de PR" fill={CHART_COLORS.secondary} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TopReviewersChart;
