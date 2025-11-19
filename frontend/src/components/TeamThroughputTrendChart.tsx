import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { getWeek, getYear } from 'date-fns';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface TeamThroughputTrendChartProps {
  data: WorkItem[];
}

const TeamThroughputTrendChart: React.FC<TeamThroughputTrendChartProps> = ({ data }) => {
  const { chartData, teams } = useMemo(() => {
    const completedItems = data.filter(item => COMPLETED_STATES.includes(item.state) && item.closedDate);
    const teams = [...new Set(completedItems.map(item => item.team))].sort();

    if (completedItems.length === 0) {
      return { chartData: [], teams: [] };
    }

    const throughputByWeek = completedItems.reduce((acc, item) => {
      const weekKey = `${getYear(item.closedDate!)}-W${getWeek(item.closedDate!, { weekStartsOn: 1 }).toString().padStart(2, '0')}`;
      if (!acc[weekKey]) {
        acc[weekKey] = {};
      }
      acc[weekKey][item.team] = (acc[weekKey][item.team] || 0) + 1;
      return acc;
    }, {} as Record<string, Record<string, number>>);

    const chartData = Object.entries(throughputByWeek)
      .map(([weekKey, teamData]) => ({
        week: weekKey,
        ...(teamData as object)
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return { chartData, teams };
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
        {teams.map((team, index) => (
          <Bar 
            key={team} 
            dataKey={team} 
            stackId="a" 
            fill={CHART_COLORS.palette[index % CHART_COLORS.palette.length]} 
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TeamThroughputTrendChart;
