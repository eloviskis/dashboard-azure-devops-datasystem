import React, { useState } from 'react';

interface DocSection {
  id: string;
  title: string;
  description: string;
  metrics: { name: string; formula: string; fields: string[]; interpretation: string }[];
  charts?: string[];
}

const DOCS: DocSection[] = [
  { id:'executive', title:'Visao Executiva', description:'Indicadores de alto nivel para gestores: throughput, cycle time, lead time e WIP no periodo selecionado.',
    metrics:[
      {name:'Throughput',formula:'COUNT(closedDate no periodo)',fields:['closedDate','state=Closed/Done/Finished'],interpretation:'Itens entregues. Maior = melhor capacidade.'},
      {name:'Cycle Time Medio',formula:'closedDate - firstActivationDate (dias)',fields:['closedDate','firstActivationDate'],interpretation:'Tempo de desenvolvimento ativo. Menor = mais agil.'},
      {name:'Lead Time Medio',formula:'closedDate - createdDate (dias)',fields:['closedDate','createdDate'],interpretation:'Tempo total desde criacao ate entrega, incluindo espera.'},
      {name:'WIP',formula:'COUNT(state = Active/Para Desenvolver/etc)',fields:['state'],interpretation:'Trabalho em andamento. WIP alto = risco de sobrecarga.'},
    ], charts:['Resumo Geral','Entregues vs Criados','Tendencia de Entregas']
  },
  { id:'team-insights', title:'Insights por Time', description:'Comparativo de performance entre times: throughput, cycle time, P85.',
    metrics:[
      {name:'Throughput por Time',formula:'COUNT(closedDate) GROUP BY team',fields:['team','closedDate'],interpretation:'Capacidade de entrega por equipe.'},
      {name:'Cycle Time por Time',formula:'AVG(cycleTime) GROUP BY team',fields:['cycleTime','team'],interpretation:'Times mais ageis vs com gargalos.'},
      {name:'P85 por Time',formula:'85 percentil (cycleTime) GROUP BY team',fields:['cycleTime','team'],interpretation:'SLA de ciclo por time.'},
    ]
  },
  { id:'team-evolution', title:'Evolucao Times', description:'Visao semanal simplificada: throughput, CT, LT, WIP, impedimentos, gargalo, retrabalho, P1/P2. Ideal para reunioes de time.',
    metrics:[
      {name:'Throughput Semanal',formula:'COUNT(closedDate na semana)',fields:['closedDate','team'],interpretation:'Entregas efetivas na semana.'},
      {name:'Projecao fim de semana',formula:'(throughput atual / dias decorridos) * 5',fields:['closedDate'],interpretation:'Estimativa se o ritmo se mantiver.'},
      {name:'Gargalo da semana',formula:'Estado com maior tempo medio (timeInStatusDays)',fields:['timeInStatusDays'],interpretation:'Onde as tarefas ficaram mais paradas.'},
      {name:'Retrabalho',formula:'COUNT(reincidencia > 0) / total * 100',fields:['reincidencia'],interpretation:'Percentual de itens que voltaram. 0% = ideal.'},
    ], charts:['Tabela 4 semanas + projecao','BarChart Throughput','LineChart CT vs LT','BarChart WIP','Cards gargalo']
  },
  { id:'cycle-analytics', title:'Cycle Time Analytics', description:'Analise detalhada com P50/P85/P95, histograma por time, scatter plot e historico comparativo.',
    metrics:[
      {name:'P50 (Mediana)',formula:'Mediana dos cycle times',fields:['cycleTime'],interpretation:'50% dos itens entregues neste tempo ou menos.'},
      {name:'P85',formula:'85 percentil dos cycle times',fields:['cycleTime'],interpretation:'Referencia de SLA: 85% das entregas ocorrem dentro deste prazo.'},
      {name:'P95',formula:'95 percentil dos cycle times',fields:['cycleTime'],interpretation:'Apenas 5% levam mais que isso. Identifica outliers.'},
    ], charts:['P85 mensal','Histograma P50/P85/P95 por time','Tendencia CT vs LT','Historico Semanal/Mensal','Scatter Plot','Ranking Times','Top 15 Outliers']
  },
  { id:'performance', title:'Performance Geral', description:'Desempenho individual e coletivo: throughput, status, aging WIP e heatmap de atividade.',
    metrics:[
      {name:'Top 10 Individual',formula:'COUNT(closedDate) GROUP BY assignedTo',fields:['assignedTo','closedDate'],interpretation:'Pessoas com mais entregas no periodo.'},
      {name:'Aging WIP',formula:'Dias em andamento acima do threshold por prioridade',fields:['changedDate','state','priority'],interpretation:'Itens parados ha muito tempo. P1>3d, P2>7d, P3>14d.'},
      {name:'WIP Limits',formula:'COUNT(itens em andamento) por coluna/time/pessoa',fields:['state','team','assignedTo'],interpretation:'WIP alto por pessoa indica sobrecarga.'},
    ], charts:['Status Geral','Performance Times','Tendencia Entregas','Top 10 Individual','Aging Items','WIP Limits','Activity Heatmap']
  },
  { id:'quality', title:'Qualidade', description:'Bugs vs Issues, taxa de deteccao, MTTR, retrabalho e bugs por feature.',
    metrics:[
      {name:'Bug vs Issue',formula:'COUNT(type=Bug) vs COUNT(type=Issue)',fields:['type'],interpretation:'Bug = erro em dev (nao chegou ao cliente). Issue = erro em producao. Alta proporcao Bug = QA eficaz.'},
      {name:'Taxa de Deteccao',formula:'Bugs / (Bugs + Issues) * 100',fields:['type'],interpretation:'Quanto maior, melhor. Alvo: >70%.'},
      {name:'MTTR',formula:'AVG(cycleTime) WHERE type=Bug',fields:['type','cycleTime'],interpretation:'Tempo medio para corrigir defeitos.'},
    ], charts:['Bugs vs Issues','Por Time','Tendencia Criacao','Rework Analysis','Bugs por Feature']
  },
  { id:'kanban', title:'Fluxo Continuo (Kanban)', description:'CFD, Lead Time vs Cycle Time, Histograma de Vazao e Flow Efficiency.',
    metrics:[
      {name:'CFD',formula:'Acumulado de itens por estado ao longo do tempo',fields:['state','changedDate'],interpretation:'Areas largas = acumulo/gargalo naquele estado.'},
      {name:'Flow Efficiency',formula:'(cycleTime / leadTime) * 100',fields:['cycleTime','leadTime'],interpretation:'% do tempo em trabalho ativo vs espera. Alvo: >40%.'},
    ], charts:['CFD','Lead Time vs Cycle Time por Time','Histograma Semanal','Flow Efficiency']
  },
  { id:'detailed-throughput', title:'Vazao Detalhada', description:'Throughput por time, responsavel e tipo de item ao longo do tempo.',
    metrics:[
      {name:'Throughput Semanal por Time',formula:'COUNT(closedDate) GROUP BY semana, team',fields:['closedDate','team'],interpretation:'Tendencia de entrega por equipe.'},
      {name:'Por Responsavel',formula:'COUNT(closedDate) GROUP BY assignedTo',fields:['assignedTo','closedDate'],interpretation:'Distribuicao de entregas por pessoa.'},
      {name:'Por Tipo',formula:'COUNT(closedDate) GROUP BY type',fields:['type','closedDate'],interpretation:'Mix: User Story, Bug, Feature, Task, etc.'},
    ]
  },
  { id:'bottlenecks', title:'Gargalos (Estimado)', description:'Tempo estimado em cada estado usando changedDate.',
    metrics:[
      {name:'Tempo em Estado',formula:'Estimativa via changedDate por estado',fields:['state','changedDate'],interpretation:'Estados com mais tempo = onde o fluxo trava.'},
      {name:'Aging WIP por Estado',formula:'Dias desde entrada no estado atual',fields:['changedDate','state'],interpretation:'Itens envelhecendo precisam de atencao.'},
    ], charts:['Time in Status (barras horizontais)','Aging Items (lista)']
  },
  { id:'impedimentos', title:'Impedimentos', description:'Itens com tag IMPEDIMENTO ou campo bloqueio ativo.',
    metrics:[
      {name:'Impedimentos Ativos',formula:'COUNT(tags LIKE IMPEDIMENTO AND state != Closed)',fields:['tags','state'],interpretation:'Bloqueios atuais. Clique para ver detalhes.'},
      {name:'Bloqueio Externo',formula:'COUNT(bloqueio = true)',fields:['bloqueio'],interpretation:'Itens bloqueados por dependencias externas ao time.'},
    ]
  },
  { id:'tags', title:'Analise de Tags', description:'Distribuicao de trabalho pelas tags do Azure DevOps.',
    metrics:[
      {name:'Top Tags',formula:'COUNT(itens) GROUP BY tag ORDER BY count DESC',fields:['tags (System.Tags)'],interpretation:'Tags mais usadas indicam foco do trabalho.'},
      {name:'Cycle Time por Tag',formula:'AVG(cycleTime) GROUP BY tag',fields:['tags','cycleTime'],interpretation:'Complexidade relativa por categoria.'},
    ]
  },
  { id:'clients', title:'Analise por Cliente', description:'Metricas segmentadas por tipo de cliente (Custom.Tipocliente).',
    metrics:[
      {name:'Throughput por Cliente',formula:'COUNT(closedDate) GROUP BY tipoCliente',fields:['tipoCliente'],interpretation:'Distribuicao de entregas por cliente.'},
      {name:'Cycle Time por Cliente',formula:'AVG(cycleTime) GROUP BY tipoCliente',fields:['tipoCliente','cycleTime'],interpretation:'Velocidade de atendimento por cliente.'},
    ]
  },
  { id:'montecarlo', title:'Previsao (Monte Carlo)', description:'Simulacao probabilistica usando throughput historico.',
    metrics:[
      {name:'Simulacao Monte Carlo',formula:'10.000 iteracoes com throughput historico diario',fields:['throughput historico'],interpretation:'Probabilidade de entregar X itens em Y dias.'},
      {name:'P85 (85% confianca)',formula:'85 percentil das simulacoes',fields:['throughput'],interpretation:'Previsao conservadora recomendada para compromissos.'},
    ]
  },
  { id:'backlog', title:'Analise de Backlog', description:'Saude do backlog, aging e capacidade recomendada de refinamento.',
    metrics:[
      {name:'Backlog Total',formula:'COUNT(state = New/Para Desenvolver)',fields:['state'],interpretation:'Tamanho do backlog pendente.'},
      {name:'Aging do Backlog',formula:'Dias desde createdDate para itens nao iniciados',fields:['createdDate','state'],interpretation:'Itens antigos podem estar obsoletos.'},
    ]
  },
  { id:'po-analysis', title:'Analise de Demanda', description:'Entrada de demandas, criacao por PO e qualidade da especificacao.',
    metrics:[
      {name:'Itens Criados vs Fechados',formula:'COUNT(createdDate) vs COUNT(closedDate)',fields:['createdDate','closedDate'],interpretation:'Entrada > Saida = backlog crescendo.'},
      {name:'Taxa de Bugs por Criador',formula:'Bugs gerados / itens criados por PO',fields:['createdBy','type'],interpretation:'Qualidade da especificacao. Alto = itens mal definidos.'},
    ]
  },
  { id:'pull-requests', title:'Pull Requests e Code Review', description:'Metricas de PRs sincronizados do Azure DevOps Repos. Inclui votos dos revisores (Aprovado/Sugestoes/Rejeitado).',
    metrics:[
      {name:'PRs Abertos',formula:'COUNT(PRs WHERE status = active)',fields:['status','createdDate'],interpretation:'PRs aguardando review ou merge.'},
      {name:'Tempo de Review',formula:'AVG(closedDate - createdDate) para PRs',fields:['createdDate','closedDate'],interpretation:'Velocidade do processo de code review.'},
      {name:'Distribuicao de Votos',formula:'COUNT por voto: Aprovado(10), Com Sugestoes(5), Sem Voto(0), Aguardando(-5), Rejeitado(-10)',fields:['reviewers[].vote'],interpretation:'Qualidade das revisoes. Alta taxa de aprovacao = codigo maduro.'},
      {name:'Top Revisores',formula:'COUNT(reviews) GROUP BY reviewer ORDER BY total DESC',fields:['reviewers[].displayName'],interpretation:'Quem mais contribui com code review.'},
      {name:'Concentracao de Reviews',formula:'Reviews do top 3 / total reviews * 100',fields:['reviewers'],interpretation:'Alta concentracao = gargalo de revisao em poucas pessoas.'},
    ], charts:['PRs por Status','Votos por Revisor','Tempo de Review por Mes','Top Revisores']
  },
  { id:'scrum-ctc', title:'Scrum', description:'Metricas para times Scrum. Seletor de time disponivel. Usa iterationPath para identificar sprints.',
    metrics:[
      {name:'Velocity',formula:'SUM(storyPoints) para itens fechados na Sprint',fields:['storyPoints','iterationPath','closedDate'],interpretation:'Capacidade em Story Points por sprint.'},
      {name:'Estimativa vs Realidade',formula:'originalEstimate vs completedWork vs remainingWork',fields:['originalEstimate','completedWork','remainingWork'],interpretation:'Acuracidade das estimativas.'},
    ]
  },
  { id:'dora', title:'Indicadores DevOps DORA (Adaptados)', description:'Metricas DORA adaptadas para Work Items. Nao sao metricas DORA reais (que requerem pipeline CI/CD), mas aproximacoes uteis.',
    metrics:[
      {name:'Deployment Frequency (Adaptado)',formula:'Throughput medio semanal',fields:['closedDate'],interpretation:'Frequencia de entregas. Elite: multiplas por semana.'},
      {name:'Lead Time for Changes (Adaptado)',formula:'Cycle time medio de User Stories',fields:['cycleTime','type'],interpretation:'Tempo de dev ate entrega. Elite: < 1 semana.'},
      {name:'Change Failure Rate (Adaptado)',formula:'(Bugs / entregas) * 100',fields:['type=Bug','closedDate'],interpretation:'Taxa de falhas. Elite: < 15%.'},
      {name:'MTTR (Adaptado)',formula:'AVG(cycleTime) WHERE type=Bug',fields:['type','cycleTime'],interpretation:'Velocidade de correcao. Elite: < 1 dia.'},
    ]
  },
  { id:'sla', title:'SLA Tracking', description:'Monitoramento de acordos de nivel de servico por prioridade.',
    metrics:[
      {name:'SLA por Prioridade',formula:'% itens dentro do SLA por P0/P1/P2/P3',fields:['priority','cycleTime'],interpretation:'Conformidade com SLAs por severidade.'},
      {name:'Itens Violando SLA',formula:'COUNT(cycleTime > SLA definido)',fields:['cycleTime','priority'],interpretation:'Itens que excederam o tempo acordado.'},
    ]
  },
  { id:'metas', title:'Metas por Time', description:'Acompanhamento de metas de throughput e cycle time por time.',
    metrics:[
      {name:'Meta de Throughput',formula:'Throughput atual / meta * 100',fields:['throughput','meta configurada'],interpretation:'Percentual de atingimento.'},
      {name:'Meta de Cycle Time',formula:'Cycle Time atual vs meta',fields:['cycleTime','meta'],interpretation:'Evolucao da velocidade vs objetivo.'},
    ]
  },
  { id:'period-comparison', title:'Comparacao de Periodos', description:'Compare metricas entre dois periodos para validar impacto de mudancas.',
    metrics:[
      {name:'Delta Throughput',formula:'Periodo A - Periodo B (COUNT itens fechados)',fields:['closedDate','periodo'],interpretation:'Melhora ou piora na capacidade de entrega.'},
      {name:'Delta Cycle Time',formula:'AVG(cycleTime) Periodo A vs Periodo B',fields:['cycleTime','periodo'],interpretation:'Evolucao da velocidade de desenvolvimento.'},
    ]
  },
  { id:'team-comparison', title:'Pessoas e Senioridade', description:'Comparacao individual de performance e contribuicao.',
    metrics:[
      {name:'Entregas por Pessoa',formula:'COUNT(closedDate) GROUP BY assignedTo',fields:['assignedTo','closedDate'],interpretation:'Volume de entrega individual.'},
      {name:'Cycle Time por Pessoa',formula:'AVG(cycleTime) GROUP BY assignedTo',fields:['cycleTime','assignedTo'],interpretation:'Velocidade individual de desenvolvimento.'},
    ]
  },
  { id:'rootcause', title:'Root Cause (Issues)', description:'Analise de causa raiz para Issues usando campos customizados do Azure DevOps.',
    metrics:[
      {name:'Issues por Causa Raiz',formula:'COUNT(issues) GROUP BY causaRaiz',fields:['causaRaiz (Custom.Raizdoproblema)'],interpretation:'Causas mais frequentes de issues em producao.'},
      {name:'Reincidencia',formula:'SUM(reincidencia) GROUP BY valor',fields:['reincidencia (Custom.REINCIDENCIA)'],interpretation:'Problemas recorrentes. Valor numerico (1x, 2x...).'},
      {name:'Por Squad/Area',formula:'COUNT(issues) GROUP BY squad/area',fields:['squad','area'],interpretation:'Qual area de negocio mais afetada.'},
    ]
  },
  { id:'rituals', title:'Ritos e Cerimonias', description:'Controle manual de cerimonias ageis: Refinamento, Review, Retrospectiva, Planning, Daily. Importacao por .ics ou link Outlook.',
    metrics:[
      {name:'% de Realizacao',formula:'Realizados / (Realizados + Remarcados + Cancelados) * 100',fields:['status=done/rescheduled/cancelled'],interpretation:'Taxa de realizacao. Alvo: >80%.'},
      {name:'Status por Cerimonia',formula:'COUNT por status GROUP BY ritual_type',fields:['ritual_type','status','scheduled_date'],interpretation:'Saude dos ritos por tipo e time.'},
    ], charts:['Cards % por rito','Tabela semanal','Historico 3 meses','Visao Geral com filtros']
  },
  { id:'qa-tracker', title:'QA Tracker', description:'Controle de testes por versao: status Pendente/Testado/Bloqueado, casos de teste, evidencias em imagem e notas.',
    metrics:[
      {name:'Cobertura',formula:'Testados / Total * 100 por versao',fields:['qa_test_records.status','version'],interpretation:'% de itens validados pelo QA na versao.'},
      {name:'Por QA Responsavel',formula:'COUNT(itens) GROUP BY qa_person',fields:['qa_person','version'],interpretation:'Carga de trabalho de teste por analista.'},
      {name:'Historico por Versao',formula:'Taxa de cobertura das ultimas 12 versoes',fields:['version','status'],interpretation:'Evolucao da maturidade de QA entre releases.'},
    ], charts:['4 cards KPI','Donut cobertura','BarChart por QA/Tipo/Area','Historico versoes','Export XLSX']
  },
  { id:'devtracker', title:'DevTracker', description:'Gestao de alocacao de desenvolvedores por projeto.',
    metrics:[
      {name:'Ocupacao por Dev',formula:'SUM(alocacao%) GROUP BY developer',fields:['devtracker_allocations'],interpretation:'% de ocupacao de cada pessoa. >100% = sobrecarga.'},
      {name:'Alocacao por Projeto',formula:'SUM(alocacao%) GROUP BY project',fields:['devtracker_projects'],interpretation:'Distribuicao de capacidade entre projetos.'},
    ]
  },
];

const FIELDS = [
  {f:'System.Id',d:'ID unico do Work Item',e:'10001'},
  {f:'System.Title',d:'Titulo do item',e:'Implementar autenticacao JWT'},
  {f:'System.State',d:'Estado atual',e:'Active, Closed, New, Pronto'},
  {f:'System.WorkItemType',d:'Tipo do item',e:'User Story, Bug, Feature, Task, Issue'},
  {f:'System.AssignedTo',d:'Pessoa atribuida',e:'Marina Duarte'},
  {f:'System.AreaPath',d:'Area/Time (mapeado para team)',e:'FLEX\\\\Time Norte'},
  {f:'System.IterationPath',d:'Sprint/Iteracao',e:'FLEX\\\\Sprint 12'},
  {f:'System.CreatedDate',d:'Data de criacao',e:'2026-01-15T10:30:00Z'},
  {f:'System.ChangedDate',d:'Ultima modificacao',e:'2026-02-10T14:20:00Z'},
  {f:'System.Tags',d:'Tags separadas por ;',e:'IMPEDIMENTO; [v1.2]'},
  {f:'Microsoft.VSTS.Common.ClosedDate',d:'Data de fechamento (Cycle Time)',e:'2026-02-11T09:00:00Z'},
  {f:'Microsoft.VSTS.Common.Priority',d:'Prioridade (0-4)',e:'1 (P1 = Alta)'},
  {f:'Microsoft.VSTS.Common.ActivatedDate',d:'Data de ativacao — inicio do trabalho',e:'2026-01-20T08:00:00Z'},
  {f:'Microsoft.VSTS.Scheduling.StoryPoints',d:'Story Points',e:'5'},
  {f:'Microsoft.VSTS.Scheduling.OriginalEstimate',d:'Estimativa original (horas)',e:'8'},
  {f:'Microsoft.VSTS.Scheduling.CompletedWork',d:'Trabalho concluido (horas)',e:'5'},
  {f:'Custom.Tipocliente',d:'Tipo de cliente',e:'Veritas Logistica'},
  {f:'Custom.QA',d:'Analista QA responsavel',e:'Marina Duarte'},
  {f:'Custom.DEV',d:'Desenvolvedor responsavel',e:'Rafael Alves'},
  {f:'Custom.PO',d:'Product Owner responsavel',e:'Beatriz Lopes'},
  {f:'Custom.Squad',d:'Squad responsavel',e:'Core, Integracao'},
  {f:'Custom.Complexity',d:'Complexidade',e:'Baixa, Media, Alta'},
  {f:'Custom.Platform',d:'Plataforma afetada',e:'Web, Mobile, API'},
  {f:'Custom.REINCIDENCIA',d:'Numero de reincidencias (numerico)',e:'2'},
  {f:'Custom.Raizdoproblema',d:'Descricao da causa raiz',e:'Falta de validacao'},
  {f:'Custom.Falhadoprocesso',d:'Etapa do processo onde ocorreu a falha',e:'Code Review, QA'},
  {f:'Custom.DeliveredVersion',d:'Versao entregue em producao',e:'v1.2'},
  {f:'Custom.DOR',d:'Definition of Ready — data que item ficou pronto para dev',e:'2026-01-18T10:00:00Z'},
  {f:'Custom.DOD',d:'Definition of Done — data de conclusao completa',e:'2026-02-05T16:00:00Z'},
];

const DocumentationDashboard: React.FC = () => {
  const [selectedId, setSelectedId] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = DOCS.filter(doc => {
    if (selectedId !== 'all' && doc.id !== selectedId) return false;
    if (search) {
      const s = search.toLowerCase();
      return doc.title.toLowerCase().includes(s) ||
        doc.description.toLowerCase().includes(s) ||
        doc.metrics.some(m => m.name.toLowerCase().includes(s) || m.fields.some(f => f.toLowerCase().includes(s)));
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="bg-ds-navy p-6 rounded-lg border border-ds-border">
        <h1 className="text-2xl font-bold text-ds-light-text mb-2">Documentacao do Dashboard</h1>
        <p className="text-ds-text text-sm">
          Referencia completa de metricas, formulas e campos do Azure DevOps utilizados em cada aba.
        </p>
      </div>

      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-ds-text mb-1">Buscar</label>
          <input type="text" placeholder="Buscar metrica, campo, formula..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-ds-dark-blue text-ds-light-text px-3 py-2 rounded border border-ds-border focus:border-ds-green outline-none text-sm" />
        </div>
        <div className="min-w-[200px]">
          <label className="block text-xs text-ds-text mb-1">Filtrar por Aba</label>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
            className="w-full bg-ds-dark-blue text-ds-light-text px-3 py-2 rounded border border-ds-border focus:border-ds-green outline-none text-sm">
            <option value="all">Todas as Abas</option>
            {DOCS.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map(doc => (
          <div key={doc.id} className="bg-ds-navy rounded-lg border border-ds-border overflow-hidden">
            <div className="bg-ds-green/10 p-4 border-b border-ds-border">
              <h2 className="text-lg font-bold text-ds-light-text">{doc.title}</h2>
              <p className="text-ds-text text-sm mt-0.5">{doc.description}</p>
            </div>
            <div className="p-4">
              <div className="grid gap-3">
                {doc.metrics.map((m, i) => (
                  <div key={i} className="bg-ds-dark-blue p-3 rounded border border-ds-border">
                    <h4 className="font-semibold text-ds-light-text">{m.name}</h4>
                    <div className="mt-1 space-y-1 text-xs">
                      <div><span className="text-ds-text">Formula: </span>
                        <code className="bg-ds-border/40 px-1.5 py-0.5 rounded text-ds-green">{m.formula}</code>
                      </div>
                      <div className="flex flex-wrap gap-1 items-center">
                        <span className="text-ds-text">Campos: </span>
                        {m.fields.map((f,j) => <span key={j} className="bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded">{f}</span>)}
                      </div>
                      <div><span className="text-ds-text">Interpretacao: </span><span className="text-ds-light-text">{m.interpretation}</span></div>
                    </div>
                  </div>
                ))}
              </div>
              {doc.charts && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {doc.charts.map((c,i) => <span key={i} className="bg-purple-900/40 text-purple-300 text-xs px-2 py-1 rounded">{c}</span>)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-ds-navy rounded-lg border border-ds-border overflow-hidden">
        <div className="bg-blue-600/10 p-4 border-b border-ds-border">
          <h2 className="text-lg font-bold text-ds-light-text">Referencia de Campos Azure DevOps</h2>
          <p className="text-ds-text text-sm mt-0.5">Campos sincronizados pelo backend e seu significado no dashboard.</p>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b border-ds-border">
              <th className="pb-2 pr-4 text-ds-text text-xs font-semibold">Campo</th>
              <th className="pb-2 pr-4 text-ds-text text-xs font-semibold">Descricao</th>
              <th className="pb-2 text-ds-text text-xs font-semibold">Exemplo</th>
            </tr></thead>
            <tbody>
              {FIELDS.map((f,i) => (
                <tr key={i} className="border-b border-ds-border/40 hover:bg-ds-dark-blue">
                  <td className="py-1.5 pr-4"><code className="text-ds-green text-xs">{f.f}</code></td>
                  <td className="py-1.5 pr-4 text-ds-light-text text-xs">{f.d}</td>
                  <td className="py-1.5 text-ds-text text-xs">{f.e}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-ds-navy rounded-lg border border-ds-border p-4">
        <h2 className="text-lg font-bold text-ds-light-text mb-3">Glossario</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          {[
            {cor:'border-ds-green',t:'Cycle Time',d:'Tempo de dev ativo: firstActivationDate ate closedDate. Mede velocidade de desenvolvimento.'},
            {cor:'border-ds-green',t:'Lead Time',d:'Tempo total: createdDate ate closedDate. Inclui tempo em fila no backlog.'},
            {cor:'border-ds-green',t:'Throughput',d:'Quantidade de itens entregues em um periodo. Mede capacidade de entrega.'},
            {cor:'border-ds-green',t:'WIP',d:'Work in Progress: itens iniciados mas nao concluidos.'},
            {cor:'border-yellow-400',t:'Bug',d:'Erro detectado em desenvolvimento, antes de chegar ao cliente. Indica QA funcionando.'},
            {cor:'border-red-400',t:'Issue',d:'Erro que chegou ao cliente em producao. Mais grave que Bug.'},
            {cor:'border-orange-400',t:'Reincidencia',d:'Issue que voltou a acontecer. Campo numerico (1x, 2x...). Exclusivo de Issues.'},
            {cor:'border-ds-green',t:'P50/P85/P95',d:'Percentis de cycle time. P85 = 85% dos itens sao entregues neste prazo ou menos.'},
            {cor:'border-ds-green',t:'Monte Carlo',d:'Simulacao estatistica com dados historicos para previsoes probabilisticas de entrega.'},
            {cor:'border-blue-400',t:'CFD',d:'Cumulative Flow Diagram. Areas largas indicam gargalos em um estado.'},
            {cor:'border-ds-green',t:'Flow Efficiency',d:'% do lead time em trabalho ativo vs espera. Alvo: >40%.'},
            {cor:'border-ds-green',t:'Story Points',d:'Unidade de estimativa de esforco relativo. Nao representa horas.'},
          ].map((g,i) => (
            <div key={i} className={`bg-ds-dark-blue p-3 rounded border-l-4 ${g.cor}`}>
              <h4 className="font-bold text-ds-light-text text-sm">{g.t}</h4>
              <p className="text-ds-text text-xs mt-1">{g.d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DocumentationDashboard;
