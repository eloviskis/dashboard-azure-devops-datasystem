import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { COMPLETED_STATES, IN_PROGRESS_STATES } from '../utils/metrics.ts';

interface ClientThroughputChartProps {
  data: WorkItem[];
}

const ClientThroughputChart: React.FC<ClientThroughputChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const itemsByClient = data.reduce((acc, item) => {
      const client = item.tipoCliente || 'Não especificado';
      if (!acc[client]) {
        acc[client] = { name: client, completed: 0, inProgress: 0 };
      }
      if (COMPLETED_STATES.includes(item.state)) {
        acc[client].completed += 1;
      }
      if (IN_PROGRESS_STATES.includes(item.state)) {
        acc[client].inProgress += 1;
      }
      return acc;
    }, {} as Record<string, { name: string; completed: number; inProgress: number; }>);

    return Object.values(itemsByClient).sort((a: { completed: number }, b: { completed: number }) => b.completed - a.completed);
  }, [data]);
  
  if (chartData.length === 0) {
    return <EmptyState message="Nenhum dado de vazão por cliente para exibir." />;
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="name" stroke={CHART_COLORS.text} fontSize={12} interval={0} angle={-45} textAnchor="end" height={100} />
        <YAxis stroke={CHART_COLORS.text} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        <Bar dataKey="completed" name="Concluídos" fill={CHART_COLORS.primary} />
        <Bar dataKey="inProgress" name="Em Progresso" fill={CHART_COLORS.secondary} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ClientThroughputChart;
