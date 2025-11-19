import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { WorkItem, WorkItemStatus } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { format, differenceInDays } from 'date-fns';

interface CycleTimeScatterPlotProps {
  data: WorkItem[];
}

const CycleTimeScatterPlot: React.FC<CycleTimeScatterPlotProps> = ({ data }) => {
  const { chartData, percentiles } = useMemo(() => {
    const completedItems = data
      .filter(item => item.status === WorkItemStatus.Concluido && item.closedDate)
      .map(item => ({
        ...item,
        cycleTime: differenceInDays(item.closedDate!, item.createdDate),
      }));

    if (completedItems.length === 0) {
      return { chartData: [], percentiles: { p50: 0, p85: 0, p95: 0 } };
    }

    const cycleTimes = completedItems.map(item => item.cycleTime).sort((a, b) => a - b);
    
    const getPercentile = (p: number) => {
      const index = (p / 100) * (cycleTimes.length - 1);
      if (Number.isInteger(index)) {
        return cycleTimes[index];
      }
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      return cycleTimes[lower] + (index - lower) * (cycleTimes[upper] - cycleTimes[lower]);
    };

    const percentiles = {
        p50: parseFloat(getPercentile(50).toFixed(1)),
        p85: parseFloat(getPercentile(85).toFixed(1)),
        p95: parseFloat(getPercentile(95).toFixed(1)),
    };

    return { chartData: completedItems, percentiles };
  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum item concluído para exibir o cycle time." />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis 
            dataKey="closedDate" 
            domain={['dataMin', 'dataMax']}
            tickFormatter={(tick) => format(new Date(tick), 'dd/MM')}
            stroke={CHART_COLORS.text}
            type="number"
            scale="time"
        />
        <YAxis dataKey="cycleTime" name="Cycle Time (dias)" stroke={CHART_COLORS.text} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
          formatter={(value: any, name: string, props: any) => {
            if (name === 'cycleTime') return [`${value} dias`, 'Cycle Time'];
            if (name === 'closedDate') return [format(new Date(value as number), 'dd/MM/yyyy'), 'Concluído em'];
            return value;
          }}
          labelFormatter={(label, payload) => payload?.[0] ? `"${payload[0].payload.title}"` : ''}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        <Scatter name="Itens Concluídos" data={chartData} fill={CHART_COLORS.primary} fillOpacity={0.7} />
        <ReferenceLine y={percentiles.p50} label={{ value: `50º (${percentiles.p50}d)`, position: 'insideRight', fill: CHART_COLORS.text }} stroke="#a0aec0" strokeDasharray="3 3" />
        <ReferenceLine y={percentiles.p85} label={{ value: `85º (${percentiles.p85}d)`, position: 'insideRight', fill: CHART_COLORS.text }} stroke="#f6e05e" strokeDasharray="3 3" />
        <ReferenceLine y={percentiles.p95} label={{ value: `95º (${percentiles.p95}d)`, position: 'insideRight', fill: CHART_COLORS.text }} stroke="#f56565" strokeDasharray="3 3" />
      </ScatterChart>
    </ResponsiveContainer>
  );
};

export default CycleTimeScatterPlot;
