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
    title: 'Ã°Å¸Å½Â¯ VisÃƒÂ£o Executiva',
    description: 'Painel de alto nÃƒÂ­vel para gestores. Indicadores-chave de throughput, qualidade e previsibilidade da equipe no perÃƒÂ­odo selecionado.',
    metrics: [
      { name: 'Throughput (VazÃƒÂ£o)', formula: 'COUNT(itens com closedDate no perÃƒÂ­odo)', fields: ['closedDate', 'state = Closed/Done/Finished/Pronto'], interpretation: 'Quantidade de itens entregues. Maior = melhor capacidade de entrega.' },
      { name: 'Cycle Time MÃƒÂ©dio', formula: '(closedDate - firstActivationDate) em dias', fields: ['closedDate', 'firstActivationDate'], interpretation: 'Tempo mÃƒÂ©dio de desenvolvimento ativo. Menor = mais ÃƒÂ¡gil.' },
      { name: 'Lead Time MÃƒÂ©dio', formula: '(closedDate - createdDate) em dias', fields: ['closedDate', 'createdDate'], interpretation: 'Tempo total desde criaÃƒÂ§ÃƒÂ£o atÃƒÂ© entrega, incluindo espera no backlog.' },
      { name: 'WIP (Work in Progress)', formula: 'COUNT(itens em estados ativos)', fields: ['state = Active, Para Desenvolver, Aguardando QA, etc.'], interpretation: 'Trabalho em andamento simultÃƒÂ¢neo. WIP alto pode indicar sobrecarga.' }
    ],
    charts: ['Resumo Geral', 'Entregues vs Criados', 'TendÃƒÂªncia de Entregas Semanal/Quinzenal/Mensal/Anual']
  },
  {
    id: 'team-insights',
    title: 'Ã°Å¸â€˜Â¥ Insights por Time',
    description: 'AnÃƒÂ¡lise comparativa de performance entre times. Inclui throughput, cycle time, P85 e percentil de cycle time por time.',
    metrics: [
      { name: 'Throughput por Time', formula: 'COUNT(itens fechados) GROUP BY team', fields: ['team (extraÃƒÂ­do de System.AreaPath)'], interpretation: 'Comparar capacidade de entrega entre equipes.' },
      { name: 'Cycle Time por Time', formula: 'AVG(cycleTime) GROUP BY team', fields: ['closedDate', 'firstActivationDate', 'team'], interpretation: 'Identificar times mais ÃƒÂ¡geis ou com gargalos.' },
      { name: 'P85 Cycle Time por Time', formula: '85Ã‚Âº percentil (cycleTime) GROUP BY team', fields: ['cycleTime', 'team'], interpretation: 'SLA de ciclo por time. 85% dos itens sÃƒÂ£o entregues neste tempo ou menos.' }
    ]
  },
  {
    id: 'team-evolution',
    title: 'Ã°Å¸â€œâ€¦ EvoluÃƒÂ§ÃƒÂ£o Times',
    description: 'VisÃƒÂ£o semanal simplificada por time: throughput, cycle time, P85, lead time, WIP, impedimentos, gargalos, retrabalho e itens crÃƒÂ­ticos. Ideal para reuniÃƒÂµes de time.',
    metrics: [
      { name: 'Throughput Semanal', formula: 'COUNT(closedDate dentro da semana) por time', fields: ['closedDate', 'team'], interpretation: 'Entregas efetivas na semana.' },
      { name: 'ProjeÃƒÂ§ÃƒÂ£o atÃƒÂ© fim da semana', formula: '(throughput atual / dias decorridos) Ãƒâ€” 5', fields: ['closedDate', 'data atual'], interpretation: 'Estimativa de entrega se o ritmo se mantiver.' },
      { name: 'Gargalo da semana', formula: 'Estado com maior tempo mÃƒÂ©dio (via timeInStatusDays)', fields: ['timeInStatusDays'], interpretation: 'Onde as tarefas ficaram mais paradas. Clique para ver os itens.' },
      { name: 'Itens P1/P2 resolvidos', formula: 'COUNT(closedDate na semana WHERE priority <= 2)', fields: ['priority', 'closedDate'], interpretation: 'UrgÃƒÂªncias crÃƒÂ­ticas resolvidas na semana.' },
      { name: 'Retrabalho', formula: 'COUNT(reincidencia > 0) / total Ãƒâ€” 100', fields: ['reincidencia'], interpretation: '% de itens que voltaram. 0% = ideal.' }
    ],
    charts: ['Tabela semanal 4 semanas + projeÃƒÂ§ÃƒÂ£o', 'BarChart Throughput', 'LineChart CT vs LT', 'BarChart WIP', 'Cards de gargalo clicÃƒÂ¡veis']
  },
  {
    id: 'cycle-analytics',
    title: 'Ã¢ÂÂ±Ã¯Â¸Â Cycle Time Analytics',
    description: 'AnÃƒÂ¡lise detalhada de tempo de ciclo com percentis P50/P85/P95, histograma por time, scatter plot e histÃƒÂ³rico comparativo semanal/quinzenal/mensal.',
    metrics: [
      { name: 'Cycle Time', formula: 'closedDate - firstActivationDate (dias)', fields: ['closedDate', 'firstActivationDate'], interpretation: 'Tempo de desenvolvimento ativo, sem tempo em fila.' },
      { name: 'P50 (Mediana)', formula: 'Mediana dos cycle times', fields: ['cycleTime calculado'], interpretation: '50% dos itens sÃƒÂ£o entregues neste tempo ou menos.' },
      { name: 'P85', formula: '85Ã‚Âº percentil dos cycle times', fields: ['cycleTime calculado'], interpretation: 'ReferÃƒÂªncia de SLA. 85% das entregas ocorrem dentro deste prazo.' },
      { name: 'P95', formula: '95Ã‚Âº percentil dos cycle times', fields: ['cycleTime calculado'], interpretation: 'Identifica outliers: apenas 5% levam mais que isso.' }
    ],
    charts: ['Percentil P85 por mÃƒÂªs (linha/barras)', 'Histograma P50/P85/P95 por time', 'TendÃƒÂªncia CT vs LT', 'HistÃƒÂ³rico Semanal/Quinzenal/Mensal', 'Scatter Plot', 'Ranking de Times', 'Top 15 Outliers', 'GlossÃƒÂ¡rio']
  },
  {
    id: 'performance',
    title: 'Ã°Å¸â€œË† Performance Geral',
    description: 'MÃƒÂ©tricas de desempenho individual e coletivo: throughput, cycle time, status, aging e heatmap de atividade.',
    metrics: [
      { name: 'Top 10 - Performance Individual', formula: 'COUNT(itens fechados) GROUP BY assignedTo', fields: ['assignedTo', 'closedDate'], interpretation: 'Colaboradores com mais entregas no perÃƒÂ­odo.' },
      { name: 'Aging WIP', formula: 'Dias em andamento > threshold (P1: 3d, P2: 7d, P3: 14d)', fields: ['changedDate', 'state', 'priority'], interpretation: 'Itens parados hÃƒÂ¡ muito tempo. Indicador visual de risco.' },
      { name: 'WIP Limits', formula: 'COUNT(itens em andamento) por coluna/time/pessoa', fields: ['state', 'team', 'assignedTo'], interpretation: 'WIP alto por pessoa indica sobrecarga.' },
      { name: 'Comparativo PerÃƒÂ­odo Anterior', formula: 'DiferenÃƒÂ§a percentual vs perÃƒÂ­odo equivalente anterior', fields: ['closedDate', 'perÃƒÂ­odo'], interpretation: 'TendÃƒÂªncia de melhora ou piora na entrega.' }
    ],
    charts: ['Status Geral (pizza)', 'Performance dos Times', 'TendÃƒÂªncia de Entregas', 'Top 10 Individual', 'Aging Items', 'WIP Limits', 'Activity Heatmap']
  },
  {
    id: 'quality',
    title: 'Ã¢Å“â€¦ Qualidade',
    description: 'Indicadores de qualidade: Bugs vs Issues, taxa de detecÃƒÂ§ÃƒÂ£o, MTTR, retrabalho e bugs por feature.',
    metrics: [
      { name: 'Bug vs Issue', formula: 'COUNT(type=Bug) vs COUNT(type=Issue)', fields: ['type'], interpretation: 'Bug = erro detectado em desenvolvimento. Issue = erro que chegou ao cliente. Alta proporÃƒÂ§ÃƒÂ£o de Bug = QA eficaz.' },
      { name: 'Taxa de DetecÃƒÂ§ÃƒÂ£o', formula: 'Bugs / (Bugs + Issues) Ãƒâ€” 100', fields: ['type'], interpretation: 'Quanto maior, melhor: mais erros capturados antes da produÃƒÂ§ÃƒÂ£o. Alvo: >70%.' },
      { name: 'MTTR (Mean Time to Restore)', formula: 'AVG(cycleTime) WHERE type = Bug', fields: ['type', 'cycleTime'], interpretation: 'Tempo mÃƒÂ©dio para corrigir defeitos.' },
      { name: 'Retrabalho (ReincidÃƒÂªncia)', formula: 'COUNT(reincidencia > 0) / COUNT(Issues) Ãƒâ€” 100', fields: ['reincidencia'], interpretation: 'Issues que voltaram. 0% = ideal.' }
    ],
    charts: ['Bugs vs Issues (pizza)', 'Bugs/Issues por Time', 'TendÃƒÂªncia de CriaÃƒÂ§ÃƒÂ£o', 'Rework Analysis', 'Bugs e Issues por Feature']
  },
  {
    id: 'kanban',
    title: 'Ã°Å¸â€œÅ  Fluxo ContÃƒÂ­nuo (Kanban)',
    description: 'VisualizaÃƒÂ§ÃƒÂ£o do fluxo de trabalho Kanban: CFD, Lead Time vs Cycle Time, Histograma de VazÃƒÂ£o e Flow Efficiency.',
    metrics: [
      { name: 'CFD (Cumulative Flow Diagram)', formula: 'Acumulado de itens por estado ao longo do tempo', fields: ['state', 'changedDate'], interpretation: 'ÃƒÂreas largas = acÃƒÂºmulo/gargalo naquele estado.' },
      { name: 'Flow Efficiency', formula: '(cycleTime / leadTime) Ãƒâ€” 100', fields: ['cycleTime', 'leadTime'], interpretation: '% do tempo em trabalho ativo vs espera. Alvo: >40%.' },
      { name: 'Lead Time vs Cycle Time', formula: 'DiferenÃƒÂ§a entre leadTime e cycleTime por time', fields: ['leadTime', 'cycleTime', 'team'], interpretation: 'A diferenÃƒÂ§a ÃƒÂ© o tempo de espera no backlog antes de iniciar.' }
    ],
    charts: ['CFD', 'Lead Time vs Cycle Time por Time', 'Histograma de VazÃƒÂ£o Semanal', 'Flow Efficiency por Time']
  },
  {
    id: 'detailed-throughput',
    title: 'Ã°Å¸â€œâ€° VazÃƒÂ£o Detalhada',
    description: 'AnÃƒÂ¡lise granular de throughput por time, responsÃƒÂ¡vel e tipo de item ao longo do tempo.',
    metrics: [
      { name: 'Throughput Semanal por Time', formula: 'COUNT(closedDate) GROUP BY semana, team', fields: ['closedDate', 'team'], interpretation: 'TendÃƒÂªncia de entrega por equipe semana a semana.' },
      { name: 'Throughput por ResponsÃƒÂ¡vel', formula: 'COUNT(closedDate) GROUP BY assignedTo', fields: ['assignedTo', 'closedDate'], interpretation: 'DistribuiÃƒÂ§ÃƒÂ£o de entregas por pessoa.' },
      { name: 'Throughput por Tipo', formula: 'COUNT(closedDate) GROUP BY type', fields: ['type', 'closedDate'], interpretation: 'Mix de entregas: User Story, Bug, Feature, Task, etc.' }
    ]
  },
  {
    id: 'bottlenecks',
    title: 'Ã°Å¸Å¡Â§ Gargalos (Estimado)',
    description: 'IdentificaÃƒÂ§ÃƒÂ£o de gargalos por tempo estimado em cada estado, baseado em changedDate.',
    metrics: [
      { name: 'Tempo em Estado (Estimado)', formula: 'Estimativa via changedDate: quando o estado mudou', fields: ['state', 'changedDate'], interpretation: 'Estados com mais tempo indicam onde o fluxo trava.' },
      { name: 'Aging WIP por Estado', formula: 'Dias desde entrada no estado atual', fields: ['changedDate', 'state'], interpretation: 'Itens envelhecendo em um estado precisam de atenÃƒÂ§ÃƒÂ£o.' }
    ],
    charts: ['Time in Status (barras horizontais por estado)', 'Aging Items (lista clicÃƒÂ¡vel)']
  },
  {
    id: 'impedimentos',
    title: 'Ã¢Å¡Â Ã¯Â¸Â Impedimentos',
    description: 'Rastreamento de itens com tag IMPEDIMENTO ou campo bloqueio ativo. Filtra da aba Ignorar Impedimentos nas mÃƒÂ©tricas quando ativado.',
    metrics: [
      { name: 'Impedimentos Ativos', formula: 'COUNT(tags LIKE IMPEDIMENTO AND state != Closed)', fields: ['tags = IMPEDIMENTO', 'state'], interpretation: 'Bloqueios atuais. Clique nas barras para ver detalhes.' },
      { name: 'Bloqueio Externo', formula: 'COUNT(bloqueio = true)', fields: ['bloqueio (campo booleano)'], interpretation: 'Itens bloqueados por dependÃƒÂªncias externas (fora do time).' }
    ]
  },
  {
    id: 'quality',
    title: 'Ã¢Å“â€¦ Qualidade',
    description: 'Bugs, Issues, retrabalho e qualidade por feature.',
    metrics: [
      { name: 'Taxa de DetecÃƒÂ§ÃƒÂ£o', formula: 'Bugs / (Bugs + Issues) Ãƒâ€” 100', fields: ['type'], interpretation: 'Percentual de erros capturados antes da produÃƒÂ§ÃƒÂ£o. >70% = excelente.' }
    ]
  },
  {
    id: 'tags',
    title: 'Ã°Å¸ÂÂ·Ã¯Â¸Â AnÃƒÂ¡lise de Tags',
    description: 'DistribuiÃƒÂ§ÃƒÂ£o de trabalho pelas tags configuradas no Azure DevOps.',
    metrics: [
      { name: 'Top Tags', formula: 'COUNT(itens) GROUP BY tag ORDER BY count DESC', fields: ['tags (System.Tags)'], interpretation: 'Tags mais usadas indicam foco e categorizaÃƒÂ§ÃƒÂ£o do trabalho.' },
      { name: 'Cycle Time por Tag', formula: 'AVG(cycleTime) GROUP BY tag', fields: ['tags', 'cycleTime'], interpretation: 'Complexidade relativa por categoria.' }
    ]
  },
  {
    id: 'clients',
    title: 'Ã°Å¸ÂÂ¢ AnÃƒÂ¡lise por Cliente',
    description: 'SegmentaÃƒÂ§ÃƒÂ£o de mÃƒÂ©tricas por tipo de cliente (campo Custom.Tipocliente).',
    metrics: [
      { name: 'Throughput por Cliente', formula: 'COUNT(itens fechados) GROUP BY tipoCliente', fields: ['tipoCliente (Custom.Tipocliente)'], interpretation: 'DistribuiÃƒÂ§ÃƒÂ£o de entregas por segmento de cliente.' },
      { name: 'Cycle Time por Cliente', formula: 'AVG(cycleTime) GROUP BY tipoCliente', fields: ['tipoCliente', 'cycleTime'], interpretation: 'Velocidade de atendimento por tipo de cliente.' }
    ]
  },
  {
    id: 'montecarlo',
    title: 'Ã°Å¸Å½Â² PrevisÃƒÂ£o (Monte Carlo)',
    description: 'SimulaÃƒÂ§ÃƒÂ£o probabilÃƒÂ­stica usando throughput histÃƒÂ³rico para prever quantos itens serÃƒÂ£o entregues.',
    metrics: [
      { name: 'SimulaÃƒÂ§ÃƒÂ£o Monte Carlo', formula: '10.000 iteraÃƒÂ§ÃƒÂµes usando throughput histÃƒÂ³rico diÃƒÂ¡rio', fields: ['throughput histÃƒÂ³rico'], interpretation: 'Probabilidade de entregar X itens em Y dias.' },
      { name: 'P50 (50% confianÃƒÂ§a)', formula: 'Mediana das simulaÃƒÂ§ÃƒÂµes', fields: ['throughput'], interpretation: 'PrevisÃƒÂ£o otimista Ã¢â‚¬â€ chance igual de ser mais ou menos.' },
      { name: 'P85 (85% confianÃƒÂ§a)', formula: '85Ã‚Âº percentil das simulaÃƒÂ§ÃƒÂµes', fields: ['throughput'], interpretation: 'PrevisÃƒÂ£o conservadora recomendada para compromissos.' }
    ]
  },
  {
    id: 'backlog',
    title: 'Ã°Å¸â€œÅ¡ AnÃƒÂ¡lise de Backlog',
    description: 'SaÃƒÂºde do backlog, aging de itens nÃƒÂ£o iniciados e capacidade recomendada de refinamento.',
    metrics: [
      { name: 'Backlog Total', formula: 'COUNT(state = New/Para Desenvolver)', fields: ['state'], interpretation: 'Tamanho do backlog pendente.' },
      { name: 'Aging do Backlog', formula: 'Dias desde createdDate para itens nÃƒÂ£o iniciados', fields: ['createdDate', 'state'], interpretation: 'Itens muito antigos podem estar obsoletos.' },
      { name: 'Capacidade Recomendada', formula: 'Throughput mÃƒÂ©dio Ãƒâ€” 3 (buffer de 3x sprint)', fields: ['throughput histÃƒÂ³rico'], interpretation: 'Quantidade ideal de itens refinados para manter o fluxo.' }
    ]
  },
  {
    id: 'po-analysis',
    title: 'Ã°Å¸â€œÂ¥ AnÃƒÂ¡lise de Demanda',
    description: 'VisÃƒÂ£o de entrada de demandas, criaÃƒÂ§ÃƒÂ£o por PO e taxa de qualidade da especificaÃƒÂ§ÃƒÂ£o.',
    metrics: [
      { name: 'Itens Criados vs Fechados', formula: 'COUNT(createdDate) vs COUNT(closedDate) no perÃƒÂ­odo', fields: ['createdDate', 'closedDate'], interpretation: 'Entrada > SaÃƒÂ­da = backlog crescendo.' },
      { name: 'Demanda por Tipo', formula: 'COUNT(itens criados) GROUP BY type', fields: ['type', 'createdDate'], interpretation: 'Mix de demandas entrando.' },
      { name: 'Taxa de Bugs por Criador', formula: 'Bugs gerados / itens criados por PO', fields: ['createdBy', 'type'], interpretation: 'Qualidade da especificaÃƒÂ§ÃƒÂ£o. Alto = itens mal especificados gerando retrabalho.' }
    ]
  },
  {
    id: 'pull-requests',
    title: 'Ã°Å¸â€â‚¬ Pull Requests & Code Review',
    description: 'MÃƒÂ©tricas de PRs sincronizados do Azure DevOps Repos.',
    metrics: [
      { name: 'PRs Abertos', formula: 'COUNT(PRs WHERE status = active)', fields: ['status', 'createdDate'], interpretation: 'PRs aguardando review/merge.' },
      { name: 'Tempo de Review', formula: 'AVG(closedDate - createdDate) para PRs', fields: ['createdDate', 'closedDate'], interpretation: 'Velocidade do processo de code review.' },
      { name: 'PRs por RepositÃƒÂ³rio', formula: 'COUNT(PRs) GROUP BY repositoryName', fields: ['repositoryName'], interpretation: 'DistribuiÃƒÂ§ÃƒÂ£o de trabalho por repositÃƒÂ³rio.' }
    ]
  },
  {
    id: 'scrum-ctc',
    title: 'Ã°Å¸ÂÆ’ Scrum',
    description: 'MÃƒÂ©tricas especÃƒÂ­ficas para times que usam Scrum. Seletor de time disponÃƒÂ­vel. Usa iterationPath para identificar sprints.',
    metrics: [
      { name: 'Velocity', formula: 'SUM(storyPoints) para itens fechados na Sprint', fields: ['storyPoints', 'iterationPath', 'closedDate'], interpretation: 'Capacidade de entrega em Story Points por sprint.' },
      { name: 'Sprint Burndown', formula: 'Story Points restantes ao longo da Sprint', fields: ['storyPoints', 'state', 'iterationPath'], interpretation: 'Progresso durante a Sprint.' },
      { name: 'Estimativa vs Realidade', formula: 'originalEstimate vs completedWork vs remainingWork', fields: ['originalEstimate', 'completedWork', 'remainingWork'], interpretation: 'Acuracidade das estimativas por sprint.' }
    ]
  },
  {
    id: 'dora',
    title: 'Ã°Å¸Å¡â‚¬ Indicadores DevOps (DORA Ã¢â‚¬â€ Adaptados)',
    description: 'MÃƒÂ©tricas DORA adaptadas para o contexto de Work Items do Azure DevOps. NÃƒÂ£o sÃƒÂ£o mÃƒÂ©tricas DORA reais (que requerem dados de pipeline CI/CD), mas aproximaÃƒÂ§ÃƒÂµes conceituais ÃƒÂºteis.',
    metrics: [
      { name: 'Deployment Frequency (Adaptado)', formula: 'Throughput mÃƒÂ©dio semanal', fields: ['closedDate'], interpretation: 'FrequÃƒÂªncia de entregas. Elite: mÃƒÂºltiplas por semana.' },
      { name: 'Lead Time for Changes (Adaptado)', formula: 'Cycle time mÃƒÂ©dio de User Stories/PBIs', fields: ['cycleTime', 'type'], interpretation: 'Tempo do inÃƒÂ­cio do desenvolvimento atÃƒÂ© entrega. Elite: < 1 semana.' },
      { name: 'Change Failure Rate (Adaptado)', formula: '(Bugs criados / entregas) Ãƒâ€” 100', fields: ['type = Bug', 'closedDate'], interpretation: 'Taxa de falhas pÃƒÂ³s-entrega. Elite: < 15%.' },
      { name: 'MTTR Ã¢â‚¬â€ Mean Time to Restore (Adaptado)', formula: 'AVG(cycleTime) WHERE type = Bug', fields: ['type', 'cycleTime'], interpretation: 'Velocidade de correÃƒÂ§ÃƒÂ£o de defeitos. Elite: < 1 dia.' }
    ]
  },
  {
    id: 'sla',
    title: 'Ã°Å¸â€œâ€¹ SLA Tracking',
    description: 'Monitoramento de acordos de nÃƒÂ­vel de serviÃƒÂ§o por prioridade.',
    metrics: [
      { name: 'SLA por Prioridade', formula: '% itens dentro do SLA por P0/P1/P2/P3', fields: ['priority', 'cycleTime'], interpretation: 'Conformidade com SLAs por severidade.' },
      { name: 'Itens Violando SLA', formula: 'COUNT(cycleTime > SLA definido)', fields: ['cycleTime', 'priority'], interpretation: 'Itens que excederam o tempo acordado.' }
    ]
  },
  {
    id: 'metas',
    title: 'Ã°Å¸ÂÂ Metas por Time',
    description: 'Acompanhamento de metas de throughput e cycle time definidas para cada time.',
    metrics: [
      { name: 'Meta de Throughput', formula: 'Throughput atual / meta Ãƒâ€” 100', fields: ['throughput', 'meta configurada'], interpretation: 'Percentual de atingimento da meta de entregas.' },
      { name: 'Meta de Cycle Time', formula: 'Cycle Time atual vs meta', fields: ['cycleTime', 'meta'], interpretation: 'ComparaÃƒÂ§ÃƒÂ£o com objetivo de velocidade.' }
    ]
  },
  {
    id: 'period-comparison',
    title: 'Ã°Å¸â€œÅ  ComparaÃƒÂ§ÃƒÂ£o de PerÃƒÂ­odos',
    description: 'Compare mÃƒÂ©tricas entre dois perÃƒÂ­odos diferentes para validar impacto de mudanÃƒÂ§as.',
    metrics: [
      { name: 'Delta Throughput', formula: 'PerÃƒÂ­odo A - PerÃƒÂ­odo B (COUNT itens fechados)', fields: ['closedDate', 'perÃƒÂ­odo'], interpretation: 'Melhora ou piora na capacidade de entrega entre perÃƒÂ­odos.' },
      { name: 'Delta Cycle Time', formula: 'AVG(cycleTime) PerÃƒÂ­odo A vs PerÃƒÂ­odo B', fields: ['cycleTime', 'perÃƒÂ­odo'], interpretation: 'EvoluÃƒÂ§ÃƒÂ£o da velocidade de desenvolvimento.' }
    ]
  },
  {
    id: 'team-comparison',
    title: 'Ã°Å¸â€˜Â¥ Pessoas & Senioridade',
    description: 'ComparaÃƒÂ§ÃƒÂ£o individual de performance, senioridade e contribuiÃƒÂ§ÃƒÂ£o por pessoa.',
    metrics: [
      { name: 'Entregas por Pessoa', formula: 'COUNT(closedDate) GROUP BY assignedTo', fields: ['assignedTo', 'closedDate'], interpretation: 'Volume de entrega individual.' },
      { name: 'Cycle Time por Pessoa', formula: 'AVG(cycleTime) GROUP BY assignedTo', fields: ['cycleTime', 'assignedTo'], interpretation: 'Velocidade individual de desenvolvimento.' }
    ]
  },
  {
    id: 'rootcause',
    title: 'Ã°Å¸â€Â Root Cause (Issues)',
    description: 'AnÃƒÂ¡lise de causa raiz para Issues. Utiliza campos customizados do Azure DevOps.',
    metrics: [
      { name: 'Issues por Causa Raiz', formula: 'COUNT(issues) GROUP BY causaRaiz', fields: ['causaRaiz (Custom.Raizdoproblema)'], interpretation: 'Causas mais frequentes de issues em produÃƒÂ§ÃƒÂ£o.' },
      { name: 'P0 por Causa Raiz', formula: 'COUNT(P0) GROUP BY causaRaiz', fields: ['priority = 0', 'causaRaiz'], interpretation: 'Causas de problemas crÃƒÂ­ticos.' },
      { name: 'Issues por Squad', formula: 'COUNT(issues) GROUP BY squad', fields: ['squad (Custom.Squad)'], interpretation: 'ÃƒÂrea de negÃƒÂ³cio mais afetada.' },
      { name: 'ReincidÃƒÂªncia', formula: 'SUM(reincidencia) GROUP BY valor', fields: ['reincidencia (Custom.REINCIDENCIA)'], interpretation: 'Problemas recorrentes. Campo numÃƒÂ©rico (1x, 2x, 3x...).' }
    ]
  },
  {
    id: 'rituals',
    title: 'Ã°Å¸â€”â€œÃ¯Â¸Â Ritos & Cerimonias',
    description: 'Controle manual de realizacao de cerimonias ageis (Refinamento, Review, Retrospectiva, Planning, Daily). Permite registro retroativo e importacao de calendario .ics ou Outlook.',
    metrics: [
      { name: '% de Realizacao', formula: 'Realizados / (Realizados + Remarcados + Cancelados) Ãƒâ€” 100', fields: ['status = done/rescheduled/cancelled'], interpretation: 'Taxa de realizacao das cerimonias. Alvo: >80%.' },
      { name: 'Status por Cerimonia', formula: 'COUNT por status (Realizado/Remarcado/Cancelado/Pendente)', fields: ['ritual_type', 'status', 'scheduled_date'], interpretation: 'Saude dos ritos por tipo e time.' },
      { name: 'Historico por Time', formula: 'Taxa de realizacao mensal GROUP BY team', fields: ['team', 'status', 'month'], interpretation: 'Evolucao da governanca agil ao longo do tempo.' }
    ],
    charts: ['Cards de % por rito', 'Tabela semanal por cerimonia', 'Historico 3 meses', 'Visao Geral com filtros']
  },
  {
    id: 'qa-tracker',
    title: 'Ã°Å¸Â§Âª QA Tracker',
    description: 'Controle de testes por versao entregue. Rastreia status de teste (Pendente/Testado/Bloqueado), casos de teste, evidencias em imagem e notas por work item.',
    metrics: [
      { name: 'Cobertura de Testes', formula: 'Testados / Total Ãƒâ€” 100 por versao', fields: ['qa_test_records.status', 'version'], interpretation: '% de itens validados pelo QA na versao selecionada.' },
      { name: 'Distribuicao por Status', formula: 'COUNT(status) GROUP BY status para a versao', fields: ['status = pending/done/blocked'], interpretation: 'Visao rapida de quantos itens estao pendentes, testados ou bloqueados.' },
      { name: 'Por QA Responsavel', formula: 'COUNT(itens) GROUP BY qa_person', fields: ['qa_person', 'version'], interpretation: 'Carga de trabalho de teste por analista.' },
      { name: 'Historico por Versao', formula: 'Taxa de cobertura das ultimas 12 versoes', fields: ['version', 'status'], interpretation: 'Evolucao da maturidade de QA entre releases.' }
    ],
    charts: ['4 cards KPI', 'Donut cobertura', 'BarChart por QA/Tipo/Area', 'Historico versoes', 'Export XLSX com evidencias']
  },
  {
    id: 'devtracker',
    title: 'Ã°Å¸â€”â€šÃ¯Â¸Â DevTracker',
    description: 'Gestao de alocacao de desenvolvedores por projeto. Permite registrar capacidade, alocacoes e gerar visao de ocupacao do time.',
    metrics: [
      { name: 'Ocupacao por Desenvolvedor', formula: 'SUM(alocacao%) GROUP BY developer', fields: ['devtracker_allocations', 'devtracker_developers'], interpretation: 'Percentual de ocupacao de cada pessoa. >100% = sobrecarga.' },
      { name: 'Alocacao por Projeto', formula: 'SUM(alocacao%) GROUP BY project', fields: ['devtracker_projects', 'devtracker_allocations'], interpretation: 'Distribuicao de capacidade entre projetos.' }
    ]
  }
];

const AZURE_FIELDS_REFERENCE = [
  { field: 'System.Id', description: 'ID unico do Work Item', example: '10001' },
  { field: 'System.Title', description: 'Titulo do item', example: 'Implementar autenticacao JWT' },
  { field: 'System.State', description: 'Estado atual', example: 'Active, Closed, New, Pronto' },
  { field: 'System.WorkItemType', description: 'Tipo do item', example: 'User Story, Bug, Feature, Task, Issue' },
  { field: 'System.AssignedTo', description: 'Pessoa atribuida', example: 'Marina Duarte' },
  { field: 'System.AreaPath', description: 'Area/Time (mapeado para o campo team)', example: 'FLEX\\Time Norte' },
  { field: 'System.IterationPath', description: 'Sprint/Iteracao', example: 'FLEX\\Sprint 12' },
  { field: 'System.CreatedDate', description: 'Data de criacao', example: '2026-01-15T10:30:00Z' },
  { field: 'System.ChangedDate', description: 'Ultima modificacao', example: '2026-02-10T14:20:00Z' },
  { field: 'System.Tags', description: 'Tags separadas por ;', example: 'IMPEDIMENTO; [v1.2]' },
  { field: 'Microsoft.VSTS.Common.ClosedDate', description: 'Data de fechamento (usada para Cycle Time)', example: '2026-02-11T09:00:00Z' },
  { field: 'Microsoft.VSTS.Common.Priority', description: 'Prioridade (0-4)', example: '1 (P1 = Alta)' },
  { field: 'Microsoft.VSTS.Common.ActivatedDate', description: 'Data de ativacao Ã¢â‚¬â€ inicio do trabalho ativo', example: '2026-01-20T08:00:00Z' },
  { field: 'Microsoft.VSTS.Scheduling.StoryPoints', description: 'Estimativa em Story Points', example: '5' },
  { field: 'Microsoft.VSTS.Scheduling.OriginalEstimate', description: 'Estimativa original em horas', example: '8' },
  { field: 'Microsoft.VSTS.Scheduling.RemainingWork', description: 'Trabalho restante em horas', example: '3' },
  { field: 'Microsoft.VSTS.Scheduling.CompletedWork', description: 'Trabalho concluido em horas', example: '5' },
  { field: 'Custom.Tipocliente', description: 'Tipo de cliente atendido pelo item', example: 'Veritas Logistica' },
  { field: 'Custom.Type', description: 'Tipo customizado (usado em Issues)', example: 'Correcao, Alteracao' },
  { field: 'Custom.Squad', description: 'Squad responsavel', example: 'Core, Integracao, Reports' },
  { field: 'Custom.Area', description: 'Area funcional do sistema', example: 'Financeiro, Vendas, Estoque' },
  { field: 'Custom.Complexity', description: 'Complexidade estimada', example: 'Baixa, Media, Alta' },
  { field: 'Custom.Platform', description: 'Plataforma afetada', example: 'Web, Mobile, API' },
  { field: 'Custom.DEV', description: 'Desenvolvedor responsavel', example: 'Rafael Alves' },
  { field: 'Custom.QA', description: 'Analista QA responsavel', example: 'Marina Duarte' },
  { field: 'Custom.PO', description: 'Product Owner responsavel', example: 'Beatriz Lopes' },
  { field: 'Custom.rootcauseteam', description: 'Time que introduziu o bug', example: 'Time Norte' },
  { field: 'Custom.Rootcausetask', description: 'ID da tarefa de origem do bug', example: '10045' },
  { field: 'Custom.rootcauseversion', description: 'Versao na qual o bug foi introducido', example: 'v1.2' },
  { field: 'Custom.REINCIDENCIA', description: 'Numero de reincidencias (valor numerico)', example: '2' },
  { field: 'Custom.Raizdoproblema', description: 'Descricao da causa raiz', example: 'Falta de validacao de entrada' },
  { field: 'Custom.Falhadoprocesso', description: 'Etapa do processo onde a falha ocorreu', example: 'Desenvolvimento, Code Review, QA' },
  { field: 'Custom.DOR', description: 'Definition of Ready Ã¢â‚¬â€ data que o item ficou pronto para dev', example: '2026-01-18T10:00:00Z' },
  { field: 'Custom.DOD', description: 'Definition of Done Ã¢â‚¬â€ data de conclusao completa', example: '2026-02-05T16:00:00Z' },
  { field: 'Custom.DeliveredVersion', description: 'Versao entregue em producao', example: 'v1.2' },
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
        <h1 className="text-2xl font-bold text-white mb-2">Ã°Å¸â€œâ€“ DocumentaÃƒÂ§ÃƒÂ£o do Dashboard</h1>
        <p className="text-ds-text">
          Esta seÃƒÂ§ÃƒÂ£o documenta todas as mÃƒÂ©tricas, cÃƒÂ¡lculos e campos do Azure DevOps utilizados em cada aba do dashboard.
          Use como referÃƒÂªncia para entender como os indicadores sÃƒÂ£o calculados.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-ds-text mb-1">Buscar</label>
          <input
            type="text"
            placeholder="Buscar mÃƒÂ©trica, campo, fÃƒÂ³rmula..."
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

      {/* DocumentaÃƒÂ§ÃƒÂ£o das Abas */}
      <div className="space-y-6">
        {filteredDocs.map((doc) => (
          <div key={doc.id} className="bg-ds-navy rounded-lg border border-ds-border overflow-hidden">
            <div className="bg-gradient-to-r from-ds-green/20 to-transparent p-4 border-b border-ds-border">
              <h2 className="text-xl font-bold text-white">{doc.title}</h2>
              <p className="text-ds-text mt-1">{doc.description}</p>
            </div>
            
            <div className="p-4">
              <h3 className="text-lg font-semibold text-ds-green mb-3">Ã°Å¸â€œÅ  MÃƒÂ©tricas</h3>
              <div className="grid gap-4">
                {doc.metrics.map((metric, idx) => (
                  <div key={idx} className="bg-ds-dark-blue p-4 rounded-lg border border-ds-border">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-bold text-white text-lg">{metric.name}</h4>
                        <div className="mt-2 space-y-2">
                          <div>
                            <span className="text-ds-text text-sm">FÃƒÂ³rmula:</span>
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
                            <span className="font-semibold">Ã°Å¸â€™Â¡ InterpretaÃƒÂ§ÃƒÂ£o:</span> {metric.interpretation}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {doc.charts && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-ds-text mb-2">Ã°Å¸â€œË† GrÃƒÂ¡ficos nesta aba:</h4>
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

      {/* ReferÃƒÂªncia de Campos Azure DevOps */}
      <div className="bg-ds-navy rounded-lg border border-ds-border overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600/20 to-transparent p-4 border-b border-ds-border">
          <h2 className="text-xl font-bold text-white">Ã°Å¸â€œâ€¹ ReferÃƒÂªncia de Campos Azure DevOps</h2>
          <p className="text-ds-text mt-1">Campos do Azure DevOps utilizados pelo dashboard e seus significados.</p>
        </div>
        
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-ds-border">
                <th className="pb-2 text-ds-text font-semibold">Campo</th>
                <th className="pb-2 text-ds-text font-semibold">DescriÃƒÂ§ÃƒÂ£o</th>
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

      {/* GlossÃƒÂ¡rio */}
      <div className="bg-ds-navy rounded-lg border border-ds-border p-4">
        <h2 className="text-xl font-bold text-white mb-4">Ã°Å¸â€œÅ¡ GlossÃƒÂ¡rio</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-ds-dark-blue p-3 rounded border-l-4 border-yellow-400">
            <h4 className="font-bold text-yellow-400">Ã°Å¸Ââ€º Bug</h4>
            <p className="text-ds-text text-sm">Erro detectado <strong>EM DESENVOLVIMENTO</strong>, antes de ir para produÃƒÂ§ÃƒÂ£o. NÃƒÂ£o impactou o cliente final. Indica que o processo de QA estÃƒÂ¡ funcionando.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded border-l-4 border-red-400">
            <h4 className="font-bold text-red-400">Ã¢Å¡Â Ã¯Â¸Â Issue</h4>
            <p className="text-ds-text text-sm">Erro que <strong>ESCAPOU PARA PRODUÃƒâ€¡ÃƒÆ’O</strong> e impactou o cliente. Mais grave que Bug, pois chegou ao usuÃƒÂ¡rio final. Pode ter reincidÃƒÂªncia.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded border-l-4 border-orange-400">
            <h4 className="font-bold text-orange-400">Ã°Å¸â€â€ž ReincidÃƒÂªncia</h4>
            <p className="text-ds-text text-sm">Issue (erro em produÃƒÂ§ÃƒÂ£o) que voltou a acontecer. Indica problema nÃƒÂ£o resolvido completamente. Campo exclusivo de Issues.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">Cycle Time</h4>
            <p className="text-ds-text text-sm">Tempo desde o inÃƒÂ­cio do trabalho (ativaÃƒÂ§ÃƒÂ£o) atÃƒÂ© a conclusÃƒÂ£o. Mede velocidade de desenvolvimento.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">Lead Time</h4>
            <p className="text-ds-text text-sm">Tempo total desde a criaÃƒÂ§ÃƒÂ£o do item atÃƒÂ© sua conclusÃƒÂ£o. Inclui tempo em fila.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">Throughput</h4>
            <p className="text-ds-text text-sm">Quantidade de itens entregues em um perÃƒÂ­odo. Mede capacidade de entrega.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">WIP (Work in Progress)</h4>
            <p className="text-ds-text text-sm">Trabalho em andamento. Itens iniciados mas nÃƒÂ£o concluÃƒÂ­dos.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">Story Points</h4>
            <p className="text-ds-text text-sm">Unidade de estimativa de esforÃƒÂ§o relativo. NÃƒÂ£o representa horas.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">P0/P1/P2/P3/P4</h4>
            <p className="text-ds-text text-sm">NÃƒÂ­veis de prioridade. P0 = crÃƒÂ­tico, P4 = baixa prioridade.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">CFD</h4>
            <p className="text-ds-text text-sm">Cumulative Flow Diagram. GrÃƒÂ¡fico de ÃƒÂ¡rea que mostra acÃƒÂºmulo por estado ao longo do tempo.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">Monte Carlo</h4>
            <p className="text-ds-text text-sm">SimulaÃƒÂ§ÃƒÂ£o estatÃƒÂ­stica usando dados histÃƒÂ³ricos para previsÃƒÂµes probabilÃƒÂ­sticas.</p>
          </div>
          <div className="bg-ds-dark-blue p-3 rounded">
            <h4 className="font-bold text-ds-green">DORA Metrics</h4>
            <p className="text-ds-text text-sm">4 mÃƒÂ©tricas DevOps: Deploy Frequency, Lead Time, Change Failure Rate, MTTR.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentationDashboard;
