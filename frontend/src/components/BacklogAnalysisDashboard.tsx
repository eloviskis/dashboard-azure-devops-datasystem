import React, { useMemo, useState } from 'react';
import { WorkItem } from '../types';
import { COMPLETED_STATES } from '../utils/metrics';
import ChartInfoLamp from './ChartInfoLamp';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, CartesianGrid } from 'recharts';

interface Props {
  data: WorkItem[];
}

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

const COLORS = ['#FFD600', '#00B8A9', '#F6416C', '#43A047', '#FF9800', '#1E88E5', '#8E24AA', '#FDD835', '#00C853', '#FF6F00'];

const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

const getWorkItemUrl = (workItemId: number | string): string => {
  return `${AZURE_DEVOPS_BASE_URL}/${workItemId}`;
};

// Componente do Modal
const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
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
            Total: <span className="font-bold text-white">{data.items.length}</span> itens
          </div>
          
          {data.items.length === 0 ? (
            <div className="text-ds-text text-center py-8">Nenhum item encontrado</div>
          ) : (
            <ul className="space-y-2">
              {data.items.map((item, idx) => (
                <li 
                  key={item.workItemId || idx}
                  className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 hover:border-ds-green transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono px-2 py-1 rounded bg-blue-600 text-white flex-shrink-0">
                      #{item.workItemId}
                    </span>
                    <div className="flex-1 min-w-0">
                      <a 
                        href={getWorkItemUrl(item.workItemId)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-white hover:text-ds-green font-medium block truncate mb-2"
                        title={item.title}
                      >
                        {item.title}
                      </a>
                      <div className="grid grid-cols-2 gap-2 text-xs text-ds-text">
                        <div>👤 {item.assignedTo || 'Não atribuído'}</div>
                        <div>👥 {item.team || 'Sem time'}</div>
                        <div>🏷️ {item.type}</div>
                        <div>📊 {item.state}</div>
                        {item.cycleTime && <div>⏱️ Cycle: {item.cycleTime.toFixed(1)} dias</div>}
                        {item.leadTime && <div>📈 Lead: {item.leadTime.toFixed(1)} dias</div>}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
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

const BacklogAnalysisDashboard: React.FC<Props> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);
  
  // Filtra apenas itens fechados/concluídos para análise de velocidade
  const completedItems = useMemo(() => 
    data.filter(item => COMPLETED_STATES.includes(item.state)),
    [data]
  );

  // Análise por Time
  const teamMetrics = useMemo(() => {
    const teams = new Map<string, {
      items: WorkItem[];
      totalCycleTime: number;
      totalLeadTime: number;
      count: number;
    }>();

    completedItems.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!teams.has(team)) {
        teams.set(team, { items: [], totalCycleTime: 0, totalLeadTime: 0, count: 0 });
      }
      const teamData = teams.get(team)!;
      teamData.items.push(item);
      teamData.count++;
      if (item.cycleTime && item.cycleTime > 0) teamData.totalCycleTime += item.cycleTime;
      if (item.leadTime && item.leadTime > 0) teamData.totalLeadTime += item.leadTime;
    });

    return Array.from(teams.entries()).map(([team, metrics]) => ({
      team,
      throughput: metrics.count,
      avgCycleTime: metrics.totalCycleTime > 0 ? (metrics.totalCycleTime / metrics.items.filter(i => i.cycleTime && i.cycleTime > 0).length) : 0,
      avgLeadTime: metrics.totalLeadTime > 0 ? (metrics.totalLeadTime / metrics.items.filter(i => i.leadTime && i.leadTime > 0).length) : 0,
      items: metrics.items
    })).sort((a, b) => b.throughput - a.throughput);
  }, [completedItems]);

  // Análise por Tipo de Work Item
  const typeMetrics = useMemo(() => {
    const types = new Map<string, {
      items: WorkItem[];
      totalCycleTime: number;
      totalLeadTime: number;
      count: number;
    }>();

    completedItems.forEach(item => {
      const type = item.type || 'Sem Tipo';
      if (!types.has(type)) {
        types.set(type, { items: [], totalCycleTime: 0, totalLeadTime: 0, count: 0 });
      }
      const typeData = types.get(type)!;
      typeData.items.push(item);
      typeData.count++;
      if (item.cycleTime && item.cycleTime > 0) typeData.totalCycleTime += item.cycleTime;
      if (item.leadTime && item.leadTime > 0) typeData.totalLeadTime += item.leadTime;
    });

    return Array.from(types.entries()).map(([type, metrics]) => ({
      type,
      completed: metrics.count,
      avgCycleTime: metrics.totalCycleTime > 0 ? Number((metrics.totalCycleTime / metrics.items.filter(i => i.cycleTime && i.cycleTime > 0).length).toFixed(1)) : 0,
      avgLeadTime: metrics.totalLeadTime > 0 ? Number((metrics.totalLeadTime / metrics.items.filter(i => i.leadTime && i.leadTime > 0).length).toFixed(1)) : 0,
      items: metrics.items
    })).sort((a, b) => b.completed - a.completed);
  }, [completedItems]);

  // Cálculo de recomendação de backlog por tipo e time
  const backlogRecommendations = useMemo(() => {
    const recommendations = new Map<string, Map<string, number>>();

    teamMetrics.forEach(team => {
      const teamMap = new Map<string, number>();
      
      // Agrupa itens do time por tipo
      const typeCount = new Map<string, number>();
      team.items.forEach(item => {
        const type = item.type || 'Sem Tipo';
        typeCount.set(type, (typeCount.get(type) || 0) + 1);
      });

      // Calcula recomendação: vazão média * 1.5 para buffer saudável
      // Proporção baseada na distribuição histórica de tipos
      const totalItems = team.items.length;
      typeCount.forEach((count, type) => {
        const proportion = count / totalItems;
        const recommendedCount = Math.ceil(team.throughput * 1.5 * proportion);
        teamMap.set(type, recommendedCount);
      });

      recommendations.set(team.team, teamMap);
    });

    return recommendations;
  }, [teamMetrics]);

  // Formata dados para exibição de recomendações
  const recommendationData = useMemo(() => {
    const data: Array<{
      team: string;
      type: string;
      recommended: number;
      currentThroughput: number;
    }> = [];

    backlogRecommendations.forEach((types, team) => {
      const teamMetric = teamMetrics.find(t => t.team === team);
      types.forEach((recommended, type) => {
        data.push({
          team,
          type,
          recommended,
          currentThroughput: teamMetric?.items.filter(i => i.type === type).length || 0
        });
      });
    });

    return data.sort((a, b) => b.recommended - a.recommended);
  }, [backlogRecommendations, teamMetrics]);

  // Dados para gráfico radar (comparativo de times)
  const radarData = useMemo(() => {
    const maxCT = Math.max(...teamMetrics.map(t => t.avgCycleTime), 1);
    const maxLT = Math.max(...teamMetrics.map(t => t.avgLeadTime), 1);
    return teamMetrics.slice(0, 6).map(team => ({
      team: team.team.length > 15 ? team.team.substring(0, 15) + '...' : team.team,
      'Vazão': team.throughput,
      'Cycle Time': Math.max(0, Math.round((1 - team.avgCycleTime / maxCT) * 100)), // Inverte: menor CT = melhor score
      'Lead Time': Math.max(0, Math.round((1 - team.avgLeadTime / maxLT) * 100)),
    }));
  }, [teamMetrics]);

  // Métricas gerais
  const overallMetrics = useMemo(() => {
    const totalThroughput = completedItems.length;
    const avgCycle = completedItems.filter(i => i.cycleTime && i.cycleTime > 0).reduce((sum, i) => sum + (i.cycleTime || 0), 0) / completedItems.filter(i => i.cycleTime && i.cycleTime > 0).length || 0;
    const avgLead = completedItems.filter(i => i.leadTime && i.leadTime > 0).reduce((sum, i) => sum + (i.leadTime || 0), 0) / completedItems.filter(i => i.leadTime && i.leadTime > 0).length || 0;
    
    return {
      totalThroughput,
      avgCycleTime: avgCycle.toFixed(1),
      avgLeadTime: avgLead.toFixed(1),
      teamsCount: teamMetrics.length,
      typesCount: typeMetrics.length
    };
  }, [completedItems, teamMetrics, typeMetrics]);

  // Handlers de clique nos gráficos
  const handleTeamClick = (data: any, index: number) => {
    const teamData = teamMetrics.find(t => t.team === data.team);
    if (teamData) {
      setModalData({
        title: `Itens Concluídos - ${data.team}`,
        items: teamData.items,
        color: COLORS[index % COLORS.length]
      });
    }
  };

  const handleTypeClick = (data: any, index: number) => {
    const typeData = typeMetrics.find(t => t.type === data.type);
    if (typeData) {
      setModalData({
        title: `Itens Concluídos - ${data.type}`,
        items: typeData.items,
        color: COLORS[index % COLORS.length]
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Cards de Métricas Gerais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 rounded-lg shadow-lg">
          <div className="text-sm opacity-90 mb-2">Vazão Total (Período)</div>
          <div className="text-4xl font-bold">{overallMetrics.totalThroughput}</div>
          <div className="text-xs opacity-75 mt-2">Itens concluídos</div>
        </div>
        <div className="bg-gradient-to-br from-green-600 to-green-800 text-white p-6 rounded-lg shadow-lg">
          <div className="text-sm opacity-90 mb-2">Cycle Time Médio</div>
          <div className="text-4xl font-bold">{overallMetrics.avgCycleTime}</div>
          <div className="text-xs opacity-75 mt-2">dias</div>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 text-white p-6 rounded-lg shadow-lg">
          <div className="text-sm opacity-90 mb-2">Lead Time Médio</div>
          <div className="text-4xl font-bold">{overallMetrics.avgLeadTime}</div>
          <div className="text-xs opacity-75 mt-2">dias</div>
        </div>
        <div className="bg-gradient-to-br from-orange-600 to-orange-800 text-white p-6 rounded-lg shadow-lg">
          <div className="text-sm opacity-90 mb-2">Times Ativos</div>
          <div className="text-4xl font-bold">{overallMetrics.teamsCount}</div>
          <div className="text-xs opacity-75 mt-2">equipes</div>
        </div>
        <div className="bg-gradient-to-br from-pink-600 to-pink-800 text-white p-6 rounded-lg shadow-lg">
          <div className="text-sm opacity-90 mb-2">Tipos de Work Item</div>
          <div className="text-4xl font-bold">{overallMetrics.typesCount}</div>
          <div className="text-xs opacity-75 mt-2">categorias</div>
        </div>
      </div>

      {/* Gráficos - Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vazão por Time */}
        <div className="bg-ds-navy p-6 rounded-lg border border-ds-border">
          <h3 className="text-xl font-bold text-white mb-4">📊 Vazão por Time</h3>
          <ChartInfoLamp info="Throughput de cada time no período selecionado. Clique nas barras para ver a lista de itens concluídos pelo time." />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={teamMetrics.map(({ items, ...rest }) => rest)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="team" 
                angle={-45} 
                textAnchor="end" 
                height={80}
                tick={{ fill: '#fff', fontSize: 11 }}
              />
              <YAxis tick={{ fill: '#fff' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                labelStyle={{ color: '#fff' }}
                formatter={(value: number) => [`${value} itens (clique para ver)`, 'Vazão']}
              />
              <Bar dataKey="throughput" fill="#00B8A9" radius={[8, 8, 0, 0]} cursor="pointer">
                {teamMetrics.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[index % COLORS.length]}
                    onClick={() => handleTeamClick(entry, index)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cycle Time vs Lead Time por Time */}
        <div className="bg-ds-navy p-6 rounded-lg border border-ds-border">
          <h3 className="text-xl font-bold text-white mb-4">⏱️ Cycle Time vs Lead Time</h3>
          <ChartInfoLamp info="Comparativo de Cycle Time e Lead Time por time. Clique nos pontos para ver os itens. Diferença grande indica tempo de espera no backlog." />
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={teamMetrics.map(({ items, ...rest }) => rest)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="team" 
                angle={-45} 
                textAnchor="end" 
                height={80}
                tick={{ fill: '#fff', fontSize: 11 }}
              />
              <YAxis tick={{ fill: '#fff' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                labelStyle={{ color: '#fff' }}
              />
              <Legend />
              <Line type="monotone" dataKey="avgCycleTime" stroke="#FFD600" strokeWidth={3} name="Cycle Time (dias)" dot={{ r: 6, cursor: 'pointer', onClick: (e: any) => {
                const teamName = e.payload.team;
                const teamData = teamMetrics.find(t => t.team === teamName);
                if (teamData) {
                  setModalData({
                    title: `Itens do Time - ${teamName}`,
                    items: teamData.items,
                    color: '#FFD600'
                  });
                }
              } }} />
              <Line type="monotone" dataKey="avgLeadTime" stroke="#F6416C" strokeWidth={3} name="Lead Time (dias)" dot={{ r: 6, cursor: 'pointer', onClick: (e: any) => {
                const teamName = e.payload.team;
                const teamData = teamMetrics.find(t => t.team === teamName);
                if (teamData) {
                  setModalData({
                    title: `Itens do Time - ${teamName}`,
                    items: teamData.items,
                    color: '#F6416C'
                  });
                }
              } }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráficos - Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance por Tipo de Work Item */}
        <div className="bg-ds-navy p-6 rounded-lg border border-ds-border">
          <h3 className="text-xl font-bold text-white mb-4">🏷️ Itens Concluídos por Tipo</h3>
          <ChartInfoLamp info="Total de itens concluídos agrupados por tipo de work item. Clique para ver os itens de cada tipo." />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={typeMetrics.map(({ items, ...rest }) => rest)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="type" 
                angle={-45} 
                textAnchor="end" 
                height={80}
                tick={{ fill: '#fff', fontSize: 11 }}
              />
              <YAxis tick={{ fill: '#fff' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                labelStyle={{ color: '#fff' }}
                formatter={(value: number) => [`${value} itens (clique para ver)`, 'Concluídos']}
              />
              <Bar dataKey="completed" radius={[8, 8, 0, 0]} cursor="pointer">
                {typeMetrics.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[index % COLORS.length]}
                    onClick={() => handleTypeClick(entry, index)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar de Performance dos Times */}
        <div className="bg-ds-navy p-6 rounded-lg border border-ds-border">
          <h3 className="text-xl font-bold text-white mb-4">🎯 Comparativo de Performance</h3>
          <ChartInfoLamp info="Radar comparativo da vazão dos times, permitindo uma visão rápida de diferenças de performance entre as equipes." />
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="team" tick={{ fill: '#fff', fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fill: '#fff' }} />
              <Radar name="Performance" dataKey="Vazão" stroke="#00B8A9" fill="#00B8A9" fillOpacity={0.6} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                labelStyle={{ color: '#fff' }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recomendações de Backlog */}
      <div className="bg-gradient-to-br from-ds-navy to-ds-dark-blue p-6 rounded-lg border-2 border-ds-green shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="text-4xl">📋</div>
          <div>
            <h3 className="text-2xl font-bold text-white">Recomendação de Backlog</h3>
            <ChartInfoLamp info="Recomendação de quantos itens refinar por tipo, baseada no throughput histórico (× 1.5 para buffer de segurança)." />
            <p className="text-ds-text text-sm">Baseado no histórico de vazão (throughput × 1.5 para buffer saudável)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from(backlogRecommendations.entries()).map(([team, types]) => {
            const teamMetric = teamMetrics.find(t => t.team === team);
            return (
              <div key={team} className="bg-ds-dark-blue rounded-lg p-5 border border-ds-border hover:border-ds-green transition-all">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold text-white">{team}</h4>
                  <div className="bg-ds-green text-ds-navy px-3 py-1 rounded-full text-sm font-bold">
                    Vazão: {teamMetric?.throughput || 0}
                  </div>
                </div>
                
                <div className="space-y-3">
                  {Array.from(types.entries()).map(([type, recommended]) => (
                    <div key={type} className="bg-ds-navy rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-ds-light-text font-medium text-sm">{type}</span>
                        <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold">
                          {recommended} itens
                        </span>
                      </div>
                      <div className="w-full bg-ds-border rounded-full h-2">
                        {/* eslint-disable-next-line react/no-inline-styles */}
                        <div 
                          className="bg-gradient-to-r from-ds-green to-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min((recommended / (teamMetric?.throughput || 1)) * 100, 100).toFixed(0)}%` } as React.CSSProperties}
                        />
                      </div>
                      <div className="text-xs text-ds-text mt-1">
                        Histórico: {teamMetric?.items.filter(i => i.type === type).length || 0} concluídos
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-ds-border">
                  <div className="text-xs text-ds-text">
                    <div className="flex justify-between mb-1">
                      <span>Cycle Time médio:</span>
                      <span className="text-white font-bold">{teamMetric?.avgCycleTime.toFixed(1) || 0} dias</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Lead Time médio:</span>
                      <span className="text-white font-bold">{teamMetric?.avgLeadTime.toFixed(1) || 0} dias</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {backlogRecommendations.size === 0 && (
          <div className="text-center py-12 text-ds-text">
            <div className="text-6xl mb-4">📊</div>
            <div className="text-lg">Não há dados suficientes no período selecionado</div>
            <div className="text-sm opacity-75 mt-2">Selecione um período maior ou aguarde mais itens serem concluídos</div>
          </div>
        )}
      </div>

      {/* Tabela Detalhada de Métricas por Tipo */}
      <div className="bg-ds-navy p-6 rounded-lg border border-ds-border">
        <h3 className="text-xl font-bold text-white mb-4">📈 Métricas Detalhadas por Tipo</h3>
        <ChartInfoLamp info="Tabela detalhada com contagem, cycle time médio, P85 e lead time por tipo de work item. Use para comparar performance entre tipos." />
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-ds-border">
                <th className="py-3 px-4 text-ds-light-text font-bold">Tipo</th>
                <th className="py-3 px-4 text-ds-light-text font-bold text-center">Concluídos</th>
                <th className="py-3 px-4 text-ds-light-text font-bold text-center">Cycle Time Médio</th>
                <th className="py-3 px-4 text-ds-light-text font-bold text-center">Lead Time Médio</th>
                <th className="py-3 px-4 text-ds-light-text font-bold text-center">Velocidade</th>
              </tr>
            </thead>
            <tbody>
              {typeMetrics.map((metric, index) => (
                <tr key={metric.type} className="border-b border-ds-border hover:bg-ds-dark-blue transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line react/no-inline-styles */}
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] } as React.CSSProperties}
                      />
                      <span className="text-white font-medium">{metric.type}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                      {metric.completed}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center text-white">
                    {metric.avgCycleTime > 0 ? `${metric.avgCycleTime} dias` : 'N/A'}
                  </td>
                  <td className="py-3 px-4 text-center text-white">
                    {metric.avgLeadTime > 0 ? `${metric.avgLeadTime} dias` : 'N/A'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {metric.avgCycleTime > 0 && metric.avgCycleTime < 5 ? (
                        <span className="text-green-400">🚀 Rápido</span>
                      ) : metric.avgCycleTime >= 5 && metric.avgCycleTime < 10 ? (
                        <span className="text-yellow-400">⚡ Moderado</span>
                      ) : metric.avgCycleTime >= 10 ? (
                        <span className="text-red-400">🐌 Lento</span>
                      ) : (
                        <span className="text-gray-400">➖ Sem dados</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Itens */}
      <ItemListModal 
        data={modalData} 
        onClose={() => setModalData(null)} 
      />
    </div>
  );
};

export default BacklogAnalysisDashboard;
