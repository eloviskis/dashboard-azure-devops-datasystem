// Aba Retrô → Conduzir: retros ao vivo (no lugar do EasyRetro). Lista, criação a partir de um modelo de colunas e
// condução (revelar, votação, cronômetro, encerrar). Encerrada, a retro vai para Retros e segue o fluxo de sempre.
import React, { useCallback, useEffect, useState } from 'react';
import { retroApi } from './retroApi.ts';
import type { BoardColumn, BoardState, BoardSummary, BoardTemplate } from './retroApi.ts';
import type { RetroCtx } from './RetroDashboard.tsx';
import { RetroBoard } from './RetroBoard.tsx';
import { Btn, Field, Input, Modal, NOTE_COLORS, Select, TeamTag, fmtDate, todayStr } from './retroUi.tsx';

const linkOf = (token: string) => `${window.location.origin}/retro/${token}`;
async function copyLink(token: string, toast: RetroCtx['toast']) {
  try { await navigator.clipboard.writeText(linkOf(token)); toast('Link copiado. Mande para o time.'); }
  catch { window.prompt('Copie o link da retro:', linkOf(token)); }
}

// ---------------------------------------------------------------- nova retro
const NewBoardModal: React.FC<{ ctx: RetroCtx; onClose: () => void; onCreated: (b: BoardSummary) => void }> = ({ ctx, onClose, onCreated }) => {
  const [templates, setTemplates] = useState<BoardTemplate[] | null>(null);
  const [teamKey, setTeamKey] = useState(ctx.config.teams[0]?.key || '');
  const [date, setDate] = useState(todayStr());
  const [title, setTitle] = useState('');
  const [tpl, setTpl] = useState('');
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [anonymous, setAnonymous] = useState(true);
  const [hide, setHide] = useState(true);
  const [votes, setVotes] = useState(3);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    retroApi.boardTemplates().then(t => {
      setTemplates(t);
      if (t[0]) { setTpl(t[0].id); setColumns(t[0].columns.map(c => ({ ...c }))); }
    }).catch(e => ctx.toast((e as Error).message, true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultTitle = `${ctx.teamLabel(teamKey)} ${fmtDate(date)}`.trim();
  const pick = (id: string) => { setTpl(id); const t = templates?.find(x => x.id === id); if (t) setColumns(t.columns.map(c => ({ ...c }))); };
  const upd = (i: number, p: Partial<BoardColumn>) => setColumns(cs => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const create = async () => {
    setBusy(true);
    try {
      onCreated(await retroApi.createBoard({
        teamKey, title: title.trim() || defaultTitle, date: date || null,
        columns: columns.map(c => ({ name: c.name.trim(), description: c.description.trim() })),
        settings: { anonymous, hideUntilReveal: hide, votesPerPerson: votes },
      }));
    } catch (e) { ctx.toast((e as Error).message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title="Nova retro ao vivo" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Field label="Time">
            <Select value={teamKey} onChange={e => setTeamKey(e.target.value)}>
              {ctx.config.teams.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Título"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder={defaultTitle} maxLength={200} /></Field>
          <Field label="Data"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        </div>

        <Field label="Modelo">
          <Select value={tpl} onChange={e => pick(e.target.value)} disabled={!templates}>
            {!templates && <option>Carregando…</option>}
            {templates?.map(t => <option key={t.id} value={t.id}>{t.name} ({t.columns.length} colunas)</option>)}
          </Select>
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-ds-text mb-1">Colunas (dá para mudar à vontade)</legend>
          {columns.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <span aria-hidden className="w-3 h-3 rounded-sm mt-3 shrink-0" style={{ background: NOTE_COLORS[i % NOTE_COLORS.length] }} />
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-[14rem_1fr] gap-1">
                <Input value={c.name} onChange={e => upd(i, { name: e.target.value })} maxLength={80} placeholder={`Coluna ${i + 1}`} aria-label={`Nome da coluna ${i + 1}`} />
                <Input value={c.description} onChange={e => upd(i, { description: e.target.value })} maxLength={300} placeholder="Pergunta ou descrição (opcional)" aria-label={`Descrição da coluna ${i + 1}`} />
              </div>
              <Btn variant="danger" disabled={columns.length === 1} onClick={() => setColumns(cs => cs.filter((_, j) => j !== i))} aria-label={`Remover coluna ${i + 1}`}>✕</Btn>
            </div>
          ))}
          <Btn disabled={columns.length >= 10} onClick={() => setColumns(cs => [...cs, { name: '', description: '' }])}>+ Adicionar coluna</Btn>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-ds-text mb-1">Como a retro funciona</legend>
          <label className="flex items-start gap-2 text-sm text-ds-light-text">
            <input type="checkbox" className="mt-1" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} />
            <span>Cards anônimos<span className="block text-xs text-ds-text">Não dá para mudar depois de criar: protege quem escreveu achando que era anônimo.</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ds-light-text">
            <input type="checkbox" className="mt-1" checked={hide} onChange={e => setHide(e.target.checked)} />
            <span>Ocultar os cards até o facilitador revelar<span className="block text-xs text-ds-text">Cada pessoa só vê os próprios cards até você clicar em Revelar.</span></span>
          </label>
          <label className="flex items-center gap-2 text-sm text-ds-light-text">
            Votos por pessoa
            <Input type="number" min={0} max={20} value={votes} onChange={e => setVotes(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} className="!w-20" />
            <span className="text-xs text-ds-text">0 = sem limite</span>
          </label>
        </fieldset>

        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" disabled={busy || !teamKey || !columns.length} onClick={create}>{busy ? 'Criando…' : 'Criar e abrir'}</Btn>
        </div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------- barra do facilitador
const FacilitatorBar: React.FC<{ ctx: RetroCtx; board: BoardSummary; state: BoardState; refresh: () => Promise<void>; onFinished: (retroId: string) => void }> = ({
  ctx, board, state, refresh, onFinished,
}) => {
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [analyze, setAnalyze] = useState(ctx.config.aiAvailable);
  const act = async (data: Parameters<typeof retroApi.updateBoard>[1]) => {
    setBusy(true);
    try { await retroApi.updateBoard(board.id, data); await refresh(); } catch (e) { ctx.toast((e as Error).message, true); } finally { setBusy(false); }
  };
  const finish = async () => {
    setBusy(true);
    try {
      const { retroId } = await retroApi.finishBoard(board.id);
      let msg = 'Retro encerrada e salva em Retros.';
      if (analyze) {
        try { const r = await retroApi.analyze(retroId); msg += ` ${r.created} sugest${r.created === 1 ? 'ão' : 'ões'} de ação na aba Ações.`; }
        catch (e) { ctx.toast(`Retro salva, mas a leitura da IA falhou: ${(e as Error).message}`, true); }
      }
      ctx.toast(msg);
      await ctx.reload();
      onFinished(retroId);
    } catch (e) { ctx.toast((e as Error).message, true); setBusy(false); }
  };
  const hiddenMode = state.settings.hideUntilReveal && !state.revealed;

  return (
    <div className="bg-ds-navy border border-ds-border rounded-lg p-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Controles do facilitador">
      <span className="text-xs font-semibold text-ds-green mr-1">Facilitador</span>
      {hiddenMode && <Btn variant="primary" disabled={busy} onClick={() => act({ revealed: true })}>Revelar cards</Btn>}
      <Btn disabled={busy} onClick={() => act({ settings: { votingOpen: !state.settings.votingOpen } })}>
        {state.settings.votingOpen ? 'Fechar votação' : 'Abrir votação'}
      </Btn>
      <label className="flex items-center gap-1 text-xs text-ds-text">
        Votos por pessoa
        <Input type="number" min={0} max={20} key={state.settings.votesPerPerson} defaultValue={state.settings.votesPerPerson} className="!w-16 !py-1"
          title="0 = sem limite"
          onBlur={e => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= 0 && n <= 20 && n !== state.settings.votesPerPerson) act({ settings: { votesPerPerson: n } });
          }} />
      </label>
      <span className="text-xs text-ds-text ml-2">Cronômetro</span>
      {[2, 5, 10].map(m => <Btn key={m} disabled={busy} onClick={() => act({ timer: { minutes: m } })}>{m} min</Btn>)}
      {state.timerEndsAt && <Btn disabled={busy} onClick={() => act({ timer: null })}>Parar</Btn>}
      <span className="flex-1" />
      {finishing ? (
        <>
          <label className={`flex items-center gap-1 text-xs ${ctx.config.aiAvailable ? 'text-ds-light-text' : 'text-ds-text'}`}>
            <input type="checkbox" checked={analyze} disabled={!ctx.config.aiAvailable} onChange={e => setAnalyze(e.target.checked)} />
            Gerar leitura e sugestões com IA
          </label>
          <Btn disabled={busy} onClick={() => setFinishing(false)}>Cancelar</Btn>
          <Btn variant="primary" disabled={busy} onClick={finish}>{busy ? 'Encerrando…' : 'Confirmar encerramento'}</Btn>
        </>
      ) : <Btn variant="danger" disabled={busy} onClick={() => setFinishing(true)}>Encerrar retro</Btn>}
    </div>
  );
};

// ---------------------------------------------------------------- lista
const RetroBoardsView: React.FC<{ ctx: RetroCtx }> = ({ ctx }) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('board'));
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => retroApi.boards().then(setBoards).catch(e => ctx.toast((e as Error).message, true)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const setBoard = (id: string | null) => {
    setOpenId(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set('board', id); else u.searchParams.delete('board');
    window.history.replaceState(null, '', u.toString());
    if (!id) load();
  };
  const remove = async (b: BoardSummary) => {
    if (!window.confirm(`Excluir a retro ao vivo "${b.title}"? Os cards dela serão apagados e o link deixa de funcionar.`)) return;
    try { await retroApi.deleteBoard(b.id); ctx.toast('Retro excluída'); load(); } catch (e) { ctx.toast((e as Error).message, true); }
  };

  const open = boards?.find(b => b.id === openId);
  if (openId && boards && !open) {
    return <p className="text-sm text-ds-text">Retro não encontrada. <button type="button" className="underline" onClick={() => setBoard(null)}>Voltar</button></p>;
  }
  if (open) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setBoard(null)} className="text-sm text-ds-text hover:text-ds-light-text">← Retros ao vivo</button>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <code className="text-[11px] text-ds-text truncate max-w-[20rem]" title={linkOf(open.token)}>{linkOf(open.token)}</code>
            <Btn onClick={() => copyLink(open.token, ctx.toast)}>Copiar link</Btn>
            <a href={linkOf(open.token)} target="_blank" rel="noreferrer" className="text-xs underline text-ds-text hover:text-ds-light-text">Abrir em tela cheia</a>
          </div>
        </div>
        <RetroBoard token={open.token}
          toolbar={open.canManage ? (s, refresh) => (
            <FacilitatorBar ctx={ctx} board={open} state={s} refresh={refresh} onFinished={id => { setOpenId(null); ctx.openRetro(id); }} />
          ) : undefined} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <p className="text-sm text-ds-text max-w-2xl">Conduza a retro aqui mesmo. O time entra pelo link, sem login. Ao encerrar, ela vai para Retros, com a leitura da IA e as sugestões de ação.</p>
        <Btn variant="primary" onClick={() => setCreating(true)}>Nova retro ao vivo</Btn>
      </div>
      {!boards ? <p className="text-sm text-ds-text">Carregando…</p> : boards.length === 0 ? (
        <p className="text-sm text-ds-text">Nenhuma retro ao vivo ainda.</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {boards.map(b => (
            <li key={b.id} className="bg-ds-navy border border-ds-border rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <TeamTag label={ctx.teamLabel(b.teamKey)} />
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${b.status === 'aberta' ? 'text-ds-green border-ds-green/40' : 'text-ds-text border-ds-border'}`}>
                  {b.status === 'aberta' ? 'Aberta' : 'Encerrada'}
                </span>
              </div>
              <p className="text-sm font-medium text-ds-light-text">{b.title}</p>
              <p className="text-xs text-ds-text">
                {b.date ? fmtDate(b.date, true) : 'sem data'} · {b.participants} {b.participants === 1 ? 'participante' : 'participantes'} · {b.cards} cards
                {b.createdByName ? ` · por ${b.createdByName}` : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {b.status === 'aberta' ? (
                  <>
                    <Btn variant="primary" onClick={() => setBoard(b.id)}>{b.canManage ? 'Conduzir' : 'Abrir'}</Btn>
                    <Btn onClick={() => copyLink(b.token, ctx.toast)}>Copiar link</Btn>
                    {b.canManage && <Btn variant="danger" onClick={() => remove(b)}>Excluir</Btn>}
                  </>
                ) : b.retroId ? <Btn onClick={() => ctx.openRetro(b.retroId!)}>Ver retro</Btn> : <span className="text-xs text-ds-text">A retro gerada foi excluída.</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <NewBoardModal ctx={ctx} onClose={() => setCreating(false)}
          onCreated={b => { setCreating(false); setBoards(bs => [b, ...(bs || [])]); setBoard(b.id); }} />
      )}
    </div>
  );
};

export default RetroBoardsView;
