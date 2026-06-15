import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

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
    try {
      await fetch(`${API}/api/ceremonies/records/${record.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      onSaved();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
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

// ─── calendar import modal ────────────────────────────────────────────────────
const CalendarImportModal: React.FC<{
  month: string;
  configs: CeremonyConfig[];
  onClose: () => void;
  onImported: () => void;
  token: string;
}> = ({ month, configs, onClose, onImported, token }) => {
  const [events, setEvents]     = useState<CalendarEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mapping, setMapping]   = useState<Record<string, { team: string; ritual_type: string }>>({});
  const [importing, setImporting] = useState(false);

  const teams = useMemo(() => [...new Set(configs.map(c => c.team))].sort(), [configs]);
  const rituals = useMemo(() => [...new Set(configs.map(c => c.ritual_type))].sort(), [configs]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/ceremonies/calendar-preview?month=${month}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setEvents(data);
        // auto-map by keyword
        const m: Record<string, { team: string; ritual_type: string }> = {};
        data.forEach((ev: CalendarEvent) => {
          const lower = ev.title.toLowerCase();
          const rt = rituals.find(r => lower.includes(r.toLowerCase())) || '';
          m[ev.id] = { team: teams[0] || '', ritual_type: rt };
        });
        setMapping(m);
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [month, token, teams, rituals]);

  const toggleSelect = (id: string) => setSelected(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const handleImport = async () => {
    setImporting(true);
    try {
      const payload = events
        .filter(ev => selected.has(ev.id))
        .map(ev => ({ ...mapping[ev.id], date: ev.date, title: ev.title }))
        .filter(ev => ev.team && ev.ritual_type);
      const res = await fetch(`${API}/api/ceremonies/calendar-import/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ events: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onImported();
    } catch (e: any) { setError(e.message); } finally { setImporting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-ds-dark-blue border border-ds-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ds-border">
          <h3 className="text-ds-light-text font-bold">📅 Importar do Calendário Microsoft</h3>
          <button onClick={onClose} className="text-ds-muted hover:text-white text-xl">&times;</button>
        </div>
        <div className="p-5 flex-1 overflow-y-auto">
          {loading && <p className="text-ds-muted text-sm text-center py-8">Buscando eventos...</p>}
          {error && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-yellow-400 text-sm">
              <p className="font-semibold">⚠️ Integração não disponível</p>
              <p className="mt-1 text-xs">{error}</p>
              <p className="mt-2 text-xs text-ds-text">Para ativar, defina <code className="bg-ds-border/30 px-1 rounded">GRAPH_CLIENT_ID</code>, <code className="bg-ds-border/30 px-1 rounded">GRAPH_CLIENT_SECRET</code>, <code className="bg-ds-border/30 px-1 rounded">GRAPH_TENANT_ID</code> e <code className="bg-ds-border/30 px-1 rounded">GRAPH_USER_EMAIL</code> no <code className="bg-ds-border/30 px-1 rounded">.env</code> do backend.</p>
            </div>
          )}
          {!loading && !error && events.length === 0 && (
            <p className="text-ds-muted text-sm text-center py-8">Nenhum evento relacionado a ritos encontrado neste mês.</p>
          )}
          {!loading && !error && events.length > 0 && (
            <div className="space-y-2">
              <p className="text-ds-text text-xs">{events.length} evento{events.length !== 1 ? 's' : ''} encontrado{events.length !== 1 ? 's' : ''}. Selecione os que deseja importar:</p>
              {events.map(ev => (
                <div key={ev.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${selected.has(ev.id) ? 'border-ds-green bg-ds-green/5' : 'border-ds-border bg-ds-navy'}`}>
                  <input type="checkbox" checked={selected.has(ev.id)} onChange={() => toggleSelect(ev.id)}
                    className="mt-0.5 h-4 w-4 accent-ds-green shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-ds-light-text text-sm font-medium truncate">{ev.title}</span>
                      {ev.isTeams && <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded shrink-0">Teams</span>}
                    </div>
                    <div className="text-ds-muted text-xs mt-0.5">{ev.date} · {ev.time} · {ev.organizer}</div>
                    {selected.has(ev.id) && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <select value={mapping[ev.id]?.team || ''} onChange={e => setMapping(m => ({ ...m, [ev.id]: { ...m[ev.id], team: e.target.value } }))}
                          className="bg-ds-dark-blue border border-ds-border rounded px-2 py-1 text-xs text-ds-light-text focus:outline-none focus:border-ds-green">
                          <option value="">Selecionar time</option>
                          {teams.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select value={mapping[ev.id]?.ritual_type || ''} onChange={e => setMapping(m => ({ ...m, [ev.id]: { ...m[ev.id], ritual_type: e.target.value } }))}
                          className="bg-ds-dark-blue border border-ds-border rounded px-2 py-1 text-xs text-ds-light-text focus:outline-none focus:border-ds-green">
                          <option value="">Selecionar rito</option>
                          {rituals.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {!loading && !error && selected.size > 0 && (
          <div className="px-5 py-4 border-t border-ds-border flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm bg-ds-border/30 text-ds-text rounded-lg">Cancelar</button>
            <button onClick={handleImport} disabled={importing}
              className="px-4 py-2 text-sm bg-ds-green text-ds-dark-blue font-bold rounded-lg hover:bg-ds-green/80 disabled:opacity-50">
              {importing ? 'Importando...' : `Importar ${selected.size} evento${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── main dashboard ───────────────────────────────────────────────────────────
const CeremoniesDashboard: React.FC = () => {
  const { token, isAdmin } = useAuth();

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [teams, setTeams]       = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [month, setMonth]       = useState(defaultMonth);
  const [configs, setConfigs]   = useState<CeremonyConfig[]>([]);
  const [records, setRecords]   = useState<CeremonyRecord[]>([]);
  const [loading, setLoading]   = useState(true);

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
        <CalendarImportModal month={month} configs={configs} onClose={() => setShowCalendar(false)} onImported={onSaved} token={token!} />
      )}

      <div className="space-y-6">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ds-light-text">🗓️ Ritos & Cerimônias</h2>
            <p className="text-ds-muted text-xs mt-0.5">Acompanhamento de realização dos ritos ágeis por time</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* team selector */}
            <div className="flex items-center gap-2">
              <label className="text-ds-text text-sm font-semibold">👥 Time:</label>
              {teams.length > 0 ? (
                <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}
                  className="bg-ds-navy border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green">
                  {teams.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <span className="text-ds-muted text-sm">Nenhum time — configure primeiro ↓</span>
              )}
            </div>
            {/* month selector */}
            <div className="flex items-center gap-2">
              <label className="text-ds-text text-sm font-semibold">📅 Mês:</label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="bg-ds-navy border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green" />
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
    </>
  );
};

export default CeremoniesDashboard;
