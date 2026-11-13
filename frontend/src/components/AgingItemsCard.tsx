import React, { useMemo, useState } from 'react';
import { WorkItem } from '../types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface AgingItemsCardProps {
  workItems: WorkItem[];
}

// URL base do Azure DevOps
const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';
const getWorkItemUrl = (workItemId: number | string) => `${AZURE_DEVOPS_BASE_URL}/${workItemId}`;

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-ds-navy border border-ds-border rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 rounded-t-lg flex justify-between items-center" style={{ backgroundColor: data.color }}>
          <h2 className="text-white font-bold text-lg">{data.title}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl font-bold leading-none">×</button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <div className="text-ds-text mb-3 text-sm">
            Total: <span className="font-bold text-white">{data.items.length}</span> itens
          </div>
          {data.items.length === 0 ? (
            <div className="text-ds-text text-center py-8">Nenhum item encontrado</div>
          ) : (
            <ul className="space-y-2">
              {data.items.map((item, idx) => (
                <li key={item.workItemId || idx} className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 hover:border-ds-green transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono px-2 py-1 rounded shrink-0 text-white" style={{ backgroundColor: data.color }}>
                      #{item.workItemId}
                    </span>
                    <div className="flex-1 min-w-0">
                      <a href={getWorkItemUrl(item.workItemId)} target="_blank" rel="noopener noreferrer" className="text-white hover:text-ds-green font-medium block truncate mb-1" title={item.title}>
                        {item.title}
                      </a>
                      <div className="grid grid-cols-2 gap-1 text-xs text-ds-text">
                        <div>👤 {item.assignedTo || 'Não atribuído'}</div>
                        <div>👥 {item.team || 'Sem time'}</div>
                        <div>🏷️ {item.type}</div>
                        <div>📊 {item.state}</div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-4 border-t border-ds-border">
          <button onClick={onClose} className="w-full bg-ds-border hover:bg-ds-green text-white py-2 px-4 rounded-lg transition-colors">Fechar</button>
        </div>
      </div>
    </div>
  );
};

const AgingItemsCard: React.FC<AgingItemsCardProps> = ({ workItems }) => {
  const [sortBy, setSortBy] = useState<'dias' | 'prioridade'>('dias');
  const [modalData, setModalData] = useState<ModalData | null>(null);

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
    const trendData: { date: string; count: number; items: WorkItem[] }[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const itemsAsOf = openItems.filter(item => {
        const itemDate = new Date(item.createdDate);
        return itemDate <= date;
      });
      trendData.push({ date: dateStr, count: itemsAsOf.length, items: itemsAsOf });
    }

    return {
      total: openItems.length,
      critical: critical.length,
      warning: warning.length,
      normal: normal.length,
      allOpenItems: openItems,
      criticalItems: critical,
      warningItems: warning,
      normalItems: normal,
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
        <div
          className="bg-ds-bg p-2 rounded text-center cursor-pointer hover:border hover:border-ds-green transition-colors"
          onClick={() => setModalData({ title: 'Itens em aberto', items: agingAnalysis.allOpenItems, color: '#1D4ED8' })}
        >
          <div className="text-lg font-bold text-ds-light-text">{agingAnalysis.total}</div>
          <div className="text-xs text-ds-text">Total</div>
        </div>
        <div
          className="bg-red-500/10 p-2 rounded text-center border border-red-500/30 cursor-pointer hover:border-red-400 transition-colors"
          onClick={() => setModalData({ title: 'Itens críticos (>30 dias)', items: agingAnalysis.criticalItems, color: '#DC2626' })}
        >
          <div className="text-lg font-bold text-red-400">{agingAnalysis.critical}</div>
          <div className="text-xs text-red-400">&gt;30d</div>
        </div>
        <div
          className="bg-yellow-500/10 p-2 rounded text-center border border-yellow-500/30 cursor-pointer hover:border-yellow-400 transition-colors"
          onClick={() => setModalData({ title: 'Itens em atenção (15-30 dias)', items: agingAnalysis.warningItems, color: '#CA8A04' })}
        >
          <div className="text-lg font-bold text-yellow-400">{agingAnalysis.warning}</div>
          <div className="text-xs text-yellow-400">15-30d</div>
        </div>
        <div
          className="bg-green-500/10 p-2 rounded text-center border border-green-500/30 cursor-pointer hover:border-green-400 transition-colors"
          onClick={() => setModalData({ title: 'Itens normais (<15 dias)', items: agingAnalysis.normalItems, color: '#16A34A' })}
        >
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
          <LineChart
            data={agingAnalysis.trendData}
            className="cursor-pointer"
            onClick={(e: any) => {
              const p = e?.activePayload?.[0]?.payload;
              if (p?.items?.length) setModalData({ title: `Itens em aberto em ${p.date}`, items: p.items, color: '#F6416C' });
            }}
          >
            <XAxis
              dataKey="date" 
              tick={{ fontSize: 9, fill: '#8E9AAF' }}
              axisLine={{ stroke: '#3B4A6B' }}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
              labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
              itemStyle={{ color: '#e6f1ff' }}
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
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
    </div>
  );
};

export default AgingItemsCard;
