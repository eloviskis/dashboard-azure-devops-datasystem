import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface IndividualPerformanceChartProps {
  data: WorkItem[];
}

const IndividualPerformanceChart: React.FC<IndividualPerformanceChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const performanceByAssignee = data
      .filter(item => COMPLETED_STATES.includes(item.state) && item.assignedTo)
      .reduce((acc: Record<string, number>, item) => {
        acc[item.assignedTo!] = (acc[item.assignedTo!] || 0) + 1;
        return acc;
      }, {});

    return Object.entries(performanceByAssignee)
      .map(([name, completed]) => ({ name, completed }))
      .sort((a, b) => (b.completed as number) - (a.completed as number))
      .slice(0, 10);
  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum dado de performance individual para exibir." />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis type="number" stroke={CHART_COLORS.text} />
        <YAxis type="category" dataKey="name" stroke={CHART_COLORS.text} width={80} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        <Bar dataKey="completed" name="Itens Concluídos" fill={CHART_COLORS.primary} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default IndividualPerformanceChart;
