import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
// import { PullRequest, ReviewerVote } from '../types.ts'; // Disabled for now
import { EmptyState } from './ChartStates.tsx';

interface VoteDistributionPieChartProps {
  data: any[]; // PullRequest[];
}

interface ModalData {
  title: string;
  items: any[]; // PullRequest[]
  color: string;
}

// Disabled for now
const ReviewerVote = {
  Approved: 10,
  ApprovedWithSuggestions: 5,
  NoVote: 0,
  WaitingForAuthor: -5,
  Rejected: -10,
};

const VOTE_COLORS: Record<number, string> = {
    [ReviewerVote.Approved]: '#48bb78', // green-500
    [ReviewerVote.ApprovedWithSuggestions]: '#90cdf4', // blue-300
    [ReviewerVote.NoVote]: '#a0aec0', // gray-400
    [ReviewerVote.WaitingForAuthor]: '#f6e05e', // yellow-400
    [ReviewerVote.Rejected]: '#f56565', // red-500
};


const VOTE_NAMES: Record<number, string> = {
  [ReviewerVote.Approved]: 'Aprovado',
  [ReviewerVote.ApprovedWithSuggestions]: 'Aprovado com Sugestões',
  [ReviewerVote.NoVote]: 'Sem Voto',
  [ReviewerVote.WaitingForAuthor]: 'Aguardando Autor',
  [ReviewerVote.Rejected]: 'Rejeitado',
};

const PRListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-ds-navy border border-ds-border rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 rounded-t-lg flex justify-between items-center bg-blue-600">
          <h2 className="text-white font-bold text-lg">{data.title}</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl font-bold leading-none"
          >
            ×
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1">
          <div className="text-ds-text mb-3 text-sm">
            Total: <span className="font-bold text-white">{data.items.length}</span> pull requests
          </div>
          
          <ul className="space-y-2">
            {data.items.map((pr, idx) => (
              <li 
                key={pr.pullRequestId || idx}
                className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 hover:border-ds-green transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xs font-mono px-2 py-1 rounded bg-blue-600 text-white flex-shrink-0">
                    PR #{pr.pullRequestId}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a 
                      href={pr.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-white hover:text-ds-green font-medium block truncate mb-2"
                      title={pr.title}
                    >
                      {pr.title}
                    </a>
                    <div className="grid grid-cols-2 gap-2 text-xs text-ds-text">
                      <div>👤 {pr.author}</div>
                      <div>📦 {pr.repository}</div>
                      <div>📊 {pr.status}</div>
                      <div>📅 {new Date(pr.creationDate).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="p-4 border-t border-ds-border">
          <button 
            onClick={onClose}
            className="w-full bg-ds-border hover:bg-ds-green text-white py-2 px-4 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

const VoteDistributionPieChart: React.FC<VoteDistributionPieChartProps> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const chartData = useMemo(() => {
    const voteCounts = data.flatMap(pr => pr.reviewers).reduce((acc, reviewer) => {
      acc[reviewer.vote] = (acc[reviewer.vote] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    return (Object.keys(voteCounts) as unknown as number[])
      .map(vote => ({
        name: VOTE_NAMES[vote],
        value: voteCounts[vote],
        color: VOTE_COLORS[vote]
      }))
      .filter(item => item.value > 0);
  }, [data]);

  const handleClick = (entry: any) => {
    // Encontra o voto correspondente ao nome clicado
    const voteValue = Object.entries(VOTE_NAMES).find(([_, name]) => name === entry.name)?.[0];
    if (!voteValue) return;

    const items = data.filter(pr => 
      pr.reviewers.some((r: any) => r.vote === parseInt(voteValue))
    );
    setModalData({
      title: `PRs com voto: ${entry.name}`,
      items,
      color: entry.color
    });
  };

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum dado de votação para exibir." />;
  }
  
  return (
    <>
      <PRListModal data={modalData} onClose={() => setModalData(null)} />
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
            cursor="pointer"
            onClick={handleClick}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [value, `${name} (clique para ver)`]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </>
  );
};

export default VoteDistributionPieChart;
