
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { WorkItem, WorkItemStatus } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { getWeek, getYear } from 'date-fns';

interface ThroughputHistogramProps {
  data: WorkItem[];
}

const ThroughputHistogram: React.FC<ThroughputHistogramProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const completedItems = data.filter(item => item.status === WorkItemStatus.Concluido && item.closedDate);
    
    if (completedItems.length === 0) {
      return [];
    }
    
    const throughputByWeek = completedItems.reduce((acc: Record<string, number>, item) => {
      const weekKey = `${getYear(item.closedDate!)}-W${getWeek(item.closedDate!, { weekStartsOn: 1 })}`;
      acc[weekKey] = (acc[weekKey] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const weeklyCounts = Object.values(throughputByWeek);

    const bins: Record<string, number> = {
        '1-5': 0,
        '6-10': 0,
        '11-15': 0,
        '16-20': 0,
        '21+': 0
    };
    
    weeklyCounts.forEach((count: number) => {
        if (count > 0 && count <= 5) bins['1-5']++;
        else if (count <= 10) bins['6-10']++;
        else if (count <= 15) bins['11-15']++;
        else if (count <= 20) bins['16-20']++;
        else if (count > 20) bins['21+']++;
    });

    return Object.entries(bins).map(([range, frequency]) => ({
      range,
      'Semanas': frequency,
    }));

  }, [data]);

  if (chartData.every(d => d['Semanas'] === 0)) {
    return <EmptyState message="Nenhum item concluído para exibir o histograma de vazão." />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="range" name="Itens por semana" stroke={CHART_COLORS.text} />
        <YAxis dataKey="Semanas" name="Nº de Semanas" stroke={CHART_COLORS.text} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
          formatter={(value: number) => [`${value} semanas`, 'Frequência']}
           labelFormatter={(label: string) => `Itens/semana: ${label}`}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        <Bar dataKey="Semanas" fill={CHART_COLORS.secondary} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ThroughputHistogram;
