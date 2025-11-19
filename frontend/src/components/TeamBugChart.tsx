import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';

interface TeamBugChartProps {
  data: WorkItem[];
}

const TeamBugChart: React.FC<TeamBugChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const qualityItemsByTeam = data.reduce((acc, item) => {
      const team = item.team || 'Sem Time';
      if (!acc[team]) {
        acc[team] = { name: team, bugs: 0, issues: 0 };
      }
      if (item.type === 'Bug') {
        acc[team].bugs += 1;
      } else if (item.type === 'Issue') {
        acc[team].issues += 1;
      }
      return acc;
    }, {} as Record<string, { name: string; bugs: number; issues: number; }>);

    return Object.values(qualityItemsByTeam).sort((a: { bugs: number, issues: number }, b: { bugs: number, issues: number }) => (b.bugs + b.issues) - (a.bugs + a.issues));
  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum bug ou incidente por time para exibir." />;
  }
  
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="name" stroke={CHART_COLORS.text} />
        <YAxis stroke={CHART_COLORS.text} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        <Bar dataKey="bugs" name="Bugs" stackId="a" fill={CHART_COLORS.bug} />
        <Bar dataKey="issues" name="Incidentes" stackId="a" fill={CHART_COLORS.issue} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TeamBugChart;
