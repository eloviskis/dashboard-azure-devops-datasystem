
import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem, WorkItemType } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';

interface BugVsIssuePieChartProps {
  data: WorkItem[];
}

const COLORS = [CHART_COLORS.bug, CHART_COLORS.issue];

const BugVsIssuePieChart: React.FC<BugVsIssuePieChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const counts = data.reduce((acc, item) => {
      if (item.type === WorkItemType.Bug) {
        acc.bugs += 1;
      } else if (item.type === WorkItemType.Issue) {
        acc.issues += 1;
      }
      return acc;
    }, { bugs: 0, issues: 0 });

    return [
      { name: 'Bugs', value: counts.bugs },
      { name: 'Incidentes', value: counts.issues },
    ].filter(item => item.value > 0);
  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum bug ou incidente para exibir." />;
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
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }}/>
      </PieChart>
    </ResponsiveContainer>
  );
};

export default BugVsIssuePieChart;
