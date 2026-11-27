import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PullRequest } from '../types';
import { CHART_COLORS } from '../constants';
import { getPullRequests, getPullRequestFiles, syncPullRequests } from '../services/azureDevOpsService';
import ChartInfoLamp from './ChartInfoLamp';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell, LineChart, Line, ComposedChart
} from 'recharts';
import { format, subMonths, isWithinInterval, startOfMonth, endOfMonth, eachMonthOfInterval, eachWeekOfInterval, endOfWeek, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { exportItemsXlsx, exportSheetsXlsx, ExportColumn } from '../utils/exportXlsx';
import { getPeriodBuckets, PeriodGroupMode, PERIOD_GROUP_MODE_OPTIONS } from '../utils/periodGrouping';
import { prPendingInfo, splitPendingByPerson } from '../utils/prPending';

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

const PR_EXPORT_COLUMNS: ExportColumn<PullRequest>[] = [
  { header: 'ID', key: 'id', width: 10, value: pr => pr.pullRequestId },
  { header: 'Título', key: 'title', width: 50, value: pr => pr.title },
  { header: 'Status', key: 'status', width: 14, value: pr => pr.status },
  { header: 'Autor', key: 'createdBy', width: 22, value: pr => pr.createdBy },
  { header: 'Repositório', key: 'repositoryName', width: 22, value: pr => pr.repositoryName },
  { header: 'Criado em', key: 'createdDate', width: 14, value: pr => pr.createdDate ? new Date(pr.createdDate).toLocaleDateString('pt-BR') : '' },
  { header: 'Fechado em', key: 'closedDate', width: 14, value: pr => pr.closedDate ? new Date(pr.closedDate).toLocaleDateString('pt-BR') : '' },
  { header: 'Tempo de Vida (dias)', key: 'lifetimeDays', width: 18, value: pr => pr.lifetimeDays ?? '' },
  { header: 'Arquivos', key: 'changedFiles', width: 10, value: pr => pr.changedFilesCount ?? '' },
  { header: 'URL', key: 'url', width: 20, value: pr => pr.url || '', isLink: true },
];

// PR grande é PR que ninguém revisa: acima de 100 arquivos vira vermelho, acima de 30 amarelo.
const filesColor = (n: number) => n > 100 ? 'text-red-400' : n > 30 ? 'text-yellow-400' : 'text-ds-green';

const branch = (ref?: string) => (ref || '').replace('refs/heads/', '');

// Colunas do relatório de pendências — mais detalhadas que PR_EXPORT_COLUMNS porque a pergunta aqui é
// "por que este PR está parado", não "quais PRs existiram no período".
const PR_PENDING_COLUMNS: ExportColumn<PullRequest>[] = [
  { header: 'PR', key: 'id', width: 9, value: pr => pr.pullRequestId },
  { header: 'Título', key: 'title', width: 60, value: pr => pr.title },
  { header: 'Repositório', key: 'repo', width: 18, value: pr => pr.repositoryName },
  { header: 'Origem', key: 'source', width: 34, value: pr => branch(pr.sourceRefName) },
  { header: 'Destino', key: 'target', width: 14, value: pr => branch(pr.targetRefName) },
  { header: 'Criado por', key: 'createdBy', width: 22, value: pr => pr.createdBy },
  { header: 'Criado em', key: 'createdDate', width: 12, value: pr => pr.createdDate ? new Date(pr.createdDate).toLocaleDateString('pt-BR') : '' },
  { header: 'Dias aberto', key: 'daysOpen', width: 12, value: pr => prPendingInfo(pr).daysOpen },
  { header: 'Aprovações', key: 'approvals', width: 12, value: pr => { const i = prPendingInfo(pr); return `${i.approvals}/${i.reviewers}`; } },
  { header: 'Falta votar', key: 'noVote', width: 40, value: pr => prPendingInfo(pr).noVote.join(', ') || '—' },
  { header: 'Arquivos', key: 'changedFiles', width: 10, value: pr => pr.changedFilesCount ?? '' },
  { header: 'Rejeitado por', key: 'rejected', width: 24, value: pr => prPendingInfo(pr).rejected.join(', ') || '—' },
  { header: 'Valida CR', key: 'validaCR', width: 10, value: pr => pr.hasValidaCRLabel ? 'Sim' : 'Não' },
  { header: 'Link', key: 'url', width: 20, value: pr => pr.url || '', isLink: true },
];

const PullRequestsDashboard: React.FC = () => {
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRepo, setFilterRepo] = useState<string>('all');
  const [filterAuthor, setFilterAuthor] = useState<string>('all');
  const [throughputGranularity, setThroughputGranularity] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly');
  const [lifetimeGroupMode, setLifetimeGroupMode] = useState<PeriodGroupMode>('monthly');
  const [hiddenReviewers, setHiddenReviewers] = useState<Set<string>>(new Set());
  const [engagementPeriod, setEngagementPeriod] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly');
  const [pendingPerson, setPendingPerson] = useState<string>('');
  const [exportingPending, setExportingPending] = useState(false);
  const [filesModal, setFilesModal] = useState<{ pr: PullRequest; files: { path: string; changeType: string }[] | null } | null>(null);

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

  // Todo mundo que aparece como autor OU revisor — o painel de pendências pergunta pelos dois papéis,
  // então a lista `authors` (só criadores) não serve aqui.
  const people = useMemo(() => {
    const set = new Set<string>();
    pullRequests.forEach(pr => {
      if (pr.createdBy) set.add(pr.createdBy);
      (pr.reviewers || []).forEach(r => { if (!r.isContainer && r.name) set.add(r.name); });
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [pullRequests]);

  // De propósito sobre `pullRequests` e não `filteredPRs`: pendência é pergunta de agora, e o PR
  // esquecido há mais de um ano (fora da janela padrão de 6 meses) é justamente o que importa achar.
  const pending = useMemo(() => splitPendingByPerson(pullRequests, pendingPerson), [pullRequests, pendingPerson]);

  const pendingSummary = useMemo(() => {
    const infos = pending.asAuthor.map(prPendingInfo);
    return {
      abertos: infos.length,
      acima30d: infos.filter(i => i.daysOpen > 30).length,
      semAprovacao: infos.filter(i => i.approvals === 0).length,
      comVotoNegativo: infos.filter(i => i.rejected.length > 0).length,
      semRevisor: infos.filter(i => i.reviewers === 0).length,
      maisAntigo: infos.reduce((max, i) => Math.max(max, i.daysOpen), 0),
    };
  }, [pending]);

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
      : null;

    // PRs without any reviewer
    const withoutReviewer = filteredPRs.filter(pr => !pr.reviewers || pr.reviewers.length === 0).length;

    // PRs pending > 3 days (active)
    const activePRs = filteredPRs.filter(pr => pr.status === 'active');
    const longPending = activePRs.filter(pr => {
      const ageDays = (new Date().getTime() - new Date(pr.createdDate).getTime()) / (1000 * 60 * 60 * 24);
      return ageDays > 3;
    }).length;

    // Average age of the currently active queue — shows the real bottleneck when there's nothing completed to measure
    const avgActiveAge = activePRs.length > 0
      ? Math.round((activePRs.reduce((sum, pr) => sum + (new Date().getTime() - new Date(pr.createdDate).getTime()) / (1000 * 60 * 60 * 24), 0) / activePRs.length) * 10) / 10
      : null;

    return { total, active, completed, abandoned, avgLifetime, withoutReviewer, longPending, avgActiveAge };
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
        if (r.isContainer) return;
        const rName = r.name || 'Desconhecido';
        if (!map[rName]) map[rName] = { total: 0, approved: 0, rejected: 0, noVote: 0 };
        map[rName].total++;
        if (r.vote >= 5) map[rName].approved++;
        else if (r.vote <= -5) map[rName].rejected++;
        else map[rName].noVote++;
      });
    });
    return Object.entries(map)
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [filteredPRs]);

  const visibleTopReviewers = useMemo(
    () => topReviewers.filter(r => !hiddenReviewers.has(r.name)),
    [topReviewers, hiddenReviewers]
  );

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

  // === TEAM CODE REVIEW ENGAGEMENT ===
  const engagementWindow = useMemo(() => {
    const days = engagementPeriod === 'weekly' ? 7 : engagementPeriod === 'biweekly' ? 14 : 30;
    const end = dateRange.end;
    const start = new Date(Math.max(addDays(end, -days).getTime(), dateRange.start.getTime()));
    return { start, end };
  }, [dateRange, engagementPeriod]);

  const teamEngagement = useMemo(() => {
    const map: Record<string, { team: string; approved: number; rejected: number; noVote: number; prs: Set<number>; reviewers: Set<string> }> = {};
    const prsInWindow = filteredPRs.filter(pr => isWithinInterval(new Date(pr.createdDate), engagementWindow));
    prsInWindow.forEach(pr => {
      (pr.reviewers || []).forEach(r => {
        if (r.isContainer || !r.team) return;
        if (!map[r.team]) map[r.team] = { team: r.team, approved: 0, rejected: 0, noVote: 0, prs: new Set(), reviewers: new Set() };
        const e = map[r.team];
        e.prs.add(pr.pullRequestId);
        e.reviewers.add(r.name);
        if (r.vote >= 5) e.approved++;
        else if (r.vote <= -5) e.rejected++;
        else e.noVote++;
      });
    });
    return Object.values(map)
      .map(e => ({ team: e.team, approved: e.approved, rejected: e.rejected, noVote: e.noVote, prsReviewed: e.prs.size, activeReviewers: e.reviewers.size }))
      .sort((a, b) => (b.approved + b.rejected + b.noVote) - (a.approved + a.rejected + a.noVote));
  }, [filteredPRs, engagementWindow]);

  // === LIFETIME TREND ===
  const lifetimeBuckets = useMemo(() => {
    try { return getPeriodBuckets(dateRange.start, dateRange.end, lifetimeGroupMode); } catch { return []; }
  }, [dateRange, lifetimeGroupMode]);

  const lifetimeTrend = useMemo(() =>
    lifetimeBuckets.map(({ label, start, end }) => {
      const prsInPeriod = filteredPRs.filter(pr => {
        const d = new Date(pr.createdDate);
        return pr.status === 'completed' && pr.lifetimeDays != null && isWithinInterval(d, { start, end });
      });
      const lifetimes = prsInPeriod.map(pr => pr.lifetimeDays as number);
      const avg = lifetimes.length > 0 ? Math.round((lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length) * 10) / 10 : null;
      const sorted = [...lifetimes].sort((a, b) => a - b);
      const p85Idx = Math.ceil(sorted.length * 0.85) - 1;
      const p85 = sorted.length > 0 ? sorted[Math.max(0, p85Idx)] : null;
      return { label, avg, p85, count: prsInPeriod.length };
    }),
    [filteredPRs, lifetimeBuckets]
  );

  // === THROUGHPUT: PRs ABERTOS VS TEMPO MÉDIO DE ATENDIMENTO ===
  const throughputTrend = useMemo(() => {
    const buildBucket = (start: Date, end: Date, label: string) => {
      const opened = filteredPRs.filter(pr => isWithinInterval(new Date(pr.createdDate), { start, end }));
      const closedInBucket = filteredPRs.filter(pr => pr.closedDate && isWithinInterval(new Date(pr.closedDate), { start, end }));
      const closed = closedInBucket.filter(pr => pr.status === 'completed');
      const abandoned = closedInBucket.filter(pr => pr.status === 'abandoned');
      const closedWithLifetime = closed.filter(pr => pr.lifetimeDays != null);
      const avgTimeToClose = closedWithLifetime.length > 0
        ? Math.round((closedWithLifetime.reduce((sum, pr) => sum + (pr.lifetimeDays as number), 0) / closedWithLifetime.length) * 10) / 10
        : null;
      return { label, start, end, opened: opened.length, closed: closed.length, abandoned: abandoned.length, avgTimeToClose };
    };
    try {
      let buckets: { start: Date; end: Date; label: string }[] = [];
      if (throughputGranularity === 'weekly') {
        buckets = eachWeekOfInterval({ start: dateRange.start, end: dateRange.end }, { weekStartsOn: 1 })
          .map(s => ({ start: s, end: endOfWeek(s, { weekStartsOn: 1 }), label: format(s, 'dd/MM') }));
      } else if (throughputGranularity === 'biweekly') {
        let cursor = new Date(dateRange.start);
        while (cursor < dateRange.end) {
          const end = addDays(cursor, 13) > dateRange.end ? dateRange.end : addDays(cursor, 13);
          buckets.push({ start: new Date(cursor), end, label: `${format(cursor, 'dd/MM')}-${format(end, 'dd/MM')}` });
          cursor = addDays(cursor, 14);
        }
      } else {
        buckets = eachMonthOfInterval({ start: dateRange.start, end: dateRange.end })
          .map(s => ({ start: s, end: endOfMonth(s), label: format(s, 'MMM/yy', { locale: ptBR }) }));
      }
      return buckets.map(b => buildBucket(b.start, b.end, b.label)).filter(b => b.opened > 0 || b.closed > 0 || b.abandoned > 0);
    } catch { return []; }
  }, [filteredPRs, dateRange, throughputGranularity]);

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
        const ageDays = Math.ceil((new Date().getTime() - new Date(pr.createdDate).getTime()) / (1000 * 60 * 60 * 24));
        return { ...pr, ageDays };
      })
      .sort((a, b) => b.ageDays - a.ageDays);
  }, [filteredPRs]);

  // === PR DETAIL MODAL STATE ===
  const [modalPRs, setModalPRs] = useState<PullRequest[] | null>(null);
  const [modalTitle, setModalTitle] = useState('');

  const openModal = useCallback((title: string, prs: PullRequest[]) => {
    setModalTitle(title);
    setModalPRs(prs);
  }, []);

  const handleExportXlsx = async () => {
    if (filteredPRs.length === 0) return;
    setExportingXlsx(true);
    try {
      await exportItemsXlsx(filteredPRs, PR_EXPORT_COLUMNS, `PullRequests_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    } finally {
      setExportingXlsx(false);
    }
  };

  const openFilesModal = async (pr: PullRequest) => {
    setFilesModal({ pr, files: null }); // null = carregando
    const files = await getPullRequestFiles(pr.pullRequestId);
    setFilesModal(cur => (cur?.pr.pullRequestId === pr.pullRequestId ? { pr, files } : cur));
  };

  const handleExportPending = async () => {
    if (!pendingPerson) return;
    setExportingPending(true);
    try {
      await exportSheetsXlsx([
        { name: 'PRs abertos (autor)', items: pending.asAuthor, columns: PR_PENDING_COLUMNS },
        { name: 'Aguardando revisão dele', items: pending.asReviewer, columns: PR_PENDING_COLUMNS },
      ], `PRs_pendentes_${pendingPerson.replace(/[^\w]+/g, '_')}.xlsx`);
    } finally {
      setExportingPending(false);
    }
  };

  // === SUMMARY CARDS CLICK ===
  const handleSummaryCardClick = useCallback((kind: string) => {
    let prs: PullRequest[] = [];
    let title = '';
    switch (kind) {
      case 'total':
        prs = filteredPRs;
        title = `Todos os PRs (${prs.length})`;
        break;
      case 'active':
        prs = filteredPRs.filter(pr => pr.status === 'active');
        title = `PRs Ativos (${prs.length})`;
        break;
      case 'completed':
        prs = filteredPRs.filter(pr => pr.status === 'completed');
        title = `PRs Concluídos (${prs.length})`;
        break;
      case 'abandoned':
        prs = filteredPRs.filter(pr => pr.status === 'abandoned');
        title = `PRs Abandonados (${prs.length})`;
        break;
      case 'avgLifetime':
        prs = filteredPRs.filter(pr => pr.status === 'completed' && pr.lifetimeDays != null);
        title = `PRs concluídos usados no cálculo do tempo médio (${prs.length})`;
        break;
      case 'withoutReviewer':
        prs = filteredPRs.filter(pr => !pr.reviewers || pr.reviewers.length === 0);
        title = `PRs sem reviewer (${prs.length})`;
        break;
      case 'longPending':
        prs = filteredPRs.filter(pr => {
          if (pr.status !== 'active') return false;
          const ageDays = (new Date().getTime() - new Date(pr.createdDate).getTime()) / (1000 * 60 * 60 * 24);
          return ageDays > 3;
        });
        title = `PRs ativos pendentes há mais de 3 dias (${prs.length})`;
        break;
      case 'avgActiveAge':
        prs = filteredPRs.filter(pr => pr.status === 'active');
        title = `PRs ativos usados no cálculo da idade média (${prs.length})`;
        break;
      default:
        return;
    }
    openModal(title, prs);
  }, [filteredPRs, openModal]);

  // Click handlers for charts
  const handleStatusPieClick = useCallback((data: any) => {
    if (!data || !data.name) return;
    const statusMap: Record<string, string> = { 'Ativos': 'active', 'Concluídos': 'completed', 'Abandonados': 'abandoned' };
    const status = statusMap[data.name];
    if (!status) return;
    const prs = filteredPRs.filter(pr => pr.status === status);
    openModal(`PRs ${data.name} (${prs.length})`, prs);
  }, [filteredPRs, openModal]);

  const handleVotePieClick = useCallback((data: any) => {
    if (!data || data.vote === undefined) return;
    const vote = data.vote;
    const prs = filteredPRs.filter(pr => (pr.reviewers || []).some(r => r.vote === vote));
    openModal(`PRs com voto "${data.name}" (${prs.length})`, prs);
  }, [filteredPRs, openModal]);

  const handleRepoBarClick = useCallback((data: any) => {
    if (!data || !data.activePayload || !data.activePayload[0]) return;
    const repo = data.activePayload[0].payload.repo;
    if (!repo) return;
    const prs = filteredPRs.filter(pr => pr.repositoryName === repo);
    openModal(`PRs em ${repo} (${prs.length})`, prs);
  }, [filteredPRs, openModal]);

  const handleAuthorBarClick = useCallback((data: any) => {
    if (!data || !data.activePayload || !data.activePayload[0]) return;
    const name = data.activePayload[0].payload.name;
    if (!name) return;
    const prs = filteredPRs.filter(pr => pr.createdBy === name);
    openModal(`PRs de ${name} (${prs.length})`, prs);
  }, [filteredPRs, openModal]);

  const handleReviewerBarClick = useCallback((data: any) => {
    if (!data || !data.activePayload || !data.activePayload[0]) return;
    const name = data.activePayload[0].payload.name;
    if (!name) return;
    const prs = filteredPRs.filter(pr => (pr.reviewers || []).some(r => (r.name || 'Desconhecido') === name));
    openModal(`PRs revisados por ${name} (${prs.length})`, prs);
  }, [filteredPRs, openModal]);

  const toggleReviewerVisibility = useCallback((name: string) => {
    setHiddenReviewers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  const handleTeamEngagementClick = useCallback((data: any) => {
    if (!data || !data.activePayload || !data.activePayload[0]) return;
    const team = data.activePayload[0].payload.team;
    if (!team) return;
    const prs = filteredPRs.filter(pr => isWithinInterval(new Date(pr.createdDate), engagementWindow) && (pr.reviewers || []).some(r => !r.isContainer && r.team === team));
    openModal(`PRs revisados por alguém do time ${team} (${prs.length})`, prs);
  }, [filteredPRs, engagementWindow, openModal]);

  const handleLifetimeClick = useCallback((data: any) => {
    if (!data || !data.activeLabel) return;
    const label = data.activeLabel;
    const bucket = lifetimeBuckets.find(b => b.label === label);
    if (!bucket) return;
    const prs = filteredPRs.filter(pr => {
      const d = new Date(pr.createdDate);
      return pr.status === 'completed' && isWithinInterval(d, { start: bucket.start, end: bucket.end });
    });
    openModal(`PRs concluídos em ${label} (${prs.length})`, prs);
  }, [filteredPRs, lifetimeBuckets, openModal]);

  const handleThroughputClick = useCallback((data: any) => {
    if (!data || !data.activeLabel) return;
    const bucket = throughputTrend.find(b => b.label === data.activeLabel);
    if (!bucket) return;
    const prs = filteredPRs.filter(pr => isWithinInterval(new Date(pr.createdDate), { start: bucket.start, end: bucket.end }));
    openModal(`PRs abertos em ${bucket.label} (${prs.length})`, prs);
  }, [filteredPRs, throughputTrend, openModal]);

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
              title="Selecione o mês"
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
              <option value="">Selecione o mês...</option>
              {lastMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          )}

          {periodType === 'custom' && (
            <div className="flex gap-2 items-end">
              <div>
                <label htmlFor="pr-custom-start" className="block text-ds-text text-sm mb-1">De:</label>
                <input id="pr-custom-start" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                  className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2" />
              </div>
              <div>
                <label htmlFor="pr-custom-end" className="block text-ds-text text-sm mb-1">Até:</label>
                <input id="pr-custom-end" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                  className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2" />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="pr-filter-status" className="block text-ds-text text-sm mb-1">Status:</label>
            <select id="pr-filter-status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 w-full">
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="completed">Concluídos</option>
              <option value="abandoned">Abandonados</option>
            </select>
          </div>
          <div>
            <label htmlFor="pr-filter-repo" className="block text-ds-text text-sm mb-1">Repositório:</label>
            <select id="pr-filter-repo" value={filterRepo} onChange={e => setFilterRepo(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 w-full">
              <option value="all">Todos</option>
              {repos.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pr-filter-author" className="block text-ds-text text-sm mb-1">Autor:</label>
            <select id="pr-filter-author" value={filterAuthor} onChange={e => setFilterAuthor(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 w-full">
              <option value="all">Todos</option>
              {authors.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={handleSync} disabled={syncing}
              className="bg-ds-green/10 text-ds-green font-semibold py-2 px-4 rounded-md hover:bg-ds-green/20 transition-colors text-sm flex-1 disabled:opacity-50">
              {syncing ? '🔄 Sincronizando...' : '🔄 Sincronizar PRs'}
            </button>
            <button
              onClick={handleExportXlsx}
              disabled={exportingXlsx || filteredPRs.length === 0}
              className="bg-ds-green/10 text-ds-green font-semibold py-2 px-3 rounded-md hover:bg-ds-green/20 transition-colors text-sm disabled:opacity-50"
              title="Exporta os PRs filtrados para .xlsx"
            >
              {exportingXlsx ? '…' : `📥 .xlsx (${filteredPRs.length})`}
            </button>
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {[
          { label: 'Total PRs', value: metrics.total, color: 'text-ds-light-text', kind: 'total' },
          { label: 'Ativos', value: metrics.active, color: 'text-blue-400', kind: 'active' },
          { label: 'Concluídos', value: metrics.completed, color: 'text-ds-green', kind: 'completed' },
          { label: 'Abandonados', value: metrics.abandoned, color: 'text-red-400', kind: 'abandoned' },
          { label: 'Tempo Médio (dias)', value: metrics.avgLifetime ?? '—', color: 'text-yellow-400', kind: 'avgLifetime' },
          { label: 'Sem Reviewer', value: metrics.withoutReviewer, color: metrics.withoutReviewer > 0 ? 'text-orange-400' : 'text-ds-green', kind: 'withoutReviewer' },
          { label: 'Pendentes >3d', value: metrics.longPending, color: metrics.longPending > 0 ? 'text-red-400' : 'text-ds-green', kind: 'longPending' },
          { label: 'Idade Média (Ativos)', value: metrics.avgActiveAge != null ? `${metrics.avgActiveAge}d` : '—', color: 'text-purple-400', kind: 'avgActiveAge' },
        ].map(card => (
          <div
            key={card.label}
            className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center cursor-pointer hover:border-ds-green transition-colors"
            onClick={() => handleSummaryCardClick(card.kind)}
            title="Clique para ver os PRs"
          >
            <p className="text-ds-text text-xs">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* PENDÊNCIAS POR PESSOA */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h3 className="text-ds-light-text font-bold text-lg">🧑‍💻 PRs pendentes por pessoa</h3>
            <p className="text-ds-text text-xs mt-1">
              Tudo que está <strong className="text-ds-light-text">em aberto agora</strong>, independente do filtro de
              período da tela — é o PR esquecido há meses que mais interessa aqui.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="pr-pending-person" className="block text-ds-text text-sm mb-1">Pessoa:</label>
              <select
                id="pr-pending-person"
                value={pendingPerson}
                onChange={e => setPendingPerson(e.target.value)}
                className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 min-w-[220px]"
              >
                <option value="">Selecione...</option>
                {people.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <button
              onClick={handleExportPending}
              disabled={!pendingPerson || exportingPending || (pending.asAuthor.length + pending.asReviewer.length) === 0}
              className="bg-ds-green/10 text-ds-green font-semibold py-2 px-3 rounded-md hover:bg-ds-green/20 transition-colors text-sm disabled:opacity-50"
              title="Exporta as duas listas em um .xlsx (uma aba para cada)"
            >
              {exportingPending ? '…' : `📥 .xlsx (${pending.asAuthor.length + pending.asReviewer.length})`}
            </button>
          </div>
        </div>

        {!pendingPerson ? (
          <p className="text-ds-text text-sm py-6 text-center">
            Escolha uma pessoa para ver os PRs que ela deixou em aberto e os que estão parados esperando o voto dela.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3 pb-3 border-b border-ds-border">
              <span className="text-ds-light-text"><strong>{pendingSummary.abertos}</strong> abertos</span>
              <span className={pendingSummary.acima30d > 0 ? 'text-red-400' : 'text-ds-text'}><strong>{pendingSummary.acima30d}</strong> acima de 30d</span>
              <span className={pendingSummary.semAprovacao > 0 ? 'text-yellow-400' : 'text-ds-text'}><strong>{pendingSummary.semAprovacao}</strong> sem nenhuma aprovação</span>
              <span className={pendingSummary.comVotoNegativo > 0 ? 'text-orange-400' : 'text-ds-text'}><strong>{pendingSummary.comVotoNegativo}</strong> com voto negativo</span>
              <span className={pendingSummary.semRevisor > 0 ? 'text-orange-400' : 'text-ds-text'}><strong>{pendingSummary.semRevisor}</strong> sem revisor atribuído</span>
              {pendingSummary.maisAntigo > 0 && <span className="text-ds-text">mais antigo: <strong>{pendingSummary.maisAntigo}d</strong></span>}
            </div>

            {([
              { titulo: `PRs abertos criados por ${pendingPerson}`, lista: pending.asAuthor, vazio: 'Nenhum PR aberto criado por essa pessoa.', mostrarAutor: false },
              { titulo: 'Aguardando o voto dela', lista: pending.asReviewer, vazio: 'Nenhum PR de outra pessoa esperando a revisão dela.', mostrarAutor: true },
            ]).map(secao => (
              <div key={secao.titulo} className="mb-4 last:mb-0">
                <p className="text-ds-light-text text-sm font-semibold mb-2">{secao.titulo} <span className="text-ds-text font-normal">({secao.lista.length})</span></p>
                {secao.lista.length === 0 ? (
                  <p className="text-ds-text text-xs py-3">{secao.vazio}</p>
                ) : (
                  <div className="overflow-auto max-h-[420px]">
                    <table className="w-full text-sm text-left text-ds-text">
                      <thead className="text-xs text-ds-light-text uppercase bg-ds-dark-blue/50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2">PR</th>
                          <th className="px-3 py-2">Título</th>
                          {secao.mostrarAutor && <th className="px-3 py-2">Autor</th>}
                          <th className="px-3 py-2">Repositório</th>
                          <th className="px-3 py-2">Aberto há</th>
                          <th className="px-3 py-2">Arquivos</th>
                          <th className="px-3 py-2">Aprovações</th>
                          <th className="px-3 py-2">Falta votar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {secao.lista.map(pr => {
                          const i = prPendingInfo(pr);
                          return (
                            <tr key={pr.pullRequestId} className="border-b border-ds-border/50 hover:bg-ds-muted/10">
                              <td className="px-3 py-2">
                                <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-ds-green hover:underline font-mono">
                                  #{pr.pullRequestId}
                                </a>
                              </td>
                              <td className="px-3 py-2 max-w-[380px]">
                                <p className="truncate text-ds-light-text" title={pr.title}>{pr.title}</p>
                                {pr.sourceRefName && pr.targetRefName && (
                                  <p className="text-xs text-ds-text/60 truncate">{branch(pr.sourceRefName)} → {branch(pr.targetRefName)}</p>
                                )}
                              </td>
                              {secao.mostrarAutor && <td className="px-3 py-2 whitespace-nowrap text-xs">{pr.createdBy}</td>}
                              <td className="px-3 py-2 whitespace-nowrap text-xs">{pr.repositoryName}</td>
                              <td className="px-3 py-2">
                                <span className={`font-semibold ${i.daysOpen > 30 ? 'text-red-400' : i.daysOpen > 7 ? 'text-yellow-400' : 'text-ds-green'}`}>
                                  {i.daysOpen}d
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {pr.changedFilesCount == null ? (
                                  <span className="text-ds-text/50" title="Ainda não sincronizado">—</span>
                                ) : (
                                  <button
                                    onClick={() => openFilesModal(pr)}
                                    className={`font-semibold hover:underline ${filesColor(pr.changedFilesCount)}`}
                                    title="Ver os arquivos alterados"
                                  >
                                    {pr.changedFilesCount}
                                  </button>
                                )}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className={i.approvals === 0 ? 'text-yellow-400' : 'text-ds-green'}>{i.approvals}/{i.reviewers}</span>
                                {i.rejected.length > 0 && (
                                  <span className="text-red-400 text-xs ml-1" title={`Voto negativo: ${i.rejected.join(', ')}`}>⛔</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs max-w-[260px]">
                                <p className="truncate" title={i.noVote.join(', ')}>
                                  {i.reviewers === 0 ? <span className="text-orange-400">sem revisor atribuído</span> : (i.noVote.join(', ') || '—')}
                                </p>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
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
          <ChartInfoLamp info="Distribuição dos PRs entre Ativos, Concluídos e Abandonados no período selecionado. Clique em uma fatia para ver os PRs." />
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={statusPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} onClick={handleStatusPieClick} className="cursor-pointer">
                {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Vote Distribution */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-semibold mb-4">Distribuição de Votos</h3>
          <ChartInfoLamp info="Distribuição dos votos nos PRs: Aprovado, Sem Voto, Aguardando Autor, Rejeitado. Clique em uma fatia para ver os PRs." />
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={voteDistribution} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} onClick={handleVotePieClick} className="cursor-pointer">
                {voteDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* PRs BY REPO */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-semibold mb-4">Pull Requests por Repositório</h3>
          <ChartInfoLamp info="Quantidade de PRs por repositório. Clique em uma barra para ver os PRs do repositório." />
          <ResponsiveContainer width="100%" height={Math.max(300, prsByRepo.length * 35)}>
            <BarChart data={prsByRepo} layout="vertical" margin={{ left: 120 }} onClick={handleRepoBarClick} className="cursor-pointer">
            <CartesianGrid strokeDasharray="3 3" stroke="#233554" />
            <XAxis type="number" tick={{ fill: '#8892B0', fontSize: 12 }} />
            <YAxis type="category" dataKey="repo" tick={{ fill: '#CCD6F6', fontSize: 11 }} width={120} />
            <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
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
          <ChartInfoLamp info="Ranking dos desenvolvedores que mais criaram PRs. Clique em uma barra para ver os PRs do autor." />
          <ResponsiveContainer width="100%" height={Math.max(300, topAuthors.length * 30)}>
            <BarChart data={topAuthors} layout="vertical" margin={{ left: 100, right: 50 }} onClick={handleAuthorBarClick} className="cursor-pointer">
              <CartesianGrid strokeDasharray="3 3" stroke="#233554" />
              <XAxis type="number" tick={{ fill: '#8892B0', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#CCD6F6', fontSize: 11 }} width={100} />
              <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
              <Bar dataKey="count" name="PRs" fill="#64FFDA" label={{ position: 'right', fill: '#CCD6F6', fontSize: 11, fontWeight: 'bold' }}>
                {topAuthors.map((_, i) => <Cell key={i} fill={CHART_COLORS.palette[i % CHART_COLORS.palette.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Reviewers */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-semibold mb-4">Top Reviewers</h3>
          <ChartInfoLamp info="Ranking dos revisores mais ativos. Clique em uma barra para ver os PRs revisados por essa pessoa. Use as caixinhas abaixo pra mostrar/esconder pessoas só neste gráfico." />
          {topReviewers.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <button onClick={() => setHiddenReviewers(new Set())} className="text-xs text-ds-green hover:underline">Marcar todos</button>
                <span className="text-ds-text/30 text-xs">|</span>
                <button onClick={() => setHiddenReviewers(new Set(topReviewers.map(r => r.name)))} className="text-xs text-ds-text hover:underline">Desmarcar todos</button>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 max-h-24 overflow-y-auto">
                {topReviewers.map(r => (
                  <label key={r.name} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!hiddenReviewers.has(r.name)}
                      onChange={() => toggleReviewerVisibility(r.name)}
                      className="w-3.5 h-3.5 accent-ds-green"
                    />
                    <span className="text-xs text-ds-text">{r.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <ResponsiveContainer width="100%" height={Math.max(300, visibleTopReviewers.length * 30)}>
            <BarChart data={visibleTopReviewers} layout="vertical" margin={{ left: 100 }} onClick={handleReviewerBarClick} className="cursor-pointer">
              <CartesianGrid strokeDasharray="3 3" stroke="#233554" />
              <XAxis type="number" tick={{ fill: '#8892B0', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#CCD6F6', fontSize: 11 }} width={100} />
              <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
              <Legend />
              <Bar dataKey="approved" name="Aprovados" stackId="a" fill="#64FFDA" />
              <Bar dataKey="noVote" name="Sem Voto" stackId="a" fill="#8892B0" />
              <Bar dataKey="rejected" name="Rejeitados" stackId="a" fill="#FF5555" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TEAM CODE REVIEW ENGAGEMENT */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-semibold mb-4">Engajamento em Code Review por Time</h3>
        <ChartInfoLamp info="Revisões feitas por pessoas de cada time nos últimos 7/14/30 dias (baseado em quem essa pessoa mais revisa como desenvolvedora nos work items). Revisores sem time conhecido (ex: QA que só revisa) não entram aqui. Clique numa barra para ver os PRs." />
        <div className="flex items-center gap-2 mb-4">
          {[
            { value: 'weekly' as const, label: 'Semanal' },
            { value: 'biweekly' as const, label: 'Quinzenal' },
            { value: 'monthly' as const, label: 'Mensal' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setEngagementPeriod(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${engagementPeriod === opt.value ? 'bg-ds-green text-ds-dark-blue' : 'bg-ds-muted/20 text-ds-text hover:bg-ds-muted/40'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={Math.max(220, teamEngagement.length * 40)}>
          <BarChart data={teamEngagement} layout="vertical" margin={{ left: 100 }} onClick={handleTeamEngagementClick} className="cursor-pointer">
            <CartesianGrid strokeDasharray="3 3" stroke="#233554" />
            <XAxis type="number" tick={{ fill: '#8892B0', fontSize: 12 }} />
            <YAxis type="category" dataKey="team" tick={{ fill: '#CCD6F6', fontSize: 11 }} width={100} />
            <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
            <Legend />
            <Bar dataKey="approved" name="Aprovados" stackId="a" fill="#64FFDA" />
            <Bar dataKey="noVote" name="Sem Voto" stackId="a" fill="#8892B0" />
            <Bar dataKey="rejected" name="Rejeitados" stackId="a" fill="#FF5555" />
          </BarChart>
        </ResponsiveContainer>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm text-left text-ds-text">
            <thead className="text-xs text-ds-light-text uppercase bg-ds-navy/50">
              <tr><th className="px-4 py-2">Time</th><th className="px-4 py-2">Pessoas ativas</th><th className="px-4 py-2">PRs revisados</th></tr>
            </thead>
            <tbody>
              {teamEngagement.map(t => (
                <tr key={t.team} className="border-b border-ds-border">
                  <td className="px-4 py-2">{t.team}</td>
                  <td className="px-4 py-2">{t.activeReviewers}</td>
                  <td className="px-4 py-2">{t.prsReviewed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* LIFETIME TREND */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-ds-light-text font-semibold">Tendência de Tempo de Vida dos PRs (dias)</h3>
          <div className="flex gap-1">
            {PERIOD_GROUP_MODE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setLifetimeGroupMode(opt.value)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${lifetimeGroupMode === opt.value ? 'bg-ds-green text-ds-dark-blue' : 'bg-ds-muted/20 text-ds-text hover:bg-ds-muted/40'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
          <ChartInfoLamp info="Evolução do tempo de vida dos PRs concluídos, por período. Clique em um ponto para ver os PRs do período." />
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={lifetimeTrend} onClick={handleLifetimeClick} className="cursor-pointer">
            <CartesianGrid strokeDasharray="3 3" stroke="#233554" />
            <XAxis dataKey="label" tick={{ fill: '#8892B0', fontSize: 12 }} />
            <YAxis tick={{ fill: '#8892B0', fontSize: 12 }} />
            <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
            <Legend />
            <Line type="monotone" dataKey="avg" name="Média (dias)" stroke="#64FFDA" strokeWidth={2} dot={{ r: 4 }} connectNulls />
            <Line type="monotone" dataKey="p85" name="P85 (dias)" stroke="#FFB86C" strokeWidth={2} dot={{ r: 4 }} connectNulls strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* THROUGHPUT: OPENED VS TIME TO CLOSE */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-semibold mb-4">PRs Abertos vs Tempo Médio de Atendimento</h3>
        <ChartInfoLamp info="Quantidade de PRs abertos, concluídos e abandonados por período (barras) comparada ao tempo médio real entre abertura e conclusão dos PRs finalizados no mesmo período (linha). Clique numa barra para ver os PRs abertos naquele período." />
        <div className="flex items-center gap-2 mb-4">
          {[
            { value: 'weekly' as const, label: 'Semanal' },
            { value: 'biweekly' as const, label: 'Quinzenal' },
            { value: 'monthly' as const, label: 'Mensal' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setThroughputGranularity(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${throughputGranularity === opt.value ? 'bg-ds-green text-ds-dark-blue' : 'bg-ds-muted/20 text-ds-text hover:bg-ds-muted/40'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={throughputTrend} onClick={handleThroughputClick} className="cursor-pointer">
            <CartesianGrid strokeDasharray="3 3" stroke="#233554" />
            <XAxis dataKey="label" tick={{ fill: '#8892B0', fontSize: 11 }} angle={throughputGranularity !== 'monthly' ? -45 : 0} textAnchor={throughputGranularity !== 'monthly' ? 'end' : 'middle'} height={throughputGranularity !== 'monthly' ? 60 : 30} />
            <YAxis yAxisId="left" tick={{ fill: '#8892B0', fontSize: 12 }} label={{ value: 'PRs abertos', angle: -90, position: 'insideLeft', style: { fill: '#8892B0', fontSize: 11 } }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#A78BFA', fontSize: 12 }} label={{ value: 'Dias até fechar', angle: -90, position: 'insideRight', style: { fill: '#A78BFA', fontSize: 11 } }} />
            <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
            <Legend />
            <Bar yAxisId="left" dataKey="opened" name="Abertos" fill={STATUS_COLORS.active} radius={[3, 3, 0, 0]} />
            <Bar yAxisId="left" dataKey="closed" name="Concluídos" fill={STATUS_COLORS.completed} radius={[3, 3, 0, 0]} />
            <Bar yAxisId="left" dataKey="abandoned" name="Abandonados" fill={STATUS_COLORS.abandoned} radius={[3, 3, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="avgTimeToClose" name="Tempo médio até fechar (dias)" stroke="#A78BFA" strokeWidth={2} dot={{ r: 4 }} connectNulls />
          </ComposedChart>
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
                            {(r.name || 'N/A').split(' ')[0]}: {VOTE_LABELS[r.vote] || 'N/A'}
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

      {/* ARQUIVOS DE UMA PR */}
      {filesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setFilesModal(null)}>
          <div className="bg-ds-navy border border-ds-border rounded-xl w-[90vw] max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-ds-border shrink-0">
              <div className="min-w-0">
                <h2 className="text-ds-light-text font-bold text-lg truncate">📄 Arquivos alterados — PR #{filesModal.pr.pullRequestId}</h2>
                <p className="text-ds-text text-xs truncate" title={filesModal.pr.title}>{filesModal.pr.title}</p>
              </div>
              <button onClick={() => setFilesModal(null)} className="text-ds-text hover:text-red-400 transition-colors text-xl font-bold ml-3">✕</button>
            </div>
            <div className="overflow-auto flex-1 p-4">
              {filesModal.files === null ? (
                <p className="text-ds-text text-center py-8">Carregando...</p>
              ) : filesModal.files.length === 0 ? (
                <p className="text-ds-text text-center py-8">Nenhum arquivo registrado para esta PR.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3 pb-3 border-b border-ds-border">
                    <span className="text-ds-light-text"><strong>{filesModal.files.length}</strong> arquivos</span>
                    {Object.entries(filesModal.files.reduce((acc, f) => {
                      acc[f.changeType] = (acc[f.changeType] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).map(([tipo, n]) => (
                      <span key={tipo} className="text-ds-text">{n} {tipo}</span>
                    ))}
                  </div>
                  {/* Agrupado pela primeira pasta: numa PR de 494 arquivos, a lista crua não diz nada */}
                  {Object.entries(filesModal.files.reduce((acc, f) => {
                    const pasta = f.path.split('/').filter(Boolean)[0] || '/';
                    (acc[pasta] = acc[pasta] || []).push(f);
                    return acc;
                  }, {} as Record<string, { path: string; changeType: string }[]>))
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([pasta, arquivos]) => (
                      <details key={pasta} className="mb-2" open={arquivos.length <= 20}>
                        <summary className="cursor-pointer text-ds-light-text text-sm py-1 hover:text-ds-green">
                          📁 {pasta} <span className="text-ds-text">({arquivos.length})</span>
                        </summary>
                        <ul className="pl-5 py-1 space-y-0.5">
                          {arquivos.map(f => (
                            <li key={f.path} className="text-xs text-ds-text flex gap-2">
                              <span className={f.changeType === 'add' ? 'text-ds-green' : f.changeType.includes('delete') ? 'text-red-400' : 'text-ds-text/60'}>
                                {f.changeType === 'add' ? '+' : f.changeType.includes('delete') ? '−' : '~'}
                              </span>
                              <span className="truncate font-mono" title={f.path}>{f.path}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                </>
              )}
            </div>
            <div className="px-6 py-3 border-t border-ds-border shrink-0">
              <a href={filesModal.pr.url} target="_blank" rel="noopener noreferrer" className="text-ds-green hover:underline text-sm">
                Abrir a PR no Azure DevOps ↗
              </a>
            </div>
          </div>
        </div>
      )}

      {/* PR DETAIL MODAL */}
      {modalPRs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModalPRs(null)}>
          <div className="bg-ds-navy border border-ds-border rounded-xl w-[90vw] max-w-5xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-ds-border shrink-0">
              <h2 className="text-ds-light-text font-bold text-lg">📋 {modalTitle}</h2>
              <button onClick={() => setModalPRs(null)} className="text-ds-text hover:text-red-400 transition-colors text-xl font-bold">✕</button>
            </div>
            {/* Modal body */}
            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-sm text-left text-ds-text">
                <thead className="text-xs text-ds-light-text uppercase bg-ds-dark-blue/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Título</th>
                    <th className="px-3 py-2">Autor</th>
                    <th className="px-3 py-2">Repositório</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Criado em</th>
                    <th className="px-3 py-2">Tempo (dias)</th>
                    <th className="px-3 py-2">Reviewers</th>
                  </tr>
                </thead>
                <tbody>
                  {modalPRs.map(pr => {
                    const lifetime = pr.lifetimeDays ?? Math.ceil((new Date().getTime() - new Date(pr.createdDate).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={pr.pullRequestId} className="border-b border-ds-border/50 hover:bg-ds-muted/10">
                        <td className="px-3 py-2">
                          <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-ds-green hover:underline font-mono">
                            #{pr.pullRequestId}
                          </a>
                        </td>
                        <td className="px-3 py-2 max-w-[300px]">
                          <p className="truncate text-ds-light-text" title={pr.title}>{pr.title}</p>
                          {pr.sourceRefName && pr.targetRefName && (
                            <p className="text-xs text-ds-text/60 truncate">{pr.sourceRefName.replace('refs/heads/', '')} → {pr.targetRefName.replace('refs/heads/', '')}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{pr.createdBy}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">{pr.repositoryName}</td>
                        <td className="px-3 py-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                            backgroundColor: `${STATUS_COLORS[pr.status] || '#8892B0'}20`,
                            color: STATUS_COLORS[pr.status] || '#8892B0'
                          }}>
                            {pr.status === 'active' ? 'Ativo' : pr.status === 'completed' ? 'Concluído' : 'Abandonado'}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">{format(new Date(pr.createdDate), 'dd/MM/yyyy')}</td>
                        <td className="px-3 py-2">
                          <span className={`font-semibold ${lifetime > 7 ? 'text-red-400' : lifetime > 3 ? 'text-yellow-400' : 'text-ds-green'}`}>
                            {lifetime}d
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {(pr.reviewers || []).slice(0, 3).map((r, i) => (
                              <span key={i} className="text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{
                                backgroundColor: `${VOTE_COLORS[r.vote] || '#8892B0'}20`,
                                color: VOTE_COLORS[r.vote] || '#8892B0'
                              }}>
                                {(r.name || 'N/A').split(' ')[0]}
                              </span>
                            ))}
                            {(pr.reviewers || []).length > 3 && (
                              <span className="text-xs text-ds-text">+{pr.reviewers.length - 3}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {modalPRs.length === 0 && (
                <p className="text-center text-ds-text py-8">Nenhum PR encontrado para este filtro.</p>
              )}
            </div>
            {/* Modal footer */}
            <div className="px-6 py-3 border-t border-ds-border text-xs text-ds-text shrink-0">
              {modalPRs.length} PR(s) · Clique no ID para abrir no Azure DevOps
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PullRequestsDashboard;
