import React, { useState, Component, ErrorInfo, ReactNode } from 'react';
import './RootCauseDashboard.css';
import { WorkItem } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface Props {
  data: WorkItem[];
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RootCauseDashboard Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-900 text-white p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-2">Erro ao carregar Root Cause Dashboard</h2>
          <p className="mb-4">Ocorreu um erro ao processar os dados:</p>
          <pre className="bg-red-950 p-4 rounded text-sm overflow-auto">
            {this.state.error?.message || 'Erro desconhecido'}
          </pre>
          <button 
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 bg-white text-red-900 px-4 py-2 rounded hover:bg-gray-200"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
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

// Helper para normalizar prioridade (pode vir como "1.0", 1, "1", null=P0, etc.)
const normalizePriority = (priority: any): number => {
  // null, undefined ou vazio = P0
  if (priority === null || priority === undefined || priority === '') return 0;
  const num = parseFloat(String(priority));
  return isNaN(num) ? 0 : Math.floor(num);
};

// Componente do Modal
const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-ds-navy border border-ds-border rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
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
                    <span 
                      className="text-xs font-mono px-2 py-1 rounded bg-blue-600 text-white"
                    >
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
                        <span>👤 {item.assignedTo || 'Não atribuído'}</span>
                        <span>📊 {item.state}</span>
                        {item.priority && <span>🔥 P{normalizePriority(item.priority)}</span>}
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

export const RootCauseDashboard: React.FC<Props> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  // Helper para verificar se causaRaiz está vazia (proteção contra null/undefined)
  const isCausaRaizEmpty = (causaRaiz: string | null | undefined): boolean => {
    return !causaRaiz || causaRaiz.trim() === '';
  };

  // Filtros e métricas - data já vem filtrado pelo período do App.tsx
  const issues = data.filter(w => w.type === 'Issue');
  const issuesFechadas = issues.filter(w => w.state === 'Closed');
  const issuesCriadas = issues.filter(w => !!w.createdDate);
  // Usa customType ao invés de buscar no título
  const issuesCorrecao = issuesFechadas.filter(w => w.customType === 'Correção');
  const issuesOutrosType = issuesFechadas.filter(w => w.customType !== 'Correção');
  // Usa causaRaiz (Microsoft.VSTS.CMMI.RootCause) para verificar causa raiz - nas Issues FECHADAS de Correção
  const issuesSemCausaRaiz = issuesCorrecao.filter(w => isCausaRaizEmpty(w.causaRaiz));
  // P0 = priority null ou 0 (null vem do Azure como P0) - nas Issues de CORREÇÃO FECHADAS
  const issuesP0 = issuesCorrecao.filter(w => normalizePriority(w.priority) === 0);

  // Agrupamentos - usa customType para agrupar tipos
  const typeCounts = issuesFechadas.reduce((acc, item) => {
    const type = item.customType || 'Sem Tipo';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const typeChart = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

  // Correções por prioridade - usa priority normalizada (null = P0)
  const correcaoPorPriority = issuesCorrecao.reduce((acc, item) => {
    const prioNum = normalizePriority(item.priority);
    const prio = `P${prioNum}`;
    acc[prio] = (acc[prio] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const correcaoPriorityChart = Object.entries(correcaoPorPriority).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));

  // P0 por causa raiz - usa campo 'causaRaiz' (Microsoft.VSTS.CMMI.RootCause do Azure DevOps)
  const p0PorCausaRaiz = issuesP0.reduce((acc, item) => {
    const causa = isCausaRaizEmpty(item.causaRaiz) ? '(sem causa raiz)' : item.causaRaiz!;
    acc[causa] = (acc[causa] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const p0CausaChart = Object.entries(p0PorCausaRaiz)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value); // Ordena por quantidade decrescente

  // Issues sem causa raiz por pessoa - usa campo causaRaiz (Microsoft.VSTS.CMMI.RootCause) nas Issues de Correção FECHADAS
  const issuesSemCausaRaizReal = issuesCorrecao.filter(w => isCausaRaizEmpty(w.causaRaiz));
  const issuesComCausaRaiz = issuesCorrecao.filter(w => !isCausaRaizEmpty(w.causaRaiz));
  
  // Agrupa por pessoa: sem causa raiz e com causa raiz (Issues de Correção FECHADAS)
  const pessoasMap = new Map<string, { semCausa: number; comCausa: number }>();
  
  issuesCorrecao.forEach(item => {
    const pessoa = item.assignedTo || '(não atribuído)';
    if (!pessoasMap.has(pessoa)) {
      pessoasMap.set(pessoa, { semCausa: 0, comCausa: 0 });
    }
    const stats = pessoasMap.get(pessoa)!;
    if (isCausaRaizEmpty(item.causaRaiz)) {
      stats.semCausa++;
    } else {
      stats.comCausa++;
    }
  });
  
  const semCausaPessoaChart = Array.from(pessoasMap.entries())
    .map(([name, stats]) => ({
      name,
      'Sem Causa Raiz': stats.semCausa,
      'Com Causa Raiz': stats.comCausa,
      total: stats.semCausa + stats.comCausa
    }))
    .sort((a, b) => b['Sem Causa Raiz'] - a['Sem Causa Raiz']); // Ordena por quem tem mais sem causa raiz

  // Handlers de clique nos gráficos
  const handleTypeClick = (chartData: any, index: number) => {
    const typeName = chartData.name;
    const items = issuesFechadas.filter(w => (w.customType || 'Sem Tipo') === typeName);
    setModalData({
      title: `Issues Fechadas - ${typeName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handlePriorityClick = (chartData: any, index: number) => {
    const prioName = chartData.name;
    const prioNum = parseInt(prioName.replace('P', ''));
    const items = issuesCorrecao.filter(w => normalizePriority(w.priority) === prioNum);
    setModalData({
      title: `Correções - Prioridade ${prioName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handleP0CausaClick = (chartData: any, index: number) => {
    const causaName = chartData.name;
    const items = issuesP0.filter(w => {
      const causa = isCausaRaizEmpty(w.causaRaiz) ? '(sem causa raiz)' : w.causaRaiz!;
      return causa === causaName;
    });
    setModalData({
      title: `P0 - ${causaName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handlePessoaSemCausaClick = (chartData: any, index: number) => {
    const pessoaName = chartData.name;
    const items = issuesCorrecao.filter(w => 
      (w.assignedTo || '(não atribuído)') === pessoaName && 
      isCausaRaizEmpty(w.causaRaiz)
    );
    setModalData({
      title: `Correções SEM Causa Raiz - ${pessoaName}`,
      items,
      color: '#F6416C' // Vermelho para sem causa raiz
    });
  };

  const handlePessoaComCausaClick = (chartData: any, index: number) => {
    const pessoaName = chartData.name;
    const items = issuesCorrecao.filter(w => 
      (w.assignedTo || '(não atribuído)') === pessoaName && 
      !isCausaRaizEmpty(w.causaRaiz)
    );
    setModalData({
      title: `Correções COM Causa Raiz - ${pessoaName}`,
      items,
      color: '#43A047' // Verde para com causa raiz
    });
  };

  return (
    <div className="space-y-6">
      {/* Modal */}
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-purple-700 text-white p-4 rounded-lg">
          <div className="text-lg font-bold">Issues Criadas</div>
          <div className="text-3xl">{issuesCriadas.length}</div>
          <div>Work items</div>
        </div>
        <div className="bg-green-700 text-white p-4 rounded-lg">
          <div className="text-lg font-bold">Issues Fechadas</div>
          <div className="text-3xl">{issuesFechadas.length}</div>
          <div>Work items</div>
        </div>
        <div className="bg-orange-700 text-white p-4 rounded-lg">
          <div className="text-lg font-bold">Issues de Correção</div>
          <div className="text-3xl">{issuesCorrecao.length}</div>
          <div>Work items</div>
        </div>
        <div className="bg-blue-700 text-white p-4 rounded-lg">
          <div className="text-lg font-bold">Outras Issues</div>
          <div className="text-3xl">{issuesOutrosType.length}</div>
          <div>Work items</div>
        </div>
        <div className="bg-gray-700 text-white p-4 rounded-lg">
          <div className="text-lg font-bold">Correções sem Causa Raíz</div>
          <div className="text-3xl">{issuesSemCausaRaiz.length}</div>
          <div>Work items</div>
        </div>
        <div className="bg-red-700 text-white p-4 rounded-lg">
          <div className="text-lg font-bold">P0 do mês</div>
          <div className="text-3xl">{issuesP0.length}</div>
          <div>Work items</div>
        </div>
      </div>

      {/* Gráficos - Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="font-bold mb-2">Total Issues fechadas do mês por tipo</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={[...typeChart].sort((a, b) => b.value - a.value)}
            layout="vertical"
            margin={{ top: 10, right: 30, left: 40, bottom: 10 }}
          >
            <XAxis type="number" tick={{ fill: '#FFD600', fontWeight: 'bold' }} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#fff', fontWeight: 'bold' }} axisLine={false} width={120} />
            <Tooltip
              content={({ active, payload }) =>
                active && payload && payload.length ? (
                  <div className="custom-tooltip-rootcause">
                    <b>{payload[0].payload.name}</b>: {payload[0].value} <span className="text-xs">(clique para ver)</span>
                  </div>
                ) : null
              }
            />
            <Bar 
              dataKey="value" 
              radius={[8, 8, 8, 8]} 
              barSize={24} 
              label={{ position: 'right', fill: '#FFD600', fontWeight: 'bold' }}
              cursor="pointer"
              onClick={(data, index) => handleTypeClick(data, index)}
            >
              {[...typeChart].sort((a, b) => b.value - a.value).map((entry, idx) => (
                <Cell key={`cell-${entry.name}`} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <div className="font-bold mb-2">Correções do mês por prioridade</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={correcaoPriorityChart}>
              <XAxis dataKey="name" tick={{ fill: '#fff', fontSize: 12 }} />
              <YAxis tick={{ fill: '#fff', fontSize: 12 }} />
              <Tooltip 
                formatter={(value: number) => [`${value} (clique para ver)`, 'Qtd']}
              />
              <Bar 
                dataKey="value" 
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(data, index) => handlePriorityClick(data, index)}
              >
                {correcaoPriorityChart.map((entry, idx) => (
                  <Cell key={`cell-${entry.name}`} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráficos - Row 2 */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="font-bold mb-2">P0 por Área/Causa Raiz ({issuesP0.length} total)</div>
        {p0CausaChart.length === 0 ? (
          <div className="flex items-center justify-center h-[180px] text-ds-text text-center">
            <div>
              <div className="text-4xl mb-2">📊</div>
              <div className="text-sm">Não há Issues com prioridade P0 neste período</div>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, p0CausaChart.length * 28)}>
            <BarChart data={p0CausaChart} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <XAxis type="number" tick={{ fill: '#FFD600', fontSize: 12, fontWeight: 'bold' }} axisLine={false} />
              <YAxis 
                type="category" 
                dataKey="name" 
                tick={{ fill: '#fff', fontSize: 10 }} 
                width={200}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                formatter={(value: number) => [`${value} issues (clique para ver)`, 'Quantidade']}
              />
              <Bar 
                dataKey="value" 
                radius={[0, 8, 8, 0]}
                barSize={20}
                cursor="pointer"
                label={{ position: 'right', fill: '#FFD600', fontSize: 11, fontWeight: 'bold' }}
                onClick={(data, index) => handleP0CausaClick(data, index)}
              >
                {p0CausaChart.map((entry, idx) => (
                  <Cell key={`cell-${entry.name}`} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráficos - Row 3 */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="font-bold mb-2">Issues de Correção por Pessoa (Causa Raiz)</div>
        <div className="text-xs text-ds-text mb-2">
          🔴 Sem Causa Raiz | 🟢 Com Causa Raiz
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart 
            data={semCausaPessoaChart} 
            margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
          >
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#fff', fontSize: 11 }} 
              angle={-45}
              textAnchor="end"
              height={80}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              tick={{ fill: '#fff', fontSize: 12 }} 
              axisLine={false}
              tickLine={false}
            />
            <Tooltip 
              formatter={(value: number, name: string) => [
                `${value} issues`,
                name === 'Sem Causa Raiz' ? '🔴 Sem Causa Raiz (clique)' : '🟢 Com Causa Raiz (clique)'
              ]}
            />
            <Legend iconType="rect" />
            <Bar 
              dataKey="Sem Causa Raiz" 
              stackId="pessoa"
              fill="#F6416C"
              radius={[0, 0, 0, 0]}
              cursor="pointer"
              onClick={(data) => handlePessoaSemCausaClick(data, 0)}
            />
            <Bar 
              dataKey="Com Causa Raiz" 
              stackId="pessoa"
              fill="#43A047"
              radius={[8, 8, 0, 0]}
              label={{ position: 'top', fill: '#FFD600', fontSize: 11, fontWeight: 'bold', formatter: (value: number, entry: any) => entry?.total || value }}
              cursor="pointer"
              onClick={(data) => handlePessoaComCausaClick(data, 0)}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Export com ErrorBoundary
export const RootCauseDashboardWithErrorBoundary: React.FC<Props> = (props) => (
  <ErrorBoundary>
    <RootCauseDashboard {...props} />
  </ErrorBoundary>
);
