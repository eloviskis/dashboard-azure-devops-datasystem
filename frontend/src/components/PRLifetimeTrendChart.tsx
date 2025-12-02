import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
// import { PullRequest, PullRequestStatus } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
// Fix: Import date-fns functions from their respective submodules for v2 compatibility.
import { format, subDays, eachDayOfInterval } from 'date-fns';

interface PRLifetimeTrendChartProps {
  data: any[]; // PullRequest[];
  period: number;
}

interface ModalData {
  title: string;
  items: any[]; // PullRequest[]
  color: string;
}

const PullRequestStatus = { Concluido: 'Concluído' }; // Mock for type check

const PRLifetimeTrendChart: React.FC<PRLifetimeTrendChartProps> = ({ data, period }) => {
  const chartData = useMemo(() => {
    const endDate = new Date();
    const startDate = subDays(endDate, period - 1);
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    // Primeiro, agrupe os PRs por data de fechamento e colete os tempos de vida
    const lifetimesByDay = data
      .filter(pr => pr.status === PullRequestStatus.Concluido && pr.closedDate && pr.lifetimeHours !== undefined)
      .reduce((acc: Record<string, number[]>, pr) => {
        const dateStr = format(pr.closedDate!, 'yyyy-MM-dd');
        if (!acc[dateStr]) {
          acc[dateStr] = [];
        }
        acc[dateStr].push(pr.lifetimeHours!);
        return acc;
      }, {});

    // Em seguida, calcule a média para cada dia
    // Fix: Explicitly type [dateStr, lifetimes] to ensure 'lifetimes' is treated as an array.
    const avgLifetimeByDay = Object.entries(lifetimesByDay).reduce((acc: Record<string, number>, [dateStr, lifetimes]: [string, number[]]) => {
      const sum = lifetimes.reduce((a, b) => a + b, 0);
      acc[dateStr] = sum / lifetimes.length;
      return acc;
    }, {} as Record<string, number>);

    return dateRange.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const formattedDate = format(date, 'dd/MM');
      const avgLifetime = avgLifetimeByDay[dateStr] ? parseFloat(avgLifetimeByDay[dateStr].toFixed(1)) : 0;
      return {
        date: formattedDate,
        'Tempo Médio (Horas)': avgLifetime,
      };
    });
  }, [data, period]);

  const [modalData, setModalData] = React.useState<ModalData | null>(null);

  if (data.filter(pr => pr.status === PullRequestStatus.Concluido).length === 0) {
    return <EmptyState message="Nenhum PR concluído no período para exibir a tendência." />;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis dataKey="date" stroke={CHART_COLORS.text} />
          <YAxis stroke={CHART_COLORS.text} />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.primary, strokeWidth: 1 }}
            formatter={(value: number) => [`${value}h`, 'Tempo Médio']}
          />
          <Legend />
          <Line type="monotone" dataKey="Tempo Médio (Horas)" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={{ r: 6, cursor: 'pointer', onClick: (e: any) => {
            const date = e.payload.date;
            const items = data.filter(pr => {
              const prDate = format(pr.closedDate, 'dd/MM');
              return prDate === date && pr.status === PullRequestStatus.Concluido;
            });
            setModalData({
              title: `PRs concluídos em ${date}`,
              items,
              color: CHART_COLORS.secondary
            });
          } }} activeDot={{ r: 8 }} />
        </LineChart>
      </ResponsiveContainer>
      <PRListModal data={modalData} onClose={() => setModalData(null)} />
    </>
  );
};

export default PRLifetimeTrendChart;

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
                key={pr.pullRequestId || pr.id || idx}
                className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 hover:border-ds-green transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xs font-mono px-2 py-1 rounded bg-blue-600 text-white flex-shrink-0">
                    PR #{pr.pullRequestId || pr.id}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div 
                      className="text-white font-medium block truncate mb-2"
                      title={pr.title}
                    >
                      {pr.title || 'Pull Request'}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-ds-text">
                      <div>👤 {pr.author || pr.createdBy || 'Autor desconhecido'}</div>
                      <div>📦 {pr.repository || pr.repo || 'Repositório'}</div>
                      <div>📊 {pr.status || 'Status'}</div>
                      <div>📅 {pr.creationDate ? new Date(pr.creationDate).toLocaleDateString('pt-BR') : '-'}</div>
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