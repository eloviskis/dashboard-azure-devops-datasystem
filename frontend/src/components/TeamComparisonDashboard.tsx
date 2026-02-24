import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Cell, LabelList
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, eachMonthOfInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { WorkItem } from '../types';
import ChartInfoLamp from './ChartInfoLamp';
import { useAuth } from '../contexts/AuthContext';

// ─── tipos ───────────────────────────────────────────────────────────────────
type Seniority = 'Estagiário' | 'Júnior' | 'Pleno' | 'Sênior' | 'Tech Lead' | 'Gestor';
type Role = 'DEV' | 'QA' | 'P.O.' | 'Outros';

interface MemberConfig {
  name: string;
  seniority: Seniority;
  role: Role;
  active: boolean;
  color?: string;
}

interface SeniorityConfigMap {
  [name: string]: Seniority;
}

interface RoleConfigMap {
  [name: string]: Role;
}

interface ActiveConfigMap {
  [name: string]: boolean;
}

// ─── constantes ──────────────────────────────────────────────────────────────
const SENIORITY_OPTIONS: Seniority[] = ['Estagiário', 'Júnior', 'Pleno', 'Sênior', 'Tech Lead', 'Gestor'];
const ROLE_OPTIONS: Role[] = ['DEV', 'QA', 'P.O.', 'Outros'];

const SENIORITY_COLORS: Record<Seniority, string> = {
  'Estagiário': '#a0aec0',
  'Júnior':     '#63b3ed',
  'Pleno':      '#68d391',
  'Sênior':     '#f6ad55',
  'Tech Lead':  '#fc8181',
  'Gestor':     '#b794f4',
};

const SENIORITY_BG: Record<Seniority, string> = {
  'Estagiário': 'bg-gray-500/20 text-gray-300 border-gray-500/40',
  'Júnior':     'bg-blue-500/20 text-blue-300 border-blue-500/40',
  'Pleno':      'bg-green-500/20 text-green-300 border-green-500/40',
  'Sênior':     'bg-orange-500/20 text-orange-300 border-orange-500/40',
  'Tech Lead':  'bg-red-500/20 text-red-300 border-red-500/40',
  'Gestor':     'bg-purple-500/20 text-purple-300 border-purple-500/40',
};

const PERSON_PALETTE = [
  '#64FFDA','#47C5FB','#F6E05E','#F56565','#B794F4','#FBB6CE',
  '#ED8936','#DD6B20','#38B2AC','#4299E1','#9F7AEA','#FC8181',
];

const COMPLETED_STATES = ['Done','Concluído','Closed','Fechado','Finished','Resolved','Pronto'];

const STORAGE_KEY = 'tc_seniority_config_v2';
const SETTINGS_KEY = 'seniority_config';
const ROLE_KEY = 'tc_role_config_v1';
const ACTIVE_KEY = 'tc_active_config_v1';
const ROLE_SETTINGS_KEY = 'role_config';
const ACTIVE_SETTINGS_KEY = 'active_config';

// ─── helpers ─────────────────────────────────────────────────────────────────
const loadLocalConfig = (): SeniorityConfigMap => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
};
const saveLocalConfig = (cfg: SeniorityConfigMap) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
};

const loadRoleConfig = (): RoleConfigMap => {
  try { return JSON.parse(localStorage.getItem(ROLE_KEY) || '{}'); } catch { return {}; }
};
const saveRoleConfig = (cfg: RoleConfigMap) => localStorage.setItem(ROLE_KEY, JSON.stringify(cfg));

const loadActiveConfig = (): ActiveConfigMap => {
  try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}'); } catch { return {}; }
};
const saveActiveConfig = (cfg: ActiveConfigMap) => localStorage.setItem(ACTIVE_KEY, JSON.stringify(cfg));

const abbrev = (name: string) =>
  name.split(' ').filter(Boolean).map(p => p[0]).join('').toUpperCase().slice(0, 2);

const fmtCT = (v: number | null | undefined) =>
  v != null && v > 0 ? `${v.toFixed(1)}d` : '—';

// ─── Tooltip customizado ────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ds-navy border border-ds-border rounded-lg px-3 py-2 text-xs shadow-xl min-w-35">
      <p className="text-ds-green font-bold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold text-white">{p.value}</span></p>
      ))}
    </div>
  );
};

// ─── Modal de configuração de senioridade ───────────────────────────────────
interface ConfigModalProps {
  members: string[];
  config: SeniorityConfigMap;
  roleConfig: RoleConfigMap;
  onSave: (cfg: SeniorityConfigMap, roleCfg: RoleConfigMap) => void;
  onClose: () => void;
}

const ROLE_COLORS: Record<Role, string> = {
  'DEV':    '#47C5FB',
  'QA':     '#68d391',
  'P.O.':   '#f6ad55',
  'Outros': '#a0aec0',
};

const ConfigModal: React.FC<ConfigModalProps> = ({ members, config, roleConfig, onSave, onClose }) => {
  const [local, setLocal] = useState<SeniorityConfigMap>({ ...config });
  const [localRole, setLocalRole] = useState<RoleConfigMap>({ ...roleConfig });

  const handleChange = (name: string, value: Seniority) => {
    setLocal(prev => ({ ...prev, [name]: value }));
  };

  const handleRoleChange = (name: string, value: Role) => {
    setLocalRole(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = () => { onSave(local, localRole); onClose(); };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-ds-navy border border-ds-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-ds-border">
          <div>
            <h2 className="text-white font-bold text-lg">⚙️ Classificar Equipe</h2>
            <p className="text-ds-text text-xs mt-0.5">Defina senioridade e cargo de cada membro</p>
          </div>
          <button onClick={onClose} className="text-ds-text hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {members.map(name => {
              const current = local[name] ?? 'Pleno';
              const currentRole = localRole[name] ?? 'DEV';
              return (
                <div key={name} className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                    style={{ backgroundColor: SENIORITY_COLORS[current] + '33', color: SENIORITY_COLORS[current], border: `1px solid ${SENIORITY_COLORS[current]}60` }}
                  >
                    {abbrev(name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{name}</p>
                    <label htmlFor={`sen-${name}`} className="sr-only">Senioridade de {name}</label>
                    <select
                      id={`sen-${name}`}
                      value={current}
                      onChange={e => handleChange(name, e.target.value as Seniority)}
                      className="mt-1 w-full bg-ds-navy border border-ds-border text-ds-light-text text-xs rounded-md px-2 py-1"
                      style={{ borderColor: SENIORITY_COLORS[current] + '60' }}
                    >
                      {SENIORITY_OPTIONS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <label htmlFor={`role-${name}`} className="sr-only">Cargo de {name}</label>
                    <select
                      id={`role-${name}`}
                      value={currentRole}
                      onChange={e => handleRoleChange(name, e.target.value as Role)}
                      className="mt-1 w-full bg-ds-navy border border-ds-border text-ds-light-text text-xs rounded-md px-2 py-1"
                      style={{ borderColor: ROLE_COLORS[currentRole] + '60' }}
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-ds-border flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-ds-text border border-ds-border rounded-lg hover:bg-ds-dark-blue transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-ds-green/20 border border-ds-green/40 text-ds-green rounded-lg hover:bg-ds-green/30 transition-colors font-semibold">
            Salvar Configuração
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Modal de detalhamento de tarefas ─────────────────────────────────────────
interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-ds-navy border border-ds-border rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div
          className="p-4 rounded-t-xl flex justify-between items-center"
          style={{ backgroundColor: data.color + '33', borderBottom: `1px solid ${data.color}40` }}
        >
          <h2 className="text-white font-bold text-base">{data.title}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl font-bold leading-none">×</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <p className="text-ds-text text-sm mb-3">
            Total: <span className="font-bold text-white">{data.items.length}</span> {data.items.length === 1 ? 'item' : 'itens'}
          </p>
          <ul className="space-y-2">
            {data.items.map((item, idx) => (
              <li
                key={item.workItemId || idx}
                className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 hover:border-ds-green transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xs font-mono px-2 py-1 rounded shrink-0 text-white" style={{ backgroundColor: data.color + '44' }}>
                    #{item.workItemId}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={`${AZURE_DEVOPS_BASE_URL}/${item.workItemId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white hover:text-ds-green font-medium block truncate mb-1"
                      title={item.title}
                    >
                      {item.title}
                    </a>
                    <div className="grid grid-cols-2 gap-1 text-xs text-ds-text">
                      <div>🏷️ {item.type}</div>
                      <div>📊 {item.state}</div>
                      {item.storyPoints ? <div>⚡ {item.storyPoints} SP</div> : null}
                      {item.cycleTime ? <div>⏱️ {item.cycleTime.toFixed(1)}d CT</div> : null}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 border-t border-ds-border">
          <button onClick={onClose} className="w-full bg-ds-border hover:bg-ds-green text-white py-2 px-4 rounded-lg transition-colors text-sm">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── componente principal ────────────────────────────────────────────────────
interface Props { data: WorkItem[]; }

const TeamComparisonDashboard: React.FC<Props> = ({ data }) => {
  const { isAdmin, token } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || 'https://backend-hazel-three-14.vercel.app';

  const [seniorityConfig, setSeniorityConfig] = useState<SeniorityConfigMap>(loadLocalConfig);
  const [roleConfig, setRoleConfig] = useState<RoleConfigMap>(loadRoleConfig);
  const [activeConfig, setActiveConfig] = useState<ActiveConfigMap>(loadActiveConfig);
  const [configMeta, setConfigMeta] = useState<{ updatedBy?: string; updatedAt?: string } | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>('__all__');
  const [selectedSeniority, setSelectedSeniority] = useState<string>('__all__');
  const [selectedRole, setSelectedRole] = useState<string>('__all__');
  const [showOnlyActive, setShowOnlyActive] = useState<boolean>(false);
  const [historyMonths, setHistoryMonths] = useState<number>(6);
  const [customStart, setCustomStart] = useState<string>(
    () => format(subMonths(new Date(), 5), 'yyyy-MM-dd')
  );
  const [customEnd, setCustomEnd] = useState<string>(
    () => format(new Date(), 'yyyy-MM-dd')
  );
  const [activePersons, setActivePersons] = useState<Set<string>>(new Set());
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [filterBarCollapsed, setFilterBarCollapsed] = useState(false);

  // ── carregar config do banco ao montar (seniority + role + active)
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const headers = { 'Authorization': `Bearer ${token}` };
        const [senRes, roleRes, activeRes] = await Promise.all([
          fetch(`${API_URL}/api/settings/${SETTINGS_KEY}`, { headers }),
          fetch(`${API_URL}/api/settings/${ROLE_SETTINGS_KEY}`, { headers }),
          fetch(`${API_URL}/api/settings/${ACTIVE_SETTINGS_KEY}`, { headers }),
        ]);
        if (senRes.ok) {
          const d = await senRes.json();
          if (d.value) {
            setSeniorityConfig(d.value);
            saveLocalConfig(d.value);
            setConfigMeta({ updatedBy: d.updated_by, updatedAt: d.updated_at });
          }
        }
        if (roleRes.ok) {
          const d = await roleRes.json();
          if (d.value) { setRoleConfig(d.value); saveRoleConfig(d.value); }
        }
        if (activeRes.ok) {
          const d = await activeRes.json();
          if (d.value) { setActiveConfig(d.value); saveActiveConfig(d.value); }
        }
      } catch {
        // sem conexão: usa localStorage já carregado
      } finally {
        setConfigLoading(false);
      }
    };
    if (token) fetchConfig();
    else setConfigLoading(false);
  }, [token, API_URL]);

  // ── times disponíveis
  const teams = useMemo(() =>
    ['__all__', ...[...new Set(data.map(i => i.team).filter(Boolean) as string[])].sort()],
    [data]
  );

  // ── itens filtrados pelo time
  const teamItems = useMemo(() =>
    selectedTeam === '__all__' ? data : data.filter(i => i.team === selectedTeam),
    [data, selectedTeam]
  );

  // ── membros únicos
  const allMembers = useMemo(() =>
    [...new Set(teamItems.map(i => i.assignedTo).filter(Boolean) as string[])].sort(),
    [teamItems]
  );

  // ── salvar config (admin: banco + localStorage; outro: apenas localStorage)
  const handleSaveConfig = useCallback(async (cfg: SeniorityConfigMap, roleCfg: RoleConfigMap) => {
    setSeniorityConfig(cfg);
    saveLocalConfig(cfg);
    setRoleConfig(roleCfg);
    saveRoleConfig(roleCfg);
    if (!isAdmin) return;
    setConfigSaving(true);
    try {
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
      const [senRes] = await Promise.all([
        fetch(`${API_URL}/api/settings/${SETTINGS_KEY}`, {
          method: 'PUT', headers, body: JSON.stringify({ value: cfg }),
        }),
        fetch(`${API_URL}/api/settings/${ROLE_SETTINGS_KEY}`, {
          method: 'PUT', headers, body: JSON.stringify({ value: roleCfg }),
        }),
      ]);
      if (senRes.ok) {
        const data = await senRes.json();
        setConfigMeta(prev => ({ ...prev, updatedBy: data.updated_by, updatedAt: new Date().toISOString() }));
      }
    } catch { /* silencioso: config já salva localmente */ }
    finally { setConfigSaving(false); }
  }, [isAdmin, token, API_URL]);

  // ── meses para análise histórica
  const months = useMemo(() => {
    const end = historyMonths === 0 && customEnd
      ? new Date(customEnd + 'T23:59:59')
      : new Date();
    const start = historyMonths === 0 && customStart
      ? new Date(customStart)
      : subMonths(end, historyMonths - 1);
    return eachMonthOfInterval({ start: startOfMonth(start), end: endOfMonth(end) });
  }, [historyMonths, customStart, customEnd]);

  // ── configuração dos membros (com seniority, role, active e cor)
  const memberConfigs = useMemo((): MemberConfig[] => {
    return allMembers.map((name, idx) => ({
      name,
      seniority: seniorityConfig[name] ?? 'Pleno',
      role: roleConfig[name] ?? 'DEV',
      active: activeConfig[name] !== false,
      color: PERSON_PALETTE[idx % PERSON_PALETTE.length],
    }));
  }, [allMembers, seniorityConfig, roleConfig, activeConfig]);

  // ── membros filtrados por senioridade, cargo e status
  const filteredMembers = useMemo(() => {
    let result = memberConfigs;
    if (selectedSeniority !== '__all__') result = result.filter(m => m.seniority === selectedSeniority);
    if (selectedRole !== '__all__') result = result.filter(m => m.role === selectedRole);
    return result;
  }, [memberConfigs, selectedSeniority, selectedRole]);

  // ── apenas membros ativos (usados em gráficos e métricas agregadas)
  // sempre exclui inativos dos cálculos; o filtro "Somente Ativos" restringe
  // adicionalmente o que aparece nos cards individuais
  const activeFilteredMembers = useMemo(() =>
    filteredMembers.filter(m => m.active),
    [filteredMembers]
  );

  // ── membros exibidos nos cards (respeita o filtro de status da barra)
  const displayedMembers = useMemo(() =>
    showOnlyActive ? filteredMembers.filter(m => m.active) : filteredMembers,
    [filteredMembers, showOnlyActive]
  );

  // ── itens do período completo de análise
  const periodStart = useMemo(() => {
    if (historyMonths === 0 && customStart) return startOfMonth(new Date(customStart));
    return startOfMonth(subMonths(new Date(), historyMonths - 1));
  }, [historyMonths, customStart]);

  const periodEnd = useMemo(() => {
    if (historyMonths === 0 && customEnd) return endOfMonth(new Date(customEnd));
    return new Date();
  }, [historyMonths, customEnd]);

  const periodItems = useMemo(() =>
    teamItems.filter(item => {
      const date = item.closedDate
        ? new Date(item.closedDate as string)
        : new Date(item.changedDate || item.createdDate || '');
      return date >= periodStart && date <= periodEnd;
    }),
    [teamItems, periodStart, periodEnd]
  );

  // ── métricas por pessoa no período
  const personMetrics = useMemo(() => {
    const map: Record<string, {
      delivered: number;
      inProgress: number;
      bugs: number;
      avgCycleTime: number | null;
      storyPoints: number;
      items: WorkItem[];
      byMonth: Record<string, number>;
      byType: Record<string, number>;
    }> = {};

    filteredMembers.forEach(({ name }) => {
      const mine = periodItems.filter(i => i.assignedTo === name);
      const completed = mine.filter(i => COMPLETED_STATES.includes(i.state));
      const cts = completed.map(i => i.cycleTime).filter(v => v != null && v > 0) as number[];
      const avgCT = cts.length ? cts.reduce((a, b) => a + b, 0) / cts.length : null;

      const byMonth: Record<string, number> = {};
      months.forEach(m => { byMonth[format(m, 'MMM/yy', { locale: ptBR })] = 0; });
      completed.forEach(item => {
        const d = item.closedDate
          ? new Date(item.closedDate as string)
          : new Date(item.changedDate || item.createdDate || '');
        const key = format(d, 'MMM/yy', { locale: ptBR });
        if (key in byMonth) byMonth[key]++;
      });

      const byType: Record<string, number> = {};
      mine.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });

      map[name] = {
        delivered: completed.length,
        inProgress: mine.filter(i => !COMPLETED_STATES.includes(i.state)).length,
        bugs: completed.filter(i => i.type === 'Bug').length,
        avgCycleTime: avgCT,
        storyPoints: mine.reduce((s, i) => s + (i.storyPoints || 0), 0),
        items: mine,
        byMonth,
        byType,
      };
    });

    return map;
  }, [filteredMembers, periodItems, months]);

  // ── dados para gráfico de throughput
  const throughputChartData = useMemo(() =>
    activeFilteredMembers
      .map(m => ({
        name: m.name.split(' ')[0],
        fullName: m.name,
        seniority: m.seniority,
        color: SENIORITY_COLORS[m.seniority],
        Entregues: personMetrics[m.name]?.delivered ?? 0,
        'Em Andamento': personMetrics[m.name]?.inProgress ?? 0,
        Bugs: personMetrics[m.name]?.bugs ?? 0,
      }))
      .sort((a, b) => b.Entregues - a.Entregues),
    [activeFilteredMembers, personMetrics]
  );

  // ── dados para gráfico de cycle time
  const cycleTimeChartData = useMemo(() =>
    activeFilteredMembers
      .map(m => ({
        name: m.name.split(' ')[0],
        fullName: m.name,
        seniority: m.seniority,
        color: SENIORITY_COLORS[m.seniority],
        'Cycle Time Médio': personMetrics[m.name]?.avgCycleTime
          ? Math.round((personMetrics[m.name].avgCycleTime as number) * 10) / 10
          : null,
      }))
      .filter(d => d['Cycle Time Médio'] != null)
      .sort((a, b) => (a['Cycle Time Médio'] as number) - (b['Cycle Time Médio'] as number)),
    [activeFilteredMembers, personMetrics]
  );

  // ── dados para linha histórica (top 8 pessoas por entrega)
  const top8 = useMemo(() =>
    [...activeFilteredMembers]
      .sort((a, b) => (personMetrics[b.name]?.delivered ?? 0) - (personMetrics[a.name]?.delivered ?? 0))
      .slice(0, 8),
    [activeFilteredMembers, personMetrics]
  );

  const lineChartData = useMemo(() =>
    months.map(m => {
      const key = format(m, 'MMM/yy', { locale: ptBR });
      const row: Record<string, any> = { mes: key };
      top8.forEach(mc => {
        row[mc.name.split(' ')[0]] = personMetrics[mc.name]?.byMonth[key] ?? 0;
      });
      return row;
    }),
    [months, top8, personMetrics]
  );

  // ── dados radar (top 6 comparativos)
  const radarTop6 = useMemo(() =>
    [...activeFilteredMembers]
      .sort((a, b) => (personMetrics[b.name]?.delivered ?? 0) - (personMetrics[a.name]?.delivered ?? 0))
      .slice(0, 6),
    [activeFilteredMembers, personMetrics]
  );

  const maxDelivered = useMemo(() =>
    Math.max(1, ...radarTop6.map(m => personMetrics[m.name]?.delivered ?? 0)),
    [radarTop6, personMetrics]
  );
  const maxSP = useMemo(() =>
    Math.max(1, ...radarTop6.map(m => personMetrics[m.name]?.storyPoints ?? 0)),
    [radarTop6, personMetrics]
  );
  const allCTs = useMemo(() => radarTop6.map(m => personMetrics[m.name]?.avgCycleTime ?? 0).filter(v => v > 0), [radarTop6, personMetrics]);
  const maxCT = useMemo(() => Math.max(1, ...allCTs), [allCTs]);

  const radarData = useMemo(() => [
    { metric: 'Entregas' },
    { metric: 'Story Points' },
    { metric: 'Velocidade (↓CT)' },
    { metric: 'Bugs Resolvidos' },
    { metric: 'Em Andamento' },
  ].map(row => {
    const out: Record<string, any> = { metric: row.metric };
    radarTop6.forEach(m => {
      const met = personMetrics[m.name];
      const firstName = m.name.split(' ')[0];
      if (row.metric === 'Entregas')           out[firstName] = Math.round(((met?.delivered ?? 0) / maxDelivered) * 100);
      if (row.metric === 'Story Points')       out[firstName] = Math.round(((met?.storyPoints ?? 0) / maxSP) * 100);
      if (row.metric === 'Velocidade (↓CT)')  out[firstName] = met?.avgCycleTime ? Math.round((1 - (met.avgCycleTime / maxCT)) * 100) : 0;
      if (row.metric === 'Bugs Resolvidos')    out[firstName] = Math.round(((met?.bugs ?? 0) / Math.max(1, maxDelivered)) * 100);
      if (row.metric === 'Em Andamento')       out[firstName] = Math.round(((met?.inProgress ?? 0) / Math.max(1, maxDelivered)) * 100);
    });
    return out;
  }), [radarTop6, personMetrics, maxDelivered, maxSP, maxCT]);

  // ── médias por senioridade
  const seniorityStats = useMemo(() => {
    const groups: Record<string, { delivered: number[]; ct: number[]; sp: number[] }> = {};
    SENIORITY_OPTIONS.forEach(s => { groups[s] = { delivered: [], ct: [], sp: [] }; });
    activeFilteredMembers.forEach(m => {
      const met = personMetrics[m.name];
      if (!met) return;
      groups[m.seniority].delivered.push(met.delivered);
      if (met.avgCycleTime) groups[m.seniority].ct.push(met.avgCycleTime);
      groups[m.seniority].sp.push(met.storyPoints);
    });
    return SENIORITY_OPTIONS.map(s => {
      const g = groups[s];
      const count = g.delivered.length;
      if (!count) return null;
      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      return {
        seniority: s,
        count,
        avgDelivered: Math.round(avg(g.delivered) * 10) / 10,
        avgCT: g.ct.length ? Math.round(avg(g.ct) * 10) / 10 : null,
        totalSP: g.sp.reduce((a, b) => a + b, 0),
      };
    }).filter(Boolean);
  }, [activeFilteredMembers, personMetrics]);

  // ── médias por cargo
  const roleStats = useMemo(() => {
    const groups: Record<string, { delivered: number[]; ct: number[]; sp: number[] }> = {};
    ROLE_OPTIONS.forEach(r => { groups[r] = { delivered: [], ct: [], sp: [] }; });
    activeFilteredMembers.forEach(m => {
      const met = personMetrics[m.name];
      if (!met) return;
      groups[m.role].delivered.push(met.delivered);
      if (met.avgCycleTime) groups[m.role].ct.push(met.avgCycleTime);
      groups[m.role].sp.push(met.storyPoints);
    });
    return ROLE_OPTIONS.map(r => {
      const g = groups[r];
      const count = g.delivered.length;
      if (!count) return null;
      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      return {
        role: r,
        count,
        avgDelivered: Math.round(avg(g.delivered) * 10) / 10,
        avgCT: g.ct.length ? Math.round(avg(g.ct) * 10) / 10 : null,
        totalSP: g.sp.reduce((a, b) => a + b, 0),
      };
    }).filter(Boolean);
  }, [activeFilteredMembers, personMetrics]);

  // ── toggle ativo/inativo de um membro (somente admin, persiste no banco)
  const toggleActive = useCallback(async (name: string) => {
    if (!isAdmin) return;
    const isCurrentlyActive = activeConfig[name] !== false;
    const updated = { ...activeConfig, [name]: !isCurrentlyActive };
    setActiveConfig(updated);
    saveActiveConfig(updated);
    try {
      await fetch(`${API_URL}/api/settings/${ACTIVE_SETTINGS_KEY}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ value: updated }),
      });
    } catch { /* silencioso: config local já atualizada */ }
  }, [isAdmin, activeConfig, token, API_URL]);

  // ── toggle visibilidade de linhas no gráfico de tendência
  const togglePerson = (name: string) => {
    setActivePersons(prev => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  };
  const isLineVisible = (name: string) => activePersons.size === 0 || activePersons.has(name);

  const hasData = displayedMembers.length > 0;

  return (
    <div className="space-y-6">
      {/* ── barra de filtros ── */}
      <div className="relative">
        <button
          onClick={() => setFilterBarCollapsed(!filterBarCollapsed)}
          className="w-full flex items-center justify-center gap-2 py-1.5 text-xs text-ds-muted hover:text-ds-light-text bg-ds-navy/50 hover:bg-ds-navy border border-ds-border rounded-lg transition-colors"
          title={filterBarCollapsed ? 'Mostrar filtros' : 'Recolher filtros'}
        >
          <span>{filterBarCollapsed ? '▼ Mostrar Filtros' : '▲ Recolher Filtros'}</span>
        </button>
      </div>
      {!filterBarCollapsed && (
      <div className="bg-ds-navy p-4 rounded-xl border border-ds-border flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="tc-team" className="block text-ds-text text-xs mb-1">Time</label>
          <select
            id="tc-team"
            value={selectedTeam}
            onChange={e => setSelectedTeam(e.target.value)}
            className="bg-ds-dark-blue border border-ds-border text-ds-light-text text-sm rounded-md p-2"
          >
            <option value="__all__">Todos os Times</option>
            {teams.filter(t => t !== '__all__').map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tc-seniority" className="block text-ds-text text-xs mb-1">Senioridade</label>
          <select
            id="tc-seniority"
            value={selectedSeniority}
            onChange={e => setSelectedSeniority(e.target.value)}
            className="bg-ds-dark-blue border border-ds-border text-ds-light-text text-sm rounded-md p-2"
          >
            <option value="__all__">Todas</option>
            {SENIORITY_OPTIONS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tc-role" className="block text-ds-text text-xs mb-1">Cargo</label>
          <select
            id="tc-role"
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
            className="bg-ds-dark-blue border border-ds-border text-ds-light-text text-sm rounded-md p-2"
          >
            <option value="__all__">Todos</option>
            {ROLE_OPTIONS.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tc-status" className="block text-ds-text text-xs mb-1">Status</label>
          <select
            id="tc-status"
            value={showOnlyActive ? 'active' : '__all__'}
            onChange={e => setShowOnlyActive(e.target.value === 'active')}
            className="bg-ds-dark-blue border border-ds-border text-ds-light-text text-sm rounded-md p-2"
          >
            <option value="__all__">Todos</option>
            <option value="active">Somente Ativos</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="tc-months" className="block text-ds-text text-xs mb-1">Período de análise</label>
          <select
            id="tc-months"
            value={historyMonths}
            onChange={e => setHistoryMonths(Number(e.target.value))}
            className="bg-ds-dark-blue border border-ds-border text-ds-light-text text-sm rounded-md p-2"
          >
            <option value={1}>Último mês</option>
            <option value={2}>Últimos 2 meses</option>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={9}>Últimos 9 meses</option>
            <option value={12}>Últimos 12 meses</option>
            <option value={18}>Últimos 18 meses</option>
            <option value={24}>Últimos 24 meses</option>
            <option value={36}>Últimos 36 meses</option>
            <option value={0}>📅 Período personalizado</option>
          </select>
          {historyMonths === 0 && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex flex-col gap-0.5">
                <label htmlFor="tc-custom-start" className="text-ds-text text-xs">De</label>
                <input
                  id="tc-custom-start"
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="bg-ds-dark-blue border border-ds-border text-ds-light-text text-xs rounded-md p-1.5"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label htmlFor="tc-custom-end" className="text-ds-text text-xs">Até</label>
                <input
                  id="tc-custom-end"
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="bg-ds-dark-blue border border-ds-border text-ds-light-text text-xs rounded-md p-1.5"
                />
              </div>
            </div>
          )}
        </div>

        <div className="ml-auto flex flex-col items-end gap-1">
          {isAdmin && (
            <button
              onClick={() => setShowConfig(true)}
              disabled={configSaving}
              className="flex items-center gap-2 px-4 py-2 bg-ds-green/10 border border-ds-green/30 text-ds-green text-sm rounded-lg hover:bg-ds-green/20 transition-colors font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {configSaving ? (
                <><span className="animate-spin">⏳</span> Salvando...</>
              ) : (
                <>⚙️ Classificar</>
              )}
            </button>
          )}
          {configLoading && (
            <span className="text-xs text-ds-text animate-pulse">Carregando configuração...</span>
          )}
          {!configLoading && configMeta && (
            <span className="text-xs text-ds-text opacity-70">
              Configurado por <span className="font-medium text-ds-light-text">{configMeta.updatedBy}</span>{' '}
              {configMeta.updatedAt && (
                <>em {format(new Date(configMeta.updatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</>
              )}
            </span>
          )}
          {!configLoading && !configMeta && !isAdmin && (
            <span className="text-xs text-ds-text opacity-50">Senioridade configurada pelo admin</span>
          )}
        </div>

        {/* ── botão limpar filtros ── */}
        <button
          onClick={() => {
            setSelectedTeam('__all__');
            setSelectedSeniority('__all__');
            setSelectedRole('__all__');
            setShowOnlyActive(false);
            setHistoryMonths(6);
            setCustomStart(format(subMonths(new Date(), 5), 'yyyy-MM-dd'));
            setCustomEnd(format(new Date(), 'yyyy-MM-dd'));
          }}
          className="bg-ds-muted/20 text-ds-light-text font-semibold py-2 px-4 rounded-md hover:bg-ds-muted/40 transition-colors text-sm"
        >
          Limpar Filtros
        </button>
      </div>
      )}

      {/* ── se não há dados ── */}
      {!hasData && (
        <div className="bg-ds-navy border border-ds-border rounded-xl p-12 text-center text-ds-text">
          <p className="text-4xl mb-3">👥</p>
          <p className="font-semibold text-white mb-1">Nenhum membro encontrado</p>
          <p className="text-sm">Selecione outro time ou período com dados disponíveis.</p>
        </div>
      )}

      {hasData && (
        <>
          {/* ── cards por senioridade e cargo lado a lado ── */}
          {(seniorityStats.length > 0 || roleStats.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Médias por Senioridade */}
              {seniorityStats.length > 0 && (
                <div>
                  <h3 className="text-ds-light-text font-bold text-sm mb-3">📊 Médias por Senioridade</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {seniorityStats.map(s => !s ? null : (
                      <div
                        key={s.seniority}
                        className="bg-ds-navy border rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.02]"
                        style={{ borderColor: SENIORITY_COLORS[s.seniority as Seniority] + '60' }}
                        onClick={() => setSelectedSeniority(prev => prev === s.seniority ? '__all__' : s.seniority)}
                      >
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full border"
                          style={{
                            backgroundColor: SENIORITY_COLORS[s.seniority as Seniority] + '22',
                            color: SENIORITY_COLORS[s.seniority as Seniority],
                            borderColor: SENIORITY_COLORS[s.seniority as Seniority] + '50',
                          }}
                        >
                          {s.seniority}
                        </span>
                        <p className="text-ds-text text-xs mt-2">{s.count} pessoa{s.count > 1 ? 's' : ''}</p>
                        <p className="text-white font-bold text-lg">{s.avgDelivered}</p>
                        <p className="text-ds-text text-xs">entregas (média)</p>
                        {s.avgCT && (
                          <p className="text-ds-text text-xs mt-1">CT médio: <span className="text-ds-green">{s.avgCT}d</span></p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Médias por Cargo */}
              {roleStats.length > 0 && (
                <div>
                  <h3 className="text-ds-light-text font-bold text-sm mb-3">💼 Médias por Cargo</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {roleStats.map(r => !r ? null : (
                      <div
                        key={r.role}
                        className="bg-ds-navy border rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.02]"
                        style={{ borderColor: ROLE_COLORS[r.role as Role] + '60' }}
                        onClick={() => setSelectedRole(prev => prev === r.role ? '__all__' : r.role)}
                      >
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full border"
                          style={{
                            backgroundColor: ROLE_COLORS[r.role as Role] + '22',
                            color: ROLE_COLORS[r.role as Role],
                            borderColor: ROLE_COLORS[r.role as Role] + '50',
                          }}
                        >
                          {r.role}
                        </span>
                        <p className="text-ds-text text-xs mt-2">{r.count} pessoa{r.count > 1 ? 's' : ''}</p>
                        <p className="text-white font-bold text-lg">{r.avgDelivered}</p>
                        <p className="text-ds-text text-xs">entregas (média)</p>
                        {r.avgCT && (
                          <p className="text-ds-text text-xs mt-1">CT médio: <span className="text-ds-green">{r.avgCT}d</span></p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── throughput individual ── */}
          <div className="bg-ds-navy p-4 rounded-xl border border-ds-border">
            <ChartInfoLamp info="Quantidade de itens entregues por pessoa no período, coloridos pela senioridade. Clique em uma barra para ver detalhes." />
            <h3 className="text-ds-light-text font-bold text-base mb-4">🏆 Itens Entregues por Pessoa</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={throughputChartData} margin={{ left: 0, right: 16, top: 8, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#303C55" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#8892B0', fontSize: 11 }}
                  angle={-40}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fill: '#8892B0', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Entregues" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }} onClick={d => {
                  const met = personMetrics[d.fullName];
                  if (!met) return;
                  const completed = met.items.filter(i => COMPLETED_STATES.includes(i.state));
                  setModalData({ title: `Itens Entregues — ${d.fullName}`, items: completed, color: d.color });
                }}>
                  {throughputChartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.color}
                      opacity={selectedPerson && selectedPerson !== d.fullName ? 0.3 : 1}
                    />
                  ))}
                  <LabelList dataKey="Entregues" position="top" fill="#ccd6f6" fontSize={10} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* legenda de senioridades */}
            <div className="flex flex-wrap gap-3 mt-3 justify-center">
              {SENIORITY_OPTIONS.map(s => {
                const has = activeFilteredMembers.some(m => m.seniority === s);
                if (!has) return null;
                return (
                  <div key={s} className="flex items-center gap-1.5 text-xs">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: SENIORITY_COLORS[s] }} />
                    <span className="text-ds-text">{s}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── cycle time individual ── */}
          {cycleTimeChartData.length > 0 && (
            <div className="bg-ds-navy p-4 rounded-xl border border-ds-border">
              <ChartInfoLamp info="Cycle Time médio de cada pessoa. Quanto menor, mais rápida é a entrega. Senioridade mais alta tende a ter itens mais complexos, então compare com cautela." />
              <h3 className="text-ds-light-text font-bold text-base mb-4">⏱️ Cycle Time Médio por Pessoa (dias)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={cycleTimeChartData} layout="vertical" margin={{ left: 80, right: 32, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#303C55" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#8892B0', fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: '#8892B0', fontSize: 11 }}
                    width={80}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Cycle Time Médio" radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }} onClick={d => {
                    const met = personMetrics[d.fullName];
                    if (!met) return;
                    const completed = met.items.filter(i => COMPLETED_STATES.includes(i.state));
                    setModalData({ title: `Cycle Time — ${d.fullName}`, items: completed, color: d.color });
                  }}>
                    {cycleTimeChartData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                    <LabelList dataKey="Cycle Time Médio" position="right" fill="#ccd6f6" fontSize={10} formatter={(v: number) => `${v}d`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── tendência histórica ── */}
          <div className="bg-ds-navy p-4 rounded-xl border border-ds-border">
            <ChartInfoLamp info="Evolução dos itens entregues por pessoa ao longo dos meses. Clique nos nomes abaixo para mostrar/ocultar linhas." />
            <h3 className="text-ds-light-text font-bold text-base mb-2">📈 Tendência de Entregas Mensais</h3>
            <p className="text-ds-text text-xs mb-4">Mostrando top {top8.length} pessoas por total de entregas. Clique para filtrar.</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineChartData} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#303C55" />
                <XAxis dataKey="mes" tick={{ fill: '#8892B0', fontSize: 11 }} />
                <YAxis tick={{ fill: '#8892B0', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                {top8.map((mc, i) => {
                  const firstName = mc.name.split(' ')[0];
                  return (
                    <Line
                      key={mc.name}
                      type="monotone"
                      dataKey={firstName}
                      stroke={PERSON_PALETTE[i % PERSON_PALETTE.length]}
                      strokeWidth={isLineVisible(mc.name) ? 2 : 0}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>

            {/* toggles de linha */}
            <div className="flex flex-wrap gap-2 mt-3 justify-center">
              {top8.map((mc, i) => {
                const firstName = mc.name.split(' ')[0];
                const active = isLineVisible(mc.name);
                return (
                  <button
                    key={mc.name}
                    onClick={() => togglePerson(mc.name)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs transition-all"
                    style={{
                      borderColor: PERSON_PALETTE[i % PERSON_PALETTE.length] + '60',
                      backgroundColor: active ? PERSON_PALETTE[i % PERSON_PALETTE.length] + '22' : 'transparent',
                      color: active ? PERSON_PALETTE[i % PERSON_PALETTE.length] : '#8892B0',
                      opacity: active ? 1 : 0.5,
                    }}
                    title={mc.name}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: PERSON_PALETTE[i % PERSON_PALETTE.length] }}
                    />
                    {firstName}
                    <span
                      className="text-xs px-1 rounded border"
                      style={{
                        borderColor: SENIORITY_COLORS[mc.seniority] + '60',
                        color: SENIORITY_COLORS[mc.seniority],
                        backgroundColor: SENIORITY_COLORS[mc.seniority] + '22',
                      }}
                    >
                      {mc.seniority}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── radar ── */}
          {radarTop6.length >= 2 && (
            <div className="bg-ds-navy p-4 rounded-xl border border-ds-border">
              <ChartInfoLamp info="Comparativo multi-dimensional dos tops 6. Valores normalizados (0–100). 'Velocidade' = inverso do cycle time (quanto maior, mais rápido)." />
              <h3 className="text-ds-light-text font-bold text-base mb-4">🕸️ Radar Comparativo (Top 6)</h3>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <ResponsiveContainer width="100%" height={340}>
                    <RadarChart data={radarData} margin={{ top: 16, right: 40, bottom: 16, left: 40 }}>
                      <PolarGrid stroke="#303C55" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: '#8892B0', fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#8892B0', fontSize: 9 }} />
                      {radarTop6.map((mc, i) => (
                        <Radar
                          key={mc.name}
                          name={mc.name.split(' ')[0]}
                          dataKey={mc.name.split(' ')[0]}
                          stroke={PERSON_PALETTE[i % PERSON_PALETTE.length]}
                          fill={PERSON_PALETTE[i % PERSON_PALETTE.length]}
                          fillOpacity={0.1}
                          strokeWidth={1.5}
                        />
                      ))}
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* tabela lateral */}
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-ds-text border-b border-ds-border">
                        <th className="text-left pb-2 font-medium">Pessoa</th>
                        <th className="text-right pb-2 font-medium">Entregues</th>
                        <th className="text-right pb-2 font-medium">CT Médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {radarTop6.map((mc, i) => {
                        const met = personMetrics[mc.name];
                        return (
                          <tr key={mc.name} className="border-b border-ds-border/40">
                            <td className="py-2 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: PERSON_PALETTE[i % PERSON_PALETTE.length] }}
                                />
                                <span className="text-white truncate max-w-20" title={mc.name}>
                                  {mc.name.split(' ')[0]}
                                </span>
                              </div>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full border ${SENIORITY_BG[mc.seniority]}`}
                              >
                                {mc.seniority}
                              </span>
                            </td>
                            <td className="text-right text-ds-green font-bold py-2">{met?.delivered ?? 0}</td>
                            <td className="text-right text-ds-text py-2">{fmtCT(met?.avgCycleTime)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── cards individuais ── */}
          <div>
            <h3 className="text-ds-light-text font-bold text-sm mb-3">👤 Detalhamento Individual</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {displayedMembers
                .sort((a, b) => (personMetrics[b.name]?.delivered ?? 0) - (personMetrics[a.name]?.delivered ?? 0))
                .map((mc, i) => {
                  const met = personMetrics[mc.name];
                  const color = PERSON_PALETTE[i % PERSON_PALETTE.length];
                  const isSelected = selectedPerson === mc.name;
                  const isInactive = !mc.active;

                  return (
                    <div
                      key={mc.name}
                      className={`border rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.01] ${
                        isInactive ? 'bg-red-950/30' : 'bg-ds-navy'
                      }`}
                      style={{
                        borderColor: isInactive ? '#ef4444' : (isSelected ? SENIORITY_COLORS[mc.seniority] : '#303C55'),
                        boxShadow: isInactive
                          ? '0 0 0 1px #ef444440'
                          : (isSelected ? `0 0 0 1px ${SENIORITY_COLORS[mc.seniority]}60` : undefined),
                        opacity: isInactive ? 0.75 : 1,
                      }}
                      onClick={() => {
                        const met = personMetrics[mc.name];
                        if (!met) return;
                        setModalData({ title: `Tarefas — ${mc.name}`, items: met.items, color: SENIORITY_COLORS[mc.seniority] });
                      }}
                    >
                      {/* header do card */}
                      <div className="flex items-start gap-3 mb-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                          style={{
                            backgroundColor: isInactive ? '#ef444433' : SENIORITY_COLORS[mc.seniority] + '33',
                            color: isInactive ? '#ef4444' : SENIORITY_COLORS[mc.seniority],
                            border: `2px solid ${ isInactive ? '#ef444460' : SENIORITY_COLORS[mc.seniority] + '60'}`,
                          }}
                        >
                          {abbrev(mc.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm truncate">{mc.name}</p>
                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SENIORITY_BG[mc.seniority]}`}
                            >
                              {mc.seniority}
                            </span>
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                              style={{
                                backgroundColor: ROLE_COLORS[mc.role] + '22',
                                color: ROLE_COLORS[mc.role],
                                borderColor: ROLE_COLORS[mc.role] + '60',
                              }}
                            >
                              {mc.role}
                            </span>
                          </div>
                        </div>
                        {isAdmin ? (
                          <button
                            onClick={e => { e.stopPropagation(); toggleActive(mc.name); }}
                            className={`text-[10px] px-2 py-1 rounded-full border font-semibold transition-all shrink-0 ${
                              isInactive
                                ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-green-500/20 hover:border-green-500/50 hover:text-green-400'
                                : 'bg-green-500/20 border-green-500/40 text-green-400 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-400'
                            }`}
                            title={isInactive ? 'Clique para ativar' : 'Clique para desativar'}
                          >
                            {isInactive ? 'Inativo' : 'Ativo'}
                          </button>
                        ) : (
                          <span
                            className={`text-[10px] px-2 py-1 rounded-full border font-semibold shrink-0 ${
                              isInactive
                                ? 'bg-red-500/20 border-red-500/50 text-red-400'
                                : 'bg-green-500/20 border-green-500/40 text-green-400'
                            }`}
                          >
                            {isInactive ? 'Inativo' : 'Ativo'}
                          </span>
                        )}
                      </div>

                      {/* métricas */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-ds-dark-blue rounded-lg p-2 text-center">
                          <p className="text-ds-text mb-0.5">Entregues</p>
                          <p className="text-ds-green font-bold text-xl">{met?.delivered ?? 0}</p>
                        </div>
                        <div className="bg-ds-dark-blue rounded-lg p-2 text-center">
                          <p className="text-ds-text mb-0.5">Em Andamento</p>
                          <p className="text-yellow-300 font-bold text-xl">{met?.inProgress ?? 0}</p>
                        </div>
                        <div className="bg-ds-dark-blue rounded-lg p-2 text-center col-span-2">
                          <p className="text-ds-text mb-0.5">CT Médio</p>
                          <p className="text-white font-bold text-base">{fmtCT(met?.avgCycleTime)}</p>
                        </div>
                      </div>

                      {/* mini tipos */}
                      {met && Object.keys(met.byType).length > 0 && (
                        <div className="mt-3 border-t border-ds-border pt-2 flex flex-wrap gap-1">
                          {Object.entries(met.byType)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 4)
                            .map(([type, count]) => (
                              <span
                                key={type}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-ds-dark-blue text-ds-text border border-ds-border"
                              >
                                {type.replace('Product Backlog Item', 'PBI').replace('User Story', 'US')}: {count}
                              </span>
                            ))}
                        </div>
                      )}

                      {/* mini sparkline de meses */}
                      {met && (
                        <div className="mt-3">
                          <ResponsiveContainer width="100%" height={40}>
                            <LineChart data={months.map(m => {
                              const key = format(m, 'MMM/yy', { locale: ptBR });
                              return { x: key, v: met.byMonth[key] ?? 0 };
                            })}>
                              <Line
                                type="monotone"
                                dataKey="v"
                                stroke={color}
                                strokeWidth={1.5}
                                dot={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}

      {/* ── modal de detalhamento de tarefas ── */}
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />

      {/* ── modal config ── */}
      {showConfig && (
        <ConfigModal
          members={allMembers.filter(name => activeConfig[name] !== false)}
          config={seniorityConfig}
          roleConfig={roleConfig}
          onSave={handleSaveConfig}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  );
};

export default TeamComparisonDashboard;
