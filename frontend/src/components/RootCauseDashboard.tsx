import React, { useState, Component, ErrorInfo, ReactNode } from 'react';
import './RootCauseDashboard.css';
import { WorkItem } from '../types';
import ChartInfoLamp from './ChartInfoLamp';
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
  
  // Verifica se há field customType preenchido em alguma issue
  const hasCustomTypeData = issuesFechadas.some(w => w.customType && w.customType.trim() !== '');
  
  // Se customType está disponível, usa para filtrar; senão, considera todas as Issues fechadas como Correção
  const issuesCorrecao = hasCustomTypeData 
    ? issuesFechadas.filter(w => w.customType === 'Correção')
    : issuesFechadas; // Sem campo customType, todas Issues fechadas são tratadas como correção
  const issuesOutrosType = hasCustomTypeData 
    ? issuesFechadas.filter(w => w.customType !== 'Correção')
    : []; // Sem customType, não há "outras"
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

  // === NOVOS AGRUPAMENTOS ===
  
  // Issues por Time Causa Raiz (time que introduziu o bug)
  const rootCauseTeamCounts = issuesCorrecao.reduce((acc, item) => {
    const team = item.rootCauseTeam || '(não informado)';
    acc[team] = (acc[team] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const rootCauseTeamChart = Object.entries(rootCauseTeamCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Issues por Complexidade
  const complexityCounts = issuesCorrecao.reduce((acc, item) => {
    const comp = item.complexity || '(não informado)';
    acc[comp] = (acc[comp] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const complexityChart = Object.entries(complexityCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Issues por Squad
  const squadCounts = issuesCorrecao.reduce((acc, item) => {
    const squad = item.squad || '(não informado)';
    acc[squad] = (acc[squad] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const squadChart = Object.entries(squadCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Issues por Plataforma
  const platformCounts = issuesCorrecao.reduce((acc, item) => {
    const plat = item.platform || '(não informado)';
    acc[plat] = (acc[plat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const platformChart = Object.entries(platformCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Issues por Desenvolvedor Responsável
  const devCounts = issuesCorrecao.reduce((acc, item) => {
    const dev = item.dev || '(não informado)';
    acc[dev] = (acc[dev] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const devChart = Object.entries(devCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Issues por Reincidência
  const reincidenciaCounts = issuesCorrecao.reduce((acc, item) => {
    const reinc = item.reincidencia ? `${item.reincidencia}x` : '(não informado)';
    acc[reinc] = (acc[reinc] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const reincidenciaChart = Object.entries(reincidenciaCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => {
      // Ordena por número de reincidências
      const numA = parseInt(a.name) || 0;
      const numB = parseInt(b.name) || 0;
      return numB - numA;
    });

  // Issues por Tipo de Cliente
  const tipoClienteCounts = issuesCorrecao.reduce((acc, item) => {
    const tipoCliente = item.tipoCliente || '(não informado)';
    acc[tipoCliente] = (acc[tipoCliente] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const tipoClienteChart = Object.entries(tipoClienteCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Raiz do Problema (campo novo - Custom.Raizdoproblema)
  const causaRaizCounts = issuesCorrecao.reduce((acc, item) => {
    const causa = item.causaRaiz || '(não informado)';
    acc[causa] = (acc[causa] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const causaRaizChart = Object.entries(causaRaizCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Identificação (Custom.7ac99842-e0ec-4f18-b91b-53bfe3e3b3f5)
  const identificacaoCounts = issuesCorrecao.reduce((acc, item) => {
    const identificacao = item.identificacao || '(não informado)';
    acc[identificacao] = (acc[identificacao] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const identificacaoChart = Object.entries(identificacaoCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Falha do Processo (Custom.Falhadoprocesso)
  const falhaDoProcessoCounts = issuesCorrecao.reduce((acc, item) => {
    const falha = item.falhaDoProcesso || '(não informado)';
    acc[falha] = (acc[falha] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const falhaDoProcessoChart = Object.entries(falhaDoProcessoCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

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

  // === NOVOS HANDLERS ===
  
  const handleRootCauseTeamClick = (chartData: any, index: number) => {
    const teamName = chartData.name;
    const items = issuesCorrecao.filter(w => (w.rootCauseTeam || '(não informado)') === teamName);
    setModalData({
      title: `Correções - Time Causa Raiz: ${teamName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handleComplexityClick = (chartData: any, index: number) => {
    const compName = chartData.name;
    const items = issuesCorrecao.filter(w => (w.complexity || '(não informado)') === compName);
    setModalData({
      title: `Correções - Complexidade: ${compName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handleSquadClick = (chartData: any, index: number) => {
    const squadName = chartData.name;
    const items = issuesCorrecao.filter(w => (w.squad || '(não informado)') === squadName);
    setModalData({
      title: `Correções - Squad: ${squadName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handlePlatformClick = (chartData: any, index: number) => {
    const platName = chartData.name;
    const items = issuesCorrecao.filter(w => (w.platform || '(não informado)') === platName);
    setModalData({
      title: `Correções - Plataforma: ${platName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handleDevClick = (chartData: any, index: number) => {
    const devName = chartData.name;
    const items = issuesCorrecao.filter(w => (w.dev || '(não informado)') === devName);
    setModalData({
      title: `Correções - Dev Responsável: ${devName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handleReincidenciaClick = (chartData: any, index: number) => {
    const reincName = chartData.name;
    const items = issuesCorrecao.filter(w => {
      const reinc = w.reincidencia ? `${w.reincidencia}x` : '(não informado)';
      return reinc === reincName;
    });
    setModalData({
      title: `Correções - Reincidência: ${reincName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handleTipoClienteClick = (chartData: any, index: number) => {
    const tipoClienteName = chartData.name;
    const items = issuesCorrecao.filter(w => (w.tipoCliente || '(não informado)') === tipoClienteName);
    setModalData({
      title: `Correções - Tipo de Cliente: ${tipoClienteName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handleCausaRaizClick = (chartData: any, index: number) => {
    const causaName = chartData.name;
    const items = issuesCorrecao.filter(w => (w.causaRaiz || '(não informado)') === causaName);
    setModalData({
      title: `Correções - Raiz do Problema: ${causaName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handleIdentificacaoClick = (chartData: any, index: number) => {
    const identificacaoName = chartData.name;
    const items = issuesCorrecao.filter(w => (w.identificacao || '(não informado)') === identificacaoName);
    setModalData({
      title: `Correções - Identificação: ${identificacaoName}`,
      items,
      color: COLORS[index % COLORS.length]
    });
  };

  const handleFalhaDoProcessoClick = (chartData: any, index: number) => {
    const falhaName = chartData.name;
    const items = issuesCorrecao.filter(w => (w.falhaDoProcesso || '(não informado)') === falhaName);
    setModalData({
      title: `Correções - Falha do Processo: ${falhaName}`,
      items,
      color: COLORS[index % COLORS.length]
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
        <ChartInfoLamp info="Distribuição de issues fechadas por tipo no mês corrente. Clique nas barras para ver a listagem completa de itens." />
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={[...typeChart].sort((a, b) => b.value - a.value)}
            layout="vertical"
            margin={{ top: 10, right: 70, left: 40, bottom: 10 }}
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
          <ChartInfoLamp info="Issues de correção agrupadas por prioridade (P0-P4). Clique para ver os itens de cada prioridade." />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={correcaoPriorityChart} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fill: '#fff', fontSize: 12 }} />
              <YAxis tick={{ fill: '#fff', fontSize: 12 }} />
              <Tooltip 
                formatter={(value: number) => [`${value} (clique para ver)`, 'Qtd']}
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }}
              />
              <Bar 
                dataKey="value" 
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                label={{ position: 'top', fill: '#FFD600', fontWeight: 'bold', fontSize: 12 }}
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
        <ChartInfoLamp info="Issues P0 (críticas) agrupadas por causa raiz. Identifica as áreas mais críticas que precisam de ação preventiva." />
        {p0CausaChart.length === 0 ? (
          <div className="flex items-center justify-center h-[180px] text-ds-text text-center">
            <div>
              <div className="text-4xl mb-2">📊</div>
              <div className="text-sm">Não há Issues com prioridade P0 neste período</div>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, p0CausaChart.length * 28)}>
            <BarChart data={p0CausaChart} layout="vertical" margin={{ top: 5, right: 70, left: 20, bottom: 5 }}>
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
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }}
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
        <ChartInfoLamp info="Comparativo de issues Sem vs. Com Causa Raiz por pessoa. Alta % sem causa raiz indica falta de preenchimento do campo." />
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
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }}
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

      {/* Gráficos - Row 4: Novos Gráficos de Root Cause Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Time Causa Raiz */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <div className="font-bold mb-2">Correções por Time Causa Raiz</div>
          <ChartInfoLamp info="Qual time introduziu o bug originalmente. Ajuda a identificar padrões de qualidade por equipe." />
          {rootCauseTeamChart.length === 0 || (rootCauseTeamChart.length === 1 && rootCauseTeamChart[0].name === '(não informado)') ? (
            <div className="flex items-center justify-center h-[200px] text-ds-text text-center">
              <div>
                <div className="text-4xl mb-2">📊</div>
                <div className="text-sm">Sem dados de Time Causa Raiz</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={rootCauseTeamChart.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#FFD600', fontSize: 12 }} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#fff', fontSize: 11 }} width={120} axisLine={false} />
                <Tooltip formatter={(value: number) => [`${value} issues (clique)`, 'Qtd']} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} cursor="pointer" onClick={(data, index) => handleRootCauseTeamClick(data, index)}>
                  {rootCauseTeamChart.slice(0, 10).map((entry, idx) => (
                    <Cell key={`cell-${entry.name}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Complexidade */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <div className="font-bold mb-2">Correções por Complexidade</div>
          <ChartInfoLamp info="Distribuição de bugs por nível de complexidade (Baixa, Média, Alta)." />
          {complexityChart.length === 0 || (complexityChart.length === 1 && complexityChart[0].name === '(não informado)') ? (
            <div className="flex items-center justify-center h-[200px] text-ds-text text-center">
              <div>
                <div className="text-4xl mb-2">📊</div>
                <div className="text-sm">Sem dados de Complexidade</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={complexityChart}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => `${name}: ${value}`}
                  dataKey="value"
                  cursor="pointer"
                  onClick={(entry, index) => handleComplexityClick(entry, index)}
                >
                  {complexityChart.map((entry, idx) => (
                    <Cell key={`cell-${entry.name}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value} issues (clique)`, 'Qtd']} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Gráficos - Row 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Squad */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <div className="font-bold mb-2">Correções por Squad</div>
          <ChartInfoLamp info="Distribuição de bugs por squad/área de negócio." />
          {squadChart.length === 0 || (squadChart.length === 1 && squadChart[0].name === '(não informado)') ? (
            <div className="flex items-center justify-center h-[200px] text-ds-text text-center">
              <div>
                <div className="text-4xl mb-2">📊</div>
                <div className="text-sm">Sem dados de Squad</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={squadChart.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#FFD600', fontSize: 12 }} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#fff', fontSize: 11 }} width={120} axisLine={false} />
                <Tooltip formatter={(value: number) => [`${value} issues (clique)`, 'Qtd']} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} cursor="pointer" onClick={(data, index) => handleSquadClick(data, index)}>
                  {squadChart.slice(0, 10).map((entry, idx) => (
                    <Cell key={`cell-${entry.name}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Plataforma */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <div className="font-bold mb-2">Correções por Plataforma</div>
          <ChartInfoLamp info="Distribuição de bugs por plataforma tecnológica (WPF, Web, Mobile, etc)." />
          {platformChart.length === 0 || (platformChart.length === 1 && platformChart[0].name === '(não informado)') ? (
            <div className="flex items-center justify-center h-[200px] text-ds-text text-center">
              <div>
                <div className="text-4xl mb-2">📊</div>
                <div className="text-sm">Sem dados de Plataforma</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={platformChart}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => `${name}: ${value}`}
                  dataKey="value"
                  cursor="pointer"
                  onClick={(entry, index) => handlePlatformClick(entry, index)}
                >
                  {platformChart.map((entry, idx) => (
                    <Cell key={`cell-${entry.name}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value} issues (clique)`, 'Qtd']} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Gráficos - Row 6 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Desenvolvedor Responsável */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <div className="font-bold mb-2">Correções por Desenvolvedor (DEV)</div>
          <ChartInfoLamp info="Desenvolvedor que trabalhou na correção. Ajuda a balancear carga de trabalho e identificar especialistas." />
          {devChart.length === 0 || (devChart.length === 1 && devChart[0].name === '(não informado)') ? (
            <div className="flex items-center justify-center h-[200px] text-ds-text text-center">
              <div>
                <div className="text-4xl mb-2">📊</div>
                <div className="text-sm">Sem dados de Desenvolvedor</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={devChart.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#FFD600', fontSize: 12 }} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#fff', fontSize: 11 }} width={150} axisLine={false} />
                <Tooltip formatter={(value: number) => [`${value} issues (clique)`, 'Qtd']} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} cursor="pointer" onClick={(data, index) => handleDevClick(data, index)}>
                  {devChart.slice(0, 10).map((entry, idx) => (
                    <Cell key={`cell-${entry.name}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Reincidência */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <div className="font-bold mb-2">Correções por Reincidência</div>
          <ChartInfoLamp info="Quantas vezes o mesmo problema ocorreu. Alta reincidência indica necessidade de solução definitiva." />
          {reincidenciaChart.length === 0 || (reincidenciaChart.length === 1 && reincidenciaChart[0].name === '(não informado)') ? (
            <div className="flex items-center justify-center h-[200px] text-ds-text text-center">
              <div>
                <div className="text-4xl mb-2">📊</div>
                <div className="text-sm">Sem dados de Reincidência</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reincidenciaChart} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: '#fff', fontSize: 12 }} />
                <YAxis tick={{ fill: '#fff', fontSize: 12 }} />
                <Tooltip formatter={(value: number) => [`${value} issues (clique)`, 'Qtd']} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(data, index) => handleReincidenciaClick(data, index)}>
                  {reincidenciaChart.map((entry, idx) => (
                    <Cell key={`cell-${entry.name}`} fill={entry.name === '(não informado)' ? '#666' : COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Raiz do Problema (Campo Novo - Custom.Raizdoproblema) */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <div className="font-bold mb-2">Raiz do Problema por Tipo (Campo Novo)</div>
          <ChartInfoLamp info="Campo novo de causa raiz (Custom.Raizdoproblema). Classificação mais precisa do problema encontrado." />
          {causaRaizChart.length === 0 || (causaRaizChart.length === 1 && causaRaizChart[0].name === '(não informado)') ? (
            <div className="flex items-center justify-center h-[200px] text-ds-text text-center">
              <div>
                <div className="text-4xl mb-2">📊</div>
                <div className="text-sm">Sem dados de Raiz do Problema (Campo Novo)</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={causaRaizChart.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#FFD600', fontSize: 12 }} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#fff', fontSize: 11 }} width={150} axisLine={false} />
                <Tooltip formatter={(value: number) => [`${value} issues (clique)`, 'Qtd']} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} cursor="pointer" onClick={(data, index) => handleCausaRaizClick(data, index)}>
                  {causaRaizChart.slice(0, 10).map((entry, idx) => (
                    <Cell key={`cell-${entry.name}`} fill={entry.name === '(não informado)' ? '#666' : COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Identificação */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <div className="font-bold mb-2">Quem Identificou o Problema</div>
          <ChartInfoLamp info="Como o problema foi identificado: Cliente, Interno, Monitoramento, Parceiro ou Testes automatizados." />
          {identificacaoChart.length === 0 || (identificacaoChart.length === 1 && identificacaoChart[0].name === '(não informado)') ? (
            <div className="flex items-center justify-center h-[200px] text-ds-text text-center">
              <div>
                <div className="text-4xl mb-2">📊</div>
                <div className="text-sm">Sem dados de Identificação</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={identificacaoChart} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: '#fff', fontSize: 11 }} />
                <YAxis tick={{ fill: '#fff', fontSize: 12 }} />
                <Tooltip formatter={(value: number) => [`${value} issues (clique)`, 'Qtd']} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(data, index) => handleIdentificacaoClick(data, index)}>
                  {identificacaoChart.map((entry, idx) => (
                    <Cell key={`cell-${entry.name}`} fill={entry.name === '(não informado)' ? '#666' : COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Falha do Processo */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <div className="font-bold mb-2">Falha do Processo</div>
          <ChartInfoLamp info="Por que o problema não foi detectado antes: falta de testes, code review, análise de impacto, etc." />
          {falhaDoProcessoChart.length === 0 || (falhaDoProcessoChart.length === 1 && falhaDoProcessoChart[0].name === '(não informado)') ? (
            <div className="flex items-center justify-center h-[200px] text-ds-text text-center">
              <div>
                <div className="text-4xl mb-2">📊</div>
                <div className="text-sm">Sem dados de Falha do Processo</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={falhaDoProcessoChart.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#FFD600', fontSize: 12 }} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#fff', fontSize: 9 }} width={180} axisLine={false} />
                <Tooltip formatter={(value: number) => [`${value} issues (clique)`, 'Qtd']} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} cursor="pointer" onClick={(data, index) => handleFalhaDoProcessoClick(data, index)}>
                  {falhaDoProcessoChart.slice(0, 10).map((entry, idx) => (
                    <Cell key={`cell-${entry.name}`} fill={entry.name === '(não informado)' ? '#666' : COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tipo de Cliente */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <div className="font-bold mb-2">Correções por Tipo de Cliente</div>
          <ChartInfoLamp info="Distribuição de correções por tipo/nível de SLA do cliente. Ajuda a identificar clientes com maior volume de problemas." />
          {tipoClienteChart.length === 0 || (tipoClienteChart.length === 1 && tipoClienteChart[0].name === '(não informado)') ? (
            <div className="flex items-center justify-center h-[200px] text-ds-text text-center">
              <div>
                <div className="text-4xl mb-2">📊</div>
                <div className="text-sm">Sem dados de Tipo de Cliente</div>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={tipoClienteChart.slice(0, 10)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: '#fff', fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fill: '#fff', fontSize: 12 }} />
                <Tooltip formatter={(value: number) => [`${value} issues (clique)`, 'Qtd']} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(data, index) => handleTipoClienteClick(data, index)}>
                  {tipoClienteChart.slice(0, 10).map((entry, idx) => (
                    <Cell key={`cell-${entry.name}`} fill={entry.name === '(não informado)' ? '#666' : COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
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
