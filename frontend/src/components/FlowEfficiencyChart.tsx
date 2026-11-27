import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine, LabelList } from 'recharts';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import { computeFlowEfficiency, splitItemTime, StatusBucket } from '../utils/flowEfficiency';

interface FlowEfficiencyChartProps {
  data: WorkItem[];
}

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
  // Quando vem de um clique numa parte da barra: ordena por esse lado e mostra o peso de cada item.
  metric?: 'active' | 'wait';
}

const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';
const ALL_TEAMS = '__all__';

const d1 = (n: number) => Math.round(n * 10) / 10;

// ponytail: a lista renderiza no máximo os 200 itens que mais pesaram — o período inteiro pode ter
// milhares e o DOM não aguenta. Como a ordenação é por peso, o corte cai na cauda irrelevante.
// Se um dia precisar do resto, o caminho é virtualizar a lista (react-window) em vez de subir o teto.
const MAX_ROWS = 200;

const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;

  // Cada item vira {item, tempo}. Com metric definido, ordena por quem mais pesou naquele lado.
  const rows = data.items.map(item => ({ item, t: splitItemTime(item) }));
  if (data.metric) {
    const key = data.metric === 'active' ? 'activeDays' : 'waitDays';
    rows.sort((a, b) => b.t[key] - a.t[key]);
  }
  const totalDays = rows.reduce((s, r) => s + (data.metric === 'active' ? r.t.activeDays : r.t.waitDays), 0);
  const shown = rows.slice(0, MAX_ROWS);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-ds-navy border border-ds-border rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 rounded-t-lg flex justify-between items-center" style={{ backgroundColor: data.color }}>
          <h2 className="text-white font-bold text-lg">{data.title}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl font-bold leading-none">×</button>
        </div>
        <div className="p-3 bg-ds-navy border-b border-ds-border">
          <p className="text-ds-text text-xs">
            {data.metric
              ? <>ℹ️ Ordenados por quem mais pesou em <strong className="text-ds-light-text">{data.metric === 'active' ? 'tempo trabalhando' : 'tempo esperando'}</strong>.
                  O gráfico soma tempo, não itens — todo item tem os dois lados, então o mesmo item aparece nas duas listas com pesos diferentes.</>
              : 'ℹ️ Esta lista mostra os itens concluídos do time.'}
          </p>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <div className="text-ds-text mb-3 text-sm">
            Total: <span className="font-bold text-white">{data.items.length}</span> itens
            {data.metric && <> · <span className="font-bold text-white">{d1(totalDays)}</span> dias {data.metric === 'active' ? 'trabalhando' : 'esperando'} somados</>}
            {rows.length > shown.length && <> · mostrando os <span className="font-bold text-white">{shown.length}</span> que mais pesaram</>}
          </div>
          {shown.length === 0 ? (
            <div className="text-ds-text text-center py-8">Nenhum item encontrado</div>
          ) : (
            <ul className="space-y-2">
              {shown.map(({ item, t }, idx) => (
                <li key={item.workItemId || idx} className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 hover:border-ds-green transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono px-2 py-1 rounded shrink-0 text-white" style={{ backgroundColor: data.color }}>
                      #{item.workItemId}
                    </span>
                    <div className="flex-1 min-w-0">
                      <a href={item.url || `${AZURE_DEVOPS_BASE_URL}/${item.workItemId}`} target="_blank" rel="noopener noreferrer" className="text-white hover:text-ds-green font-medium block truncate mb-1" title={item.title}>
                        {item.title}
                      </a>
                      <div className="grid grid-cols-2 gap-1 text-xs text-ds-text">
                        <div>👤 {item.assignedTo || 'Não atribuído'}</div>
                        <div>👥 {item.team || 'Sem time'}</div>
                        <div>🏷️ {item.type}</div>
                        <div>📊 {item.state}</div>
                      </div>
                      {/* Onde o tempo deste item foi parar — mesma leitura da barra do gráfico */}
                      <div className="mt-2">
                        <div className="flex h-1.5 rounded overflow-hidden bg-ds-border/40" title={`${t.efficiency}% do tempo trabalhando`}>
                          <div style={{ width: `${t.efficiency}%`, backgroundColor: '#64FFDA' }} />
                          <div style={{ width: `${100 - t.efficiency}%`, backgroundColor: '#F56565', opacity: 0.55 }} />
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] mt-1">
                          <span className={data.metric === 'active' ? 'text-ds-green font-bold' : 'text-ds-green/70'}>🟢 {d1(t.activeDays)}d trabalhando</span>
                          <span className={data.metric === 'wait' ? 'text-red-400 font-bold' : 'text-red-400/70'}>🔴 {d1(t.waitDays)}d esperando</span>
                          <span className="text-ds-text">{t.efficiency}% de eficiência</span>
                          {t.topWaitStatus && <span className="text-ds-text/70">⏳ maior fila: {t.topWaitStatus} ({d1(t.topWaitDays)}d)</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-4 border-t border-ds-border">
          <button onClick={onClose} className="w-full bg-ds-border hover:bg-ds-green text-white py-2 px-4 rounded-lg transition-colors">Fechar</button>
        </div>
      </div>
    </div>
  );
};

// Verde acima da meta, amarelo na faixa típica de mercado, vermelho abaixo dela.
const efficiencyColor = (pct: number) => pct >= 40 ? 'text-green-400' : pct >= 20 ? 'text-yellow-400' : 'text-red-400';
const efficiencyLabel = (pct: number) => pct >= 40 ? '🚀 Excelente' : pct >= 20 ? '⚠️ Atenção' : '🔴 Crítico';

const BUCKET_STYLE: Record<StatusBucket, { title: string; chip: string }> = {
  active: { title: '🟢 Conta como trabalho ativo', chip: 'bg-ds-green/15 text-ds-green border-ds-green/30' },
  wait: { title: '🔴 Conta como espera', chip: 'bg-red-500/15 text-red-300 border-red-500/30' },
  excluded: { title: '⚪ Fora da conta (pós-entrega)', chip: 'bg-ds-border/40 text-ds-text border-ds-border' },
};

const FlowEfficiencyChart: React.FC<FlowEfficiencyChartProps> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>(ALL_TEAMS);

  const analysis = useMemo(() => computeFlowEfficiency(data), [data]);

  // null = visão geral. Também cai pra null se o time escolhido sumir do período filtrado.
  const focus = analysis.teams.find(t => t.team === selectedTeam) || null;

  if (analysis.teams.length === 0) {
    return (
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center text-ds-text py-8">
        Sem dados suficientes para calcular Flow Efficiency. São necessários itens concluídos com histórico de status
        e pelo menos 3 itens por time.
      </div>
    );
  }

  const handleTeamClick = (team: string) => {
    const t = analysis.teams.find(x => x.team === team);
    setModalData({ title: `Itens concluídos — ${team}`, items: t?.items || [], color: '#64FFDA' });
  };

  // Um dos lados (trabalhando/esperando): mesma lista de itens, ordenada pelo lado escolhido.
  const openMetricModal = (metric: 'active' | 'wait', label: string, items: WorkItem[], efficiency: number) => {
    setModalData({
      title: metric === 'active'
        ? `🟢 Tempo trabalhando (${efficiency}%) — ${label}`
        : `🔴 Tempo esperando (${100 - efficiency}%) — ${label}`,
      items,
      color: metric === 'active' ? '#64FFDA' : '#F56565',
      metric,
    });
  };

  const handleSegmentClick = (team: string, metric: 'active' | 'wait') => {
    const t = analysis.teams.find(x => x.team === team);
    if (t) openMetricModal(metric, team, t.items, t.efficiency);
  };

  const FlowTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-title">{d.team}</p>
        <p className={efficiencyColor(d.efficiency)}><strong>{d.efficiency}% de eficiência</strong></p>
        <p>🟢 {d.activeDays}d trabalhando · 🔴 {d.waitDays}d esperando <span className="chart-tooltip-subtle">(média por item)</span></p>
        {d.topWaitStatus && <p>⏳ Maior fila: <strong>{d.topWaitStatus}</strong> ({d.topWaitDays}d por item)</p>}
        <p className="chart-tooltip-subtle">{d.count} itens concluídos — clique na parte verde ou vermelha para ver os itens de cada lado</p>
      </div>
    );
  };

  const headline = focus ?? { ...analysis.global, team: 'Todos os times' };
  const dim = (team: string) => (!focus || focus.team === team ? 1 : 0.2);

  // Mesma lista dos segmentos da barra, mas para o recorte do topo (time filtrado ou geral) —
  // garante acesso mesmo quando a fatia no gráfico é pequena demais para clicar.
  const openSideModal = (metric: 'active' | 'wait') =>
    openMetricModal(metric, headline.team, focus ? focus.items : analysis.completedItems, headline.efficiency);

  return (
    <div className="space-y-4">
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />

      {/* O que é, como se calcula e de onde vêm os dados */}
      <div className="bg-ds-navy border border-ds-border rounded-lg p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="text-xs text-ds-text space-y-1.5">
            <p className="text-ds-light-text font-bold text-sm">💡 O que este gráfico mostra</p>
            <p>
              De todo o tempo que um item levou até ser entregue, <strong className="text-ds-green">quanto dele alguém
              estava de fato trabalhando nele</strong> — o resto foi item parado em fila esperando alguém pegar.
            </p>
            <p className="text-ds-light-text">
              Conta: <code className="text-ds-green">tempo ativo ÷ (tempo ativo + tempo em espera)</code>
            </p>
            <p>
              <strong className="text-ds-light-text">Como ler:</strong> acima de 40% é ótimo · 15% a 25% é o típico do
              mercado · abaixo de 20% significa que o item passa a maior parte da vida esperando, não sendo trabalhado.
            </p>
            <p className="text-ds-text/80">
              <strong>De onde vêm os dados:</strong> do histórico real de mudança de estado de cada item no Azure DevOps
              (cada vez que alguém arrasta o card de coluna). Não é estimativa. Times com menos de 3 itens concluídos
              no período ficam de fora.
            </p>
          </div>
          <div className="space-y-2">
            {(Object.keys(BUCKET_STYLE) as StatusBucket[]).map(bucket => (
              analysis.statusesByBucket[bucket].length > 0 && (
                <div key={bucket}>
                  <p className="text-ds-text text-xs mb-1">{BUCKET_STYLE[bucket].title}</p>
                  <div className="flex flex-wrap gap-1">
                    {analysis.statusesByBucket[bucket].map(s => (
                      <span key={s} className={`px-2 py-0.5 rounded border text-[10px] ${BUCKET_STYLE[bucket].chip}`}>{s}</span>
                    ))}
                  </div>
                </div>
              )
            ))}
            <p className="text-ds-text/70 text-[10px] pt-1">
              Status vindos dos itens do período. "Pós-entrega" é o tempo que o item passa já entregue esperando
              fechamento formal — não pesa contra o time.
            </p>
          </div>
        </div>
      </div>

      {/* Filtro de time + número em destaque */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="text-ds-text text-xs block mb-1">Time</label>
          <select
            value={selectedTeam}
            onChange={e => setSelectedTeam(e.target.value)}
            className="bg-ds-navy border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text focus:border-ds-green focus:outline-none"
          >
            <option value={ALL_TEAMS}>Todos os Times</option>
            {analysis.teams.map(t => (
              <option key={t.team} value={t.team}>{t.team}</option>
            ))}
          </select>
        </div>
        <div
          className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center cursor-pointer hover:border-ds-green transition-colors"
          onClick={() => setModalData({
            title: focus ? `Itens concluídos — ${focus.team}` : 'Itens usados no Flow Efficiency Global',
            items: focus ? focus.items : analysis.completedItems,
            color: '#64FFDA',
          })}
        >
          <p className="text-ds-text text-xs">Flow Efficiency — {headline.team}</p>
          <p className={`text-3xl font-bold ${efficiencyColor(headline.efficiency)}`}>{headline.efficiency}%</p>
          <p className="text-ds-text text-xs mt-1">{efficiencyLabel(headline.efficiency)}</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Média por item — clique para ver os itens</p>
          <p className="text-lg font-bold text-ds-light-text">
            <button
              onClick={() => openSideModal('active')}
              className="text-ds-green hover:underline"
              title="Ver os itens que mais pesaram no tempo trabalhando"
            >
              {headline.activeDays}d trabalhando
            </button>
            {' · '}
            <button
              onClick={() => openSideModal('wait')}
              className="text-red-400 hover:underline"
              title="Ver os itens que mais pesaram no tempo esperando"
            >
              {headline.waitDays}d esperando
            </button>
          </p>
          <p className="text-ds-text text-xs mt-1">{headline.count} itens concluídos</p>
        </div>
        {focus?.topWaitStatus && (
          <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
            <p className="text-ds-text text-xs">Onde o tempo de {focus.team} está parado</p>
            <p className="text-lg font-bold text-red-400">{focus.topWaitStatus}</p>
            <p className="text-ds-text text-xs mt-1">{focus.topWaitDays}d por item, em média</p>
          </div>
        )}
      </div>

      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-1">Flow Efficiency por Time</h3>
        <p className="text-ds-text text-xs mb-4">
          Cada barra é 100% do tempo de vida dos itens do time: a parte verde é a eficiência.
          Clique na <strong className="text-ds-green">parte verde</strong> ou na <strong className="text-red-400">vermelha</strong> para ver
          quais itens mais pesaram naquele lado.
        </p>
        <ResponsiveContainer width="100%" height={Math.max(250, analysis.teams.length * 45)}>
          <BarChart data={analysis.teams} layout="vertical" margin={{ left: 120, right: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis type="number" domain={[0, 100]} unit="%" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="team" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} width={110} />
            <Tooltip content={<FlowTooltip />} cursor={{ fill: 'rgba(100, 255, 218, 0.06)' }} />
            <Legend />
            <Bar dataKey="efficiency" name="Trabalhando (%)" stackId="a" fill="#64FFDA" cursor="pointer" onClick={(d: any) => handleSegmentClick(d.team, 'active')}>
              {analysis.teams.map(t => <Cell key={t.team} fillOpacity={dim(t.team)} />)}
            </Bar>
            <Bar dataKey="waitPct" name="Esperando (%)" stackId="a" fill="#F56565" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => handleSegmentClick(d.team, 'wait')}>
              {analysis.teams.map(t => <Cell key={t.team} fillOpacity={dim(t.team) * 0.55} />)}
              <LabelList dataKey="efficiency" position="right" formatter={(v: any) => `${v}%`} fill="#e6f1ff" fontSize={11} fontWeight="bold" />
            </Bar>
            <ReferenceLine x={40} stroke="#F6E05E" strokeDasharray="4 4" label={{ value: 'Meta 40%', position: 'top', fill: '#F6E05E', fontSize: 10 }} />
          </BarChart>
        </ResponsiveContainer>

        {/* Ranking de eficiência */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          {analysis.teams.map((t, idx) => (
            <div
              key={t.team}
              className={`p-2 bg-ds-bg rounded text-xs text-center cursor-pointer hover:bg-ds-bg/70 transition-all ${focus && focus.team !== t.team ? 'opacity-40' : ''} ${focus?.team === t.team ? 'ring-1 ring-ds-green' : ''}`}
              onClick={() => handleTeamClick(t.team)}
            >
              <span className="text-ds-text">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : ''} {t.team}</span>
              <p className={`text-lg font-bold ${efficiencyColor(t.efficiency)}`}>{t.efficiency}%</p>
              <p className="text-ds-text">{t.count} itens</p>
              <p className="flex justify-center gap-2 mt-1">
                <button
                  onClick={e => { e.stopPropagation(); handleSegmentClick(t.team, 'active'); }}
                  className="text-ds-green hover:underline"
                  title={`Itens que mais pesaram nos ${t.activeDays}d trabalhando`}
                >🟢 {t.activeDays}d</button>
                <button
                  onClick={e => { e.stopPropagation(); handleSegmentClick(t.team, 'wait'); }}
                  className="text-red-400 hover:underline"
                  title={`Itens que mais pesaram nos ${t.waitDays}d esperando`}
                >🔴 {t.waitDays}d</button>
              </p>
              {t.topWaitStatus && <p className="text-ds-text/70 text-[10px] truncate" title={`Maior fila: ${t.topWaitStatus}`}>⏳ {t.topWaitStatus}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FlowEfficiencyChart;
