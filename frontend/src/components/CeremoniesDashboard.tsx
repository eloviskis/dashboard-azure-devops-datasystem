import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import CalendarImportMulti from './CalendarImportMulti';

// ─── types ────────────────────────────────────────────────────────────────────
type Status = 'done' | 'rescheduled' | 'cancelled' | 'pending';
type Frequency = 'weekly' | 'biweekly' | 'monthly';

interface CeremonyConfig {
  id: number;
  team: string;
  ritual_type: string;
  frequency: Frequency;
  active: boolean;
}

interface CeremonyRecord {
  id: number;
  team: string;
  ritual_type: string;
  scheduled_date: string;
  status: Status;
  reason: string | null;
  notes: string | null;
  imported_from: string | null;
  created_by: string | null;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  isTeams: boolean;
  organizer: string;
}

type DashboardView = 'overview' | 'weekly';

interface OverviewData {
  summary: { total: number; done: number; rescheduled: number; cancelled: number; pending: number };
  byTeam: { team: string; done: number; rescheduled: number; cancelled: number; pending: number; total: number }[];
  byRitual: { ritual_type: string; done: number; rescheduled: number; cancelled: number; pending: number; total: number }[];
  records: CeremonyRecord[];
}

// ─── constants ────────────────────────────────────────────────────────────────
const DEFAULT_RITUALS = [
  { ritual_type: 'Refinamento',               frequency: 'weekly'   as Frequency },
  { ritual_type: 'Sprint Review',              frequency: 'weekly'   as Frequency },
  { ritual_type: 'Retrospectiva',              frequency: 'biweekly' as Frequency },
  { ritual_type: 'Apresentação de Resultados', frequency: 'monthly'  as Frequency },
];

const FREQ_LABEL: Record<Frequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string; icon: string }> = {
  done:        { label: 'Realizado',  color: 'text-green-400',  bg: 'bg-green-500/20 border-green-500/40',  icon: '✅' },
  rescheduled: { label: 'Remarcado',  color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-500/40', icon: '🔄' },
  cancelled:   { label: 'Cancelado',  color: 'text-red-400',    bg: 'bg-red-500/20 border-red-500/40',      icon: '❌' },
  pending:     { label: 'Pendente',   color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/30',  icon: '⏳' },
};

const API = import.meta.env.VITE_API_URL || '';

// ─── helpers ──────────────────────────────────────────────────────────────────
function getWeeksOfMonth(year: number, month: number): { start: Date; end: Date; label: string }[] {
  const weeks: { start: Date; end: Date; label: string }[] = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);

  let cursor = new Date(firstDay);
  // advance to Monday of first week
  const dow = cursor.getDay();
  if (dow !== 1) cursor.setDate(cursor.getDate() - (dow === 0 ? 6 : dow - 1));

  let wk = 1;
  while (cursor <= lastDay) {
    const start = new Date(cursor);
    const end   = new Date(cursor);
    end.setDate(end.getDate() + 6);
    weeks.push({
      start,
      end: end > lastDay ? lastDay : end,
      label: `Semana ${wk} (${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}–${(end > lastDay ? lastDay : end).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})`,
    });
    cursor.setDate(cursor.getDate() + 7);
    wk++;
  }
  return weeks;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

// ─── sub-components ───────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: Status; onClick?: () => void }> = ({ status, onClick }) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color} ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} transition-opacity`}
    >
      {cfg.icon} {cfg.label}
    </button>
  );
};

const PctBar: React.FC<{ value: number; label?: string }> = ({ value, label }) => {
  const color = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      {label && <div className="flex justify-between text-xs text-ds-text"><span>{label}</span><span className="font-bold">{value}%</span></div>}
      <div className="w-full bg-ds-border/30 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
};

const MiniPctBar: React.FC<{ value: number }> = ({ value }) => {
  const color = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-ds-border/30 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-bold w-9 text-right ${value >= 80 ? 'text-green-400' : value >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{value}%</span>
    </div>
  );
};

// ─── record modal ─────────────────────────────────────────────────────────────
interface RecordModalProps {
  record: CeremonyRecord | null;
  prefill: { team: string; ritual_type: string; scheduled_date: string } | null;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}

const RecordModal: React.FC<RecordModalProps> = ({ record, prefill, onClose, onSaved, token }) => {
  const [status, setStatus]   = useState<Status>(record?.status || 'done');
  const [reason, setReason]   = useState(record?.reason || '');
  const [notes, setNotes]     = useState(record?.notes || '');
  const [date, setDate]       = useState(record?.scheduled_date?.slice(0, 10) || prefill?.scheduled_date || '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const isEdit = !!record;
  const title  = isEdit
    ? `${record.ritual_type} — ${record.team}`
    : `${prefill?.ritual_type} — ${prefill?.team}`;

  const handleSave = async () => {
    if (!date) { setError('Selecione uma data'); return; }
    setSaving(true); setError('');
    try {
      let res: Response;
      if (isEdit) {
        res = await fetch(`${API}/api/ceremonies/records/${record.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status, reason: reason || null, notes: notes || null, scheduled_date: date }),
        });
      } else {
        res = await fetch(`${API}/api/ceremonies/records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            team: prefill!.team,
            ritual_type: prefill!.ritual_type,
            scheduled_date: date,
            status,
            reason: reason || null,
            notes: notes || null,
          }),
        });
      }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao salvar'); }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!record || !confirm('Remover este registro?')) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/ceremonies/records/${record.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(d.error || `Erro ${res.status}`);
      }
      onSaved();
    } catch (e: any) { setError(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-ds-dark-blue border border-ds-border rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ds-border">
          <h3 className="text-ds-light-text font-bold text-sm">{isEdit ? '✏️ Editar registro' : '➕ Registrar ocorrência'}</h3>
          <button onClick={onClose} className="text-ds-muted hover:text-white text-xl">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-ds-light-text font-semibold text-sm">{title}</div>

          {error && <div className="text-red-400 text-xs bg-red-500/10 rounded p-2">{error}</div>}

          <div className="space-y-1">
            <label className="text-ds-text text-xs">Data</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-ds-navy border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text focus:outline-none focus:border-ds-green" />
          </div>

          <div className="space-y-1">
            <label className="text-ds-text text-xs">Status</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([s, cfg]) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${status === s ? `${cfg.bg} ${cfg.color} border-current` : 'border-ds-border text-ds-text hover:border-ds-green'}`}>
                  {cfg.icon} {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {(status === 'rescheduled' || status === 'cancelled') && (
            <div className="space-y-1">
              <label className="text-ds-text text-xs">Motivo *</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: feriado, indisponibilidade..."
                className="w-full bg-ds-navy border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text focus:outline-none focus:border-ds-green" />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-ds-text text-xs">Observações (opcional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Pauta, participantes, resultado..."
              className="w-full bg-ds-navy border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text focus:outline-none focus:border-ds-green resize-none" />
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-ds-border">
          {isEdit
            ? <button onClick={handleDelete} disabled={saving} className="text-xs text-red-400 hover:text-red-300 transition-colors">🗑 Excluir</button>
            : <span />
          }
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm bg-ds-border/30 text-ds-text rounded-lg hover:bg-ds-border/50">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-sm bg-ds-green text-ds-dark-blue font-bold rounded-lg hover:bg-ds-green/80 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── config modal ─────────────────────────────────────────────────────────────
const ConfigModal: React.FC<{
  configs: CeremonyConfig[];
  onClose: () => void;
  onSaved: () => void;
  token: string;
}> = ({ configs, onClose, onSaved, token }) => {
  const [team, setTeam]   = useState('');
  const [ritual, setRitual] = useState(DEFAULT_RITUALS[0].ritual_type);
  const [freq, setFreq]   = useState<Frequency>('weekly');
  const [customRitual, setCustomRitual] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  const handleAdd = async () => {
    const rt = ritual === '__custom__' ? customRitual.trim() : ritual;
    if (!team.trim() || !rt) { setError('Preencha time e rito'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API}/api/ceremonies/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ team: team.trim(), ritual_type: rt, frequency: freq }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setTeam(''); onSaved();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    await fetch(`${API}/api/ceremonies/config/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setDeleting(null);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-ds-dark-blue border border-ds-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ds-border">
          <h3 className="text-ds-light-text font-bold">⚙️ Configurar Ritos por Time</h3>
          <button onClick={onClose} className="text-ds-muted hover:text-white text-xl">&times;</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* add form */}
          <div className="bg-ds-navy rounded-lg p-4 space-y-3 border border-ds-border">
            <p className="text-ds-light-text text-xs font-semibold">➕ Adicionar rito a um time</p>
            {error && <div className="text-red-400 text-xs">{error}</div>}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-ds-text text-xs">Time</label>
                <input type="text" value={team} onChange={e => setTeam(e.target.value)} placeholder="Nome do time"
                  className="mt-1 w-full bg-ds-dark-blue border border-ds-border rounded px-2 py-1.5 text-sm text-ds-light-text focus:outline-none focus:border-ds-green" />
              </div>
              <div>
                <label className="text-ds-text text-xs">Frequência</label>
                <select value={freq} onChange={e => setFreq(e.target.value as Frequency)}
                  className="mt-1 w-full bg-ds-dark-blue border border-ds-border rounded px-2 py-1.5 text-sm text-ds-light-text focus:outline-none focus:border-ds-green">
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quinzenal</option>
                  <option value="monthly">Mensal</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-ds-text text-xs">Rito</label>
              <select value={ritual} onChange={e => setRitual(e.target.value)}
                className="mt-1 w-full bg-ds-dark-blue border border-ds-border rounded px-2 py-1.5 text-sm text-ds-light-text focus:outline-none focus:border-ds-green">
                {DEFAULT_RITUALS.map(r => <option key={r.ritual_type} value={r.ritual_type}>{r.ritual_type}</option>)}
                <option value="__custom__">Outro (digitar)</option>
              </select>
            </div>
            {ritual === '__custom__' && (
              <input type="text" value={customRitual} onChange={e => setCustomRitual(e.target.value)} placeholder="Nome do rito"
                className="w-full bg-ds-dark-blue border border-ds-border rounded px-2 py-1.5 text-sm text-ds-light-text focus:outline-none focus:border-ds-green" />
            )}
            <button onClick={handleAdd} disabled={saving}
              className="w-full py-2 bg-ds-green text-ds-dark-blue font-bold text-sm rounded-lg hover:bg-ds-green/80 disabled:opacity-50">
              {saving ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>

          {/* existing configs */}
          <div className="space-y-2">
            <p className="text-ds-text text-xs font-semibold">Ritos cadastrados</p>
            {configs.length === 0 && <p className="text-ds-muted text-xs">Nenhum rito configurado ainda.</p>}
            {configs.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-ds-navy border border-ds-border rounded-lg px-3 py-2">
                <div>
                  <span className="text-ds-light-text text-sm font-medium">{c.team}</span>
                  <span className="text-ds-muted text-xs ml-2">·</span>
                  <span className="text-ds-text text-sm ml-2">{c.ritual_type}</span>
                  <span className="ml-2 text-xs text-ds-green/80 bg-ds-green/10 px-1.5 py-0.5 rounded">{FREQ_LABEL[c.frequency]}</span>
                </div>
                <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                  className="text-ds-muted hover:text-red-400 text-xs transition-colors">
                  {deleting === c.id ? '...' : '✕'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── main dashboard ───────────────────────────────────────────────────────────
const CeremoniesDashboard: React.FC = () => {
  const { token, isAdmin } = useAuth();

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const overviewLoadedRef = React.useRef(false);

  const [teams, setTeams]       = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [month, setMonth]       = useState(defaultMonth);
  const [configs, setConfigs]   = useState<CeremonyConfig[]>([]);
  const [records, setRecords]   = useState<CeremonyRecord[]>([]);
  const [loading, setLoading]   = useState(true);

  // ── overview state ────────────────────────────────────────────────────────
  const [view, setView]                     = useState<DashboardView>('overview');
  const [overviewData, setOverviewData]     = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [filterTeam, setFilterTeam]         = useState('');
  const [filterRitual, setFilterRitual]     = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [dateFrom, setDateFrom]             = useState('2025-06-01');
  const [dateTo, setDateTo]                 = useState(isoDate(new Date()));
  const [overviewPage, setOverviewPage]     = useState(0);
  const OVERVIEW_PAGE_SIZE = 30;

  const [recordModal, setRecordModal] = useState<{
    record: CeremonyRecord | null;
    prefill: { team: string; ritual_type: string; scheduled_date: string } | null;
  } | null>(null);
  const [showConfig, setShowConfig]     = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/ceremonies/teams`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setTeams(data);
        setSelectedTeam(t => t || data[0] || '');
      }
    } catch {}
  }, [token]);

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo });
      if (filterTeam)   params.append('team',         filterTeam);
      if (filterRitual) params.append('ritual_type',  filterRitual);
      if (filterStatus) params.append('status',       filterStatus);
      const res = await fetch(`${API}/api/ceremonies/records/overview?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    if (res.ok) {
        const data = await res.json();
        setOverviewData(data);
        overviewLoadedRef.current = true;
      }
    } catch {}
    setOverviewLoading(false);
  }, [token, dateFrom, dateTo, filterTeam, filterRitual, filterStatus]);

  useEffect(() => {
    if (view === 'overview') { setOverviewPage(0); fetchOverview(); }
  }, [view, fetchOverview]);

  const fetchConfigs = useCallback(async () => {
    if (!selectedTeam) return;
    try {
      const res = await fetch(`${API}/api/ceremonies/config?team=${encodeURIComponent(selectedTeam)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setConfigs(await res.json());
    } catch {}
  }, [token, selectedTeam]);

  const fetchRecords = useCallback(async () => {
    if (!selectedTeam || !month) return;
    try {
      const res = await fetch(`${API}/api/ceremonies/records?team=${encodeURIComponent(selectedTeam)}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRecords(await res.json());
    } catch {}
  }, [token, selectedTeam, month]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchTeams(), fetchConfigs(), fetchRecords()]);
    setLoading(false);
  }, [fetchTeams, fetchConfigs, fetchRecords]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (selectedTeam) { fetchConfigs(); fetchRecords(); } }, [selectedTeam, month, fetchConfigs, fetchRecords]);

  const [yr, mo] = month.split('-').map(Number);
  const weeks = useMemo(() => getWeeksOfMonth(yr, mo), [yr, mo]);

  // rituals for selected team
  const teamRituals = configs.map(c => c.ritual_type);

  // build lookup: ritual + week → records
  const recordsMap = useMemo(() => {
    const map: Record<string, CeremonyRecord[]> = {};
    records.forEach(r => {
      const d = new Date(r.scheduled_date);
      const wkIdx = weeks.findIndex(w => d >= w.start && d <= w.end);
      const key = `${r.ritual_type}__${wkIdx}`;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [records, weeks]);

  // monthly stats per ritual
  const ritualStats = useMemo(() => {
    return teamRituals.map(rt => {
      const recs = records.filter(r => r.ritual_type === rt);
      const done   = recs.filter(r => r.status === 'done').length;
      const notDone = recs.filter(r => r.status === 'rescheduled' || r.status === 'cancelled').length;
      const total = done + notDone;
      return { rt, done, notDone, total, pct: pct(done, total) };
    });
  }, [records, teamRituals]);

  const overallPct = useMemo(() => {
    const done  = records.filter(r => r.status === 'done').length;
    const total = records.filter(r => r.status !== 'pending').length;
    return pct(done, total);
  }, [records]);

  const monthLabel = useMemo(() => {
    const d = new Date(yr, mo - 1, 1);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, [yr, mo]);

  // last 3 months history
  const historyMonths = useMemo(() => {
    return [-2, -1].map(offset => {
      const d = new Date(yr, mo - 1 + offset, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  }, [yr, mo]);

  const [historyRecords, setHistoryRecords] = useState<Record<string, CeremonyRecord[]>>({});
  useEffect(() => {
    if (!selectedTeam) return;
    (async () => {
      const results: Record<string, CeremonyRecord[]> = {};
      await Promise.all(historyMonths.map(async m => {
        try {
          const res = await fetch(`${API}/api/ceremonies/records?team=${encodeURIComponent(selectedTeam)}&month=${m}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) results[m] = await res.json();
          else results[m] = [];
        } catch { results[m] = []; }
      }));
      setHistoryRecords(results);
    })();
  }, [selectedTeam, historyMonths, token]);

  const openCellModal = (ritual_type: string, week: typeof weeks[0], existing: CeremonyRecord[]) => {
    if (existing.length > 0) {
      setRecordModal({ record: existing[0], prefill: null });
    } else {
      // default to monday of the week (or 1st of month if before)
      const d = week.start < new Date(yr, mo - 1, 1) ? new Date(yr, mo - 1, 1) : week.start;
      setRecordModal({ record: null, prefill: { team: selectedTeam, ritual_type, scheduled_date: isoDate(d) } });
    }
  };

  const onSaved = () => {
    setRecordModal(null);
    setShowConfig(false);
    fetchAll();
    if (overviewLoadedRef.current) fetchOverview();
  };

  if (loading && teams.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-ds-green" />
      </div>
    );
  }

  return (
    <>
      {/* modals */}
      {recordModal && (
        <RecordModal
          record={recordModal.record}
          prefill={recordModal.prefill}
          onClose={() => setRecordModal(null)}
          onSaved={onSaved}
          token={token!}
        />
      )}
      {showConfig && (
        <ConfigModal configs={configs} onClose={() => setShowConfig(false)} onSaved={onSaved} token={token!} />
      )}
      {showCalendar && (
        <CalendarImportMulti teams={teams} month={month} onClose={() => setShowCalendar(false)} onImported={fetchAll} />
      )}

      <div className="space-y-6">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ds-light-text">🗓️ Ritos & Cerimônias</h2>
            <p className="text-ds-muted text-xs mt-0.5">Acompanhamento de realização dos ritos ágeis por time</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* view toggle */}
            <div className="flex rounded-lg border border-ds-border overflow-hidden">
              <button onClick={() => setView('overview')}
                className={`px-3 py-1.5 text-sm font-semibold transition-colors ${view === 'overview' ? 'bg-ds-green text-ds-dark-blue' : 'text-ds-text hover:text-ds-light-text'}`}>
                📊 Visão Geral
              </button>
              <button onClick={() => setView('weekly')}
                className={`px-3 py-1.5 text-sm font-semibold transition-colors border-l border-ds-border ${view === 'weekly' ? 'bg-ds-green text-ds-dark-blue' : 'text-ds-text hover:text-ds-light-text'}`}>
                📋 Por Time/Semana
              </button>
            </div>
            {/* action buttons */}
            <button onClick={() => setShowCalendar(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition-colors">
              📅 Importar Calendário
            </button>
            {isAdmin && (
              <button onClick={() => setShowConfig(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-ds-navy border border-ds-border text-ds-text rounded-lg hover:border-ds-green hover:text-ds-light-text transition-colors">
                ⚙️ Configurar Ritos
              </button>
            )}
          </div>
        </div>

        {/* ── VISÃO GERAL ──────────────────────────────────────────────────── */}
        {view === 'overview' && (
          <div className="space-y-5">
            {/* filters */}
            <div className="bg-ds-navy rounded-xl border border-ds-border p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="text-ds-text text-xs">De</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green" />
                </div>
                <div className="space-y-1">
                  <label className="text-ds-text text-xs">Até</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green" />
                </div>
                <div className="space-y-1">
                  <label className="text-ds-text text-xs">Time</label>
                  <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
                    className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green">
                    <option value="">Todos os times</option>
                    {teams.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-ds-text text-xs">Cerimônia</label>
                  <select value={filterRitual} onChange={e => setFilterRitual(e.target.value)}
                    className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green">
                    <option value="">Todos os tipos</option>
                    {overviewData && [...new Set(overviewData.byRitual.map(r => r.ritual_type))].map(rt => (
                      <option key={rt} value={rt}>{rt}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-ds-text text-xs">Status</label>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green">
                    <option value="">Todos</option>
                    <option value="done">✅ Realizado</option>
                    <option value="rescheduled">🔄 Remarcado</option>
                    <option value="cancelled">❌ Cancelado</option>
                    <option value="pending">⏳ Pendente</option>
                  </select>
                </div>
                <button onClick={fetchOverview} disabled={overviewLoading}
                  className="px-4 py-2 bg-ds-green text-ds-dark-blue text-sm font-bold rounded-lg hover:bg-ds-green/80 disabled:opacity-50 transition-colors">
                  {overviewLoading ? '⏳' : '🔍 Filtrar'}
                </button>
              </div>
            </div>

            {overviewLoading && (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-ds-green" />
              </div>
            )}

            {!overviewLoading && overviewData && (
              <>
                {/* summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-ds-border bg-ds-navy p-4 text-center">
                    <p className="text-ds-muted text-xs uppercase tracking-wide mb-1">Total</p>
                    <p className="text-3xl font-black text-ds-light-text">{overviewData.summary.total}</p>
                    <p className="text-ds-muted text-xs mt-1">registros</p>
                  </div>
                  <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 text-center">
                    <p className="text-green-400 text-xs uppercase tracking-wide mb-1">✅ Realizados</p>
                    <p className="text-3xl font-black text-green-400">{overviewData.summary.done}</p>
                    <p className="text-green-400/70 text-xs mt-1">{pct(overviewData.summary.done, overviewData.summary.total)}% do total</p>
                  </div>
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-center">
                    <p className="text-yellow-400 text-xs uppercase tracking-wide mb-1">🔄 Remarcados</p>
                    <p className="text-3xl font-black text-yellow-400">{overviewData.summary.rescheduled}</p>
                    <p className="text-yellow-400/70 text-xs mt-1">{pct(overviewData.summary.rescheduled, overviewData.summary.total)}% do total</p>
                  </div>
                  <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-center">
                    <p className="text-red-400 text-xs uppercase tracking-wide mb-1">❌ Cancelados</p>
                    <p className="text-3xl font-black text-red-400">{overviewData.summary.cancelled}</p>
                    <p className="text-red-400/70 text-xs mt-1">{pct(overviewData.summary.cancelled, overviewData.summary.total)}% do total</p>
                  </div>
                </div>

                {/* rankings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* by team */}
                  <div className="bg-ds-navy rounded-xl border border-ds-border overflow-hidden">
                    <div className="px-4 py-3 border-b border-ds-border">
                      <span className="text-ds-light-text font-bold text-sm">👥 Por Time</span>
                    </div>
                    <div className="divide-y divide-ds-border/40">
                      {overviewData.byTeam.map(t => (
                        <div key={t.team} className="px-4 py-2.5 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <button onClick={() => { setFilterTeam(t.team); setOverviewPage(0); fetchOverview(); }}
                              className="text-ds-light-text text-sm font-medium hover:text-ds-green transition-colors text-left">
                              {t.team}
                            </button>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-green-400">{t.done}</span>
                              <span className="text-yellow-400">{t.rescheduled}</span>
                              <span className="text-red-400">{t.cancelled}</span>
                              <span className="text-ds-muted">/{t.total}</span>
                            </div>
                          </div>
                          <MiniPctBar value={pct(t.done, t.total)} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* by ritual */}
                  <div className="bg-ds-navy rounded-xl border border-ds-border overflow-hidden">
                    <div className="px-4 py-3 border-b border-ds-border">
                      <span className="text-ds-light-text font-bold text-sm">🎯 Por Cerimônia</span>
                    </div>
                    <div className="divide-y divide-ds-border/40">
                      {overviewData.byRitual.map(r => (
                        <div key={r.ritual_type} className="px-4 py-2.5 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <button onClick={() => { setFilterRitual(r.ritual_type); setOverviewPage(0); fetchOverview(); }}
                              className="text-ds-light-text text-sm font-medium hover:text-ds-green transition-colors text-left">
                              {r.ritual_type}
                            </button>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-green-400">{r.done}</span>
                              <span className="text-yellow-400">{r.rescheduled}</span>
                              <span className="text-red-400">{r.cancelled}</span>
                              <span className="text-ds-muted">/{r.total}</span>
                            </div>
                          </div>
                          <MiniPctBar value={pct(r.done, r.total)} />
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2 border-t border-ds-border flex gap-4 text-xs text-ds-muted">
                      <span className="text-green-400">✅ realizados</span>
                      <span className="text-yellow-400">🔄 remarcados</span>
                      <span className="text-red-400">❌ cancelados</span>
                      <span>/total</span>
                    </div>
                  </div>
                </div>

                {/* records list */}
                <div className="bg-ds-navy rounded-xl border border-ds-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-ds-border flex items-center justify-between">
                    <span className="text-ds-light-text font-bold text-sm">
                      📋 Todas as Ocorrências
                      <span className="ml-2 text-ds-muted text-xs font-normal">({overviewData.records.length} registros)</span>
                    </span>
                    {overviewData.records.length > OVERVIEW_PAGE_SIZE && (
                      <div className="flex items-center gap-2 text-xs text-ds-muted">
                        <button onClick={() => setOverviewPage(p => Math.max(0, p - 1))} disabled={overviewPage === 0}
                          className="px-2 py-1 border border-ds-border rounded disabled:opacity-40 hover:border-ds-green hover:text-ds-green transition-colors">
                          ‹
                        </button>
                        <span>{overviewPage + 1}/{Math.ceil(overviewData.records.length / OVERVIEW_PAGE_SIZE)}</span>
                        <button onClick={() => setOverviewPage(p => Math.min(Math.ceil(overviewData.records.length / OVERVIEW_PAGE_SIZE) - 1, p + 1))}
                          disabled={(overviewPage + 1) * OVERVIEW_PAGE_SIZE >= overviewData.records.length}
                          className="px-2 py-1 border border-ds-border rounded disabled:opacity-40 hover:border-ds-green hover:text-ds-green transition-colors">
                          ›
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-ds-border text-ds-muted text-xs">
                          <th className="text-left px-4 py-2 font-semibold">Data</th>
                          <th className="text-left px-4 py-2 font-semibold">Time</th>
                          <th className="text-left px-4 py-2 font-semibold">Cerimônia</th>
                          <th className="text-left px-4 py-2 font-semibold">Status</th>
                          <th className="text-left px-4 py-2 font-semibold">Observação / Motivo</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {overviewData.records
                          .slice(overviewPage * OVERVIEW_PAGE_SIZE, (overviewPage + 1) * OVERVIEW_PAGE_SIZE)
                          .map((r, i) => {
                            const dateObj = new Date(r.scheduled_date);
                            const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
                            return (
                              <tr key={r.id} className={`border-b border-ds-border/40 hover:bg-ds-dark-blue/40 transition-colors ${i % 2 === 0 ? '' : 'bg-ds-dark-blue/20'}`}>
                                <td className="px-4 py-2.5 text-ds-text whitespace-nowrap">{dateStr}</td>
                                <td className="px-4 py-2.5 text-ds-light-text font-medium">{r.team}</td>
                                <td className="px-4 py-2.5 text-ds-text">{r.ritual_type}</td>
                                <td className="px-4 py-2.5">
                                  <StatusBadge status={r.status} />
                                </td>
                                <td className="px-4 py-2.5 text-ds-muted text-xs max-w-xs truncate">
                                  {r.reason || r.notes || <span className="text-ds-border/50 italic">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <button onClick={() => setRecordModal({ record: r, prefill: null })}
                                    className="text-ds-muted hover:text-ds-green transition-colors text-xs px-2 py-1 border border-ds-border/50 rounded hover:border-ds-green">
                                    ✏️ Editar
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {!overviewLoading && !overviewData && (
              <div className="text-center py-16 text-ds-muted">Clique em Filtrar para carregar os dados</div>
            )}
          </div>
        )}

        {/* ── POR TIME/SEMANA ──────────────────────────────────────────────── */}
        {view === 'weekly' && (
          <div className="space-y-6">
            {/* controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-ds-text text-sm font-semibold">👥 Time:</label>
                {teams.length > 0 ? (
                  <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}
                    className="bg-ds-navy border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green">
                    {teams.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <span className="text-ds-muted text-sm">Nenhum time</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-ds-text text-sm font-semibold">📅 Mês:</label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                  className="bg-ds-navy border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green" />
              </div>
            </div>

        {/* no config state */}
        {teams.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <div className="text-5xl">🗓️</div>
            <h3 className="text-ds-light-text font-semibold text-lg">Nenhum rito configurado</h3>
            <p className="text-ds-muted text-sm max-w-md">Configure os ritos de cada time para começar o acompanhamento. Clique em "Configurar Ritos" para adicionar times e seus ritos.</p>
            {isAdmin && (
              <button onClick={() => setShowConfig(true)}
                className="px-5 py-2.5 bg-ds-green text-ds-dark-blue font-bold rounded-lg hover:bg-ds-green/80 transition-colors">
                ⚙️ Configurar Ritos
              </button>
            )}
          </div>
        )}

        {selectedTeam && teamRituals.length > 0 && (
          <>
            {/* summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* overall */}
              <div className={`col-span-2 md:col-span-1 rounded-xl border p-4 space-y-2 ${overallPct >= 80 ? 'border-green-500/30 bg-green-500/5' : overallPct >= 60 ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                <p className="text-ds-text text-xs font-semibold uppercase tracking-wide">% Geral do mês</p>
                <p className={`text-4xl font-black ${overallPct >= 80 ? 'text-green-400' : overallPct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{overallPct}%</p>
                <p className="text-ds-muted text-xs capitalize">{monthLabel}</p>
              </div>
              {/* per ritual */}
              {ritualStats.map(s => (
                <div key={s.rt} className="rounded-xl border border-ds-border bg-ds-navy p-4 space-y-2">
                  <p className="text-ds-text text-xs font-semibold truncate">{s.rt}</p>
                  <p className={`text-3xl font-black ${s.pct >= 80 ? 'text-green-400' : s.pct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{s.pct}%</p>
                  <p className="text-ds-muted text-xs">{s.done}/{s.total} realizados</p>
                </div>
              ))}
            </div>

            {/* weekly table */}
            <div className="bg-ds-navy rounded-xl border border-ds-border overflow-hidden">
              <div className="px-4 py-3 border-b border-ds-border flex items-center justify-between">
                <span className="text-ds-light-text font-bold text-sm">📋 Registro Semanal — {monthLabel}</span>
                <span className="text-ds-muted text-xs">{selectedTeam}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ds-border text-ds-text text-xs">
                      <th className="text-left px-4 py-3 font-semibold w-48">Rito</th>
                      {weeks.map((w, i) => (
                        <th key={i} className="text-center px-3 py-3 font-semibold whitespace-nowrap">{w.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {teamRituals.map((rt, ri) => {
                      const cfg = configs.find(c => c.ritual_type === rt);
                      return (
                        <tr key={rt} className={`border-b border-ds-border/50 ${ri % 2 === 0 ? 'bg-ds-navy/50' : 'bg-ds-dark-blue/30'}`}>
                          <td className="px-4 py-3">
                            <div className="text-ds-light-text font-medium">{rt}</div>
                            {cfg && <div className="text-ds-muted text-xs mt-0.5">{FREQ_LABEL[cfg.frequency]}</div>}
                          </td>
                          {weeks.map((w, wi) => {
                            const key = `${rt}__${wi}`;
                            const recs = recordsMap[key] || [];
                            const isCurrentWeek = w.start <= now && now <= w.end;
                            const weekInMonth = w.start <= new Date(yr, mo, 0) && w.end >= new Date(yr, mo - 1, 1);

                            // for biweekly, only show odd weeks; for monthly, only last week
                            const showCell = cfg?.frequency === 'weekly' ? true
                              : cfg?.frequency === 'biweekly' ? wi % 2 === 0
                              : wi === weeks.length - 1;

                            if (!showCell || !weekInMonth) {
                              return <td key={wi} className="px-3 py-3 text-center"><span className="text-ds-border/50 text-xs">—</span></td>;
                            }

                            return (
                              <td key={wi} className={`px-3 py-3 text-center ${isCurrentWeek ? 'bg-ds-green/5' : ''}`}>
                                {recs.length > 0 ? (
                                  <div className="flex flex-col gap-1 items-center">
                                    {recs.map(r => (
                                      <StatusBadge key={r.id} status={r.status} onClick={() => setRecordModal({ record: r, prefill: null })} />
                                    ))}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => openCellModal(rt, w, [])}
                                    className="text-ds-border hover:text-ds-green transition-colors text-lg leading-none" title="Registrar ocorrência">
                                    +
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-ds-border flex items-center gap-4 flex-wrap">
                {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([s, cfg]) => (
                  <span key={s} className="flex items-center gap-1 text-xs text-ds-muted">{cfg.icon} {cfg.label}</span>
                ))}
                <span className="text-ds-muted text-xs ml-auto">Clique em + para registrar · Clique no badge para editar</span>
              </div>
            </div>

            {/* history */}
            {historyMonths.length > 0 && (
              <div className="bg-ds-navy rounded-xl border border-ds-border p-4 space-y-4">
                <h3 className="text-ds-light-text font-bold text-sm">📊 Histórico — últimos 2 meses</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {historyMonths.map(hm => {
                    const [hyr, hmo] = hm.split('-').map(Number);
                    const hLabel = new Date(hyr, hmo - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                    const hmRecords = historyRecords[hm] || [];
                    const hmDone  = hmRecords.filter(r => r.status === 'done').length;
                    const hmTotal = hmRecords.filter(r => r.status !== 'pending').length;
                    return (
                      <div key={hm} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-ds-text text-sm font-semibold capitalize">{hLabel}</span>
                          <span className={`text-sm font-bold ${pct(hmDone, hmTotal) >= 80 ? 'text-green-400' : pct(hmDone, hmTotal) >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{pct(hmDone, hmTotal)}%</span>
                        </div>
                        <PctBar value={pct(hmDone, hmTotal)} />
                        <div className="space-y-2">
                          {teamRituals.map(rt => {
                            const recs = hmRecords.filter(r => r.ritual_type === rt);
                            const done  = recs.filter(r => r.status === 'done').length;
                            const total = recs.filter(r => r.status !== 'pending').length;
                            return <PctBar key={rt} value={pct(done, total)} label={rt} />;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
          </div>
        )}
      </div>
    </>
  );
};

export default CeremoniesDashboard;
