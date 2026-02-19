import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, PieChart, Pie, LineChart, Line } from 'recharts';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';

interface ReworkAnalysisChartProps {
  data: WorkItem[];
}

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

// Helper para gerar URL do work item
const getWorkItemUrl = (workItemId: number | string): string => {
  return `${AZURE_DEVOPS_BASE_URL}/${workItemId}`;
};

// Custom Tooltip para evitar renderização de objetos
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}>
        <p style={{ color: '#64ffda', fontWeight: 'bold', marginBottom: '5px' }}>{String(label)}</p>
        {payload.map((entry: any, index: number) => {
          // Garantir que só valores primitivos sejam renderizados
          const value = typeof entry.value === 'object' ? JSON.stringify(entry.value) : String(entry.value);
          return (
            <p key={index} style={{ color: entry.color, margin: '2px 0' }}>
              {String(entry.name)}: {value}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

// Custom Label para garantir renderização segura
const CustomLabel = (props: any) => {
  const { x, y, width, value } = props;
  try {
    const displayValue = typeof value === 'object' ? '' : String(value || '');
    return (
      <text 
        x={x + width / 2} 
        y={y - 5} 
        fill="#e6f1ff" 
        textAnchor="middle" 
        fontSize={12}
      >
        {displayValue}
      </text>
    );
  } catch (e) {
    return null;
  }
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
        <div className="p-4 rounded-t-lg flex justify-between items-center" style={{ backgroundColor: data.color }}>
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
                      #{String(item.workItemId)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <a 
                        href={getWorkItemUrl(item.workItemId)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-white hover:text-ds-green font-medium block truncate"
                        title={String(item.title)}
                      >
                        {String(item.title)}
                      </a>
                      <div className="flex gap-4 mt-1 text-xs text-ds-text flex-wrap">
                        <span>👤 {String(item.assignedTo || 'Não atribuído')}</span>
                        <span>📊 {String(item.state)}</span>
                        <span>🏢 {String(item.team || 'Sem time')}</span>
                        {item.reincidencia && Number(item.reincidencia) > 0 && (
                          <span className="text-orange-400">� Clientes afetados: {String(item.reincidencia)}</span>
                        )}
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

const ReworkAnalysisChart: React.FC<ReworkAnalysisChartProps> = ({ data: rawData }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  // Sanitizar dados de entrada para remover referências circulares ou objetos complexos
  const data = useMemo(() => {
    return rawData.map(item => ({
      ...item,
      // Garantir que campos complexos não sejam objetos
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : String(item.tags || ''),
      timeInStatusDays: undefined, // Remover objeto complexo
    }));
  }, [rawData]);

  const analysis = useMemo(() => {
    // Bugs (erros em desenvolvimento) vs Issues (erros em produção)
    const bugs = data.filter(i => i.type === 'Bug');
    const issues = data.filter(i => i.type === 'Issue');
    const completedBugs = bugs.filter(i => COMPLETED_STATES.includes(i.state));
    
    // Issues com múltiplos clientes afetados (campo Reincidência = qtd de clientes com o mesmo problema)
    const issuesWithReincidencia = issues.filter(i => i.reincidencia && Number(i.reincidencia) > 0);
    const totalReincidenciaValue = issuesWithReincidencia.reduce((sum, i) => sum + Number(i.reincidencia || 0), 0);
    
    // Taxa de detecção em desenvolvimento (quanto maior, melhor o QA)
    const totalDefects = bugs.length + issues.length;
    const detectionRate = totalDefects > 0 ? Math.round((bugs.length / totalDefects) * 1000) / 10 : 0;
    
    // Comparação Bugs vs Issues (contagem real)
    const bugVsIssueComparison = [
      { category: 'Bugs (Dev)',        total: bugs.length },
      { category: 'Issues (Produção)', total: issues.length },
    ];

    // Issues ainda abertas (backlog de defeitos em produção)
    const openIssues = issues.filter(i => !COMPLETED_STATES.includes(i.state));

    // MTTR global (média de cycle time das Issues fechadas)
    const closedIssuesWithCT = issues.filter(i => COMPLETED_STATES.includes(i.state) && i.cycleTime != null);
    const avgIssueCT = closedIssuesWithCT.length > 0
      ? Math.round((closedIssuesWithCT.reduce((s, i) => s + i.cycleTime!, 0) / closedIssuesWithCT.length) * 10) / 10
      : 0;

    // Tendência mensal (últimos 12 meses ou período do filtro)
    const monthMap: Record<string, { bugs: number; issues: number }> = {};
    data.forEach(item => {
      if (!item.createdDate) return;
      const d = new Date(item.createdDate);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = { bugs: 0, issues: 0 };
      if (item.type === 'Bug') monthMap[key].bugs++;
      else if (item.type === 'Issue') monthMap[key].issues++;
    });
    const monthlyTrend = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-18)
      .map(([month, counts]) => {
        const [year, m] = month.split('-');
        return { month: `${m}/${year.slice(2)}`, ...counts };
      });

    // MTTR por time (Mean Time To Resolve — apenas Issues fechadas com cycleTime)
    const issueCTByTeam: Record<string, number[]> = {};
    issues.filter(i => COMPLETED_STATES.includes(i.state) && i.cycleTime != null).forEach(i => {
      const team = i.team || 'Sem Time';
      if (!issueCTByTeam[team]) issueCTByTeam[team] = [];
      issueCTByTeam[team].push(i.cycleTime!);
    });
    const mttrByTeam = Object.entries(issueCTByTeam)
      .map(([team, cts]) => ({
        team,
        mttr: Math.round((cts.reduce((a, b) => a + b, 0) / cts.length) * 10) / 10,
        count: cts.length,
      }))
      .sort((a, b) => b.mttr - a.mttr)
      .slice(0, 12);

    // Fonte de identificação das Issues (campo identificacao)
    const identMap: Record<string, number> = {};
    issues.forEach(i => {
      const k = i.identificacao?.trim() || 'Não informado';
      identMap[k] = (identMap[k] || 0) + 1;
    });
    const IDENT_COLORS: Record<string, string> = {
      'Cliente': '#f56565',
      'Interno': '#48bb78',
      'Não informado': '#718096',
    };
    const identPieData = Object.entries(identMap)
      .map(([name, value]) => ({ name, value, fill: IDENT_COLORS[name] || '#9f7aea' }))
      .sort((a, b) => b.value - a.value);

    // Distribuição de falha do processo
    const falhaMap: Record<string, number> = {};
    data.forEach(i => {
      const k = i.falhaDoProcesso?.trim() || 'Não informado';
      falhaMap[k] = (falhaMap[k] || 0) + 1;
    });
    const falhaDistribution = Object.entries(falhaMap)
      .filter(([k]) => k !== 'Não informado')
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const avgBugCT = completedBugs.filter(b => b.cycleTime).length > 0
      ? Math.round((completedBugs.filter(b => b.cycleTime).reduce((sum, b) => sum + (b.cycleTime || 0), 0) / completedBugs.filter(b => b.cycleTime).length) * 10) / 10
      : 0;

    return {
      totalBugs: bugs.length,
      totalIssues: issues.length,
      totalReincidences: totalReincidenciaValue,
      detectionRate,
      avgBugCT,
      avgIssueCT,
      openIssues: openIssues.length,
      bugVsIssueComparison,
      bugs,
      issues,
      monthlyTrend,
      mttrByTeam,
      identPieData,
      falhaDistribution,
    };
  }, [data]);

  // Funções para abrir modal com filtros
  const handleShowBugs = () => {
    setModalData({
      title: 'Bugs (Detectados em Desenvolvimento)',
      items: analysis.bugs,
      color: '#FFC107'
    });
  };

  const handleShowIssues = () => {
    setModalData({
      title: 'Issues (Erros em Produção)',
      items: analysis.issues,
      color: '#f56565'
    });
  };

  const handleBarClick = (category: string) => {
    if (category.startsWith('Bugs')) {
      handleShowBugs();
    } else if (category.startsWith('Issues')) {
      handleShowIssues();
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div 
          className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center cursor-pointer hover:border-yellow-400 transition-colors"
          onClick={handleShowBugs}
          title="Clique para ver detalhes"
        >
          <p className="text-ds-text text-xs">Bugs (Dev)</p>
          <p className="text-2xl font-bold text-yellow-400">{String(analysis.totalBugs)}</p>
          <p className="text-xs text-ds-text mt-1">Detectados antes</p>
        </div>
        <div 
          className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center cursor-pointer hover:border-red-400 transition-colors"
          onClick={handleShowIssues}
          title="Clique para ver detalhes"
        >
          <p className="text-ds-text text-xs">Issues (Produção)</p>
          <p className="text-2xl font-bold text-red-400">{String(analysis.totalIssues)}</p>
          <p className="text-xs text-ds-text mt-1">Escaparam para prod</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Taxa de Detecção</p>
          <p className={`text-2xl font-bold ${analysis.detectionRate > 70 ? 'text-green-400' : analysis.detectionRate > 50 ? 'text-yellow-400' : 'text-red-400'}`}>
            {String(analysis.detectionRate)}%
          </p>
          <p className="text-xs text-ds-text mt-1">Pegos em Dev</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Issues Abertas</p>
          <p className={`text-2xl font-bold ${analysis.openIssues > 20 ? 'text-red-400' : analysis.openIssues > 10 ? 'text-yellow-400' : 'text-green-400'}`}>
            {String(analysis.openIssues)}
          </p>
          <p className="text-xs text-ds-text mt-1">Backlog prod · MTTR {String(analysis.avgIssueCT)}d</p>
        </div>
      </div>

      {/* Gráfico comparativo Bugs vs Issues */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-2">Bugs (Dev) vs Issues (Produção)</h3>
        <p className="text-ds-text text-sm mb-4">
          📊 <strong className="text-yellow-400">Bugs</strong> são erros detectados em desenvolvimento.
          <strong className="text-red-400"> Issues</strong> são erros que escaparam para produção.
          Quanto maior a taxa de detecção em Dev, melhor o processo de QA.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={analysis.bugVsIssueComparison} margin={{ top: 30, right: 30, bottom: 10, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="category" stroke={CHART_COLORS.text} tick={{ fontSize: 13, fontWeight: 600 }} />
            <YAxis stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="total"
              name="Total"
              radius={[6, 6, 0, 0]}
              label={<CustomLabel />}
              cursor="pointer"
              onClick={(data: any) => handleBarClick(data?.category ?? '')}
            >
              <Cell fill="#f6ad55" />
              <Cell fill="#f56565" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tendência Mensal — Bugs vs Issues */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-1">Tendência Mensal — Bugs vs Issues</h3>
        <p className="text-ds-text text-xs mb-3">
          Evolução mês a mês de erros criados. Queda nas <strong className="text-red-400">Issues</strong> indica melhoria de qualidade de entrega.
        </p>
        {analysis.monthlyTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={analysis.monthlyTrend} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="month" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
              <YAxis stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="bugs" name="Bugs (Dev)" stroke="#f6ad55" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="issues" name="Issues (Produção)" stroke="#f56565" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-ds-text text-center py-8">Sem dados suficientes para tendência mensal.</p>
        )}
      </div>

      {/* MTTR por time + Fonte de identificação */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* MTTR por Time */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-1">MTTR por Time (Issues)</h3>
          <p className="text-ds-text text-xs mb-3">
            Mean Time To Resolve — tempo médio (em dias) para fechar Issues em produção. Menor = mais ágil.
          </p>
          {analysis.mttrByTeam.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, analysis.mttrByTeam.length * 36)}>
              <BarChart data={analysis.mttrByTeam} layout="vertical" margin={{ left: 110, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis type="number" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} unit=" d" />
                <YAxis type="category" dataKey="team" stroke={CHART_COLORS.text} tick={{ fontSize: 10 }} width={105} />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}>
                        <p style={{ color: '#64ffda', fontWeight: 'bold' }}>{String(label)}</p>
                        <p>MTTR: <strong>{String(d.mttr)} dias</strong></p>
                        <p style={{ color: '#a0aec0', fontSize: '12px' }}>{String(d.count)} issues resolvidas</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="mttr" name="MTTR (dias)" radius={[0, 4, 4, 0]}>
                  {analysis.mttrByTeam.map((entry, index) => (
                    <Cell key={index} fill={entry.mttr > 14 ? '#f56565' : entry.mttr > 7 ? '#f6ad55' : '#48bb78'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-ds-text text-center py-8">Sem Issues resolvidas com cycle time registrado.</p>
          )}
        </div>

        {/* Fonte de Identificação das Issues */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-1">Fonte de Identificação das Issues</h3>
          <p className="text-ds-text text-xs mb-3">
            Quem detectou o problema — <span className="text-red-400 font-semibold">Cliente</span> indica falha no processo de QA interno.
          </p>
          {analysis.identPieData.length > 0 && analysis.identPieData.some(d => d.name !== 'Não informado') ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie
                    data={analysis.identPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }: any) => `${String(name)} ${Math.round(percent * 100)}%`}
                    labelLine={false}
                  >
                    {analysis.identPieData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div style={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}>
                          <p style={{ color: d.fill, fontWeight: 'bold' }}>{String(d.name)}</p>
                          <p>{String(d.value)} issues</p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {analysis.identPieData.map((entry) => {
                  const total = analysis.identPieData.reduce((s, d) => s + d.value, 0);
                  const pct = total > 0 ? Math.round((entry.value / total) * 1000) / 10 : 0;
                  return (
                    <div key={entry.name} className="flex items-center gap-2">
                      <span style={{ backgroundColor: entry.fill }} className="inline-block w-3 h-3 rounded-full shrink-0" />
                      <span className="text-ds-light-text text-sm truncate flex-1">{String(entry.name)}</span>
                      <span className="text-ds-text text-sm font-semibold">{String(entry.value)} ({String(pct)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-ds-text text-center py-8">Campo "Identificação" não preenchido no período.</p>
          )}
        </div>
      </div>

      {/* Distribuição de Falha do Processo */}
      {analysis.falhaDistribution.length > 0 && (
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-1">Distribuição — Falha do Processo</h3>
          <p className="text-ds-text text-xs mb-3">
            Causas raiz de processo que originaram Bugs e Issues. Priorize as categorias com maior frequência para melhorias no fluxo.
          </p>
          <ResponsiveContainer width="100%" height={Math.max(180, analysis.falhaDistribution.length * 38)}>
            <BarChart data={analysis.falhaDistribution} layout="vertical" margin={{ left: 180, right: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis type="number" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" stroke={CHART_COLORS.text} tick={{ fontSize: 10 }} width={175} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Ocorrências" fill="#9f7aea" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#e6f1ff', fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Modal de detalhes */}
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
    </div>
  );
};

export default ReworkAnalysisChart;
