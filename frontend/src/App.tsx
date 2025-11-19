

import React, { useState, useMemo } from 'react';
// Fix: Import `subDays` from its submodule `date-fns/subDays` to resolve the export error.
import subDays from 'date-fns/subDays';
import { GoogleGenAI } from '@google/genai';

// Import Hooks
import { useAzureDevOpsData } from './hooks/useAzureDevOpsData.ts';

// Import Components
import Header from './components/Header.tsx';
import FilterBar from './components/FilterBar.tsx';
import SummaryCard from './components/SummaryCard.tsx';
import StatusPieChart from './components/StatusPieChart.tsx';
import TeamPerformanceBarChart from './components/TeamPerformanceBarChart.tsx';
import DeliveryTrendLineChart from './components/DeliveryTrendLineChart.tsx';
import IndividualPerformanceChart from './components/IndividualPerformanceChart.tsx';
import BugVsIssuePieChart from './components/BugVsIssuePieChart.tsx';
import BugCreationTrendChart from './components/BugCreationTrendChart.tsx';
import TeamBugChart from './components/TeamBugChart.tsx';
import AIInsightsModal from './components/AIInsightsModal.tsx';
import CumulativeFlowDiagram from './components/CumulativeFlowDiagram.tsx';
import LeadVsCycleTimeChart from './components/LeadVsCycleTimeChart.tsx';
import ThroughputHistogram from './components/ThroughputHistogram.tsx';
import MonteCarloSimulation from './components/MonteCarloSimulation.tsx';
import TeamThroughputTrendChart from './components/TeamThroughputTrendChart.tsx';
import ThroughputBreakdownChart from './components/ThroughputBreakdownChart.tsx';
import BottleneckAnalysisChart from './components/BottleneckAnalysisChart.tsx';
import TopTagsChart from './components/TopTagsChart.tsx';
import CycleTimeByTagChart from './components/CycleTimeByTagChart.tsx';
import WorkItemTable from './components/WorkItemTable.tsx';
import ClientItemDistributionChart from './components/ClientItemDistributionChart.tsx';
import ClientCycleTimeChart from './components/ClientCycleTimeChart.tsx';
import ClientThroughputChart from './components/ClientThroughputChart.tsx';

// Import Types
import { WorkItem, WorkItemFilters } from './types.ts';

// Import Metrics
import { calculatePerformanceMetrics, calculateQualityMetrics } from './utils/metrics.ts';

type Tab = 'performance' | 'quality' | 'kanban' | 'detailed-throughput' | 'bottlenecks' | 'tags' | 'clients' | 'montecarlo' | 'item-list';

const App = () => {
  const [activeTab, setActiveTab] = useState<Tab>('performance');
  const { workItems, loading: loadingWIs, error: errorWIs, lastSyncStatus } = useAzureDevOpsData();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [aiInsight, setAiInsight] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const initialWorkItemFilters: WorkItemFilters = {
    period: 30,
    teams: [],
    assignedTos: [],
    types: [],
    states: [],
    clients: [],
    tags: [],
  };

  const [workItemFilters, setWorkItemFilters] = useState<WorkItemFilters>(initialWorkItemFilters);

  const filteredWorkItems = useMemo(() => {
    const now = new Date();
    const startDate = subDays(now, workItemFilters.period);

    return workItems.filter(item => {
      const itemDate = new Date(item.createdDate);
      if (itemDate < startDate) return false;
      if (workItemFilters.teams.length > 0 && !workItemFilters.teams.includes(item.team)) return false;
      if (workItemFilters.assignedTos.length > 0 && !workItemFilters.assignedTos.includes(item.assignedTo || '')) return false;
      if (workItemFilters.types.length > 0 && !workItemFilters.types.includes(item.type)) return false;
      if (workItemFilters.states.length > 0 && !workItemFilters.states.includes(item.state)) return false;
      if (workItemFilters.clients.length > 0 && item.tipoCliente && !workItemFilters.clients.includes(item.tipoCliente)) return false;
      if (workItemFilters.tags.length > 0 && (!item.tags || !item.tags.some(t => workItemFilters.tags.includes(t)))) return false;
      return true;
    });
  }, [workItems, workItemFilters]);

  
  const handleGenerateInsights = async () => {
      setAiLoading(true);
      setAiError('');
      setAiInsight('');
      
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        
        let contextData = JSON.stringify({
          filters: workItemFilters,
          data: filteredWorkItems.slice(0, 30).map(d => ({...d, title: undefined})) // Limita o tamanho e remove o ruído do título
        });
        let prompt = `Você é um analista de engenharia de software e agilidade sênior. Analise os seguintes dados (já filtrados) do Azure DevOps em JSON e forneça insights acionáveis em português do Brasil. Formate sua resposta usando markdown.`;

        if (activeTab === 'kanban') {
            prompt += `\nFoco em: análise de fluxo (WIP, Throughput, Cycle Time, Lead Time), previsibilidade, e saúde do fluxo de trabalho. Compare Lead Time vs. Cycle Time para identificar gargalos no backlog.`;
        } else if (activeTab === 'detailed-throughput') {
             prompt += `\nFoco em: detalhar a vazão (throughput). Compare a performance entre times, identifique quem são as pessoas que mais entregam e quais tipos de item são mais comuns.`;
        } else if (activeTab === 'bottlenecks') {
            prompt += `\nFoco em: identificar gargalos no fluxo de trabalho. Analise o tempo gasto em cada status e aponte quais etapas estão demorando mais e por quê.`;
        }  else if (activeTab === 'tags') {
            prompt += `\nFoco em: analisar o uso de tags. Identifique as tags mais comuns e analise se itens com certas tags levam mais tempo para serem concluídos, sugerindo possíveis correlações.`;
        } else if (activeTab === 'clients') {
            prompt += `\nFoco em: analisar a demanda por cliente. Identifique quais clientes geram mais trabalho, qual o cycle time médio para cada um e se há algum padrão notável.`;
        } else if (activeTab === 'item-list') {
            prompt += `\nFoco em: resumir as características principais da lista de itens de trabalho fornecida. Identifique padrões comuns, como o tipo de trabalho mais frequente, o status predominante, ou times/pessoas com mais itens atribuídos.`;
        } else { // performance or quality
            prompt += `\nFoco em: vazão, cycle time, gargalos, e análise de qualidade (Bugs vs. Incidentes).`;
        }
        
        prompt += `\n\nDados: ${contextData}`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        setAiInsight(response.text);

      } catch (error) {
          console.error("Erro ao gerar insights:", error);
          setAiError("Não foi possível gerar os insights. Tente novamente.");
      } finally {
          setAiLoading(false);
      }
  };

  const { total, completed, inProgress, avgCycleTime } = useMemo(() => calculatePerformanceMetrics(filteredWorkItems), [filteredWorkItems]);
  const { openBugs, openIssues, avgResolutionTime } = useMemo(() => calculateQualityMetrics(filteredWorkItems), [filteredWorkItems]);
  
  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
  }

  const handleOpenModal = () => {
    setAiInsight('');
    setAiError('');
    setIsModalOpen(true);
  }

  const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-xl md:text-2xl font-bold text-ds-light-text">{title}</h2>
      <button
        onClick={handleOpenModal}
        className="text-ds-green hover:text-white transition-colors"
        aria-label="Gerar Insights com Inteligência Artificial"
        title="Gerar Insights com IA"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </button>
    </div>
  );

  const renderContent = () => {
    if (loadingWIs) return <div className="text-center p-10 text-ds-light-text">Carregando dados do backend...</div>;
    if (errorWIs) return <div className="text-center p-10 text-red-500">Erro ao carregar dados do backend. Verifique se o servidor está rodando.</div>;

    switch (activeTab) {
      case 'performance':
        return (
          <>
            <SectionHeader title="Visão Geral de Performance" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <SummaryCard title="Total de Itens" value={total} />
              <SummaryCard title="Concluídos no Período" value={completed} />
              <SummaryCard title="Em Progresso" value={inProgress} />
              <SummaryCard title="Cycle Time Médio" value={avgCycleTime} unit="dias" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h3 className="text-ds-light-text font-bold text-lg mb-4">Status Geral</h3><StatusPieChart data={filteredWorkItems} /></div>
              <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h3 className="text-ds-light-text font-bold text-lg mb-4">Performance dos Times</h3><TeamPerformanceBarChart data={filteredWorkItems} /></div>
              <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h3 className="text-ds-light-text font-bold text-lg mb-4">Tendência de Entregas</h3><DeliveryTrendLineChart data={filteredWorkItems} period={workItemFilters.period} /></div>
              <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h3 className="text-ds-light-text font-bold text-lg mb-4">Top 10 - Performance Individual</h3><IndividualPerformanceChart data={filteredWorkItems} /></div>
            </div>
          </>
        );
      case 'quality':
        return (
          <>
            <SectionHeader title="Análise de Qualidade" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <SummaryCard title="Bugs Abertos (Retrabalho)" value={openBugs} />
                <SummaryCard title="Incidentes em Aberto (Prod.)" value={openIssues} />
                <SummaryCard title="Tempo Médio de Resolução" value={avgResolutionTime} unit="dias" />
                <SummaryCard title="Itens de Qualidade Abertos" value={openBugs + openIssues} />
            </div>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h3 className="text-ds-light-text font-bold text-lg mb-4">Bugs vs. Incidentes</h3><BugVsIssuePieChart data={filteredWorkItems} /></div>
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h3 className="text-ds-light-text font-bold text-lg mb-4">Bugs e Incidentes por Time</h3><TeamBugChart data={filteredWorkItems} /></div>
                <div className="col-span-1 lg:col-span-2 bg-ds-navy p-4 rounded-lg border border-ds-border"><h3 className="text-ds-light-text font-bold text-lg mb-4">Tendência de Criação</h3><BugCreationTrendChart data={filteredWorkItems} period={workItemFilters.period} /></div>
            </div>
          </>
        );
      case 'clients':
        return (
          <>
            <SectionHeader title="Análise por Cliente" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                    <h3 className="text-ds-light-text font-bold text-lg mb-4">Distribuição de Itens por Cliente</h3>
                    <ClientItemDistributionChart data={filteredWorkItems} />
                </div>
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                    <h3 className="text-ds-light-text font-bold text-lg mb-4">Cycle Time Médio por Cliente (Dias)</h3>
                    <ClientCycleTimeChart data={filteredWorkItems} />
                </div>
                 <div className="col-span-1 lg:col-span-2 bg-ds-navy p-4 rounded-lg border border-ds-border">
                    <h3 className="text-ds-light-text font-bold text-lg mb-4">Itens Concluídos por Cliente</h3>
                    <ClientThroughputChart data={filteredWorkItems} />
                </div>
            </div>
          </>
        );
      case 'kanban':
        return (
          <>
            <SectionHeader title="Métricas de Fluxo e Kanban" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="lg:col-span-2 bg-ds-navy p-4 rounded-lg border border-ds-border">
                    <h3 className="text-ds-light-text font-bold text-lg mb-4">Diagrama de Fluxo Cumulativo (WIP)</h3>
                    <CumulativeFlowDiagram data={filteredWorkItems} period={workItemFilters.period} />
                </div>
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                    <h3 className="text-ds-light-text font-bold text-lg mb-4">Lead Time vs. Cycle Time por Time (Dias)</h3>
                    <LeadVsCycleTimeChart data={filteredWorkItems} />
                </div>
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                    <h3 className="text-ds-light-text font-bold text-lg mb-4">Vazão Semanal (Histograma)</h3>
                    <ThroughputHistogram data={filteredWorkItems} />
                </div>
            </div>
          </>
        );
      case 'detailed-throughput':
        return (
            <>
                <SectionHeader title="Análise Detalhada de Vazão (Throughput)" />
                <div className="grid grid-cols-1 gap-6">
                    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                        <h3 className="text-ds-light-text font-bold text-lg mb-4">Tendência de Vazão Semanal por Time</h3>
                        <TeamThroughputTrendChart data={filteredWorkItems} />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                            <h3 className="text-ds-light-text font-bold text-lg mb-4">Vazão por Responsável</h3>
                            <ThroughputBreakdownChart data={filteredWorkItems} groupBy="assignedTo" />
                        </div>
                         <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                            <h3 className="text-ds-light-text font-bold text-lg mb-4">Vazão por Tipo de Item</h3>
                            <ThroughputBreakdownChart data={filteredWorkItems} groupBy="type" />
                        </div>
                    </div>
                </div>
            </>
        );
        case 'bottlenecks':
            return (
                <>
                    <SectionHeader title="Análise de Gargalos" />
                     <div className="grid grid-cols-1 gap-6">
                        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                            <h3 className="text-ds-light-text font-bold text-lg mb-4">Tempo Médio em Cada Status (Dias)</h3>
                            <BottleneckAnalysisChart data={filteredWorkItems} />
                        </div>
                    </div>
                </>
            );
        case 'tags':
             return (
                <>
                    <SectionHeader title="Análise por Tags" />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                            <h3 className="text-ds-light-text font-bold text-lg mb-4">Top 10 Tags Mais Utilizadas</h3>
                            <TopTagsChart data={filteredWorkItems} />
                        </div>
                        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                             <h3 className="text-ds-light-text font-bold text-lg mb-4">Cycle Time Médio por Tag (Dias)</h3>
                            <CycleTimeByTagChart data={filteredWorkItems} />
                        </div>
                    </div>
                </>
            );
      case 'montecarlo':
        return (
            <>
                {/* Monte Carlo não tem um título simples, então não usamos SectionHeader */}
                <MonteCarloSimulation data={filteredWorkItems} filters={workItemFilters} />
            </>
        );
      case 'item-list':
        return (
            <>
                <SectionHeader title="Lista de Itens de Trabalho" />
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                    <WorkItemTable data={filteredWorkItems} />
                </div>
            </>
        );
      default:
        return null;
    }
  };

  const NavButton: React.FC<{tabId: Tab, children: React.ReactNode}> = ({ tabId, children }) => (
      <button onClick={() => handleTabClick(tabId)} className={`py-2 px-3 text-sm font-medium whitespace-nowrap ${activeTab === tabId ? 'border-b-2 border-ds-green text-ds-green' : 'text-ds-text hover:text-ds-light-text'}`}>
          {children}
      </button>
  );

  return (
    <div className="min-h-screen bg-ds-dark-blue">
      <Header lastSyncStatus={lastSyncStatus} />
      <div className="p-6 md:p-10">
        <div className="mb-6">
            <div className="flex border-b border-ds-border overflow-x-auto">
                <NavButton tabId="performance">Performance Geral</NavButton>
                <NavButton tabId="quality">Qualidade</NavButton>
                <NavButton tabId="clients">Análise por Cliente</NavButton>
                <NavButton tabId="kanban">Fluxo & Kanban</NavButton>
                <NavButton tabId="detailed-throughput">Vazão Detalhada</NavButton>
                <NavButton tabId="bottlenecks">Análise de Gargalos</NavButton>
                <NavButton tabId="tags">Análise de Tags</NavButton>
                <NavButton tabId="item-list">Lista de Itens</NavButton>
                <NavButton tabId="montecarlo">Previsão (Monte Carlo)</NavButton>
            </div>
        </div>
        
        <FilterBar 
            activeTab={activeTab}
            workItems={workItems}
            workItemFilters={workItemFilters}
            onWorkItemFiltersChange={setWorkItemFilters}
            onClearFilters={() => {
                setWorkItemFilters(initialWorkItemFilters);
            }}
        />
        
        <AIInsightsModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onGenerate={handleGenerateInsights}
            insight={aiInsight}
            loading={aiLoading}
            error={aiError}
            activeTab={activeTab}
        />

        <main className="mt-6">
            {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default App;