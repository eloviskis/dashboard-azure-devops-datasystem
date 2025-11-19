import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PullRequest, ReviewerVote } from '../types.ts';
import { VOTE_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';

interface VoteDistributionPieChartProps {
  data: PullRequest[];
}

const VOTE_NAMES: Record<number, string> = {
  [ReviewerVote.Approved]: 'Aprovado',
  [ReviewerVote.ApprovedWithSuggestions]: 'Aprovado com Sugestões',
  [ReviewerVote.NoVote]: 'Sem Voto',
  [ReviewerVote.WaitingForAuthor]: 'Aguardando Autor',
  [ReviewerVote.Rejected]: 'Rejeitado',
};

const VoteDistributionPieChart: React.FC<VoteDistributionPieChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const voteCounts = data.flatMap(pr => pr.reviewers).reduce((acc, reviewer) => {
      acc[reviewer.vote] = (acc[reviewer.vote] || 0) + 1;
      return acc;
    }, {} as Record<ReviewerVote, number>);

    return (Object.keys(voteCounts) as unknown as ReviewerVote[])
      .map(vote => ({
        name: VOTE_NAMES[vote],
        value: voteCounts[vote],
        color: VOTE_COLORS[vote]
      }))
      .filter(item => item.value > 0);
  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum dado de votação para exibir." />;
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
            <Cell key={`cell-${index}`} fill={entry.color} />
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

export default VoteDistributionPieChart;
