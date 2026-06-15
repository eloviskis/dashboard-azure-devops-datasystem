import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API = import.meta.env.VITE_API_URL || 'https://dsmetrics.online';

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
  const { token, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'ics' | 'oauth' | 'api'>('ics');
  
  // ICS upload
  const [file, setFile] = useState<File | null>(null);
  const [icsEvents, setIcsEvents] = useState<CalendarEvent[]>([]);
  const [icsLoading, setIcsLoading] = useState(false);
  
  // OAuth
  const [oauthToken, setOauthToken] = useState<string | null>(null);
  const [oauthEvents, setOauthEvents] = useState<CalendarEvent[]>([]);
  const [oauthLoading, setOauthLoading] = useState(false);
  
  // API admin
  const [apiEvents, setApiEvents] = useState<CalendarEvent[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  
  // Shared
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mapping, setMapping] = useState<Record<string, { team: string; ritual_type: string }>>({});
  const [importing, setImporting] = useState(false);
  
  const rituals = ['Daily', 'Refinamento', 'Review', 'Retrospectiva', 'Planning'];
  
  // Check OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('graph_token');
    if (token) {
      setOauthToken(token);
      setActiveTab('oauth');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setIcsLoading(true);
    
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
      console.log('📅 Eventos parseados:', data.events);
      setIcsEvents(data.events.map((e: any, i: number) => ({ ...e, id: `ics-${i}` })));
    } catch (err: any) {
      alert('Erro ao processar arquivo: ' + err.message);
    } finally {
      setIcsLoading(false);
    }
  };
  
  const handleOAuthLogin = async () => {
    try {
      const res = await fetch(`${API}/api/ceremonies/auth/microsoft`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.location.href = data.authUrl;
    } catch (err: any) {
      alert('Erro ao iniciar login: ' + err.message);
    }
  };
  
  const fetchOAuthEvents = async () => {
    if (!oauthToken) return;
    setOauthLoading(true);
    
    try {
      const res = await fetch(`${API}/api/ceremonies/calendar-preview-oauth?month=${month}&token=${oauthToken}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setOauthEvents(await res.json());
    } catch (err: any) {
      alert('Erro ao buscar eventos: ' + err.message);
    } finally {
      setOauthLoading(false);
    }
  };
  
  const fetchApiEvents = async () => {
    setApiLoading(true);
    setApiError('');
    
    try {
      const res = await fetch(`${API}/api/ceremonies/calendar-preview?month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 503) {
          setApiError('Integração não configurada. Defina GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_TENANT_ID e GRAPH_USER_EMAIL no .env do backend.');
        } else {
          throw new Error(text);
        }
        return;
      }
      setApiEvents(await res.json());
    } catch (err: any) {
      setApiError(err.message);
    } finally {
      setApiLoading(false);
    }
  };
  
  useEffect(() => {
    if (activeTab === 'oauth' && oauthToken && oauthEvents.length === 0) {
      fetchOAuthEvents();
    }
    if (activeTab === 'api' && apiEvents.length === 0 && !apiError) {
      fetchApiEvents();
    }
  }, [activeTab, oauthToken]);
  
  const currentEvents = activeTab === 'ics' ? icsEvents : activeTab === 'oauth' ? oauthEvents : apiEvents;
  const currentLoading = activeTab === 'ics' ? icsLoading : activeTab === 'oauth' ? oauthLoading : apiLoading;
  
  const toggleSelect = (id: string) => {
    setSelected(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  
  const handleImport = async () => {
    const eventsToImport = currentEvents.filter(e => selected.has(e.id)).map(e => ({
      team: mapping[e.id]?.team || '',
      ritual_type: mapping[e.id]?.ritual_type || '',
      date: e.date,
      title: e.title,
    }));
    
    const invalid = eventsToImport.filter(e => !e.team || !e.ritual_type);
    if (invalid.length > 0) {
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
      <div className="bg-ds-dark-blue border border-ds-border rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ds-border">
          <h3 className="text-ds-light-text font-bold">📅 Importar do Calendário</h3>
          <button onClick={onClose} className="text-ds-muted hover:text-white text-xl">&times;</button>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-ds-border">
          <button onClick={() => setActiveTab('ics')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'ics' ? 'text-ds-green border-b-2 border-ds-green bg-ds-green/5' : 'text-ds-muted hover:text-ds-text'}`}>
            📁 Upload .ics
          </button>
          <button onClick={() => setActiveTab('oauth')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'oauth' ? 'text-ds-green border-b-2 border-ds-green bg-ds-green/5' : 'text-ds-muted hover:text-ds-text'}`}>
            🔐 Microsoft Login
          </button>
          {isAdmin && (
            <button onClick={() => setActiveTab('api')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'api' ? 'text-ds-green border-b-2 border-ds-green bg-ds-green/5' : 'text-ds-muted hover:text-ds-text'}`}>
              🔧 API Admin
            </button>
          )}
        </div>
        
        <div className="p-5 flex-1 overflow-y-auto">
          {activeTab === 'ics' && icsEvents.length === 0 && (
            <div>
              <p className="text-ds-text text-sm mb-3">Faça upload de um arquivo .ics exportado do Outlook/Teams:</p>
              <input type="file" accept=".ics" onChange={handleFileChange}
                className="block w-full text-sm text-ds-text file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-ds-green file:text-ds-dark-blue hover:file:bg-ds-green/80 cursor-pointer" />
              {icsLoading && <p className="text-ds-muted text-sm mt-4 text-center">Processando arquivo...</p>}
              {!icsLoading && file && icsEvents.length === 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-yellow-400 text-sm mt-4">
                  <p className="font-semibold">⚠️ Nenhum evento encontrado no arquivo</p>
                  <p className="mt-1 text-xs">Certifique-se de que o arquivo .ics contém eventos válidos.</p>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'oauth' && (
            <div>
              {!oauthToken ? (
                <div className="text-center py-8">
                  <p className="text-ds-text text-sm mb-4">Conecte-se com sua conta Microsoft para acessar seu calendário:</p>
                  <button onClick={handleOAuthLogin}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"/></svg>
                    Entrar com Microsoft
                  </button>
                </div>
              ) : (
                <>
                  {oauthLoading && <p className="text-ds-muted text-sm text-center py-8">Buscando eventos...</p>}
                  {!oauthLoading && oauthEvents.length === 0 && <p className="text-ds-muted text-sm text-center py-8">Nenhum evento encontrado neste mês.</p>}
                </>
              )}
            </div>
          )}
          
          {activeTab === 'api' && (
            <div>
              {apiLoading && <p className="text-ds-muted text-sm text-center py-8">Buscando eventos...</p>}
              {apiError && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-yellow-400 text-sm">
                  <p className="font-semibold">⚠️ Integração não disponível</p>
                  <p className="mt-1 text-xs">{apiError}</p>
                </div>
              )}
              {!apiLoading && !apiError && apiEvents.length === 0 && <p className="text-ds-muted text-sm text-center py-8">Nenhum evento encontrado neste mês.</p>}
            </div>
          )}
          
          {/* Event list */}
          {!currentLoading && currentEvents.length > 0 && (
            <>
              <div className="bg-ds-green/10 border border-ds-green/30 rounded-lg p-4 mb-4">
                <h4 className="text-ds-green font-semibold text-sm mb-1">✅ {currentEvents.length} evento(s) encontrado(s)!</h4>
                <p className="text-ds-text text-xs">Marque os eventos que deseja importar e escolha o time e tipo de rito para cada um:</p>
              </div>
              <div className="space-y-2">
              {currentEvents.map(ev => (
                <div key={ev.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${selected.has(ev.id) ? 'border-ds-green bg-ds-green/5' : 'border-ds-border bg-ds-navy'}`}>
                  <input type="checkbox" checked={selected.has(ev.id)} onChange={() => toggleSelect(ev.id)}
                    className="mt-0.5 h-4 w-4 accent-ds-green shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-ds-light-text text-sm font-medium truncate">{ev.title}</span>
                      {ev.isTeams && <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded shrink-0">Teams</span>}
                    </div>
                    <div className="text-ds-muted text-xs mt-0.5">{ev.date} {ev.time && `· ${ev.time}`} {ev.organizer && `· ${ev.organizer}`}</div>
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
        
        {!currentLoading && selected.size > 0 && (
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
