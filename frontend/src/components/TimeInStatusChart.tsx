import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface TimeInStatusChartProps {
  data: WorkItem[];
}

const TimeInStatusChart: React.FC<TimeInStatusChartProps> = ({ data }) => {
  const { chartData, statusOrder } = useMemo(() => {
    const completedItems = data.filter(item => COMPLETED_STATES.includes(item.state) && item.timeInStatusDays);

    if (completedItems.length === 0) {
      return { chartData: [], statusOrder: [] };
    }

    const totalTimeByTeam: Record<string, { count: number, statuses: Record<string, number> }> = {};
    const allStatuses = new Set<string>();

    completedItems.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!totalTimeByTeam[team]) {
        totalTimeByTeam[team] = { count: 0, statuses: {} };
      }
      totalTimeByTeam[team].count++;
      Object.entries(item.timeInStatusDays!).forEach(([status, days]) => {
        totalTimeByTeam[team].statuses[status] = (totalTimeByTeam[team].statuses[status] || 0) + (days as number);
        allStatuses.add(status);
      });
    });
    
    const chartData = Object.entries(totalTimeByTeam).map(([team, data]) => {
      const avgStatuses: Record<string, number> = {};
      Object.entries(data.statuses).forEach(([status, totalDays]) => {
        avgStatuses[status] = parseFloat((totalDays / data.count).toFixed(1));
      });
      return {
        name: team,
        ...avgStatuses,
      };
    }).sort((a,b) => a.name.localeCompare(b.name));
    
    // Garante uma ordem consistente para as barras empilhadas
    const statusOrder = Array.from(allStatuses).sort();

    return { chartData, statusOrder };

  }, [data]);
  
  if (chartData.length === 0) {
    return <EmptyState message="Nenhum item concluído com dados de tempo para exibir." />;
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="name" stroke={CHART_COLORS.text} />
        <YAxis stroke={CHART_COLORS.text} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
          labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
          itemStyle={{ color: '#e6f1ff' }}
          formatter={(value: number, name: string) => [`${value.toFixed(1)} dias`, name]}
        />
        <Legend />
        {statusOrder.map((status, index) => (
            <Bar 
                key={status} 
                dataKey={status} 
                stackId="a" 
                fill={CHART_COLORS.palette[index % CHART_COLORS.palette.length]} 
            />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TimeInStatusChart;
