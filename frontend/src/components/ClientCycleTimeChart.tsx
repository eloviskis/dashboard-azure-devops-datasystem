import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface ClientCycleTimeChartProps {
  data: WorkItem[];
}

const ClientCycleTimeChart: React.FC<ClientCycleTimeChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const completedItems = data.filter(item => 
        COMPLETED_STATES.includes(item.state) && 
        item.cycleTime !== null &&
        item.tipoCliente
    );

    const timeByClient: Record<string, { totalTime: number; count: number }> = {};

    completedItems.forEach(item => {
        const client = item.tipoCliente!;
        if (!timeByClient[client]) {
          timeByClient[client] = { totalTime: 0, count: 0 };
        }
        timeByClient[client].totalTime += item.cycleTime!;
        timeByClient[client].count++;
    });

    return Object.entries(timeByClient)
      .map(([name, { totalTime, count }]) => ({
        name,
        value: parseFloat((totalTime / count).toFixed(1)),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum item concluído com cliente especificado para analisar." />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="name" stroke={CHART_COLORS.text} fontSize={12} interval={0} angle={-30} textAnchor="end" height={80} />
        <YAxis stroke={CHART_COLORS.text} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
          formatter={(value: number) => [`${value} dias`, 'Cycle Time Médio']}
        />
        <Bar dataKey="value" name="Cycle Time Médio" fill={CHART_COLORS.secondary} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ClientCycleTimeChart;
