import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import ChartInfoLamp from './ChartInfoLamp';
import { EmptyState } from './ChartStates.tsx';
import { useAuth } from '../contexts/AuthContext';
import { baixarXlsx, montarPainelXlsx } from '../utils/painelXlsx.ts';
import { getPeriodBuckets, type PeriodBucket, type PeriodGroupMode } from '../utils/periodGrouping.ts';
import {
  buildPainelMensal, dentroDaFaixa, faixaDoTime, itensDaMetrica, itensDoTime, METAS_PADRAO, TIMES_PLANILHA, textoFaixa,
  type Faixa, type MetaMetrica, type MetasPainel, type MetricKey,
} from '../utils/painelMensal.ts';

interface Props { data: WorkItem[]; }
interface CicloItem { fim: string; cicloDiasUteis: number | null; }

// Modal de itens: mesmo padrão usado nos outros gráficos da ferramenta (ex.: BottleneckAnalysisChart.tsx) —
// local a este arquivo, não compartilhado.
const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';
interface ModalInfo { titulo: string; itens: WorkItem[]; }
const ItemModal: React.FC<{ info: ModalInfo | null; onClose: () => void }> = ({ info, onClose }) => {
  if (!info) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-ds-navy border border-ds-border rounded-lg shadow-2xl max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 rounded-t-lg flex justify-between items-center bg-blue-600">
          <h2 className="text-white font-bold text-base">{info.titulo}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl font-bold leading-none">×</button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <div className="text-ds-text mb-3 text-sm">Total: <span className="font-bold text-white">{info.itens.length}</span> itens</div>
          {info.itens.length === 0 ? (
            <p className="text-ds-text text-sm">Nenhum item nesse período.</p>
          ) : (
            <ul className="space-y-2">
              {info.itens.map((item, idx) => (
                <li key={item.workItemId || idx} className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 hover:border-ds-green transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono px-2 py-1 rounded bg-blue-600 text-white flex-shrink-0">#{item.workItemId}</span>
                    <div className="flex-1 min-w-0">
                      <a href={item.url || `${AZURE_DEVOPS_BASE_URL}/${item.workItemId}`} target="_blank" rel="noopener noreferrer" className="text-white hover:text-ds-green font-medium block truncate mb-2" title={item.title}>
                        {item.title}
                      </a>
                      <div className="grid grid-cols-2 gap-2 text-xs text-ds-text">
                        <div>👤 {item.assignedTo || 'Não atribuído'}</div>
                        <div>👥 {item.team || 'Sem time'}</div>
                        <div>🏷️ {item.type}</div>
                        <div>📊 {item.state}</div>
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

const META_KEY = 'metas_painel_mensal';
const METRICAS: MetricKey[] = ['fluxo', 'cycle', 'bugs', 'retrabalho', 'qtdP0', 'slaP0'];
const MODOS: { value: PeriodGroupMode; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
];

const INFO: Record<MetricKey, string> = {
  fluxo: 'Fluxo de Eficiência = média, item a item, de Ativo ÷ (Ativo + Fila). Ativo = Desenvolvendo + Testando QA; Fila = Aguardando Code Review + Fazendo Code Review + Aguardando QA. Período = primeira vez que o item chegou a Pronto ou foi Fechado (o que vier primeiro). Verde = dentro da faixa de meta. Sustentação tem faixa própria.',
  cycle: 'Cycle Time P85 em dias úteis (sábado e domingo descontados; feriados não), da criação até a primeira vez que o item chegou a Pronto ou foi Fechado (o que vier primeiro — um fechamento em lote, bem depois do Pronto, não conta). 85% dos itens concluídos no período levaram até esse número. Fechamentos em massa de itens antigos sobem o P85 do mês. As médias são a média dos valores dos times.',
  bugs: 'Quantidade de Issues (erros que escaparam para produção) criadas no período, por time.',
  retrabalho: '% das entregas concluídas no período que são Bug (achado em desenvolvimento) ou Issue (escapou para produção), sobre o total de entregas concluídas. Verde até 31%.',
  qtdP0: 'Quantidade de itens P0 (prioridade vazia ou 0) concluídos no período com Cycle Time preenchido. Prioridade 1 (Crítica) não entra. Mesma base do SLA P0, ao lado — aqui é a contagem, lá é o % dentro do prazo.',
  slaP0: '% dos itens P0 (prioridade vazia ou 0) concluídos no período com Cycle Time em até 7 dias corridos. Prioridade 1 (Crítica) não entra.',
};

const nomeTime = (t: string) => (t.toLowerCase().replace(/[^a-z]/g, '') === 'sustentacao' ? 'Sustentação' : t);

const corCelula = (ok: boolean | null) =>
  ok === true ? 'text-green-400' : ok === false ? 'text-red-400' : 'text-ds-text/40';

const formatar = (v: number | null, key: MetricKey) => {
  if (v === null) return '—';
  if (key === 'bugs' || key === 'qtdP0') return String(v);
  return `${v}${key === 'cycle' ? 'd' : '%'}`;
};

// Data local como AAAA-MM-DD (toISOString usa UTC e pode pular um dia)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const PainelMensalDashboard: React.FC<Props> = ({ data }) => {
  const { token, isAdmin } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || '';

  const hoje = new Date();
  const [modo, setModo] = useState<PeriodGroupMode>('monthly');
  const [inicio, setInicio] = useState<string>(iso(new Date(hoje.getFullYear(), 0, 1)));
  const [fim, setFim] = useState<string>(iso(hoje));

  const [metas, setMetas] = useState<MetasPainel>(METAS_PADRAO);
  const [rascunho, setRascunho] = useState<MetasPainel>(METAS_PADRAO);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Metas compartilhadas: o servidor guarda a configuração; sem ela, valem as padrão da planilha.
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/settings/${META_KEY}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.value) {
          const merged = { ...METAS_PADRAO, ...d.value } as MetasPainel;
          setMetas(merged);
          setRascunho(merged);
        }
      })
      .catch(() => { /* sem conexão: usa as metas padrão */ });
  }, [token, API_URL]);

  const salvarMetas = async () => {
    setSalvando(true);
    setErro('');
    try {
      const res = await fetch(`${API_URL}/api/settings/${META_KEY}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: rascunho }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErro(d.error || 'Erro ao salvar metas');
        return;
      }
      setMetas(rascunho);
      setEditando(false);
    } catch {
      setErro('Erro de conexão ao salvar metas');
    } finally {
      setSalvando(false);
    }
  };

  const ajustarLimite = (key: MetricKey, lado: 'min' | 'max', valor: string, team?: string) => {
    const n = valor === '' ? null : Number(valor);
    setRascunho(prev => {
      const m = { ...prev[key] };
      if (team) {
        const porTime = { ...(m.porTime || {}) };
        porTime[team] = { ...(porTime[team] || { min: null, max: null }), [lado]: n } as Faixa;
        m.porTime = porTime;
      } else {
        m[lado] = n;
      }
      return { ...prev, [key]: m };
    });
  };

  // Períodos do intervalo escolhido, no modo escolhido (semanal, quinzenal ou mensal)
  const periodos = useMemo(() => {
    const ini = new Date(`${inicio}T00:00:00`);
    const end = new Date(`${fim}T23:59:59`);
    if (Number.isNaN(ini.getTime()) || Number.isNaN(end.getTime()) || ini > end) return [];
    return getPeriodBuckets(ini, end, modo);
  }, [inicio, fim, modo]);

  // Fim (primeiro Fechado, ou Pronto) e Cycle Time no critério da planilha. Só o Painel usa esses valores.
  const [ciclo, setCiclo] = useState<Map<number, CicloItem>>(() => new Map());
  useEffect(() => {
    fetch(`${API_URL}/api/painel-time/ciclo`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((rows: { id: number; fim: string; cicloDiasUteis: number | null }[]) =>
        setCiclo(new Map(rows.map((r): [number, CicloItem] => [r.id, { fim: r.fim, cicloDiasUteis: r.cicloDiasUteis }]))))
      .catch(() => setErro('Não foi possível carregar as datas de fim do Painel. Recarregue a página.'));
  }, [API_URL, token]);
  const itens = useMemo(() => data.map(i => {
    const c = ciclo.get(i.workItemId);
    return c ? { ...i, closedDate: c.fim, cycleTimeBusinessDays: c.cicloDiasUteis } : i;
  }), [data, ciclo]);

  // Usa TODOS os itens (não o quickFilter): o painel tem a própria janela de datas.
  // Times escolhidos no seletor. Começa com os 5 da planilha; o usuário marca/desmarca os outros.
  const [timesEscolhidos, setTimesEscolhidos] = useState<Set<string>>(() => new Set(TIMES_PLANILHA));
  const todosTimes = useMemo(
    () => [...new Set(itens.map(i => i.team).filter((t): t is string => !!t && t !== 'Sem Time'))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [itens]
  );
  const alternarTime = (team: string) => setTimesEscolhidos(prev => {
    const next = new Set(prev);
    if (next.has(team)) next.delete(team); else next.add(team);
    return next;
  });

  const painel = useMemo(
    () => buildPainelMensal(itens, periodos, [...timesEscolhidos]),
    [itens, periodos, timesEscolhidos]
  );

  // Clique numa barra do gráfico: mesma lista de itens que gerou o número daquela métrica/time/período.
  const [modal, setModal] = useState<ModalInfo | null>(null);
  const abrirModal = (key: MetricKey, team: string, idx: number) => {
    const bucket: PeriodBucket | undefined = periodos[idx];
    if (!bucket) return;
    setModal({
      titulo: `${metas[key].label} — ${nomeTime(team)} — ${painel.labels[idx]}`,
      itens: itensDaMetrica(itensDoTime(itens, team), bucket, key),
    });
  };

  const linhasDaMetrica = (key: MetricKey) => [
    ...painel.times.map(t => ({ nome: nomeTime(t), valores: painel.porTime[key][t], team: t, media: false })),
    { nome: 'Média de todos os times', valores: painel.mediaTodos[key], team: undefined, media: true },
    { nome: 'Média sem Sustentação', valores: painel.mediaSemSustentacao[key], team: undefined, media: true },
  ];

  const tabelaMetrica = (key: MetricKey) => {
    const meta = metas[key];
    return (
      <div className="overflow-x-auto">
        <table className="text-xs text-left text-ds-text">
          <thead className="text-ds-light-text border-b border-ds-border">
            <tr>
              <th className="px-2 py-2 sticky left-0 bg-ds-navy">Time</th>
              {painel.labels.map((lab, i) => <th key={i} className="px-2 py-2 text-right whitespace-nowrap">{lab}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhasDaMetrica(key).map(l => (
              <tr key={l.nome} className={`border-b border-ds-border/50 ${l.media ? 'font-semibold text-ds-light-text' : ''}`}>
                <td className="px-2 py-1.5 whitespace-nowrap sticky left-0 bg-ds-navy">{l.nome}</td>
                {l.valores.map((v, i) => {
                  const faixa = l.team ? faixaDoTime(meta, l.team) : { min: meta.min, max: meta.max };
                  return (
                    <td key={i} className={`px-2 py-1.5 text-right font-mono whitespace-nowrap ${corCelula(dentroDaFaixa(v, faixa))}`}>
                      {formatar(v, key)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Uma linha por período, uma coluna por time — usado pelo gráfico de linha e pelo de barras.
  const linhasGrafico = (key: MetricKey) => painel.labels.map((lab, i) => {
    const row: Record<string, string | number | null> = { periodo: lab };
    painel.times.forEach(t => { row[nomeTime(t)] = painel.porTime[key][t][i]; });
    return row;
  });

  const graficoMetrica = (key: MetricKey) => {
    const meta = metas[key];
    const rows = linhasGrafico(key);
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis dataKey="periodo" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff' }} />
          <Legend />
          {meta.min !== null && meta.max !== null && (
            <ReferenceArea y1={meta.min} y2={meta.max} fill="#64FFDA" fillOpacity={0.08} />
          )}
          {meta.max !== null && meta.min === null && (
            <ReferenceLine y={meta.max} stroke="#64FFDA" strokeDasharray="4 4" label={{ value: `limite ${meta.max}${meta.unidade}`, fill: '#64FFDA', fontSize: 10 }} />
          )}
          {painel.times.map((t, i) => (
            <Line key={t} type="monotone" dataKey={nomeTime(t)} stroke={CHART_COLORS.palette[i % CHART_COLORS.palette.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  // Gráfico de barras: mesmos dados do gráfico de linha, uma barra por time e período. Clicar numa barra abre
  // o modal com os itens daquele número (itensDaMetrica, mesmos predicados do cálculo em painelMensal.ts).
  const graficoBarras = (key: MetricKey) => {
    const meta = metas[key];
    const rows = linhasGrafico(key);
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis dataKey="periodo" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff' }}
            formatter={(value: number, name: string) => [value, `${name} (clique na barra para ver os itens)`]}
          />
          <Legend />
          {meta.min !== null && meta.max !== null && (
            <ReferenceArea y1={meta.min} y2={meta.max} fill="#64FFDA" fillOpacity={0.08} />
          )}
          {meta.max !== null && meta.min === null && (
            <ReferenceLine y={meta.max} stroke="#64FFDA" strokeDasharray="4 4" />
          )}
          {painel.times.map((t, i) => (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <Bar key={t} dataKey={nomeTime(t)} fill={CHART_COLORS.palette[i % CHART_COLORS.palette.length]} cursor="pointer"
              onClick={(_: any, idx: number) => abrirModal(key, t, idx)} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  // Exporta no layout da aba "Validado" da planilha de gestão (uma aba, blocos por time, médias como fórmulas).
  const exportarXlsx = async () => {
    const wb = await montarPainelXlsx(painel, metas);
    const rotulo = MODOS.find(m => m.value === modo)?.label ?? '';
    await baixarXlsx(wb, `Painel_${rotulo}_${inicio}_a_${fim}.xlsx`);
  };

  const editorMetas = (
    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border mb-4 space-y-3">
      <p className="text-xs text-ds-text">Edite as faixas de meta. Quem não é admin só visualiza. Sem valor em um lado = sem limite.</p>
      {METRICAS.map(key => {
        const m = rascunho[key];
        return (
          <div key={key} className="flex flex-wrap items-center gap-3 text-xs">
            <span className="w-56 text-ds-light-text">{m.label}</span>
            <label className="flex items-center gap-1">mín <input type="number" step="any" value={m.min ?? ''} onChange={e => ajustarLimite(key, 'min', e.target.value)} className="w-20 bg-ds-dark-blue border border-ds-border rounded px-2 py-1" /></label>
            <label className="flex items-center gap-1">máx <input type="number" step="any" value={m.max ?? ''} onChange={e => ajustarLimite(key, 'max', e.target.value)} className="w-20 bg-ds-dark-blue border border-ds-border rounded px-2 py-1" /></label>
            {m.porTime?.sustentacao && (
              <span className="flex items-center gap-2 text-ds-text">
                Sustentação:
                <label className="flex items-center gap-1">mín <input type="number" step="any" value={m.porTime.sustentacao.min ?? ''} onChange={e => ajustarLimite(key, 'min', e.target.value, 'sustentacao')} className="w-20 bg-ds-dark-blue border border-ds-border rounded px-2 py-1" /></label>
                <label className="flex items-center gap-1">máx <input type="number" step="any" value={m.porTime.sustentacao.max ?? ''} onChange={e => ajustarLimite(key, 'max', e.target.value, 'sustentacao')} className="w-20 bg-ds-dark-blue border border-ds-border rounded px-2 py-1" /></label>
              </span>
            )}
          </div>
        );
      })}
      {erro && <p className="text-xs text-red-400">{erro}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={salvarMetas} disabled={salvando} className="text-xs px-3 py-2 rounded-md bg-ds-green text-ds-dark-blue font-semibold disabled:opacity-50">
          {salvando ? 'Salvando...' : 'Salvar metas'}
        </button>
        <button type="button" onClick={() => { setRascunho(metas); setEditando(false); setErro(''); }} className="text-xs px-3 py-2 rounded-md border border-ds-border text-ds-text">
          Cancelar
        </button>
      </div>
    </div>
  );

  const intervaloInvalido = periodos.length === 0;

  return (
    <div className="space-y-6">
      <ItemModal info={modal} onClose={() => setModal(null)} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-ds-light-text font-bold text-xl">📅 Painel por Time</h2>
          <p className="text-xs text-ds-text mt-1">
            Mesmos campos da planilha de gestão, com os dados desta ferramenta. Escolha os times, o período e a granularidade.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <details className="relative">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none px-3 py-2 rounded-lg border border-ds-border text-xs text-ds-light-text hover:bg-ds-border/50 transition-colors">
              Times: {timesEscolhidos.size} de {todosTimes.length} ▾
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-72 max-h-80 overflow-y-auto bg-ds-navy border border-ds-border rounded-lg shadow-xl p-3">
              <div className="flex gap-4 mb-2 pb-2 border-b border-ds-border text-xs">
                <button type="button" onClick={() => setTimesEscolhidos(new Set(todosTimes))} className="text-ds-green hover:underline">Marcar todos</button>
                <button type="button" onClick={() => setTimesEscolhidos(new Set())} className="text-ds-text hover:underline">Desmarcar todos</button>
              </div>
              {todosTimes.map(t => (
                <label key={t} className="flex items-center gap-2 py-1 text-xs text-ds-light-text cursor-pointer">
                  <input type="checkbox" checked={timesEscolhidos.has(t)} onChange={() => alternarTime(t)} className="accent-ds-green w-4 h-4 shrink-0" />
                  <span className="truncate">{nomeTime(t)}</span>
                </label>
              ))}
            </div>
          </details>
          <div className="flex gap-1">
            {MODOS.map(opt => (
              <button key={opt.value} type="button" onClick={() => setModo(opt.value)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${modo === opt.value ? 'bg-ds-green text-ds-dark-blue' : 'bg-ds-muted/20 text-ds-text hover:bg-ds-muted/40'}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <label className="text-xs text-ds-text">De
            <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="block mt-1 bg-ds-navy border border-ds-border rounded-lg px-2 py-1.5 text-sm text-ds-light-text" />
          </label>
          <label className="text-xs text-ds-text">Até
            <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="block mt-1 bg-ds-navy border border-ds-border rounded-lg px-2 py-1.5 text-sm text-ds-light-text" />
          </label>
          <button type="button" onClick={exportarXlsx} disabled={intervaloInvalido || painel.times.length === 0}
            className="text-xs px-3 py-2 rounded-md bg-ds-green/10 text-ds-green font-semibold hover:bg-ds-green/20 disabled:opacity-50">
            📥 Exportar .xlsx
          </button>
          {isAdmin && (
            <button type="button" onClick={() => { setRascunho(metas); setEditando(v => !v); }} className="text-xs px-3 py-2 rounded-md border border-ds-border text-ds-light-text hover:bg-ds-border/50">
              {editando ? 'Fechar metas' : '⚙️ Editar metas'}
            </button>
          )}
        </div>
      </div>

      {editando && isAdmin && editorMetas}

      {intervaloInvalido ? (
        <EmptyState message="Escolha um intervalo válido (a data inicial não pode ser depois da final)." />
      ) : painel.times.length === 0 ? (
        <EmptyState message="Selecione pelo menos um time com itens no período escolhido." />
      ) : (
        METRICAS.map(key => (
          <div key={key} className="bg-ds-navy p-4 rounded-lg border border-ds-border">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-ds-light-text font-bold text-base">{metas[key].label}</h3>
              <span className="text-xs text-ds-text">Meta: {textoFaixa({ min: metas[key].min, max: metas[key].max }, metas[key].unidade)}</span>
              <ChartInfoLamp info={INFO[key]} />
            </div>
            <p className="text-xs text-ds-text/80 mb-2">Como é calculado: {INFO[key]}</p>
            <div className="mt-3">{tabelaMetrica(key)}</div>
            <div className="mt-4">{graficoMetrica(key)}</div>
            <p className="text-xs text-ds-text/60 mt-4 mb-1">Clique numa barra para ver os itens daquele time e período.</p>
            <div>{graficoBarras(key)}</div>
          </div>
        ))
      )}
    </div>
  );
};

export default PainelMensalDashboard;
