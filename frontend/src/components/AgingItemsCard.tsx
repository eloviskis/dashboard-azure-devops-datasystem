import React, { useMemo, useState } from 'react';
import { WorkItem } from '../types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface AgingItemsCardProps {
  workItems: WorkItem[];
}

// URL base do Azure DevOps
const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

const AgingItemsCard: React.FC<AgingItemsCardProps> = ({ workItems }) => {
  const [sortBy, setSortBy] = useState<'dias' | 'prioridade'>('dias');

  const agingAnalysis = useMemo(() => {
    const now = new Date();
    const closedStates = ['Closed', 'Done', 'Pronto', 'Concluído', 'Fechado', 'Resolved', 'Finished'];
    
    // Filtrar itens não concluídos e calcular aging
    const openItems = workItems.filter(item => 
      !closedStates.includes(item.state)
    ).map(item => {
      const created = item.createdDate ? new Date(item.createdDate) : new Date();
      const daysOld = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      return { ...item, daysOld };
    });

    // Categorizar por aging
    const critical = openItems.filter(i => i.daysOld > 30); // Críticos > 30 dias
    const warning = openItems.filter(i => i.daysOld > 15 && i.daysOld <= 30); // Atenção 15-30 dias
    const normal = openItems.filter(i => i.daysOld <= 15); // Normal <= 15 dias

    // Ordenar itens
    const sortedItems = [...openItems].sort((a, b) => {
      if (sortBy === 'dias') return b.daysOld - a.daysOld;
      return (a.priority || 999) - (b.priority || 999);
    });

    // Dados para gráfico de tendência (últimos 30 dias)
    const trendData: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const count = openItems.filter(item => {
        const itemDate = new Date(item.createdDate);
        return itemDate <= date;
      }).length;
      trendData.push({ date: dateStr, count });
    }

    return {
      total: openItems.length,
      critical: critical.length,
      warning: warning.length,
      normal: normal.length,
      items: sortedItems.slice(0, 50), // Limitar a 50 itens
      trendData: trendData.filter((_, i) => i % 3 === 0), // A cada 3 dias
      avgDays: openItems.length > 0 
        ? Math.round(openItems.reduce((sum, i) => sum + i.daysOld, 0) / openItems.length)
        : 0
    };
  }, [workItems, sortBy]);

  const getPriorityColor = (priority: number | undefined) => {
    if (priority === 1) return 'bg-red-500/20 text-red-400';
    if (priority === 2) return 'bg-orange-500/20 text-orange-400';
    if (priority === 3) return 'bg-yellow-500/20 text-yellow-400';
    if (priority === 4) return 'bg-blue-500/20 text-blue-400';
    return 'bg-gray-500/20 text-gray-400'; // Sem prioridade
  };

  const getAgingColor = (days: number) => {
    if (days > 30) return 'text-red-400';
    if (days > 15) return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-ds-light-text font-bold text-lg flex items-center gap-2">
          <span className="text-xl">📅</span> Itens Envelhecidos
          {agingAnalysis.critical > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {agingAnalysis.critical} críticos
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-ds-text text-xs">Por:</span>
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'dias' | 'prioridade')}
            className="bg-ds-bg border border-ds-border text-ds-light-text text-xs rounded px-2 py-1"
          >
            <option value="dias">Dias</option>
            <option value="prioridade">Prioridade</option>
          </select>
        </div>
      </div>

      {/* Métricas resumidas */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-ds-bg p-2 rounded text-center">
          <div className="text-lg font-bold text-ds-light-text">{agingAnalysis.total}</div>
          <div className="text-xs text-ds-text">Total</div>
        </div>
        <div className="bg-red-500/10 p-2 rounded text-center border border-red-500/30">
          <div className="text-lg font-bold text-red-400">{agingAnalysis.critical}</div>
          <div className="text-xs text-red-400">&gt;30d</div>
        </div>
        <div className="bg-yellow-500/10 p-2 rounded text-center border border-yellow-500/30">
          <div className="text-lg font-bold text-yellow-400">{agingAnalysis.warning}</div>
          <div className="text-xs text-yellow-400">15-30d</div>
        </div>
        <div className="bg-green-500/10 p-2 rounded text-center border border-green-500/30">
          <div className="text-lg font-bold text-green-400">{agingAnalysis.normal}</div>
          <div className="text-xs text-green-400">&lt;15d</div>
        </div>
      </div>

      {/* Indicador de média */}
      <div className="text-center text-sm text-ds-text mb-3">
        <span className="opacity-60">Média de aging:</span>{' '}
        <span className={`font-bold ${getAgingColor(agingAnalysis.avgDays)}`}>
          {agingAnalysis.avgDays} dias
        </span>
      </div>

      {/* Gráfico de tendência (compacto) */}
      <div className="h-24 mb-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={agingAnalysis.trendData}>
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 9, fill: '#8E9AAF' }}
              axisLine={{ stroke: '#3B4A6B' }}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1A2234', border: '1px solid #3B4A6B', borderRadius: '8px', fontSize: '12px' }}
              labelStyle={{ color: '#E5E7EB' }}
            />
            <Line 
              type="monotone" 
              dataKey="count" 
              stroke="#F6416C" 
              strokeWidth={2}
              dot={false}
              name="Itens em aberto"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Lista de itens com scroll */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {agingAnalysis.items.length === 0 ? (
          <div className="text-center text-ds-text py-4">
            Nenhum item envelhecido encontrado
          </div>
        ) : (
          agingAnalysis.items.map((item, idx) => (
            <div 
              key={item.workItemId || idx}
              className="bg-ds-bg border border-ds-border rounded p-2 hover:border-ds-green transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${getPriorityColor(item.priority)}`}>
                  #{item.workItemId}
                </span>
                <div className="flex-1 min-w-0">
                  <a 
                    href={`${AZURE_DEVOPS_BASE_URL}/${item.workItemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-ds-light-text hover:text-ds-green truncate block"
                    title={item.title}
                  >
                    {item.title}
                  </a>
                  <div className="flex gap-3 text-xs text-ds-text mt-0.5">
                    <span className={getAgingColor(item.daysOld)}>{item.daysOld}d</span>
                    <span>{item.team || 'Sem time'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AgingItemsCard;
