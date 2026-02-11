import React, { useMemo, useState } from 'react';
import { WorkItem } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { CHART_COLORS } from '../constants';
import { COMPLETED_STATES } from '../utils/metrics';
import ChartInfoLamp from './ChartInfoLamp';

interface Props {
  data: WorkItem[];
}

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

const COLORS = ['#FFD600', '#00B8A9', '#F6416C', '#43A047', '#FF9800', '#1E88E5', '#8E24AA', '#FDD835', '#00C853', '#FF6F00'];

// URL base do Azure DevOps
const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

// Helper para gerar URL do work item
const getWorkItemUrl = (workItemId: number | string): string => {
  return `${AZURE_DEVOPS_BASE_URL}/${workItemId}`;
};

// Componente do Modal
const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-ds-navy border border-ds-border rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 rounded-t-lg flex justify-between items-center bg-blue-600">
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
                    <span className="text-xs font-mono px-2 py-1 rounded bg-blue-600 text-white">
                      #{item.workItemId}
                    </span>
                    <div className="flex-1 min-w-0">
                      <a 
                        href={getWorkItemUrl(item.workItemId)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-white hover:text-ds-green font-medium block truncate"
                        title={item.title}
                      >
                        {item.title}
                      </a>
                      <div className="flex gap-4 mt-1 text-xs text-ds-text">
                        <span>📝 {item.type}</span>
                        <span>👤 {item.assignedTo || 'Não atribuído'}</span>
                        <span>📊 {item.state}</span>
                        <span>🏢 {item.team || 'Sem time'}</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
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

export const POAnalysisDashboard: React.FC<Props> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  // Filtra apenas itens que têm createdBy definido
  const itemsComCriador = useMemo(() => 
    data.filter(item => item.createdBy && item.createdBy.trim() !== ''), 
    [data]
  );

  // Total de itens criados por pessoa
  const itensCriadosPorPessoa = useMemo(() => {
    const counts = itemsComCriador.reduce((acc, item) => {
      const criador = item.createdBy || '(não informado)';
      acc[criador] = (acc[criador] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15); // Top 15
  }, [itemsComCriador]);

  // Itens criados por time
  const itensCriadosPorTime = useMemo(() => {
    const counts = itemsComCriador.reduce((acc, item) => {
      const team = item.team || 'Sem Time';
      acc[team] = (acc[team] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [itemsComCriador]);

  // Taxa de conclusão por criador (criados vs fechados)
  const taxaConclusaoPorCriador = useMemo(() => {
    const stats = itemsComCriador.reduce((acc, item) => {
      const criador = item.createdBy || '(não informado)';
      if (!acc[criador]) {
        acc[criador] = { criados: 0, fechados: 0 };
      }
      acc[criador].criados++;
      if (COMPLETED_STATES.includes(item.state)) {
        acc[criador].fechados++;
      }
      return acc;
    }, {} as Record<string, { criados: number; fechados: number }>);

    return Object.entries(stats)
      .map(([name, stat]) => ({
        name,
        criados: stat.criados,
        fechados: stat.fechados,
        taxa: stat.criados > 0 ? ((stat.fechados / stat.criados) * 100).toFixed(1) : '0'
      }))
      .filter(item => item.criados >= 3) // Mínimo 3 itens criados
      .sort((a, b) => b.fechados - a.fechados)
      .slice(0, 15); // Top 15
  }, [itemsComCriador]);

  // Melhor desempenho (maior taxa de conclusão com volume significativo)
  const melhorDesempenho = useMemo(() => {
    const stats = itemsComCriador.reduce((acc, item) => {
      const criador = item.createdBy || '(não informado)';
      if (!acc[criador]) {
        acc[criador] = { criados: 0, fechados: 0 };
      }
      acc[criador].criados++;
      if (COMPLETED_STATES.includes(item.state)) {
        acc[criador].fechados++;
      }
      return acc;
    }, {} as Record<string, { criados: number; fechados: number }>);

    return Object.entries(stats)
      .map(([name, stat]) => ({
        name,
        criados: stat.criados,
        fechados: stat.fechados,
        taxaPercent: stat.criados > 0 ? (stat.fechados / stat.criados) * 100 : 0
      }))
      .filter(item => item.criados >= 5) // Mínimo 5 itens para ser considerado
      .sort((a, b) => b.taxaPercent - a.taxaPercent)
      .slice(0, 10);
  }, [itemsComCriador]);

  // Criação por tipo de work item por pessoa
  const criacaoPorTipoPorPessoa = useMemo(() => {
    // Primeiro, agrupa por pessoa e tipo
    const stats = itemsComCriador.reduce((acc, item) => {
      const criador = item.createdBy || '(não informado)';
      const tipo = item.type || 'Sem Tipo';
      
      if (!acc[criador]) {
        acc[criador] = {};
      }
      if (!acc[criador][tipo]) {
        acc[criador][tipo] = 0;
      }
      acc[criador][tipo]++;
      
      return acc;
    }, {} as Record<string, Record<string, number>>);

    // Calcula total por pessoa para filtrar os top criadores
    const totaisPorPessoa = Object.entries(stats).map(([name, tipos]) => ({
      name,
      total: Object.values(tipos).reduce((sum, count) => sum + count, 0),
      tipos
    })).sort((a, b) => b.total - a.total).slice(0, 15); // Top 15 criadores

    // Obter todos os tipos únicos
    const tiposUnicos = new Set<string>();
    totaisPorPessoa.forEach(pessoa => {
      Object.keys(pessoa.tipos).forEach(tipo => tiposUnicos.add(tipo));
    });

    // Formatar dados para o gráfico
    return {
      data: totaisPorPessoa.map(pessoa => {
        const entry: any = { name: pessoa.name };
        tiposUnicos.forEach(tipo => {
          entry[tipo] = pessoa.tipos[tipo] || 0;
        });
        return entry;
      }),
      tipos: Array.from(tiposUnicos)
    };
  }, [itemsComCriador]);

  // Análise DOR (Definition of Ready) por pessoa
  const dorPorPessoa = useMemo(() => {
    const stats = itemsComCriador.reduce((acc, item) => {
      const criador = item.createdBy || '(não informado)';
      if (!acc[criador]) {
        acc[criador] = { total: 0, comReady: 0, semReady: 0 };
      }
      acc[criador].total++;
      
      // Verifica se tem readyDate preenchido
      if (item.readyDate && item.readyDate !== null && String(item.readyDate).trim() !== '') {
        acc[criador].comReady++;
      } else {
        acc[criador].semReady++;
      }
      
      return acc;
    }, {} as Record<string, { total: number; comReady: number; semReady: number }>);

    return Object.entries(stats)
      .map(([name, stat]) => ({
        name,
        'Com DOR': stat.comReady,
        'Sem DOR': stat.semReady,
        total: stat.total,
        taxaDOR: stat.total > 0 ? ((stat.comReady / stat.total) * 100).toFixed(1) : '0'
      }))
      .filter(item => item.total >= 3) // Mínimo 3 itens
      .sort((a, b) => b['Sem DOR'] - a['Sem DOR']) // Ordena por quem tem mais sem DOR
      .slice(0, 15); // Top 15
  }, [itemsComCriador]);

  // Handlers de clique
  const handleCriadorClick = (chartData: any, index: number) => {
    const criadorName = chartData.name;
    const items = itemsComCriador.filter(item => 
      (item.createdBy || '(não informado)') === criadorName
    );
    setModalData({
      title: `Itens criados por ${criadorName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handleTimeClick = (chartData: any, index: number) => {
    const teamName = chartData.name;
    const items = itemsComCriador.filter(item => 
      (item.team || 'Sem Time') === teamName
    );
    setModalData({
      title: `Itens criados - Time ${teamName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handleConclusaoClick = (chartData: any, index: number) => {
    const criadorName = chartData.name;
    const items = itemsComCriador.filter(item => 
      (item.createdBy || '(não informado)') === criadorName &&
      COMPLETED_STATES.includes(item.state)
    );
    setModalData({
      title: `Itens fechados criados por ${criadorName}`,
      items,
      color: '#43A047'
    });
  };

  const handleTipoPorPessoaClick = (chartData: any, tipoClicado: string, index: number) => {
    const criadorName = chartData.name;
    const items = itemsComCriador.filter(item => 
      (item.createdBy || '(não informado)') === criadorName &&
      (item.type || 'Sem Tipo') === tipoClicado
    );
    setModalData({
      title: `${tipoClicado} criados por ${criadorName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handleDORComClick = (chartData: any) => {
    const criadorName = chartData.name;
    const items = itemsComCriador.filter(item => 
      (item.createdBy || '(não informado)') === criadorName &&
      item.readyDate && item.readyDate !== null && String(item.readyDate).trim() !== ''
    );
    setModalData({
      title: `Itens COM DOR (Ready) criados por ${criadorName}`,
      items,
      color: '#43A047'
    });
  };

  const handleDORSemClick = (chartData: any) => {
    const criadorName = chartData.name;
    const items = itemsComCriador.filter(item => 
      (item.createdBy || '(não informado)') === criadorName &&
      (!item.readyDate || item.readyDate === null || String(item.readyDate).trim() === '')
    );
    setModalData({
      title: `Itens SEM DOR (Ready) criados por ${criadorName}`,
      items,
      color: '#F6416C'
    });
  };

  // Métricas gerais
  const totalCriados = itemsComCriador.length;
  const totalFechados = itemsComCriador.filter(item => 
    COMPLETED_STATES.includes(item.state)
  ).length;
  const taxaGeralConclusao = totalCriados > 0 ? ((totalFechados / totalCriados) * 100).toFixed(1) : '0';
  const totalCriadores = new Set(itemsComCriador.map(item => item.createdBy)).size;
  const totalComDOR = itemsComCriador.filter(item => 
    item.readyDate && item.readyDate !== null && String(item.readyDate).trim() !== ''
  ).length;
  const taxaDOR = totalCriados > 0 ? ((totalComDOR / totalCriados) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* Modal */}
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-blue-700 text-white p-4 rounded-lg">
          <div className="text-lg font-bold">Itens Criados</div>
          <div className="text-3xl">{totalCriados}</div>
          <div>Work items</div>
        </div>
        <div className="bg-green-700 text-white p-4 rounded-lg">
          <div className="text-lg font-bold">Itens Fechados</div>
          <div className="text-3xl">{totalFechados}</div>
          <div>Work items</div>
        </div>
        <div className="bg-purple-700 text-white p-4 rounded-lg">
          <div className="text-lg font-bold">Taxa de Conclusão</div>
          <div className="text-3xl">{taxaGeralConclusao}%</div>
          <div>Do período</div>
        </div>
        <div className="bg-teal-700 text-white p-4 rounded-lg">
          <div className="text-lg font-bold">Taxa DOR (Ready)</div>
          <div className="text-3xl">{taxaDOR}%</div>
          <div>{totalComDOR} de {totalCriados}</div>
        </div>
        <div className="bg-orange-700 text-white p-4 rounded-lg">
          <div className="text-lg font-bold">Criadores Ativos</div>
          <div className="text-3xl">{totalCriadores}</div>
          <div>Pessoas</div>
        </div>
      </div>

      {/* Gráfico: Top Criadores */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="font-bold mb-2 text-white">Top 15 - Criadores de Work Items</div>
        <ChartInfoLamp info="Ranking dos maiores criadores de work items no período. Clique nas barras para ver os itens criados por cada pessoa." />
        <div className="text-xs text-ds-text mb-3">Quantidade de itens criados no período</div>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart 
            data={itensCriadosPorPessoa} 
            margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
          >
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#fff', fontSize: 10 }} 
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis tick={{ fill: '#fff', fontSize: 12 }} />
            <Tooltip 
              formatter={(value: number) => [`${value} itens (clique para ver)`, 'Criados']}
              contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
            />
            <Bar 
              dataKey="value" 
              radius={[8, 8, 0, 0]}
              cursor="pointer"
              label={{ position: 'top', fill: '#FFD600', fontSize: 11, fontWeight: 'bold' }}
              onClick={(data, index) => handleCriadorClick(data, index)}
            >
              {itensCriadosPorPessoa.map((entry, idx) => (
                <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico: Itens por Time */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="font-bold mb-2 text-white">Criação de Work Items por Time</div>
        <ChartInfoLamp info="Distribuição de itens criados por equipe. Clique para ver os itens de cada time." />
        <div className="text-xs text-ds-text mb-3">Distribuição de itens criados por equipe</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart 
            data={itensCriadosPorTime}
            margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
          >
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#fff', fontSize: 11 }} 
              angle={-45}
              textAnchor="end"
              height={70}
            />
            <YAxis tick={{ fill: '#fff', fontSize: 12 }} />
            <Tooltip 
              formatter={(value: number) => [`${value} itens (clique para ver)`, 'Criados']}
              contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
            />
            <Bar 
              dataKey="value" 
              fill={CHART_COLORS.primary}
              radius={[8, 8, 0, 0]}
              cursor="pointer"
              label={{ position: 'top', fill: '#FFD600', fontSize: 11, fontWeight: 'bold' }}
              onClick={(data, index) => handleTimeClick(data, index)}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico: Taxa de Conclusão por Criador */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="font-bold mb-2 text-white">Top 15 - Taxa de Conclusão por Criador</div>
        <ChartInfoLamp info="Comparativo entre itens criados e fechados por pessoa (mín. 3 criados). Diferença grande pode indicar falta de refinamento." />
        <div className="text-xs text-ds-text mb-3">Comparação entre itens criados e fechados (mínimo 3 itens criados)</div>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart 
            data={taxaConclusaoPorCriador}
            margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
          >
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#fff', fontSize: 10 }} 
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis tick={{ fill: '#fff', fontSize: 12 }} />
            <Tooltip 
              contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
            />
            <Legend />
            <Bar dataKey="criados" name="Criados" fill="#64B5F6" radius={[4, 4, 0, 0]} />
            <Bar 
              dataKey="fechados" 
              name="Fechados" 
              fill="#43A047" 
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(data, index) => handleConclusaoClick(data, index)}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico: Criação por Tipo de Work Item por Pessoa */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="font-bold mb-2 text-white">Top 15 - Criação por Tipo de Work Item por Pessoa</div>
        <ChartInfoLamp info="Distribuição de tipos de work item criados por pessoa. Mostra se alguém cria mais bugs, issues ou PBIs." />
        <div className="text-xs text-ds-text mb-3">Distribuição de tipos de itens criados por cada pessoa (clique nas barras para ver detalhes)</div>
        <ResponsiveContainer width="100%" height={450}>
          <BarChart 
            data={criacaoPorTipoPorPessoa.data}
            margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
          >
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#fff', fontSize: 10 }} 
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis tick={{ fill: '#fff', fontSize: 12 }} />
            <Tooltip 
              contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            {criacaoPorTipoPorPessoa.tipos.map((tipo, idx) => (
              <Bar 
                key={tipo}
                dataKey={tipo}
                stackId="pessoa"
                fill={COLORS[idx % COLORS.length]}
                cursor="pointer"
                onClick={(data) => handleTipoPorPessoaClick(data, tipo, idx)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico: DOR (Definition of Ready) por Pessoa */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="font-bold mb-2 text-white">Top 15 - DOR (Definition of Ready) por Criador</div>
        <ChartInfoLamp info="Análise de itens com campo 'Ready' preenchido vs. não preenchido por criador. Alta taxa de DOR indica melhor qualidade na especificação." />
        <div className="text-xs text-ds-text mb-3">
          Análise de itens com campo "Ready" preenchido vs não preenchido (mínimo 3 itens criados)
        </div>
        <ResponsiveContainer width="100%" height={450}>
          <BarChart 
            data={dorPorPessoa}
            margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
          >
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#fff', fontSize: 10 }} 
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis tick={{ fill: '#fff', fontSize: 12 }} />
            <Tooltip 
              contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
              formatter={(value: number, name: string) => [
                `${value} itens`,
                name === 'Com DOR' ? '✅ Com DOR (clique)' : '❌ Sem DOR (clique)'
              ]}
            />
            <Legend iconType="rect" />
            <Bar 
              dataKey="Sem DOR" 
              stackId="dor"
              fill="#F6416C"
              radius={[0, 0, 0, 0]}
              cursor="pointer"
              onClick={(data) => handleDORSemClick(data)}
            />
            <Bar 
              dataKey="Com DOR" 
              stackId="dor"
              fill="#43A047"
              radius={[8, 8, 0, 0]}
              label={{ 
                position: 'top', 
                fill: '#FFD600', 
                fontSize: 11, 
                fontWeight: 'bold',
                formatter: (value: number, entry: any) => {
                  const taxa = entry?.taxaDOR || '0';
                  return `${entry?.total || value} (${taxa}%)`;
                }
              }}
              cursor="pointer"
              onClick={(data) => handleDORComClick(data)}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela: Melhor Desempenho */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="font-bold mb-2 text-white">🏆 Ranking - Melhor Taxa de Conclusão</div>
        <ChartInfoLamp info="Ranking dos criadores com melhor percentual de itens fechados (mín. 5 criados). Indica efetividade da demanda criada." />
        <div className="text-xs text-ds-text mb-3">Criadores com melhor percentual de itens fechados (mínimo 5 itens criados)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ds-border">
                <th className="text-left p-2 text-ds-light-text">Posição</th>
                <th className="text-left p-2 text-ds-light-text">Criador</th>
                <th className="text-center p-2 text-ds-light-text">Criados</th>
                <th className="text-center p-2 text-ds-light-text">Fechados</th>
                <th className="text-center p-2 text-ds-light-text">Taxa</th>
              </tr>
            </thead>
            <tbody>
              {melhorDesempenho.map((item, idx) => (
                <tr key={idx} className="border-b border-ds-border hover:bg-ds-dark-blue">
                  <td className="p-2 text-ds-text">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`}
                  </td>
                  <td className="p-2 text-white font-medium">{item.name}</td>
                  <td className="p-2 text-center text-ds-text">{item.criados}</td>
                  <td className="p-2 text-center text-green-400 font-bold">{item.fechados}</td>
                  <td className="p-2 text-center">
                    <span className={`font-bold ${
                      item.taxaPercent >= 80 ? 'text-green-400' : 
                      item.taxaPercent >= 60 ? 'text-yellow-400' : 
                      'text-orange-400'
                    }`}>
                      {item.taxaPercent.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default POAnalysisDashboard;
