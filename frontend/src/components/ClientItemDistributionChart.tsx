import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';

interface ClientItemDistributionChartProps {
  data: WorkItem[];
}

const ClientItemDistributionChart: React.FC<ClientItemDistributionChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const itemsByClient = data.reduce((acc, item) => {
      const client = item.tipoCliente || 'Não especificado';
      acc[client] = (acc[client] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(itemsByClient)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => (b.value as number) - (a.value as number));
  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum dado de cliente para exibir." />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
          nameKey="name"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={CHART_COLORS.palette[index % CHART_COLORS.palette.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text, fontSize: '12px' }} />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default ClientItemDistributionChart;
