// Retrô ao vivo: o quadro (cards, votos, comentários, grupos, cronômetro, imagens e GIFs). O participante usa na
// página pública /retro/<token> (RetroBoardPage); o facilitador usa dentro da aba Retrô, com a barra de controles
// (prop toolbar). Cards ocultos e anonimato já chegam resolvidos do servidor: a tela só mostra o que recebeu.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { boardApi, boardCred, boardImg } from './retroApi.ts';
import type { BoardApi, BoardCard, BoardError, BoardState, Gif } from './retroApi.ts';
import { Btn, Input, NOTE_COLORS, NOTE_INK, Select, TextArea, fmtDate, useToast } from './retroUi.tsx';

// ponytail: polling a cada 2 s com número de versão (resposta curta quando nada mudou). Se o atraso incomodar, o
// caminho é SSE (o Nginx já repassa os cabeçalhos de Upgrade).
const POLL_MS = 2000;
const MAX_MB = 5;
const MAX_IMAGES = 4;
const IMG_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const INK_SOFT = `${NOTE_INK}55`;

type Toast = (text: string, error?: boolean) => void;
type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;

async function uploadImage(api: BoardApi, file: File) {
  if (!IMG_TYPES.includes(file.type)) throw new Error('Use imagem PNG, JPG, GIF ou WEBP');
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`Imagem maior que ${MAX_MB} MB`);
  return (await api.upload(file)).src;
}

// ---------------------------------------------------------------- GIFs (GIPHY, pelo backend)
const GifPicker: React.FC<{ api: BoardApi; toast: Toast; onPick: (src: string) => void; onClose: () => void }> = ({ api, toast, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Gif[] | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try { setList(await api.gifs(q.trim())); } catch (err) { toast((err as Error).message, true); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 rounded-lg border border-ds-border bg-ds-dark-blue p-2 space-y-2">
      <form onSubmit={search} className="flex gap-1">
        <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar GIF…" aria-label="Buscar GIF" maxLength={50} />
        <Btn type="submit" disabled={busy}>{busy ? '…' : 'Buscar'}</Btn>
        <Btn onClick={onClose} aria-label="Fechar busca de GIF">✕</Btn>
      </form>
      {list && (list.length ? (
        <div className="grid grid-cols-3 gap-1 max-h-48 overflow-y-auto">
          {list.map(g => (
            <button key={g.src} type="button" onClick={() => onPick(g.src)} className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-green">
              <img src={g.preview} alt={g.title || 'GIF'} loading="lazy" className="w-full h-16 object-cover rounded" />
            </button>
          ))}
        </div>
      ) : <p className="text-xs text-ds-text">Nenhum GIF encontrado.</p>)}
      <p className="text-[10px] text-ds-text">GIFs da GIPHY</p>
    </div>
  );
};

// ---------------------------------------------------------------- escrever / editar card
const Composer: React.FC<{
  api: BoardApi; gifs: boolean; toast: Toast; label: string; submitLabel: string;
  initial?: { text: string; images: string[] }; onSubmit: (text: string, images: string[]) => Promise<void>; onCancel?: () => void;
}> = ({ api, gifs, toast, label, submitLabel, initial, onSubmit, onCancel }) => {
  const [text, setText] = useState(initial?.text || '');
  const [images, setImages] = useState<string[]>(initial?.images || []);
  const [uploading, setUploading] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const full = images.length >= MAX_IMAGES;

  const addFiles = async (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith('image/')).slice(0, MAX_IMAGES - images.length);
    if (!imgs.length) return;
    setUploading(true);
    try { for (const f of imgs) { const src = await uploadImage(api, f); setImages(l => [...l, src].slice(0, MAX_IMAGES)); } }
    catch (e) { toast((e as Error).message, true); } finally { setUploading(false); }
  };
  const submit = async () => {
    if (!text.trim() && !images.length) return;
    setBusy(true);
    try {
      await onSubmit(text.trim(), images);
      if (!initial) { setText(''); setImages([]); setGifOpen(false); }
    } catch (e) { toast((e as Error).message, true); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2"
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); e.stopPropagation(); addFiles(Array.from(e.dataTransfer.files)); } }}>
      <TextArea value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={2} aria-label={label}
        placeholder="Escreva um card… (Ctrl+Enter envia; cole ou arraste uma imagem)"
        onPaste={e => { const f = Array.from(e.clipboardData.files); if (f.length) { e.preventDefault(); addFiles(f); } }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }} />
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {images.map(src => (
            <span key={src} className="relative">
              <img src={boardImg(src)} alt="Imagem anexada" className="h-14 rounded" />
              <button type="button" onClick={() => setImages(l => l.filter(x => x !== src))} aria-label="Remover imagem"
                className="absolute -top-1.5 -right-1.5 bg-ds-dark-blue text-ds-light-text border border-ds-border rounded-full w-5 h-5 text-xs leading-none">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <input ref={fileRef} type="file" accept={IMG_TYPES.join(',')} multiple className="sr-only" tabIndex={-1} aria-hidden
          onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <Btn onClick={() => fileRef.current?.click()} disabled={uploading || full} title={`PNG, JPG, GIF ou WEBP até ${MAX_MB} MB`}>🖼️ Imagem</Btn>
        {gifs && <Btn onClick={() => setGifOpen(o => !o)} disabled={full} aria-expanded={gifOpen}>GIF</Btn>}
        {uploading && <span className="text-[11px] text-ds-text" role="status">Enviando imagem…</span>}
        <span className="flex-1" />
        {onCancel && <Btn onClick={onCancel}>Cancelar</Btn>}
        <Btn variant="primary" disabled={busy || uploading || (!text.trim() && !images.length)} onClick={submit}>{submitLabel}</Btn>
      </div>
      {gifOpen && <GifPicker api={api} toast={toast} onClose={() => setGifOpen(false)}
        onPick={src => { setImages(l => [...l, src].slice(0, MAX_IMAGES)); setGifOpen(false); }} />}
    </div>
  );
};

// ---------------------------------------------------------------- cronômetro (servidor guarda só o fim)
const Timer: React.FC<{ endsAt: string | null; offset: number }> = ({ endsAt, offset }) => {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now() + offset);
    const t = setInterval(() => setNow(Date.now() + offset), 500);
    return () => clearInterval(t);
  }, [endsAt, offset]);
  if (!endsAt) return null;
  const left = Math.max(0, Math.round((Date.parse(endsAt) - now) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const cls = !left ? 'border-red-400/60 text-red-300 animate-pulse' : left <= 30 ? 'border-amber-300/60 text-amber-300' : 'border-ds-border text-ds-light-text';
  return (
    <span role="timer" aria-label={left ? `Faltam ${mm} minutos e ${ss} segundos` : 'Tempo esgotado'}
      className={`font-mono text-sm px-2 py-1 rounded-lg border ${cls}`}>⏱ {left ? `${mm}:${ss}` : 'Tempo esgotado'}</span>
  );
};

// ---------------------------------------------------------------- card
const chip = 'text-[11px] px-2 py-0.5 rounded-full border disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-dark-blue';

const CardView: React.FC<{
  card: BoardCard; color: string; state: BoardState; api: BoardApi; run: Run; toast: Toast;
  others: { id: number; label: string }[]; dragId: React.MutableRefObject<number | null>;
}> = ({ card, color, state, api, run, toast, others, dragId }) => {
  const [editing, setEditing] = useState<number | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState('');
  const [grouping, setGrouping] = useState(false);
  const [over, setOver] = useState(false);

  if (card.hidden) {
    return (
      <div className="p-3 text-xs select-none shadow-md" style={{ background: `${color}66`, color: NOTE_INK, borderRadius: '2px 2px 14px 2px' }}>
        <span aria-hidden className="block blur-[3px]">████ ██████ ███ ████</span>
        <p className="mt-1">🙈 Oculto até o facilitador revelar</p>
      </div>
    );
  }
  const items = card.items || [];
  const comments = card.comments || [];
  const votingOpen = state.settings.votingOpen;
  const canVote = votingOpen && (card.myVote || state.me.votesLeft === null || state.me.votesLeft > 0);

  return (
    <div draggable={editing === null}
      onDragStart={e => { dragId.current = card.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(card.id)); }}
      onDragEnd={() => { dragId.current = null; }}
      onDragOver={e => { if (dragId.current && dragId.current !== card.id) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        const from = dragId.current;
        if (!from) return;
        e.preventDefault(); setOver(false); dragId.current = null;
        if (from !== card.id) run(() => api.group(from, card.id), 'Cards agrupados');
      }}
      className={`p-3 text-sm space-y-2 shadow-md ${over ? 'ring-2 ring-ds-green' : ''}`}
      style={{ background: color, color: NOTE_INK, borderRadius: '2px 2px 14px 2px' }}>
      {items.map((it, i) => (
        <div key={it.id}>
          {i > 0 && <hr className="my-1.5 border-0 border-t border-dashed" style={{ borderColor: INK_SOFT }} />}
          {editing === it.id ? (
            <Composer api={api} gifs={state.gifsEnabled} toast={toast} label="Editar card" submitLabel="Salvar" initial={{ text: it.text, images: it.images }}
              onCancel={() => setEditing(null)}
              onSubmit={async (t, im) => { await api.editCard(it.id, t, im); setEditing(null); await run(async () => undefined); }} />
          ) : (
            <>
              {it.text && <p className="whitespace-pre-wrap break-words">{it.text}</p>}
              {it.images.map(src => <img key={src} src={boardImg(src)} alt="Imagem do card" loading="lazy" className="mt-1 max-h-48 max-w-full object-contain rounded" />)}
              <div className="flex flex-wrap items-center gap-2 text-[11px] opacity-80 mt-1">
                {it.author && <span>— {it.author}</span>}
                {it.mine && <>
                  <button type="button" className="underline" onClick={() => setEditing(it.id)}>Editar</button>
                  <button type="button" className="underline" onClick={() => { if (window.confirm('Apagar este card?')) run(() => api.deleteCard(it.id), 'Card apagado'); }}>Apagar</button>
                </>}
                {i > 0 && <button type="button" className="underline" onClick={() => run(() => api.ungroup(it.id), 'Card separado do grupo')}>Separar</button>}
              </div>
            </>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <button type="button" aria-pressed={!!card.myVote} disabled={!canVote}
          onClick={() => run(() => (card.myVote ? api.unvote(card.id) : api.vote(card.id)))}
          title={!votingOpen ? 'Votação fechada' : !canVote ? 'Você já usou seus votos' : card.myVote ? 'Tirar meu voto' : 'Votar'}
          className={`${chip} font-semibold`} style={card.myVote ? { background: NOTE_INK, color: '#fff', borderColor: NOTE_INK } : { borderColor: INK_SOFT }}>
          ▲ {card.votes} {card.votes === 1 ? 'voto' : 'votos'}
        </button>
        <button type="button" aria-expanded={showComments} onClick={() => setShowComments(s => !s)} className={chip} style={{ borderColor: INK_SOFT }}>
          💬 {comments.length}<span className="sr-only"> comentários</span>
        </button>
        <button type="button" aria-expanded={grouping} onClick={() => setGrouping(g => !g)} className={chip} style={{ borderColor: INK_SOFT }}
          title="Juntar com outro card (ou arraste este card sobre outro)">⧉ Agrupar</button>
      </div>

      {grouping && (
        <Select aria-label="Agrupar com qual card" value="" className="!text-xs !py-1"
          onChange={e => { const into = Number(e.target.value); if (into) { setGrouping(false); run(() => api.group(card.id, into), 'Cards agrupados'); } }}>
          <option value="">Juntar com…</option>
          {others.filter(o => o.id !== card.id).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
      )}

      {showComments && (
        <div className="space-y-1">
          {comments.map(c => (
            <p key={c.id} className="text-[12px] break-words">
              ↳ {c.text}{c.author ? ` — ${c.author}` : ''}
              {c.mine && <button type="button" className="ml-1 underline opacity-70" onClick={() => run(() => api.deleteComment(c.id))}>apagar</button>}
            </p>
          ))}
          <form className="flex gap-1" onSubmit={e => {
            e.preventDefault();
            const t = comment.trim();
            if (t) run(async () => { await api.comment(card.id, t); setComment(''); });
          }}>
            <input value={comment} onChange={e => setComment(e.target.value)} maxLength={1000} placeholder="Comentar…" aria-label="Comentário"
              className="flex-1 min-w-0 rounded px-2 py-1 text-xs bg-white/60 focus:outline-none focus:ring-1" style={{ color: NOTE_INK }} />
            <button type="submit" className="text-[11px] font-semibold underline">Enviar</button>
          </form>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- entrar (nome ou anônimo)
type BoardInfo = Awaited<ReturnType<BoardApi['info']>>;
const JoinForm: React.FC<{ api: BoardApi; token: string; onJoined: () => void; onGone: (msg: string) => void }> = ({ api, token, onJoined, onGone }) => {
  const [info, setInfo] = useState<BoardInfo | null>(null);
  const [name, setName] = useState(() => boardCred.lastName());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.info().then(setInfo).catch(e => onGone((e as Error).message)); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.join(name.trim());
      boardCred.set(token, r.participant);
      boardCred.lastName(name.trim());
      onJoined();
    } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
  };
  if (!info) return <p className="text-sm text-ds-text">Carregando…</p>;
  return (
    <form onSubmit={join} className="max-w-md mx-auto mt-10 bg-ds-navy border border-ds-border rounded-xl p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ds-light-text">{info.title}</h2>
        <p className="text-sm text-ds-text">{info.teamLabel}{info.date ? ` · ${fmtDate(info.date, true)}` : ''}</p>
      </div>
      <label className="block">
        <span className="block text-xs font-medium text-ds-text mb-1">Seu nome (opcional)</span>
        <Input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Anônimo" autoFocus />
      </label>
      <p className="text-xs text-ds-text">
        {info.anonymous
          ? 'Esta retro é anônima: na tela ninguém vê quem escreveu cada card, nem o facilitador.'
          : 'Nesta retro o seu nome aparece nos cards e comentários que você escrever.'}
      </p>
      {err && <p className="text-sm text-red-300" role="alert">{err}</p>}
      <Btn type="submit" variant="primary" disabled={busy} className="w-full !py-2 !text-sm">Entrar na retro</Btn>
    </form>
  );
};

// ---------------------------------------------------------------- quadro
export const RetroBoard: React.FC<{ token: string; toolbar?: (s: BoardState, refresh: () => Promise<void>) => React.ReactNode }> = ({ token, toolbar }) => {
  const api = useMemo(() => boardApi(token), [token]);
  const [joined, setJoined] = useState(() => !!boardCred.get(token));
  const [state, setState] = useState<BoardState | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [byVotes, setByVotes] = useState(false);
  const vRef = useRef(0);
  const dragId = useRef<number | null>(null);
  const { toast, toastNode } = useToast();

  const refresh = useCallback(async () => {
    try {
      const s = await api.state(vRef.current);
      if (s.unchanged) return;
      vRef.current = s.v;
      setOffset(Date.parse(s.serverNow) - Date.now());
      setState(s);
    } catch (e) {
      const status = (e as BoardError).status;
      if (status === 401) { boardCred.clear(token); vRef.current = 0; setJoined(false); }
      else if (status === 404 || status === 410) setGone((e as Error).message);
      // sem rede: tenta de novo no próximo ciclo
    }
  }, [api, token]);

  useEffect(() => {
    if (!joined || gone) return;
    let stop = false;
    let t = 0;
    const loop = async () => {
      if (!document.hidden) await refresh();
      if (!stop) t = window.setTimeout(loop, POLL_MS);
    };
    loop();
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop = true; clearTimeout(t); document.removeEventListener('visibilitychange', onVis); };
  }, [joined, gone, refresh]);

  const run: Run = useCallback(async (fn, ok) => {
    try { await fn(); if (ok) toast(ok); } catch (e) { toast((e as Error).message, true); }
    await refresh();
  }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  if (gone) return <div className="text-center py-16 text-sm text-ds-light-text bg-ds-navy rounded-xl border border-ds-border">{gone}</div>;
  if (!joined) return <JoinForm api={api} token={token} onJoined={() => setJoined(true)} onGone={setGone} />;
  if (!state) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-ds-green" /></div>;

  const hiddenMode = state.settings.hideUntilReveal && !state.revealed;
  const label = (c: BoardCard) => `${state.columns[c.col]?.name || ''}: ${(c.items?.[0]?.text || '(imagem)').slice(0, 50)}`;
  const others = state.cards.filter(c => !c.hidden).map(c => ({ id: c.id, label: label(c) }));
  const pill = 'text-[11px] px-2 py-1 rounded-full border';

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ds-light-text">{state.title}</h2>
          <p className="text-xs text-ds-text">
            {state.teamLabel}{state.date ? ` · ${fmtDate(state.date, true)}` : ''} · {state.participants} {state.participants === 1 ? 'participante' : 'participantes'} · você: {state.me.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Timer endsAt={state.timerEndsAt} offset={offset} />
          {hiddenMode && <span className={`${pill} border-amber-300/40 text-amber-300`}>🙈 Cards ocultos até revelar</span>}
          <span className={`${pill} ${state.settings.votingOpen ? 'border-ds-green/40 text-ds-green' : 'border-ds-border text-ds-text'}`}>
            {state.settings.votingOpen ? `Votação aberta${state.me.votesLeft !== null ? ` · restam ${state.me.votesLeft}` : ''}` : 'Votação fechada'}
          </span>
          {state.settings.anonymous && <span className={`${pill} border-ds-border text-ds-text`}>Anônima</span>}
          <Btn onClick={() => setByVotes(b => !b)} aria-pressed={byVotes}>{byVotes ? 'Ordem: mais votados' : 'Ordem: chegada'}</Btn>
        </div>
      </header>

      {toolbar?.(state, refresh)}

      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {state.columns.map((c, i) => {
          const color = NOTE_COLORS[i % NOTE_COLORS.length];
          const list = state.cards.filter(k => k.col === i);
          const sorted = byVotes ? [...list].sort((a, b) => (b.votes || 0) - (a.votes || 0)) : list;
          return (
            <section key={i} className="w-72 shrink-0 space-y-3" aria-labelledby={`board-col-${i}`}>
              <div>
                <div className="flex items-center gap-2">
                  <span aria-hidden className="w-3 h-3 rounded-sm" style={{ background: color }} />
                  <h3 id={`board-col-${i}`} className="text-sm font-semibold text-ds-light-text">{c.name}</h3>
                  <span className="text-xs text-ds-text">{list.length}</span>
                </div>
                {c.description && <p className="text-xs text-ds-text mt-1">{c.description}</p>}
              </div>
              <Composer api={api} gifs={state.gifsEnabled} toast={toast} label={`Novo card em ${c.name}`} submitLabel="Adicionar"
                onSubmit={async (t, im) => { await api.addCard(i, t, im); await refresh(); }} />
              {sorted.map(card => (
                <CardView key={card.id} card={card} color={color} state={state} api={api} run={run} toast={toast} others={others} dragId={dragId} />
              ))}
            </section>
          );
        })}
      </div>
      {toastNode}
    </div>
  );
};

// Página pública /retro/<token> (sem login, sem o resto do app).
export const RetroBoardPage: React.FC<{ token: string }> = ({ token }) => {
  useEffect(() => { document.title = 'Retrô ao vivo · DSMetrics'; }, []);
  return (
    <div className="min-h-screen bg-ds-dark-blue text-ds-light-text">
      <header className="px-4 sm:px-6 py-3 border-b border-ds-border flex items-center gap-2">
        <span className="font-bold text-ds-green">DSMetrics</span><span className="text-sm text-ds-text">· Retrô ao vivo</span>
      </header>
      <main className="p-4 sm:p-6"><RetroBoard token={token} /></main>
    </div>
  );
};
