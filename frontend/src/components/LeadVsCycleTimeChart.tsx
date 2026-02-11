
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface LeadVsCycleTimeChartProps {
  data: WorkItem[];
}

const LeadVsCycleTimeChart: React.FC<LeadVsCycleTimeChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const completedItems = data.filter(item => 
      COMPLETED_STATES.includes(item.state) && 
      item.leadTime !== null && 
      item.cycleTime !== null
    );

    if (completedItems.length === 0) {
      return [];
    }
    
    const timeByTeam: Record<string, { leadTimeSum: number, cycleTimeSum: number, count: number }> = {};

    completedItems.forEach(item => {
        const team = item.team || 'Sem Time';
        if (!timeByTeam[team]) {
            timeByTeam[team] = { leadTimeSum: 0, cycleTimeSum: 0, count: 0 };
        }
        timeByTeam[team].leadTimeSum += item.leadTime!;
        timeByTeam[team].cycleTimeSum += item.cycleTime!;
        timeByTeam[team].count++;
    });

    return Object.entries(timeByTeam).map(([team, values]) => ({
      name: team,
      'Lead Time': parseFloat((values.leadTimeSum / values.count).toFixed(1)),
      'Cycle Time': parseFloat((values.cycleTimeSum / values.count).toFixed(1)),
    }));

  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum item concluído com dados de tempo para exibir." />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="name" stroke={CHART_COLORS.text} />
        <YAxis stroke={CHART_COLORS.text} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
          labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
          itemStyle={{ color: '#e6f1ff' }}
          formatter={(value: number, name: string) => [`${value} dias`, name]}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        <Bar dataKey="Lead Time" fill={CHART_COLORS.secondary} />
        <Bar dataKey="Cycle Time" fill={CHART_COLORS.primary} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default LeadVsCycleTimeChart;
