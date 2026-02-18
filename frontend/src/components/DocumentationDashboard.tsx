import React, { useState } from 'react';

interface DocSection {
  id: string;
  title: string;
  description: string;
  metrics: {
    name: string;
    formula: string;
    fields: string[];
    interpretation: string;
  }[];
  charts?: string[];
}

const DOCUMENTATION: DocSection[] = [
  {
    id: 'executive',
    title: '📊 Visão Executiva',
    description: 'Painel de indicadores de alto nível para gestores. Apresenta resumo geral do desempenho da equipe com métricas-chave de throughput, qualidade e previsibilidade.',
    metrics: [
      {
        name: 'Throughput (Vazão)',
        formula: 'COUNT(itens com closedDate no período)',
        fields: ['closedDate', 'state = Closed/Done/Finished'],
        interpretation: 'Quantidade de itens entregues. Maior = melhor capacidade de entrega.'
      },
      {
        name: 'Cycle Time Médio',
        formula: '(closedDate - firstActivationDate) em dias',
        fields: ['closedDate', 'firstActivationDate (Microsoft.VSTS.Common.ActivatedDate)'],
        interpretation: 'Tempo médio de desenvolvimento. Menor = mais ágil.'
      },
      {
        name: 'Lead Time Médio',
        formula: '(closedDate - createdDate) em dias',
        fields: ['closedDate', 'createdDate'],
        interpretation: 'Tempo total desde criação até entrega. Inclui tempo em fila.'
      },
      {
        name: 'WIP (Work in Progress)',
        formula: 'COUNT(itens em estados ativos: Active, Para Desenvolver, etc)',
        fields: ['state'],
        interpretation: 'Trabalho em andamento. WIP alto pode indicar sobrecarga.'
      }
    ],
    charts: ['Resumo Geral', 'Entregues vs Criados', 'Tendência de Entregas']
  },
  {
    id: 'team-insights',
    title: '👥 Insights por Time',
    description: 'Análise comparativa de performance entre times, baseada em area_path do Azure DevOps.',
    metrics: [
      {
        name: 'Throughput por Time',
        formula: 'COUNT(itens fechados) GROUP BY team',
        fields: ['team (extraído de System.AreaPath)'],
        interpretation: 'Comparar capacidade de entrega entre equipes.'
      },
      {
        name: 'Cycle Time por Time',
        formula: 'AVG(cycleTime) GROUP BY team',
        fields: ['closedDate', 'firstActivationDate', 'team'],
        interpretation: 'Identificar times mais ágeis ou com gargalos.'
      },
      {
        name: 'Story Points por Time',
        formula: 'SUM(storyPoints) GROUP BY team',
        fields: ['storyPoints (Microsoft.VSTS.Scheduling.StoryPoints)', 'team'],
        interpretation: 'Esforço total entregue por cada time.'
      }
    ]
  },
  {
    id: 'cycle-analytics',
    title: '⏱️ Cycle Time Analytics',
    description: 'Análise detalhada de tempo de ciclo com percentis, histograma e scatter plot para identificar outliers e padrões.',
    metrics: [
      {
        name: 'Cycle Time',
        formula: 'closedDate - firstActivationDate (em dias)',
        fields: ['closedDate', 'firstActivationDate'],
        interpretation: 'Tempo de desenvolvimento ativo (sem tempo em fila).'
      },
      {
        name: 'Percentil 50 (P50)',
        formula: 'Mediana dos cycle times',
        fields: ['cycleTime calculado'],
        interpretation: '50% dos itens são entregues neste tempo ou menos.'
      },
      {
        name: 'Percentil 85 (P85)',
        formula: '85º percentil dos cycle times',
        fields: ['cycleTime calculado'],
        interpretation: 'Usado para SLAs - 85% dos itens são entregues neste tempo.'
      },
      {
        name: 'Percentil 95 (P95)',
        formula: '95º percentil dos cycle times',
        fields: ['cycleTime calculado'],
        interpretation: 'Identifica outliers - apenas 5% levam mais que isso.'
      }
    ],
    charts: ['Histograma de Cycle Time', 'Scatter Plot (evolução temporal)', 'Box Plot por período']
  },
  {
    id: 'performance',
    title: '📈 Performance Geral',
    description: 'Métricas de desempenho individual e coletivo, comparando produtividade e consistência.',
    metrics: [
      {
        name: 'Itens por Pessoa',
        formula: 'COUNT(itens fechados) / COUNT(pessoas únicas)',
        fields: ['assignedTo (System.AssignedTo)', 'closedDate'],
        interpretation: 'Produtividade média por desenvolvedor.'
      },
      {
        name: 'Story Points por Pessoa',
        formula: 'SUM(storyPoints) / COUNT(pessoas)',
        fields: ['storyPoints', 'assignedTo'],
        interpretation: 'Esforço médio entregue por pessoa.'
      },
      {
        name: 'Variância de Cycle Time',
        formula: 'Desvio padrão dos cycle times',
        fields: ['cycleTime'],
        interpretation: 'Consistência das entregas. Menor variância = mais previsível.'
      }
    ]
  },
  {
    id: 'quality',
    title: '🎯 Qualidade',
    description: 'Indicadores de qualidade do código e processos, incluindo bugs e retrabalho.',
    metrics: [
      {
        name: 'Taxa de Bugs',
        formula: '(bugs fechados / total itens fechados) × 100',
        fields: ['type = Bug', 'closedDate'],
        interpretation: 'Percentual de bugs no throughput. Menor = melhor qualidade.'
      },
      {
        name: 'Bugs por Sprint/Período',
        formula: 'COUNT(bugs criados no período)',
        fields: ['type = Bug', 'createdDate'],
        interpretation: 'Tendência de criação de bugs.'
      },
      {
        name: 'Tempo Médio de Correção',
        formula: 'AVG(cycleTime) WHERE type = Bug',
        fields: ['type', 'cycleTime'],
        interpretation: 'Agilidade na correção de defeitos.'
      },
      {
        name: 'Top Pessoas com Reincidência',
        formula: 'Soma do valor do campo reincidência para bugs da pessoa / Total de bugs da pessoa',
        fields: ['type = Bug', 'reincidencia (Custom.REINCIDENCIA)', 'assignedTo'],
        interpretation: 'Ranking de bugs com reincidência. Ordena por soma total de reincidências. Mostra: total de reincidências (soma), número de bugs com reincidência, e taxa percentual. Considera apenas BUGS, não todos os work items.'
      }
    ]
  },
  {
    id: 'clients',
    title: '🏢 Análise por Cliente',
    description: 'Segmentação de métricas por tipo de cliente (SLA One, CTC, Franquia, etc).',
    metrics: [
      {
        name: 'Throughput por Cliente',
        formula: 'COUNT(itens fechados) GROUP BY tipoCliente',
        fields: ['tipoCliente (Custom.Tipocliente)', 'closedDate'],
        interpretation: 'Distribuição de entregas por segmento de cliente.'
      },
      {
        name: 'Cycle Time por Cliente',
        formula: 'AVG(cycleTime) GROUP BY tipoCliente',
        fields: ['tipoCliente', 'cycleTime'],
        interpretation: 'Velocidade de atendimento por tipo de cliente.'
      }
    ]
  },
  {
    id: 'kanban',
    title: '📋 Fluxo Contínuo (Kanban)',
    description: 'Visualização do fluxo de trabalho com CFD e métricas de fluxo.',
    metrics: [
      {
        name: 'CFD (Cumulative Flow Diagram)',
        formula: 'Acumulado de itens por estado ao longo do tempo',
        fields: ['state', 'changedDate'],
        interpretation: 'Visualiza gargalos (áreas largas = acúmulo).'
      },
      {
        name: 'WIP por Estado',
        formula: 'COUNT(itens) GROUP BY state',
        fields: ['state'],
        interpretation: 'Distribuição atual do trabalho no board.'
      },
      {
        name: 'Flow Efficiency',
        formula: '(tempo ativo / lead time) × 100',
        fields: ['cycleTime', 'leadTime'],
        interpretation: 'Percentual do tempo em trabalho ativo vs espera.'
      }
    ]
  },
  {
    id: 'detailed-throughput',
    title: '📊 Vazão Detalhada',
    description: 'Análise granular do throughput com breakdown por tipo, time e período.',
    metrics: [
      {
        name: 'Throughput Semanal',
        formula: 'COUNT(itens fechados) GROUP BY semana',
        fields: ['closedDate'],
        interpretation: 'Tendência de entregas por semana.'
      },
      {
        name: 'Throughput por Tipo',
        formula: 'COUNT(itens fechados) GROUP BY type',
        fields: ['type (System.WorkItemType)', 'closedDate'],
        interpretation: 'Mix de entregas (PBI, Bug, Task, etc).'
      }
    ]
  },
  {
    id: 'bottlenecks',
    title: '🚧 Gargalos (Estimado)',
    description: 'Identificação de gargalos no processo baseado em tempo em cada estado.',
    metrics: [
      {
        name: 'Tempo em Estado (Estimado)',
        formula: 'Estimativa baseada em changedDate e state',
        fields: ['state', 'changedDate'],
        interpretation: 'Estados com mais tempo indicam gargalos.'
      },
      {
        name: 'Aging WIP',
        formula: 'Dias desde entrada no estado atual',
        fields: ['changedDate', 'state'],
        interpretation: 'Itens "envelhecendo" precisam de atenção.'
      }
    ],
    charts: ['Time in Status (barras)', 'Aging Items (lista)']
  },
  {
    id: 'tags',
    title: '🏷️ Análise de Tags',
    description: 'Distribuição de trabalho por tags/categorias do Azure DevOps.',
    metrics: [
      {
        name: 'Top Tags',
        formula: 'COUNT(itens) GROUP BY tag ORDER BY count DESC',
        fields: ['tags (System.Tags)'],
        interpretation: 'Tags mais usadas indicam áreas de foco.'
      },
      {
        name: 'Cycle Time por Tag',
        formula: 'AVG(cycleTime) GROUP BY tag',
        fields: ['tags', 'cycleTime'],
        interpretation: 'Complexidade relativa por categoria.'
      }
    ]
  },
  {
    id: 'montecarlo',
    title: '🎲 Previsão (Monte Carlo)',
    description: 'Simulação de Monte Carlo para previsão probabilística de entregas.',
    metrics: [
      {
        name: 'Simulação Monte Carlo',
        formula: '10.000 iterações usando throughput histórico',
        fields: ['throughput diário histórico'],
        interpretation: 'Probabilidade de entregar X itens em Y dias.'
      },
      {
        name: 'Percentil 50 (Previsão)',
        formula: 'Mediana das simulações',
        fields: ['throughput histórico'],
        interpretation: '50% de chance de atingir esta quantidade.'
      },
      {
        name: 'Percentil 85 (Previsão)',
        formula: '85º percentil das simulações',
        fields: ['throughput histórico'],
        interpretation: 'Previsão conservadora (85% confiança).'
      }
    ]
  },
  {
    id: 'rootcause',
    title: '🔍 Root Cause (Issues)',
    description: 'Análise de causa raiz para Issues de Correção, identificando padrões e origem dos bugs. Utiliza campos customizados específicos para rastreamento de problemas.',
    metrics: [
      {
        name: 'Issues por Tipo (Correção/Alteração)',
        formula: 'COUNT(issues) GROUP BY customType',
        fields: ['customType (Custom.Type)'],
        interpretation: 'Distribuição de correções vs alterações.'
      },
      {
        name: 'P0 por Causa Raiz',
        formula: 'COUNT(P0) GROUP BY causaRaiz',
        fields: ['priority = 0', 'causaRaiz (Custom.Raizdoproblema)'],
        interpretation: 'Áreas que mais geram problemas críticos.'
      },
      {
        name: 'Issues por Time Causa Raiz',
        formula: 'COUNT(issues) GROUP BY rootCauseTeam',
        fields: ['rootCauseTeam (Custom.rootcauseteam)'],
        interpretation: 'Qual time introduziu o bug originalmente.'
      },
      {
        name: 'Issues por Complexidade',
        formula: 'COUNT(issues) GROUP BY complexity',
        fields: ['complexity (Custom.Complexity)'],
        interpretation: 'Distribuição: Baixa, Média, Alta.'
      },
      {
        name: 'Issues por Squad',
        formula: 'COUNT(issues) GROUP BY squad',
        fields: ['squad (Custom.Squad)'],
        interpretation: 'Área de negócio mais afetada.'
      },
      {
        name: 'Issues por Plataforma',
        formula: 'COUNT(issues) GROUP BY platform',
        fields: ['platform (Custom.Platform)'],
        interpretation: 'WPF, Web, Mobile, etc.'
      },
      {
        name: 'Issues por DEV',
        formula: 'COUNT(issues) GROUP BY dev',
        fields: ['dev (Custom.DEV)'],
        interpretation: 'Desenvolvedor que trabalhou na correção.'
      },
      {
        name: 'Reincidência',
        formula: 'SUM(reincidencia) GROUP BY valor',
        fields: ['reincidencia (Custom.REINCIDENCIA) - valor numérico'],
        interpretation: 'Problemas recorrentes. Campo indica quantas vezes o problema ocorreu (1x, 2x, 3x...).'
      },
      {
        name: 'Issues Sem Causa Raiz',
        formula: 'COUNT(issues WHERE causaRaiz IS NULL OR causaRaiz = "")',
        fields: ['causaRaiz (Custom.Raizdoproblema)'],
        interpretation: 'Correções sem análise de causa raiz preenchida.'
      },
      {
        name: 'Identificação da Falha',
        formula: 'COUNT(issues) GROUP BY identificacao',
        fields: ['identificacao (Custom.7ac99842-e0ec-4f18-b91b-53bfe3e3b3f5)'],
        interpretation: 'Como o problema foi identificado (Cliente, QA, Desenvolvimento, etc).'
      },
      {
        name: 'Falha do Processo',
        formula: 'COUNT(issues) GROUP BY falhaDoProcesso',
        fields: ['falhaDoProcesso (Custom.Falhadoprocesso)'],
        interpretation: 'Em qual etapa do processo a falha ocorreu.'
      }
    ]
  },
  {
    id: 'backlog',
    title: '📚 Análise de Backlog',
    description: 'Saúde do backlog, aging de itens não iniciados e distribuição por prioridade.',
    metrics: [
      {
        name: 'Backlog Total',
        formula: 'COUNT(itens WHERE state = New/Para Desenvolver)',
        fields: ['state'],
        interpretation: 'Tamanho do backlog não iniciado.'
      },
      {
        name: 'Aging do Backlog',
        formula: 'Dias desde criação para itens não iniciados',
        fields: ['createdDate', 'state = New'],
        interpretation: 'Itens antigos podem estar obsoletos.'
      },
      {
        name: 'Backlog por Prioridade',
        formula: 'COUNT(backlog) GROUP BY priority',
        fields: ['priority', 'state = New'],
        interpretation: 'Distribuição de prioridades pendentes.'
      }
    ]
  },
  {
    id: 'impedimentos',
    title: '⚠️ Impedimentos',
    description: 'Rastreamento de Work Items do tipo Impediment.',
    metrics: [
      {
        name: 'Impedimentos Ativos',
        formula: 'COUNT(items WHERE type = Impediment AND state != Closed)',
        fields: ['type = Impediment', 'state'],
        interpretation: 'Bloqueios atuais que precisam de atenção.'
      },
      {
        name: 'Tempo Médio de Resolução',
        formula: 'AVG(closedDate - createdDate) WHERE type = Impediment',
        fields: ['type', 'closedDate', 'createdDate'],
        interpretation: 'Agilidade em resolver bloqueios.'
      }
    ]
  },
  {
    id: 'po-analysis',
    title: '📝 Análise de Demanda',
    description: 'Visão do fluxo de entrada de demandas e análise para Product Owners. Inclui tracking de DOR (Definition of Ready) e DOD (Definition of Done).',
    metrics: [
      {
        name: 'Itens Criados vs Fechados',
        formula: 'COUNT(createdDate) vs COUNT(closedDate) no período',
        fields: ['createdDate', 'closedDate'],
        interpretation: 'Entrada > Saída = backlog crescendo.'
      },
      {
        name: 'Demanda por Tipo',
        formula: 'COUNT(itens criados) GROUP BY type',
        fields: ['type', 'createdDate'],
        interpretation: 'Mix de demandas entrando.'
      },
      {
        name: 'Itens com/sem DOR',
        formula: 'COUNT(itens WHERE readyDate IS NOT NULL) vs COUNT(itens WHERE readyDate IS NULL)',
        fields: ['readyDate (Custom.DOR) - data que o item ficou pronto para desenvolvimento'],
        interpretation: 'Itens com Definition of Ready preenchida. Indica qualidade da preparação da demanda.'
      },
      {
        name: 'Itens com/sem DOD',
        formula: 'COUNT(itens WHERE doneDate IS NOT NULL) vs COUNT(itens WHERE doneDate IS NULL)',
        fields: ['doneDate (Custom.DOD) - data que o item foi considerado "pronto"'],
        interpretation: 'Itens que atingiram Definition of Done. Indica conclusão completa.'
      }
    ]
  },
  {
    id: 'pull-requests',
    title: '🔀 Pull Requests & Code Review',
    description: 'Métricas de Pull Requests e processo de Code Review.',
    metrics: [
      {
        name: 'PRs Abertos',
        formula: 'COUNT(PRs WHERE status = active)',
        fields: ['status', 'createdDate'],
        interpretation: 'PRs aguardando review/merge.'
      },
      {
        name: 'Tempo de Review',
        formula: 'AVG(closedDate - createdDate) para PRs',
        fields: ['createdDate', 'closedDate'],
        interpretation: 'Velocidade do processo de code review.'
      },
      {
        name: 'PRs por Reviewer',
        formula: 'COUNT(PRs) GROUP BY reviewer',
        fields: ['reviewers'],
        interpretation: 'Carga de review por pessoa.'
      },
      {
        name: 'PRs com Valida CR',
        formula: 'COUNT(PRs WHERE labels CONTAINS "Valida CR")',
        fields: ['labels'],
        interpretation: 'PRs que passaram pela validação.'
      }
    ]
  },
  {
    id: 'scrum-ctc',
    title: '🏃 Scrum (CTC/Franquia)',
    description: 'Métricas específicas para times Scrum CTC e Franquia.',
    metrics: [
      {
        name: 'Velocity',
        formula: 'SUM(storyPoints) para itens fechados na Sprint',
        fields: ['storyPoints', 'iterationPath', 'closedDate'],
        interpretation: 'Capacidade de entrega em Story Points.'
      },
      {
        name: 'Sprint Burndown',
        formula: 'Story Points restantes ao longo da Sprint',
        fields: ['storyPoints', 'state', 'iterationPath'],
        interpretation: 'Progresso durante a Sprint.'
      }
    ]
  },
  {
    id: 'dora',
    title: '🚀 Indicadores DevOps (DORA)',
    description: 'Métricas DORA para avaliar maturidade DevOps da equipe.',
    metrics: [
      {
        name: 'Deployment Frequency',
        formula: 'Entregas por período (baseado em throughput)',
        fields: ['closedDate'],
        interpretation: 'Frequência de deploys. Elite: múltiplas por dia.'
      },
      {
        name: 'Lead Time for Changes',
        formula: 'Tempo desde commit até produção',
        fields: ['leadTime (calculado)'],
        interpretation: 'Elite: menos de 1 hora. Low: mais de 6 meses.'
      },
      {
        name: 'Change Failure Rate',
        formula: '(Bugs criados / Total entregas) × 100',
        fields: ['type = Bug', 'createdDate', 'closedDate'],
        interpretation: 'Taxa de falhas. Elite: 0-15%.'
      },
      {
        name: 'Mean Time to Restore',
        formula: 'AVG(cycleTime) para bugs P0/P1',
        fields: ['type = Bug', 'priority', 'cycleTime'],
        interpretation: 'Tempo para resolver incidentes. Elite: < 1 hora.'
      }
    ]
  },
  {
    id: 'sla',
    title: '📋 SLA Tracking',
    description: 'Monitoramento de acordos de nível de serviço por prioridade e cliente.',
    metrics: [
      {
        name: 'SLA por Prioridade',
        formula: 'Percentual de itens dentro do SLA por P0/P1/P2/P3/P4',
        fields: ['priority', 'cycleTime', 'SLA definido'],
        interpretation: 'Conformidade com SLAs por severidade.'
      },
      {
        name: 'Itens Violando SLA',
        formula: 'COUNT(itens WHERE cycleTime > SLA)',
        fields: ['cycleTime', 'priority'],
        interpretation: 'Itens que excederam o tempo acordado.'
      }
    ]
  },
  {
    id: 'metas',
    title: '🎯 Metas por Time',
    description: 'Acompanhamento de metas definidas para cada time.',
    metrics: [
      {
        name: 'Meta de Throughput',
        formula: 'Progresso vs meta definida',
        fields: ['throughput', 'meta configurada'],
        interpretation: 'Percentual de atingimento da meta de entregas.'
      },
      {
        name: 'Meta de Cycle Time',
        formula: 'Cycle Time atual vs meta',
        fields: ['cycleTime médio', 'meta configurada'],
        interpretation: 'Comparação com objetivo de velocidade.'
      }
    ]
  }
];

const AZURE_FIELDS_REFERENCE = [
  { field: 'System.Id', description: 'ID único do Work Item', example: '78645' },
  { field: 'System.Title', description: 'Título do item', example: 'Corrigir bug no cálculo de impostos' },
  { field: 'System.State', description: 'Estado atual', example: 'Active, Closed, New' },
  { field: 'System.WorkItemType', description: 'Tipo do item', example: 'Bug, Issue, PBI, Task' },
  { field: 'System.AssignedTo', description: 'Pessoa atribuída', example: 'João Silva' },
  { field: 'System.AreaPath', description: 'Área/Time', example: 'USE\\Frente de Loja' },
  { field: 'System.IterationPath', description: 'Sprint/Iteração', example: 'USE\\Sprint 45' },
  { field: 'System.CreatedDate', description: 'Data de criação', example: '2026-01-15T10:30:00Z' },
  { field: 'System.ChangedDate', description: 'Última modificação', example: '2026-02-10T14:20:00Z' },
  { field: 'System.Tags', description: 'Tags separadas por ;', example: 'PDV;Urgente;Cliente X' },
  { field: 'Microsoft.VSTS.Common.ClosedDate', description: 'Data de fechamento', example: '2026-02-11T09:00:00Z' },
  { field: 'Microsoft.VSTS.Common.Priority', description: 'Prioridade (0-4)', example: '1 (P1 = Alta)' },
  { field: 'Microsoft.VSTS.Common.ActivatedDate', description: 'Data de ativação (início do trabalho)', example: '2026-01-20T08:00:00Z' },
  { field: 'Microsoft.VSTS.Scheduling.StoryPoints', description: 'Estimativa em Story Points', example: '5' },
  { field: 'Custom.Tipocliente', description: 'Tipo de cliente', example: 'SLA ONE - CTC' },
  { field: 'Custom.Type', description: 'Tipo customizado (Issue)', example: 'Correção, Alteração' },
  { field: 'Custom.Squad', description: 'Squad responsável', example: 'Frente de Loja' },
  { field: 'Custom.Area', description: 'Área do sistema', example: 'PDV | Vendas | Caixa' },
  { field: 'Custom.Complexity', description: 'Complexidade', example: 'Baixa, Média, Alta' },
  { field: 'Custom.Platform', description: 'Plataforma', example: 'WPF, Web, Mobile' },
  { field: 'Custom.DEV', description: 'Desenvolvedor responsável', example: 'Maria Santos' },
  { field: 'Custom.QA', description: 'QA responsável', example: 'Pedro Costa' },
  { field: 'Custom.rootcauseteam', description: 'Time que causou o bug', example: 'Legado' },
  { field: 'Custom.Rootcausetask', description: 'ID da tarefa origem', example: '71142' },
  { field: 'Custom.rootcauseversion', description: 'Versão com o bug', example: '3.51.6.6' },
  { field: 'Custom.REINCIDENCIA', description: 'Número de reincidências (valor numérico)', example: '2' },
  { field: 'Custom.Raizdoproblema', description: 'Descrição da causa raiz', example: 'Falta de validação' },
  { field: 'Custom.DOR', description: 'Definition of Ready - data que item ficou pronto para dev', example: '2026-01-18T10:00:00Z' },
  { field: 'Custom.DOD', description: 'Definition of Done - data de conclusão completa', example: '2026-02-05T16:00:00Z' },
  { field: 'Custom.7ac99842-e0ec-4f18-b91b-53bfe3e3b3f5', description: 'Identificação da falha (como foi descoberta)', example: 'Cliente, QA, Desenvolvimento' },
  { field: 'Custom.Falhadoprocesso', description: 'Falha do processo (etapa onde ocorreu)', example: 'Desenvolvimento, Code Review, QA' },
  { field: 'Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028', description: 'Code Review - Nível 1', example: 'João Silva' },
  { field: 'Custom.60cee051-7e66-4753-99d6-4bc8717fae0e', description: 'Code Review - Nível 2', example: 'Maria Costa' },
  { field: 'Custom.PO', description: 'Product Owner responsável', example: 'Ana Souza' },
  { field: 'Custom.EntryDate', description: 'Data de entrada no sistema', example: '2026-01-10T08:00:00Z' },
];

const DocumentationDashboard: React.FC = () => {
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDocs = DOCUMENTATION.filter(doc => {
    if (selectedSection !== 'all' && doc.id !== selectedSection) return false;
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        doc.title.toLowerCase().includes(searchLower) ||
        doc.description.toLowerCase().includes(searchLower) ||
        doc.metrics.some(m => 
          m.name.toLowerCase().includes(searchLower) ||
          m.formula.toLowerCase().includes(searchLower) ||
          m.fields.some(f => f.toLowerCase().includes(searchLower))
        )
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-ds-navy p-6 rounded-lg border border-ds-border">
        <h1 className="text-2xl font-bold text-white mb-2">📖 Documentação do Dashboard</h1>
        <p className="text-ds-text">
          Esta seção documenta todas as métricas, cálculos e campos do Azure DevOps utilizados em cada aba do dashboard.
          Use como referência para entender como os indicadores são calculados.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-ds-text mb-1">Buscar</label>
          <input
            type="text"
            placeholder="Buscar métrica, campo, fórmula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-ds-dark-blue text-white px-3 py-2 rounded border border-ds-border focus:border-ds-green outline-none"
          />
        </div>
        <div className="min-w-[200px]">
          <label className="block text-sm text-ds-text mb-1">Filtrar por Aba</label>
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="w-full bg-ds-dark-blue text-white px-3 py-2 rounded border border-ds-border focus:border-ds-green outline-none"
          >
            <option value="all">Todas as Abas</option>
            {DOCUMENTATION.map(doc => (
              <option key={doc.id} value={doc.id}>{doc.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Documentação das Abas */}
      <div className="space-y-6">
        {filteredDocs.map((doc) => (
          <div key={doc.id} className="bg-ds-navy rounded-lg border border-ds-border overflow-hidden">
            <div className="bg-gradient-to-r from-ds-green/20 to-transparent p-4 border-b border-ds-border">
              <h2 className="text-xl font-bold text-white">{doc.title}</h2>
              <p className="text-ds-text mt-1">{doc.description}</p>
            </div>
            
            <div className="p-4">
              <h3 className="text-lg font-semibold text-ds-green mb-3">📊 Métricas</h3>
              <div className="grid gap-4">
                {doc.metrics.map((metric, idx) => (
                  <div key={idx} className="bg-ds-dark-blue p-4 rounded-lg border border-ds-border">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-bold text-white text-lg">{metric.name}</h4>
                        <div className="mt-2 space-y-2">
                          <div>
                            <span className="text-ds-text text-sm">Fórmula:</span>
                            <code className="ml-2 bg-ds-border px-2 py-1 rounded text-ds-green text-sm">
                              {metric.formula}
                            </code>
                          </div>
                          <div>
                            <span className="text-ds-text text-sm">Campos Azure DevOps:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {metric.fields.map((field, i) => (
                                <span key={i} className="bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded text-xs">
                                  {field}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="text-ds-text text-sm">
                            <span className="font-semibold">💡 Interpretação:</span> {metric.interpretation}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {doc.charts && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-ds-text mb-2">📈 Gráficos nesta aba:</h4>
                  <div className="flex flex-wrap gap-2">
                    {doc.charts.map((chart, i) => (
                      <span key={i} className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded text-sm">
                        {chart}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Referência de Campos Azure DevOps */}
      <div className="bg-ds-navy rounded-lg border border-ds-border overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600/20 to-transparent p-4 border-b border-ds-border">
          <h2 className="text-xl font-bold text-white">📋 Referência de Campos Azure DevOps</h2>
          <p className="text-ds-text mt-1">Campos do Azure DevOps utilizados pelo dashboard e seus significados.</p>
        </div>
        
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-ds-border">
                <th className="pb-2 text-ds-text font-semibold">Campo</th>
                <th className="pb-2 text-ds-text font-semibold">Descrição</th>
                <th className="pb-2 text-ds-text font-semibold">Exemplo</th>
              </tr>
            </thead>
            <tbody>
              {AZURE_FIELDS_REFERENCE.map((field, idx) => (
                <tr key={idx} className="border-b border-ds-border/50 hover:bg-ds-dark-blue">
                  <td className="py-2 pr-4">
                    <code className="text-ds-green text-xs">{field.field}</code>
                  </td>
                  <td className="py-2 pr-4 text-white">{field.description}</td>
                  <td className="py-2 text-ds-text">{field.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Glossário */}
      <div className="bg-ds-navy rounded-lg border border-ds-border p-4">
        <h2 className="text-xl font-bold text-white mb-4">📚 Glossário</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">Cycle Time</h4>
            <p className="text-ds-text text-sm">Tempo desde o início do trabalho (ativação) até a conclusão. Mede velocidade de desenvolvimento.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">Lead Time</h4>
            <p className="text-ds-text text-sm">Tempo total desde a criação do item até sua conclusão. Inclui tempo em fila.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">Throughput</h4>
            <p className="text-ds-text text-sm">Quantidade de itens entregues em um período. Mede capacidade de entrega.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">WIP (Work in Progress)</h4>
            <p className="text-ds-text text-sm">Trabalho em andamento. Itens iniciados mas não concluídos.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">Story Points</h4>
            <p className="text-ds-text text-sm">Unidade de estimativa de esforço relativo. Não representa horas.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">P0/P1/P2/P3/P4</h4>
            <p className="text-ds-text text-sm">Níveis de prioridade. P0 = crítico, P4 = baixa prioridade.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">CFD</h4>
            <p className="text-ds-text text-sm">Cumulative Flow Diagram. Gráfico de área que mostra acúmulo por estado ao longo do tempo.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">Monte Carlo</h4>
            <p className="text-ds-text text-sm">Simulação estatística usando dados históricos para previsões probabilísticas.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">DORA Metrics</h4>
            <p className="text-ds-text text-sm">4 métricas DevOps: Deploy Frequency, Lead Time, Change Failure Rate, MTTR.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentationDashboard;
