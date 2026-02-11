
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
// Fix: Import date-fns functions from their respective submodules for v2 compatibility.
import { format, subDays, eachDayOfInterval } from 'date-fns';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface DeliveryTrendLineChartProps {
  data: WorkItem[];
  period: number;
}

const DeliveryTrendLineChart: React.FC<DeliveryTrendLineChartProps> = ({ data, period }) => {
  const chartData = useMemo(() => {
    const endDate = new Date();
    const startDate = subDays(endDate, period - 1);
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    const deliveriesByDay = data
      .filter(item => COMPLETED_STATES.includes(item.state) && item.closedDate)
      .reduce((acc, item) => {
        const dateStr = format(item.closedDate!, 'yyyy-MM-dd');
        acc[dateStr] = (acc[dateStr] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return dateRange.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const formattedDate = format(date, 'dd/MM');
      return {
        date: formattedDate,
        entregas: deliveriesByDay[dateStr] || 0,
      };
    });
  }, [data, period]);

  if (data.length === 0) {
    return <EmptyState message="Nenhum dado de entregas para exibir." />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="date" stroke={CHART_COLORS.text} />
        <YAxis stroke={CHART_COLORS.text} />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.primary, strokeWidth: 1 }}
            contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
            labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
            itemStyle={{ color: '#e6f1ff' }}
            formatter={(value: number) => [value, 'Entregas']}
          />
          <Legend />
        <Line type="monotone" dataKey="entregas" name="Entregas" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default DeliveryTrendLineChart;