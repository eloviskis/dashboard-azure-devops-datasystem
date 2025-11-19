
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem, WorkItemStatus } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';

interface TimeInStatusChartProps {
  data: WorkItem[];
}

const TimeInStatusChart: React.FC<TimeInStatusChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const completedItems = data.filter(item => item.status === WorkItemStatus.Concluido && item.timeInStatusDays);

    if (completedItems.length === 0) {
      return [];
    }

    const totalTimeBySquad: Record<string, { count: number, statuses: Record<string, number> }> = {};

    completedItems.forEach(item => {
      if (!totalTimeBySquad[item.squad]) {
        totalTimeBySquad[item.squad] = { count: 0, statuses: {} };
      }
      totalTimeBySquad[item.squad].count++;
      Object.entries(item.timeInStatusDays).forEach(([status, days]) => {
        // Fix: Cast 'days' to number to allow addition, as it's inferred as 'unknown'.
        totalTimeBySquad[item.squad].statuses[status] = (totalTimeBySquad[item.squad].statuses[status] || 0) + (days as number);
      });
    });

    return Object.entries(totalTimeBySquad).map(([squad, data]) => {
      const avgStatuses: Record<string, number> = {};
      Object.entries(data.statuses).forEach(([status, totalDays]) => {
        avgStatuses[status] = parseFloat((totalDays / data.count).toFixed(1));
      });
      return {
        name: squad,
        ...avgStatuses,
      };
    }).sort((a,b) => a.name.localeCompare(b.name));

  }, [data]);
  
  const statusOrder = [WorkItemStatus.Ativo, WorkItemStatus.EmProgresso, WorkItemStatus.Resolvido];

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
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
          formatter={(value: number) => [`${value.toFixed(1)} dias`, 'Tempo médio']}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        {statusOrder.map((status, index) => (
            <Bar 
                key={status} 
                dataKey={status} 
                stackId="a" 
                fill={CHART_COLORS.palette[index + 1]} 
            />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TimeInStatusChart;