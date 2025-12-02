import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface CycleTimeByTagChartProps {
  data: WorkItem[];
}

const CycleTimeByTagChart: React.FC<CycleTimeByTagChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const completedItems = data.filter(item => {
      const tags = Array.isArray(item.tags) ? item.tags : (item.tags ? item.tags.split(';').map(t => t.trim()) : []);
      return COMPLETED_STATES.includes(item.state) && tags.length > 0 && item.cycleTime !== null;
    });
    const timeByTag: Record<string, { totalTime: number; count: number }> = {};

    completedItems.forEach(item => {
      const tags = Array.isArray(item.tags) ? item.tags : (item.tags ? item.tags.split(';').map(t => t.trim()) : []);
      tags.forEach(tag => {
        if (!timeByTag[tag]) {
          timeByTag[tag] = { totalTime: 0, count: 0 };
        }
        timeByTag[tag].totalTime += item.cycleTime!;
        timeByTag[tag].count++;
      });
    });

    return Object.entries(timeByTag)
      .map(([name, { totalTime, count }]) => ({
        name,
        value: parseFloat((totalTime / count).toFixed(1)),
      }))
      .sort((a, b) => b.value - a.value);

  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum item concluído com tags para analisar." />;
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="name" stroke={CHART_COLORS.text} fontSize={12} />
        <YAxis stroke={CHART_COLORS.text} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          formatter={(value: number) => [`${value} dias`, 'Cycle Time Médio']}
        />
        <Bar dataKey="value" name="Cycle Time Médio" fill={CHART_COLORS.secondary} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default CycleTimeByTagChart;
