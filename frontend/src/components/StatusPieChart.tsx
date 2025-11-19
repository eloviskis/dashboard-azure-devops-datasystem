import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { STATUS_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';

interface StatusPieChartProps {
  data: WorkItem[];
}

const StatusPieChart: React.FC<StatusPieChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const statusCounts = data.reduce((acc, item) => {
      acc[item.state] = (acc[item.state] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum dado de status para exibir." />;
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
          {chartData.map((entry) => (
            <Cell key={`cell-${entry.name}`} fill={STATUS_COLORS[entry.name] || '#cccccc'} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: '#112240',
            borderColor: '#303C55',
            color: '#8892B0',
          }}
        />
        <Legend wrapperStyle={{ color: '#8892B0' }} />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default StatusPieChart;
