import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API = import.meta.env.VITE_API_URL || '';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string | null;
  isTeams?: boolean;
  organizer?: string;
}

interface CalendarImportMultiProps {
  teams: string[];
  month: string;
  onClose: () => void;
  onImported: () => void;
}

const CalendarImportMulti: React.FC<CalendarImportMultiProps> = ({ teams, month, onClose, onImported }) => {
  const { token } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [icsUrl, setIcsUrl] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mapping, setMapping] = useState<Record<string, { team: string; ritual_type: string }>>({});
  const [importing, setImporting] = useState(false);

  const rituals = ['Daily', 'Refinamento', 'Review', 'Retrospectiva', 'Planning'];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setEvents([]);
    setSelected(new Set());
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', f);
      const res = await fetch(`${API}/api/ceremonies/calendar-import/ics`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEvents(data.events.map((e: any, i: number) => ({ ...e, id: `ics-${i}` })));
    } catch (err: any) {
      alert('Erro ao processar arquivo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUrlFetch = async () => {
    if (!icsUrl.trim()) { alert('Cole a URL do calendÃ¡rio'); return; }
    setEvents([]);
    setSelected(new Set());
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/ceremonies/calendar-import/url`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: icsUrl }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEvents(data.events.map((e: any, i: number) => ({ ...e, id: `url-${i}` })));
    } catch (err: any) {
      alert('Erro ao buscar calendÃ¡rio: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const handleImport = async () => {
    const eventsToImport = events.filter(e => selected.has(e.id)).map(e => ({
      team: mapping[e.id]?.team || '',
      ritual_type: mapping[e.id]?.ritual_type || '',
      date: e.date,
      title: e.title,
    }));
    if (eventsToImport.some(e => !e.team || !e.ritual_type)) {
      alert('Selecione time e rito para todos os eventos marcados');
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(`${API}/api/ceremonies/calendar-import/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: eventsToImport }),
      });
      if (!res.ok) throw new Error(await res.text());
      alert(`${eventsToImport.length} evento(s) importado(s)!`);
      onImported();
      onClose();
    } catch (err: any) {
      alert('Erro ao importar: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-ds-dark-blue border border-ds-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ds-border">
          <h3 className="text-ds-light-text font-bold">ðŸ“… Importar do CalendÃ¡rio</h3>
          <button onClick={onClose} className="text-ds-muted hover:text-white text-xl">&times;</button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          {events.length === 0 && (
            <div className="space-y-4">
              {/* Upload arquivo */}
              <div>
                <label className="text-ds-text text-xs font-semibold block mb-2">ðŸ“ Fazer upload de arquivo .ics</label>
                <input type="file" accept=".ics" onChange={handleFileChange}
                  className="block w-full text-sm text-ds-text file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-ds-green file:text-ds-dark-blue hover:file:bg-ds-green/80 cursor-pointer" />
                <p className="text-ds-muted text-xs mt-1">Outlook: Arquivo â†’ Salvar calendÃ¡rio â†’ .ics</p>
              </div>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-ds-border" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-ds-dark-blue px-2 text-ds-muted uppercase">ou</span></div>
              </div>

              {/* URL compartilhada */}
              <div>
                <label className="text-ds-text text-xs font-semibold block mb-2">ðŸ”— Link do calendÃ¡rio compartilhado (Outlook/Exchange)</label>
                <div className="flex gap-2">
                  <input type="url" value={icsUrl} onChange={e => setIcsUrl(e.target.value)}
                    placeholder="https://outlook.office365.com/owa/calendar/..."
                    className="flex-1 bg-ds-navy border border-ds-border rounded px-3 py-2 text-sm text-ds-light-text focus:outline-none focus:border-ds-green" />
                  <button onClick={handleUrlFetch} disabled={loading || !icsUrl.trim()}
                    className="px-4 py-2 bg-ds-green text-ds-dark-blue text-sm font-semibold rounded hover:bg-ds-green/80 disabled:opacity-50">
                    {loading ? '...' : 'Buscar'}
                  </button>
                </div>
                <p className="text-ds-muted text-xs mt-1">ðŸ’¡ Outlook â†’ ConfiguraÃ§Ãµes â†’ CalendÃ¡rio â†’ CalendÃ¡rios compartilhados â†’ Publicar â†’ Copiar link ICS</p>
              </div>

              {loading && <p className="text-ds-muted text-sm text-center py-4">Processando arquivo...</p>}

              {!loading && (file || icsUrl) && events.length === 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-400 text-sm">
                  <p className="font-semibold">âš ï¸ Nenhum evento de cerimÃ´nia encontrado</p>
                  <p className="text-xs mt-1">Buscando por: refinamento, review, retrospectiva, daily, planning, apresentaÃ§Ã£o, resultado (01/06/2025 atÃ© hoje)</p>
                </div>
              )}
            </div>
          )}

          {/* Lista de eventos */}
          {events.length > 0 && (
            <>
              <div className="bg-ds-green/10 border border-ds-green/30 rounded-lg p-3 mb-4 flex items-center justify-between">
                <div>
                  <span className="text-ds-green font-semibold text-sm">âœ… {events.length} evento(s) encontrado(s)</span>
                  <p className="text-ds-text text-xs mt-0.5">Marque os que deseja importar e escolha time e rito:</p>
                </div>
                <button onClick={() => { setEvents([]); setFile(null); setIcsUrl(''); setSelected(new Set()); }}
                  className="text-xs text-ds-text hover:text-ds-light-text border border-ds-border rounded px-2 py-1">â† Voltar</button>
              </div>
              <div className="space-y-2">
                {events.map(ev => (
                  <div key={ev.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${selected.has(ev.id) ? 'border-ds-green bg-ds-green/5' : 'border-ds-border bg-ds-navy'}`}>
                    <input type="checkbox" checked={selected.has(ev.id)} onChange={() => toggleSelect(ev.id)}
                      className="mt-0.5 h-4 w-4 accent-ds-green shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-ds-light-text text-sm font-medium truncate block">{ev.title}</span>
                      <span className="text-ds-muted text-xs">{ev.date}{ev.time ? ` Â· ${ev.time}` : ''}{ev.organizer ? ` Â· ${ev.organizer}` : ''}</span>
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
            </>
          )}
        </div>

        {selected.size > 0 && (
          <div className="px-5 py-4 border-t border-ds-border flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm bg-ds-border/30 text-ds-text rounded-lg">Cancelar</button>
            <button onClick={handleImport} disabled={importing}
              className="px-4 py-2 text-sm bg-ds-green text-ds-dark-blue font-bold rounded-lg hover:bg-ds-green/80 disabled:opacity-50">
              {importing ? 'Importando...' : `Importar ${selected.size} evento(s)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CalendarImportMulti;
