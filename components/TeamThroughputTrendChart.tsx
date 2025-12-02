

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem, WorkItemStatus } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
// Fix: Import date-fns functions from their respective submodules for v2 compatibility and remove unused imports.
import { getWeek, getYear } from 'date-fns';

interface TeamThroughputTrendChartProps {
  data: WorkItem[];
  period: number;
}

const TeamThroughputTrendChart: React.FC<TeamThroughputTrendChartProps> = ({ data, period }) => {
  const { chartData, squads } = useMemo(() => {
    const completedItems = data.filter(item => item.status === WorkItemStatus.Concluido && item.closedDate);
    const squads = [...new Set(completedItems.map(item => item.squad))].sort();

    if (completedItems.length === 0) {
      return { chartData: [], squads: [] };
    }

    const throughputByWeek = completedItems.reduce((acc, item) => {
      const weekKey = `${getYear(item.closedDate!)}-W${getWeek(item.closedDate!, { weekStartsOn: 1 }).toString().padStart(2, '0')}`;
      if (!acc[weekKey]) {
        acc[weekKey] = {};
      }
      acc[weekKey][item.squad] = (acc[weekKey][item.squad] || 0) + 1;
      return acc;
    }, {} as Record<string, Record<string, number>>);

    const chartData = Object.entries(throughputByWeek)
      .map(([weekKey, squadData]) => ({
        week: weekKey,
        // Fix: Cast squadData to an object to resolve spread operator error when its type is inferred as unknown.
        ...(squadData as object)
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return { chartData, squads };
  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum item concluído para exibir a tendência de vazão." />;
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="week" stroke={CHART_COLORS.text} />
        <YAxis stroke={CHART_COLORS.text} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text, fontSize: '12px' }} />
        {squads.map((squad, index) => (
          <Bar 
            key={squad} 
            dataKey={squad} 
            stackId="a" 
            fill={CHART_COLORS.palette[index % CHART_COLORS.palette.length]} 
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TeamThroughputTrendChart;