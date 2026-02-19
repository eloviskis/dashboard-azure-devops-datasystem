import React, { useState, useMemo } from 'react';
import { WorkItem } from '../types';
import ChartInfoLamp from './ChartInfoLamp';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

interface Props {
  data: WorkItem[];
}

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

const COLORS = ['#F6416C', '#FF9800', '#FFD600', '#00B8A9', '#1E88E5', '#8E24AA', '#43A047', '#FDD835', '#00C853', '#FF6F00'];

// URL base do Azure DevOps
const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

// Helper para gerar URL do work item
const getWorkItemUrl = (workItemId: number | string): string => {
  return `${AZURE_DEVOPS_BASE_URL}/${workItemId}`;
};

// Helper para calcular dias parados (desde changedDate até agora)
const calculateDaysStopped = (changedDate: string): number => {
  const changed = new Date(changedDate);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - changed.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
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
        {/* Header */}
        <div 
          className="p-4 rounded-t-lg flex justify-between items-center bg-red-600"
        >
          <h2 className="text-white font-bold text-lg">{data.title}</h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl font-bold leading-none"
          >
            ×
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          <div className="text-ds-text mb-3 text-sm">
            Total: <span className="font-bold text-white">{data.items.length}</span> itens impedidos
          </div>
          
          {data.items.length === 0 ? (
            <div className="text-ds-text text-center py-8">Nenhum item encontrado</div>
          ) : (
            <div className="space-y-3">
              {data.items.map((item, idx) => {
                const daysStopped = calculateDaysStopped((item.changedDate || item.createdDate || '').toString());
                return (
                  <div 
                    key={item.workItemId || idx}
                    className="bg-ds-dark-blue border border-ds-border rounded-lg p-4 hover:border-red-500 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span 
                        className="text-xs font-mono px-2 py-1 rounded flex-shrink-0 bg-red-600 text-white"
                      >
                        #{item.workItemId}
                      </span>
                      <div className="flex-1 min-w-0">
                        <a 
                          href={getWorkItemUrl(item.workItemId)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-white hover:text-ds-green font-medium block mb-2"
                          title={item.title}
                        >
                          {item.title}
                        </a>
                        
                        <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                          <div>
                            <span className="text-ds-text">👤 Responsável: </span>
                            <span className="text-white font-medium">{item.assignedTo || 'Não atribuído'}</span>
                          </div>
                          <div>
                            <span className="text-ds-text">👥 Time: </span>
                            <span className="text-white font-medium">{item.team || 'Sem time'}</span>
                          </div>
                          <div>
                            <span className="text-ds-text">🏷️ Tipo: </span>
                            <span className="text-white font-medium">{item.type}</span>
                          </div>
                          <div>
                            <span className="text-ds-text">📊 Status: </span>
                            <span className="text-yellow-400 font-medium">{item.state}</span>
                          </div>
                          <div>
                            <span className="text-ds-text">⏱️ Parado há: </span>
                            <span className="text-red-400 font-bold">{daysStopped} dias</span>
                          </div>
                          <div>
                            <span className="text-ds-text">📅 Última atualização: </span>
                            <span className="text-white">{item.changedDate ? new Date(item.changedDate.toString()).toLocaleDateString('pt-BR') : '-'}</span>
                          </div>
                        </div>

                        {item.tags && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {(Array.isArray(item.tags) ? item.tags : item.tags.split(';')).map((tag, i) => (
                              <span 
                                key={i} 
                                className={`text-xs px-2 py-1 rounded ${
                                  tag.trim().toUpperCase().includes('IMPEDIMENTO') 
                                    ? 'bg-red-600 text-white font-bold' 
                                    : 'bg-ds-border text-ds-text'
                                }`}
                              >
                                {tag.trim()}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="bg-ds-navy rounded p-3 mt-2">
                          <div className="text-xs text-ds-text mb-1">💬 Observação:</div>
                          <div className="text-sm text-white italic">
                            {item.title.length > 100 
                              ? 'Verifique os comentários no Azure DevOps para detalhes do impedimento'
                              : 'Clique no item para ver discussões no Azure DevOps'
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer */}
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

const ImpedimentosDashboard: React.FC<Props> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  // Filtra itens com tag [IMPEDIMENTO]
  const impedimentos = useMemo(() => {
    return data.filter(item => {
      if (!item.tags) return false;
      const tagsStr = Array.isArray(item.tags) ? item.tags.join(';') : item.tags;
      return tagsStr.toUpperCase().includes('IMPEDIMENTO');
    }).map(item => ({
      ...item,
      daysStopped: calculateDaysStopped((item.changedDate || item.createdDate || '').toString())
    }));
  }, [data]);

  // Agrupa por time
  const impedimentosPorTime = useMemo(() => {
    const times = new Map<string, WorkItem[]>();
    
    impedimentos.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!times.has(team)) {
        times.set(team, []);
      }
      times.get(team)!.push(item);
    });

    return Array.from(times.entries())
      .map(([team, items]) => ({
        team,
        count: items.length,
        items,
        avgDaysStopped: items.reduce((sum, i) => sum + i.daysStopped, 0) / items.length
      }))
      .sort((a, b) => b.count - a.count);
  }, [impedimentos]);

  // Agrupa por tipo
  const impedimentosPorTipo = useMemo(() => {
    const tipos = new Map<string, WorkItem[]>();
    
    impedimentos.forEach(item => {
      const type = item.type || 'Sem Tipo';
      if (!tipos.has(type)) {
        tipos.set(type, []);
      }
      tipos.get(type)!.push(item);
    });

    return Array.from(tipos.entries())
      .map(([type, items]) => ({
        type,
        count: items.length,
        items,
        avgDaysStopped: items.reduce((sum, i) => sum + i.daysStopped, 0) / items.length
      }))
      .sort((a, b) => b.count - a.count);
  }, [impedimentos]);

  // Agrupa por tempo parado (faixas)
  const impedimentosPorTempoParado = useMemo(() => {
    const faixas = [
      { label: '0-3 dias', min: 0, max: 3, items: [] as WorkItem[] },
      { label: '4-7 dias', min: 4, max: 7, items: [] as WorkItem[] },
      { label: '8-14 dias', min: 8, max: 14, items: [] as WorkItem[] },
      { label: '15-30 dias', min: 15, max: 30, items: [] as WorkItem[] },
      { label: '30+ dias', min: 31, max: Infinity, items: [] as WorkItem[] },
    ];

    impedimentos.forEach(item => {
      const faixa = faixas.find(f => item.daysStopped >= f.min && item.daysStopped <= f.max);
      if (faixa) faixa.items.push(item);
    });

    return faixas.map(f => ({
      name: f.label,
      count: f.items.length,
      items: f.items
    }));
  }, [impedimentos]);

  // Top 10 itens mais antigos
  const top10MaisAntigos = useMemo(() => {
    return [...impedimentos]
      .sort((a, b) => b.daysStopped - a.daysStopped)
      .slice(0, 10);
  }, [impedimentos]);

  // Handlers de clique
  const handleTimeClick = (data: any, index: number) => {
    const teamData = impedimentosPorTime.find(t => t.team === data.team);
    if (teamData) {
      setModalData({
        title: `Impedimentos - ${data.team}`,
        items: teamData.items,
        color: COLORS[index % COLORS.length]
      });
    }
  };

  const handleTipoClick = (data: any, index: number) => {
    const typeData = impedimentosPorTipo.find(t => t.type === data.type);
    if (typeData) {
      setModalData({
        title: `Impedimentos - ${data.type}`,
        items: typeData.items,
        color: COLORS[index % COLORS.length]
      });
    }
  };

  const handleTempoClick = (data: any, index: number) => {
    const faixaData = impedimentosPorTempoParado.find(f => f.name === data.name);
    if (faixaData) {
      setModalData({
        title: `Impedimentos - ${data.name}`,
        items: faixaData.items,
        color: COLORS[index % COLORS.length]
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Modal */}
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-red-600 to-red-800 text-white p-6 rounded-lg shadow-lg">
          <div className="text-sm opacity-90 mb-2">🚫 Total de Impedimentos</div>
          <div className="text-4xl font-bold">{impedimentos.length}</div>
          <div className="text-xs opacity-75 mt-2">Itens bloqueados</div>
        </div>
        <div className="bg-gradient-to-br from-orange-600 to-orange-800 text-white p-6 rounded-lg shadow-lg">
          <div className="text-sm opacity-90 mb-2">⏱️ Tempo Médio Parado</div>
          <div className="text-4xl font-bold">
            {impedimentos.length > 0 
              ? (impedimentos.reduce((sum, i) => sum + i.daysStopped, 0) / impedimentos.length).toFixed(1)
              : 0
            }
          </div>
          <div className="text-xs opacity-75 mt-2">dias</div>
        </div>
        <div className="bg-gradient-to-br from-yellow-600 to-yellow-800 text-white p-6 rounded-lg shadow-lg">
          <div className="text-sm opacity-90 mb-2">👥 Times Afetados</div>
          <div className="text-4xl font-bold">{impedimentosPorTime.length}</div>
          <div className="text-xs opacity-75 mt-2">equipes com impedimentos</div>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-800 text-white p-6 rounded-lg shadow-lg">
          <div className="text-sm opacity-90 mb-2">🔥 Mais Crítico</div>
          <div className="text-4xl font-bold">
            {top10MaisAntigos.length > 0 ? top10MaisAntigos[0].daysStopped : 0}
          </div>
          <div className="text-xs opacity-75 mt-2">dias parado</div>
        </div>
      </div>

      {impedimentos.length === 0 ? (
        <div className="bg-gradient-to-br from-green-600 to-green-800 text-white p-12 rounded-lg text-center">
          <div className="text-6xl mb-4">🎉</div>
          <div className="text-2xl font-bold mb-2">Nenhum Impedimento Detectado!</div>
          <div className="text-lg opacity-90">Todos os itens estão fluindo normalmente</div>
        </div>
      ) : (
        <>
          {/* Gráficos - Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Impedimentos por Time */}
            <div className="bg-ds-navy p-6 rounded-lg border border-ds-border">
              <h3 className="text-xl font-bold text-white mb-4">👥 Impedimentos por Time</h3>
              <ChartInfoLamp info="Distribuição de impedimentos por time. Clique nas barras para ver a lista de itens impedidos de cada equipe." />
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={impedimentosPorTime.map(({ items, ...rest }) => rest)} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
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
                    formatter={(value: number, name: string, props: any) => [
                      `${value} impedimentos (média: ${props.payload.avgDaysStopped.toFixed(1)} dias parados)`,
                      'Clique para detalhes'
                    ]}
                  />
                  <Bar dataKey="count" fill="#F6416C" radius={[8, 8, 0, 0]} cursor="pointer">
                    {impedimentosPorTime.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]}
                        onClick={() => handleTimeClick(entry, index)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Impedimentos por Tipo */}
            <div className="bg-ds-navy p-6 rounded-lg border border-ds-border">
              <h3 className="text-xl font-bold text-white mb-4">🏷️ Impedimentos por Tipo</h3>
              <ChartInfoLamp info="Distribuição dos impedimentos por tipo de work item (Bug, Issue, PBI, etc.)." />
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={impedimentosPorTipo.map(({ items, ...rest }) => rest)}
                    dataKey="count"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.type}: ${entry.count}`}
                    onClick={(data, index) => handleTipoClick(data, index)}
                    cursor="pointer"
                  >
                    {impedimentosPorTipo.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Impedimentos por Tempo Parado */}
          <div className="bg-ds-navy p-6 rounded-lg border border-ds-border">
            <h3 className="text-xl font-bold text-white mb-4">⏱️ Distribuição por Tempo Parado</h3>
            <ChartInfoLamp info="Distribuição dos impedimentos por faixa de tempo parado (0-3d, 4-7d, 8-14d, 15-30d, 30d+). Muitos itens na faixa alta indica problemas sistêmicos." />
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={impedimentosPorTempoParado.map(({ items, ...rest }) => rest)} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#fff', fontSize: 12 }}
                />
                <YAxis tick={{ fill: '#fff' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(value: number) => [`${value} impedimentos (clique para ver)`, 'Quantidade']}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} cursor="pointer">
                  {impedimentosPorTempoParado.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]}
                      onClick={() => handleTempoClick(entry, index)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top 10 Impedimentos Mais Antigos */}
          <div className="bg-gradient-to-br from-red-900 to-red-950 p-6 rounded-lg border-2 border-red-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="text-4xl">🚨</div>
              <div>
                <h3 className="text-2xl font-bold text-white">Top 10 Impedimentos Mais Críticos</h3>
                <ChartInfoLamp info="Os 10 impedimentos mais antigos/críticos ordenados por dias parados. Clique nos links para abrir no Azure DevOps." />
                <p className="text-red-200 text-sm">Itens com maior tempo parado - requerem atenção imediata</p>
              </div>
            </div>

            <div className="space-y-3">
              {top10MaisAntigos.map((item, index) => (
                <div 
                  key={item.workItemId}
                  className="bg-ds-navy rounded-lg p-4 border border-red-500 hover:border-red-300 transition-all hover:shadow-lg hover:shadow-red-500/20"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                        index === 0 ? 'bg-red-600' : index === 1 ? 'bg-orange-600' : index === 2 ? 'bg-yellow-600' : 'bg-gray-600'
                      }`}>
                        {index + 1}
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <a 
                          href={getWorkItemUrl(item.workItemId)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-white hover:text-red-400 font-bold"
                        >
                          #{item.workItemId}
                        </a>
                        <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold">
                          {item.daysStopped} DIAS PARADO
                        </span>
                      </div>
                      
                      <a 
                        href={getWorkItemUrl(item.workItemId)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-white hover:text-red-400 font-medium block mb-3"
                      >
                        {item.title}
                      </a>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-ds-text">👥 Time: </span>
                          <span className="text-white font-medium">{item.team || 'Sem time'}</span>
                        </div>
                        <div>
                          <span className="text-ds-text">🏷️ Tipo: </span>
                          <span className="text-white font-medium">{item.type}</span>
                        </div>
                        <div>
                          <span className="text-ds-text">👤 Responsável: </span>
                          <span className="text-white font-medium">{item.assignedTo || 'Não atribuído'}</span>
                        </div>
                        <div>
                          <span className="text-ds-text">📅 Última atualização: </span>
                          <span className="text-white">{item.changedDate ? new Date(item.changedDate).toLocaleDateString('pt-BR') : '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ImpedimentosDashboard;
