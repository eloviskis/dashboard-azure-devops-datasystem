import React, { useState, useEffect, useMemo } from 'react';
import { PullRequest } from '../types';
import { CHART_COLORS } from '../constants';
import { getPullRequests, syncPullRequests } from '../services/azureDevOpsService';
import ChartInfoLamp from './ChartInfoLamp';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { format, subMonths, isWithinInterval, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type PeriodType = 'monthly' | 'specific-month' | 'custom';

const VOTE_LABELS: Record<number, string> = {
  10: 'Aprovado',
  5: 'Aprovado com sugestões',
  0: 'Sem voto',
  [-5]: 'Aguardando autor',
  [-10]: 'Rejeitado'
};

const VOTE_COLORS: Record<number, string> = {
  10: '#64FFDA',
  5: '#47C5FB',
  0: '#8892B0',
  [-5]: '#FFB86C',
  [-10]: '#FF5555'
};

const STATUS_COLORS: Record<string, string> = {
  active: '#47C5FB',
  completed: '#64FFDA',
  abandoned: '#FF5555'
};

const PullRequestsDashboard: React.FC = () => {
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRepo, setFilterRepo] = useState<string>('all');
  const [filterAuthor, setFilterAuthor] = useState<string>('all');

  useEffect(() => {
    const fetchPRs = async () => {
      setLoading(true);
      const data = await getPullRequests();
      setPullRequests(data);
      setLoading(false);
    };
    fetchPRs();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    await syncPullRequests();
    const data = await getPullRequests();
    setPullRequests(data);
    setSyncing(false);
  };

  const lastMonths = useMemo(() => {
    const months: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = subMonths(now, i);
      const val = format(d, 'yyyy-MM');
      const label = format(d, 'MMMM yyyy', { locale: ptBR });
      months.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return months;
  }, []);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (periodType === 'specific-month' && selectedMonth) {
      const [year, month] = selectedMonth.split('-').map(Number);
      return { start: startOfMonth(new Date(year, month - 1)), end: endOfMonth(new Date(year, month - 1)) };
    }
    if (periodType === 'custom' && customStart && customEnd) {
      return { start: new Date(customStart), end: new Date(customEnd) };
    }
    return { start: subMonths(now, 6), end: now };
  }, [periodType, selectedMonth, customStart, customEnd]);

  const repos = useMemo(() => [...new Set(pullRequests.map(pr => pr.repositoryName))].sort(), [pullRequests]);
  const authors = useMemo(() => [...new Set(pullRequests.map(pr => pr.createdBy).filter(Boolean))].sort(), [pullRequests]);

  const filteredPRs = useMemo(() => {
    return pullRequests.filter(pr => {
      const createdDate = new Date(pr.createdDate);
      if (!isWithinInterval(createdDate, { start: dateRange.start, end: dateRange.end })) return false;
      if (filterStatus !== 'all' && pr.status !== filterStatus) return false;
      if (filterRepo !== 'all' && pr.repositoryName !== filterRepo) return false;
      if (filterAuthor !== 'all' && pr.createdBy !== filterAuthor) return false;
      return true;
    });
  }, [pullRequests, dateRange, filterStatus, filterRepo, filterAuthor]);

  // === METRICS ===
  const metrics = useMemo(() => {
    const total = filteredPRs.length;
    const active = filteredPRs.filter(pr => pr.status === 'active').length;
    const completed = filteredPRs.filter(pr => pr.status === 'completed').length;
    const abandoned = filteredPRs.filter(pr => pr.status === 'abandoned').length;

    const completedWithLifetime = filteredPRs.filter(pr => pr.status === 'completed' && pr.lifetimeDays != null);
    const avgLifetime = completedWithLifetime.length > 0
      ? Math.round((completedWithLifetime.reduce((sum, pr) => sum + (pr.lifetimeDays || 0), 0) / completedWithLifetime.length) * 10) / 10
      : 0;

    // PRs without any reviewer
    const withoutReviewer = filteredPRs.filter(pr => !pr.reviewers || pr.reviewers.length === 0).length;

    // PRs pending > 3 days (active)
    const longPending = filteredPRs.filter(pr => {
      if (pr.status !== 'active') return false;
      const ageDays = (new Date().getTime() - new Date(pr.createdDate).getTime()) / (1000 * 60 * 60 * 24);
      return ageDays > 3;
    }).length;

    // Average time to first approval (for completed PRs)
    // Since we don't have approval timestamps, use lifetime as proxy
    const avgApprovalTime = avgLifetime;

    return { total, active, completed, abandoned, avgLifetime, withoutReviewer, longPending, avgApprovalTime };
  }, [filteredPRs]);

  // === STATUS PIE ===
  const statusPieData = useMemo(() => [
    { name: 'Ativos', value: metrics.active, color: STATUS_COLORS.active },
    { name: 'Concluídos', value: metrics.completed, color: STATUS_COLORS.completed },
    { name: 'Abandonados', value: metrics.abandoned, color: STATUS_COLORS.abandoned },
  ].filter(d => d.value > 0), [metrics]);

  // === PRs BY REPO ===
  const prsByRepo = useMemo(() => {
    const map: Record<string, { active: number; completed: number; abandoned: number }> = {};
    filteredPRs.forEach(pr => {
      if (!map[pr.repositoryName]) map[pr.repositoryName] = { active: 0, completed: 0, abandoned: 0 };
      map[pr.repositoryName][pr.status]++;
    });
    return Object.entries(map)
      .map(([repo, counts]) => ({ repo, ...counts, total: counts.active + counts.completed + counts.abandoned }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [filteredPRs]);

  // === TOP AUTHORS ===
  const topAuthors = useMemo(() => {
    const map: Record<string, number> = {};
    filteredPRs.forEach(pr => {
      if (pr.createdBy) map[pr.createdBy] = (map[pr.createdBy] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [filteredPRs]);

  // === TOP REVIEWERS ===
  const topReviewers = useMemo(() => {
    const map: Record<string, { total: number; approved: number; rejected: number; noVote: number }> = {};
    filteredPRs.forEach(pr => {
      (pr.reviewers || []).forEach(r => {
        if (!map[r.name]) map[r.name] = { total: 0, approved: 0, rejected: 0, noVote: 0 };
        map[r.name].total++;
        if (r.vote >= 5) map[r.name].approved++;
        else if (r.vote <= -5) map[r.name].rejected++;
        else map[r.name].noVote++;
      });
    });
    return Object.entries(map)
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [filteredPRs]);

  // === REVIEW CONCENTRATION ===
  const reviewConcentration = useMemo(() => {
    if (topReviewers.length === 0) return null;
    const totalReviews = topReviewers.reduce((s, r) => s + r.total, 0);
    const top3Reviews = topReviewers.slice(0, 3).reduce((s, r) => s + r.total, 0);
    const concentration = Math.round((top3Reviews / totalReviews) * 100);
    return {
      concentration,
      top3: topReviewers.slice(0, 3).map(r => r.name),
      isRisky: concentration > 60
    };
  }, [topReviewers]);

  // === LIFETIME TREND ===
  const lifetimeTrend = useMemo(() => {
    try {
      const months = eachMonthOfInterval({ start: dateRange.start, end: dateRange.end });
      return months.map(monthStart => {
        const monthEnd = endOfMonth(monthStart);
        const prsInMonth = filteredPRs.filter(pr => {
          const d = new Date(pr.createdDate);
          return pr.status === 'completed' && pr.lifetimeDays != null && isWithinInterval(d, { start: monthStart, end: monthEnd });
        });
        const lifetimes = prsInMonth.map(pr => pr.lifetimeDays as number);
        const avg = lifetimes.length > 0 ? Math.round((lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length) * 10) / 10 : null;
        const sorted = [...lifetimes].sort((a, b) => a - b);
        const p85Idx = Math.ceil(sorted.length * 0.85) - 1;
        const p85 = sorted.length > 0 ? sorted[Math.max(0, p85Idx)] : null;
        return {
          label: format(monthStart, 'MMM/yy', { locale: ptBR }),
          avg,
          p85,
          count: prsInMonth.length
        };
      });
    } catch { return []; }
  }, [filteredPRs, dateRange]);

  // === VOTE DISTRIBUTION ===
  const voteDistribution = useMemo(() => {
    const map: Record<number, number> = {};
    filteredPRs.forEach(pr => {
      (pr.reviewers || []).forEach(r => {
        map[r.vote] = (map[r.vote] || 0) + 1;
      });
    });
    return Object.entries(map)
      .map(([vote, count]) => ({
        vote: Number(vote),
        name: VOTE_LABELS[Number(vote)] || `Voto ${vote}`,
        count,
        color: VOTE_COLORS[Number(vote)] || '#8892B0'
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredPRs]);

  // === ACTIVE PR QUEUE (risk analysis) ===
  const activePRQueue = useMemo(() => {
    return filteredPRs
      .filter(pr => pr.status === 'active')
      .map(pr => {
        const ageDays = Math.round((new Date().getTime() - new Date(pr.createdDate).getTime()) / (1000 * 60 * 60 * 24));
        return { ...pr, ageDays };
      })
      .sort((a, b) => b.ageDays - a.ageDays);
  }, [filteredPRs]);

  if (loading) return <div className="text-center p-10 text-ds-light-text">Carregando Pull Requests...</div>;

  if (pullRequests.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-ds-navy p-6 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-lg mb-4">Nenhum Pull Request encontrado. Sincronize os dados do Azure DevOps.</p>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-ds-green text-ds-dark-blue font-semibold py-2 px-6 rounded-lg hover:bg-ds-green/80 transition-colors disabled:opacity-50"
          >
            {syncing ? '🔄 Sincronizando...' : '🔄 Sincronizar PRs'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* FILTERS */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-ds-text text-sm mb-1">Período:</label>
            <div className="flex gap-1">
              {[
                { value: 'monthly', label: 'Últimos 6 meses' },
                { value: 'specific-month', label: 'Mês Específico' },
                { value: 'custom', label: 'Personalizado' },
              ].map(opt => (
                <button key={opt.value}
                  onClick={() => setPeriodType(opt.value as PeriodType)}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${periodType === opt.value ? 'bg-ds-green text-ds-dark-blue' : 'bg-ds-muted/20 text-ds-text hover:bg-ds-muted/40'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {periodType === 'specific-month' && (
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
              <option value="">Selecione o mês...</option>
              {lastMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          )}

          {periodType === 'custom' && (
            <div className="flex gap-2 items-end">
              <div>
                <label className="block text-ds-text text-sm mb-1">De:</label>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                  className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2" />
              </div>
              <div>
                <label className="block text-ds-text text-sm mb-1">Até:</label>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                  className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2" />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-ds-text text-sm mb-1">Status:</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 w-full">
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="completed">Concluídos</option>
              <option value="abandoned">Abandonados</option>
            </select>
          </div>
          <div>
            <label className="block text-ds-text text-sm mb-1">Repositório:</label>
            <select value={filterRepo} onChange={e => setFilterRepo(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 w-full">
              <option value="all">Todos</option>
              {repos.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-ds-text text-sm mb-1">Autor:</label>
            <select value={filterAuthor} onChange={e => setFilterAuthor(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 w-full">
              <option value="all">Todos</option>
              {authors.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={handleSync} disabled={syncing}
              className="bg-ds-green/10 text-ds-green font-semibold py-2 px-4 rounded-md hover:bg-ds-green/20 transition-colors text-sm w-full disabled:opacity-50">
              {syncing ? '🔄 Sincronizando...' : '🔄 Sincronizar PRs'}
            </button>
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {[
          { label: 'Total PRs', value: metrics.total, color: 'text-ds-light-text' },
          { label: 'Ativos', value: metrics.active, color: 'text-blue-400' },
          { label: 'Concluídos', value: metrics.completed, color: 'text-ds-green' },
          { label: 'Abandonados', value: metrics.abandoned, color: 'text-red-400' },
          { label: 'Tempo Médio (dias)', value: metrics.avgLifetime, color: 'text-yellow-400' },
          { label: 'Sem Reviewer', value: metrics.withoutReviewer, color: metrics.withoutReviewer > 0 ? 'text-orange-400' : 'text-ds-green' },
          { label: 'Pendentes >3d', value: metrics.longPending, color: metrics.longPending > 0 ? 'text-red-400' : 'text-ds-green' },
          { label: 'Tempo Aprovação', value: `${metrics.avgApprovalTime}d`, color: 'text-purple-400' },
        ].map(card => (
          <div key={card.label} className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
            <p className="text-ds-text text-xs">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* PR WITHOUT REVIEWER ALERT */}
      {metrics.withoutReviewer > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
          <p className="text-orange-400 font-semibold">🔍 PRs Sem Reviewer</p>
          <p className="text-ds-text text-sm mt-1">
            Existem <strong className="text-orange-400">{metrics.withoutReviewer}</strong> PRs sem nenhum reviewer atribuído.
            Isso pode causar atraso na revisão e merge.
          </p>
        </div>
      )}

      {/* REVIEW CONCENTRATION ALERT */}
      {reviewConcentration && reviewConcentration.isRisky && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <p className="text-yellow-400 font-semibold">⚠️ Concentração de Reviews</p>
          <p className="text-ds-text text-sm mt-1">
            Os top 3 reviewers ({reviewConcentration.top3.join(', ')}) concentram <strong className="text-yellow-400">{reviewConcentration.concentration}%</strong> de todas as reviews.
            Isso é um risco — se um deles sair, o fluxo de PRs pode travar.
          </p>
        </div>
      )}

      {/* ACTIVE PR QUEUE ALERT */}
      {activePRQueue.length > 0 && activePRQueue[0].ageDays > 7 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 font-semibold">🚨 Fila de PRs Ativos</p>
          <p className="text-ds-text text-sm mt-1">
            Existem <strong className="text-red-400">{activePRQueue.filter(pr => pr.ageDays > 7).length}</strong> PRs ativos há mais de 7 dias.
            O mais antigo tem <strong className="text-red-400">{activePRQueue[0].ageDays} dias</strong>.
          </p>
        </div>
      )}

      {/* CHARTS ROW 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Pie */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-semibold mb-4">Distribuição por Status</h3>
          <ChartInfoLamp info="Distribuição dos PRs entre Ativos, Concluídos e Abandonados no período selecionado." />
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={statusPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#172A45', border: '1px solid #233554', color: '#CCD6F6' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Vote Distribution */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-semibold mb-4">Distribuição de Votos</h3>
          <ChartInfoLamp info="Distribuição dos votos nos PRs: Aprovado, Sem Voto, Aguardando Autor, Rejeitado. Votos 'Sem Voto' indicam PRs sem review ativa." />
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={voteDistribution} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {voteDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#172A45', border: '1px solid #233554', color: '#CCD6F6' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* PRs BY REPO */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-semibold mb-4">Pull Requests por Repositório</h3>
        <ChartInfoLamp info="Quantidade de PRs por repositório, divididos entre Concluídos, Ativos e Abandonados. Repositórios com muitos PRs ativos podem ter gargalo de review." />
        <ResponsiveContainer width="100%" height={Math.max(300, prsByRepo.length * 35)}>
          <BarChart data={prsByRepo} layout="vertical" margin={{ left: 120 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#233554" />
            <XAxis type="number" tick={{ fill: '#8892B0', fontSize: 12 }} />
            <YAxis type="category" dataKey="repo" tick={{ fill: '#CCD6F6', fontSize: 11 }} width={120} />
            <Tooltip contentStyle={{ backgroundColor: '#172A45', border: '1px solid #233554', color: '#CCD6F6' }} />
            <Legend />
            <Bar dataKey="completed" name="Concluídos" stackId="a" fill="#64FFDA" />
            <Bar dataKey="active" name="Ativos" stackId="a" fill="#47C5FB" />
            <Bar dataKey="abandoned" name="Abandonados" stackId="a" fill="#FF5555" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* CHARTS ROW 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Authors */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-semibold mb-4">Top Autores de PRs</h3>
          <ChartInfoLamp info="Ranking dos desenvolvedores que mais criaram PRs no período. Ajuda a identificar os maiores contribuidores de código." />
          <ResponsiveContainer width="100%" height={Math.max(300, topAuthors.length * 30)}>
            <BarChart data={topAuthors} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#233554" />
              <XAxis type="number" tick={{ fill: '#8892B0', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#CCD6F6', fontSize: 11 }} width={100} />
              <Tooltip contentStyle={{ backgroundColor: '#172A45', border: '1px solid #233554', color: '#CCD6F6' }} />
              <Bar dataKey="count" name="PRs" fill="#64FFDA">
                {topAuthors.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Reviewers */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-semibold mb-4">Top Reviewers</h3>
          <ChartInfoLamp info="Ranking dos revisores mais ativos, com breakdown de aprovações, rejeições e sem voto. Concentração alta em poucos revisores é um risco." />
          <ResponsiveContainer width="100%" height={Math.max(300, topReviewers.length * 30)}>
            <BarChart data={topReviewers} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#233554" />
              <XAxis type="number" tick={{ fill: '#8892B0', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#CCD6F6', fontSize: 11 }} width={100} />
              <Tooltip contentStyle={{ backgroundColor: '#172A45', border: '1px solid #233554', color: '#CCD6F6' }} />
              <Legend />
              <Bar dataKey="approved" name="Aprovados" stackId="a" fill="#64FFDA" />
              <Bar dataKey="noVote" name="Sem Voto" stackId="a" fill="#8892B0" />
              <Bar dataKey="rejected" name="Rejeitados" stackId="a" fill="#FF5555" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* LIFETIME TREND */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-semibold mb-4">Tendência de Tempo de Vida dos PRs (dias)</h3>
        <ChartInfoLamp info="Evolução mensal do tempo médio e P85 de vida dos PRs concluídos. Tempo de vida alto pode indicar gargalo no code review." />
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={lifetimeTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#233554" />
            <XAxis dataKey="label" tick={{ fill: '#8892B0', fontSize: 12 }} />
            <YAxis tick={{ fill: '#8892B0', fontSize: 12 }} />
            <Tooltip contentStyle={{ backgroundColor: '#172A45', border: '1px solid #233554', color: '#CCD6F6' }} />
            <Legend />
            <Line type="monotone" dataKey="avg" name="Média (dias)" stroke="#64FFDA" strokeWidth={2} dot={{ r: 4 }} connectNulls />
            <Line type="monotone" dataKey="p85" name="P85 (dias)" stroke="#FFB86C" strokeWidth={2} dot={{ r: 4 }} connectNulls strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ACTIVE PR TABLE */}
      {activePRQueue.length > 0 && (
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-semibold mb-4">🔴 PRs Ativos (fila de review)</h3>
          <ChartInfoLamp info="Tabela com PRs atualmente abertos aguardando review, ordenados por idade. PRs com mais de 7 dias indicam bloqueio de review." />
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-ds-text">
              <thead className="text-xs text-ds-light-text uppercase bg-ds-navy/50">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Autor</th>
                  <th className="px-4 py-3">Repositório</th>
                  <th className="px-4 py-3">Idade (dias)</th>
                  <th className="px-4 py-3">Reviewers</th>
                </tr>
              </thead>
              <tbody>
                {activePRQueue.slice(0, 20).map(pr => (
                  <tr key={pr.pullRequestId} className="border-b border-ds-border hover:bg-ds-muted/20">
                    <td className="px-4 py-3">
                      <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-ds-green hover:underline">
                        #{pr.pullRequestId}
                      </a>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate" title={pr.title}>{pr.title}</td>
                    <td className="px-4 py-3">{pr.createdBy}</td>
                    <td className="px-4 py-3">{pr.repositoryName}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${pr.ageDays > 7 ? 'text-red-400' : pr.ageDays > 3 ? 'text-yellow-400' : 'text-ds-green'}`}>
                        {pr.ageDays}d
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(pr.reviewers || []).map((r, i) => (
                          <span key={i} className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${VOTE_COLORS[r.vote] || '#8892B0'}20`, color: VOTE_COLORS[r.vote] || '#8892B0' }}>
                            {r.name.split(' ')[0]}: {VOTE_LABELS[r.vote] || 'N/A'}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default PullRequestsDashboard;
