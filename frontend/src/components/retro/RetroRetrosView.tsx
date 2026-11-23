// Aba Retrô → Retros: lista por time, importação do EasyRetro e tela da retro (post-its, leitura da IA, ações).
import React, { useEffect, useMemo, useState } from 'react';
import { retroApi } from './retroApi.ts';
import type { RetroDetail, RetroSummary } from './retroApi.ts';
import type { RetroCtx } from './RetroDashboard.tsx';
import {
  PDF_AI_MAX_CHARS, inferDate, inferTeam, normalizeAiPdf, parseCsv, parseRows, pdfHeuristic, pdfItemsToLines, readXlsxRows, retroStats,
} from '../../utils/retroParser.ts';
import type { ParsedRetro, PdfLine } from '../../utils/retroParser.ts';
import {
  ActionCard, Btn, Field, Input, Modal, NOTE_COLORS, PostIt, STATE_LABEL, Select, TONE_CLASS, TONE_LABEL, TeamTag, fmtDate, fmtDateTime, norm,
} from './retroUi.tsx';

// ---------------------------------------------------------------- leitura de arquivos no navegador
async function ensureBuffer() {
  if (typeof (globalThis as Record<string, unknown>).Buffer === 'undefined') {
    const { Buffer: Buf } = await import('buffer');
    (globalThis as Record<string, unknown>).Buffer = Buf;
  }
}
async function readPdfLines(data: ArrayBuffer): Promise<PdfLine[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise;
  let lines: PdfLine[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    lines = lines.concat(pdfItemsToLines(content.items as { str: string; transform: number[]; width?: number }[]));
  }
  return lines;
}
async function parseFile(file: File, aiAvailable: boolean): Promise<ParsedRetro> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xlsm') { await ensureBuffer(); return parseRows(await readXlsxRows(await file.arrayBuffer()), file.name); }
  if (ext === 'csv') return parseRows(parseCsv(await file.text()), file.name);
  if (ext === 'xls') throw new Error('Formato .xls antigo: abra no Excel e salve como .xlsx');
  if (ext === 'pdf') {
    const lines = await readPdfLines(await file.arrayBuffer());
    if (!lines.length) throw new Error('O PDF não tem texto legível (pode ser só imagem).');
    if (aiAvailable) {
      const text = lines.map(l => l.t).join('\n');
      try {
        return { ...normalizeAiPdf(await retroApi.structurePdf(text), file.name), truncated: text.length > PDF_AI_MAX_CHARS };
      } catch { /* cai na heurística */ }
    }
    return pdfHeuristic(lines, file.name);
  }
  throw new Error('Formato não suportado (use .xlsx, .csv ou .pdf)');
}

interface Draft { key: string; file: string; parsed?: ParsedRetro; error?: string; teamKey: string; title: string; date: string }

// ---------------------------------------------------------------- importação
const ImportModal: React.FC<{ ctx: RetroCtx; onClose: () => void; onDone: (ids: string[]) => void }> = ({ ctx, onClose, onDone }) => {
  const { config } = ctx;
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reading, setReading] = useState(false);
  const [analyze, setAnalyze] = useState(config.aiAvailable);
  const [saving, setSaving] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const addFiles = async (files: FileList | File[]) => {
    setReading(true);
    const out: Draft[] = [];
    for (const f of Array.from(files)) {
      const key = `${f.name}-${f.size}-${Math.random()}`;
      try {
        const parsed = await parseFile(f, config.aiAvailable);
        const st = retroStats(parsed.columns);
        if (!parsed.columns.length || !st.cards) throw new Error('Nenhum card encontrado no arquivo');
        const team = inferTeam(parsed.title, config.teams);
        out.push({ key, file: f.name, parsed, teamKey: team.key || '', title: parsed.title, date: inferDate(parsed.title) || inferDate(f.name) });
      } catch (e) {
        out.push({ key, file: f.name, error: (e as Error).message, teamKey: '', title: '', date: '' });
      }
    }
    setDrafts(d => [...d, ...out]);
    setReading(false);
  };

  const similar = (d: Draft) => ctx.retros.find(r => r.teamKey === d.teamKey && ((d.date && r.date === d.date) || norm(r.title) === norm(d.title)));
  const ok = drafts.filter(d => d.parsed);
  const ready = ok.length > 0 && ok.every(d => d.teamKey && d.title.trim());
  const upd = (key: string, p: Partial<Draft>) => setDrafts(ds => ds.map(d => (d.key === key ? { ...d, ...p } : d)));

  const save = async () => {
    setSaving('Salvando…');
    try {
      const { created } = await retroApi.importRetros(ok.map(d => ({ teamKey: d.teamKey, title: d.title.trim(), date: d.date || null, sourceFile: d.file, columns: d.parsed!.columns })));
      let sug = 0;
      if (analyze) {
        for (const [i, c] of created.entries()) {
          setSaving(`Gerando leitura com IA (${i + 1}/${created.length})…`);
          try { sug += (await retroApi.analyze(c.id)).created; } catch (e) { ctx.toast(`${c.title}: ${(e as Error).message}`, true); }
        }
      }
      ctx.toast(`${created.length} retro${created.length > 1 ? 's' : ''} importada${created.length > 1 ? 's' : ''}${analyze ? `, ${sug} sugest${sug === 1 ? 'ão' : 'ões'} de ação` : ''}.`);
      await ctx.reload();
      onDone(created.map(c => c.id));
    } catch (e) { ctx.toast((e as Error).message, true); } finally { setSaving(null); }
  };

  return (
    <Modal title="Importar retrospectiva do EasyRetro" onClose={onClose} wide>
      <div className="space-y-4">
        <label onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
          className={`block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-ds-green ${over ? 'border-ds-green bg-ds-green/5' : 'border-ds-border hover:border-ds-text'}`}>
          <input type="file" multiple accept=".xlsx,.xlsm,.xls,.csv,.pdf" className="sr-only" onChange={e => e.target.files && addFiles(e.target.files)} />
          <span className="text-sm text-ds-light-text">Arraste os arquivos aqui ou clique para escolher</span>
          <span className="block text-xs text-ds-text mt-1">Exportações do EasyRetro em .xlsx, .csv ou .pdf. Pode mandar vários de uma vez.</span>
        </label>
        {reading && <p className="text-sm text-ds-text" role="status">Lendo arquivos…</p>}

        {drafts.map(d => (
          <div key={d.key} className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-ds-text truncate">{d.file}</span>
              <button type="button" className="text-xs text-ds-text hover:text-red-300" onClick={() => setDrafts(ds => ds.filter(x => x.key !== d.key))}>Remover</button>
            </div>
            {d.error ? <p className="text-sm text-red-300">{d.error}</p> : (() => {
              const st = retroStats(d.parsed!.columns);
              const sim = similar(d);
              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Field label="Time">
                      <Select value={d.teamKey} onChange={e => upd(d.key, { teamKey: e.target.value })}>
                        <option value="">Escolha o time…</option>
                        {config.teams.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Título"><Input value={d.title} onChange={e => upd(d.key, { title: e.target.value })} /></Field>
                    <Field label="Data"><Input type="date" value={d.date} onChange={e => upd(d.key, { date: e.target.value })} /></Field>
                  </div>
                  <p className="text-xs text-ds-text">
                    {d.parsed!.columns.length} colunas · {st.cards} cards · {st.votes} votos · {st.comments} comentários
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {d.parsed!.columns.map((c, i) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded" style={{ background: NOTE_COLORS[i % 5], color: '#14273A' }}>{c.name} ({c.cards.length})</span>
                    ))}
                  </div>
                  {!d.teamKey && <p className="text-xs text-amber-300">Não reconheci o time no título: escolha acima.</p>}
                  {d.parsed!.via === 'estimado' && <p className="text-xs text-amber-300">Colunas estimadas pelo tamanho da fonte do PDF (sem IA). Confira os cards depois de importar.</p>}
                  {d.parsed!.via === 'ia' && <p className="text-xs text-ds-text">Estrutura do PDF montada pela IA.</p>}
                  {d.parsed!.truncated && <p className="text-xs text-amber-300">PDF longo: só o começo do texto coube na leitura da IA. Confira se faltam colunas ou cards no fim.</p>}
                  {sim && <p className="text-xs text-amber-300">Já existe uma retro parecida: “{sim.title}” ({fmtDate(sim.date, true) || 'sem data'}).</p>}
                </>
              );
            })()}
          </div>
        ))}

        <label className={`flex items-center gap-2 text-sm ${config.aiAvailable ? 'text-ds-light-text' : 'text-ds-text'}`}>
          <input type="checkbox" checked={analyze} disabled={!config.aiAvailable} onChange={e => setAnalyze(e.target.checked)} />
          Gerar leitura e sugestões com IA ao salvar{!config.aiAvailable && ' (IA não configurada no servidor)'}
        </label>
        <div className="flex justify-end gap-2 items-center">
          {saving && <span className="text-xs text-ds-text" role="status">{saving}</span>}
          <Btn onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" disabled={!ready || !!saving} onClick={save}>Salvar {ok.length > 1 ? `${ok.length} retros` : 'retro'}</Btn>
        </div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------- tela da retro
const RetroDetailView: React.FC<{ ctx: RetroCtx; id: string; onBack: () => void }> = ({ ctx, id, onBack }) => {
  const { config, types } = ctx;
  const [r, setR] = useState<RetroDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => retroApi.retro(id).then(setR).catch(e => setErr((e as Error).message));
  useEffect(() => { load(); }, [id, ctx.actions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <p className="text-red-300 text-sm">{err} <button className="underline" onClick={onBack}>Voltar</button></p>;
  if (!r) return <p className="text-ds-text text-sm">Carregando…</p>;

  const analyze = async () => {
    setBusy('Gerando leitura e sugestões…');
    try { const res = await retroApi.analyze(r.id); ctx.toast(`Leitura gerada. ${res.created} sugest${res.created === 1 ? 'ão' : 'ões'} nova${res.created === 1 ? '' : 's'} na aba Ações.`); await ctx.reload(); }
    catch (e) { ctx.toast((e as Error).message, true); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!window.confirm(`Excluir a retro "${r.title}"? As sugestões ainda não aprovadas dela serão apagadas. As ações aprovadas continuam.`)) return;
    try { await retroApi.deleteRetro(r.id); ctx.toast('Retro excluída'); await ctx.reload(); onBack(); } catch (e) { ctx.toast((e as Error).message, true); }
  };
  const ins = r.insights;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="text-sm text-ds-text hover:text-ds-light-text">← Retros</button>
      <header className="bg-ds-navy border border-ds-border rounded-lg p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <TeamTag label={ctx.teamLabel(r.teamKey)} />
          <h3 className="text-lg font-semibold text-ds-light-text">{r.title}</h3>
          <span className="text-sm text-ds-text">{r.date ? fmtDate(r.date, true) : 'sem data'}</span>
        </div>
        <p className="text-xs text-ds-text">
          {r.stats.cards} cards · {r.stats.votes} votos · {r.stats.comments} comentários
          {r.sourceFile && ` · arquivo: ${r.sourceFile}`}{r.createdByName && ` · importada por ${r.createdByName}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => setEdit(true)}>Editar dados</Btn>
          {config.isLeader && <Btn variant="danger" onClick={remove}>Excluir retro</Btn>}
        </div>
      </header>

      {/* Leitura da IA */}
      <section className="bg-ds-navy border border-ds-border rounded-lg p-4 space-y-3" aria-labelledby="ins-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 id="ins-h" className="text-sm font-semibold text-ds-light-text">Leitura da retro</h4>
          <div className="flex items-center gap-2">
            {busy && <span className="text-xs text-ds-text" role="status">{busy}</span>}
            <Btn variant={ins ? 'ghost' : 'primary'} disabled={!!busy || !config.aiAvailable} onClick={analyze}
              title={config.aiAvailable ? '' : 'IA não configurada no servidor'}>{ins ? 'Gerar de novo' : 'Gerar leitura e sugestões'}</Btn>
          </div>
        </div>
        {!ins ? <p className="text-sm text-ds-text">Ainda sem leitura. A IA resume o clima, aponta os temas e sugere ações para a fila.</p> : (
          <div className="space-y-3">
            <p className="text-sm text-ds-light-text">{ins.resumo}</p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {ins.temas.map((t, i) => (
                <li key={i} className="text-sm bg-ds-dark-blue border border-ds-border rounded-lg p-2">
                  <span className={`text-[11px] border rounded-full px-1.5 py-0.5 mr-2 ${TONE_CLASS[t.tom]}`}>{TONE_LABEL[t.tom]}</span>
                  <span className="font-medium text-ds-light-text">{t.tema}</span>
                  <p className="text-xs text-ds-text mt-1">{t.detalhe}</p>
                </li>
              ))}
            </ul>
            {ins.elogios.length > 0 && <div><span className="text-xs font-medium text-ds-text">Elogios</span>
              <ul className="mt-1 space-y-1">{ins.elogios.map((e, i) => <li key={i} className="text-sm text-ds-light-text">💚 {e}</li>)}</ul></div>}
            {ins.gerado_em && <p className="text-[11px] text-ds-text">Gerada em {fmtDateTime(ins.gerado_em)}{ins.gerado_por ? ` por ${ins.gerado_por}` : ''}</p>}
          </div>
        )}
      </section>

      {/* Cards */}
      <section aria-label="Cards da retro" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {r.columns.map((c, ci) => (
          <div key={ci} className="space-y-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="w-3 h-3 rounded-sm" style={{ background: NOTE_COLORS[ci % 5] }} />
              <h4 className="text-sm font-semibold text-ds-light-text">{c.name}</h4>
              <span className="text-xs text-ds-text">{c.cards.length}</span>
            </div>
            {c.description && <p className="text-xs text-ds-text">{c.description}</p>}
            {c.cards.map((k, i) => (
              <PostIt key={i} text={k.t} votes={k.v} comments={k.c} color={NOTE_COLORS[ci % 5]} index={ci * 3 + i}>
                <button type="button" className="mt-2 text-[11px] font-semibold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-dark-blue rounded"
                  onClick={() => ctx.newAction({ teamKey: r.teamKey, retroId: r.id, origin: [k.t.slice(0, 280)] })}>Criar ação</button>
              </PostIt>
            ))}
          </div>
        ))}
      </section>

      {/* Ações da retro */}
      <section className="space-y-2" aria-labelledby="ra-h">
        <h4 id="ra-h" className="text-sm font-semibold text-ds-light-text">Ações desta retro ({r.actions.length})</h4>
        {r.actions.length === 0 ? <p className="text-sm text-ds-text">Nenhuma ação ligada a esta retro.</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {[...r.actions].sort((a, b) => ['sugerida', 'aberta', 'andamento', 'validacao', 'concluida'].indexOf(a.state) - ['sugerida', 'aberta', 'andamento', 'validacao', 'concluida'].indexOf(b.state))
              .map(a => (
                <ActionCard key={a.id} a={a} types={types} teams={config.teams} onOpen={() => ctx.openAction(a.id)}
                  footer={<span className="text-[11px] text-ds-text">Estado: {STATE_LABEL[a.state]}</span>} />
              ))}
          </div>
        )}
      </section>

      {edit && <EditRetroModal ctx={ctx} r={r} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load(); }} />}
    </div>
  );
};

const EditRetroModal: React.FC<{ ctx: RetroCtx; r: RetroDetail; onClose: () => void; onSaved: () => void }> = ({ ctx, r, onClose, onSaved }) => {
  const [d, setD] = useState({ teamKey: r.teamKey, title: r.title, date: r.date || '' });
  const save = async () => {
    try { await retroApi.updateRetro(r.id, { ...d, date: d.date || null }); ctx.toast('Retro atualizada'); await ctx.reload(); onSaved(); }
    catch (e) { ctx.toast((e as Error).message, true); }
  };
  return (
    <Modal title="Editar dados da retro" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Time">
          <Select value={d.teamKey} onChange={e => setD({ ...d, teamKey: e.target.value })}>{ctx.config.teams.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>
        </Field>
        {d.teamKey !== r.teamKey && <p className="text-xs text-amber-300">As ações desta retro também passam para o novo time.</p>}
        <Field label="Título"><Input value={d.title} onChange={e => setD({ ...d, title: e.target.value })} /></Field>
        <Field label="Data"><Input type="date" value={d.date} onChange={e => setD({ ...d, date: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" onClick={save}>Salvar</Btn></div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------- lista
const RetroRetrosView: React.FC<{ ctx: RetroCtx }> = ({ ctx }) => {
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('retro'));
  const [importing, setImporting] = useState(false);
  const setRetro = (id: string | null) => {
    setOpenId(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set('retro', id); else u.searchParams.delete('retro');
    window.history.replaceState(null, '', u.toString());
  };
  const groups = useMemo(() => {
    const by = new Map<string, RetroSummary[]>();
    for (const r of ctx.retros) by.set(r.teamKey, [...(by.get(r.teamKey) || []), r]);
    return [...by.entries()].sort((a, b) => ctx.teamLabel(a[0]).localeCompare(ctx.teamLabel(b[0]), 'pt-BR'));
  }, [ctx.retros, ctx.teamLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (openId) return <RetroDetailView ctx={ctx} id={openId} onBack={() => setRetro(null)} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <p className="text-sm text-ds-text">{ctx.retros.length} retros importadas</p>
        <Btn variant="primary" onClick={() => setImporting(true)}>Importar retro</Btn>
      </div>
      {groups.length === 0 && <p className="text-sm text-ds-text">Nenhuma retro ainda. Importe a exportação do EasyRetro (.xlsx, .csv ou .pdf).</p>}
      {groups.map(([team, list]) => (
        <section key={team} className="space-y-2">
          <h3 className="text-sm font-semibold text-ds-light-text">{ctx.teamLabel(team)}</h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {list.map(r => (
              <li key={r.id}>
                <button type="button" onClick={() => setRetro(r.id)}
                  className="w-full text-left bg-ds-navy border border-ds-border rounded-lg p-3 hover:border-ds-text/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-green">
                  <span className="block text-sm font-medium text-ds-light-text">{r.title}</span>
                  <span className="block text-xs text-ds-text mt-1">
                    {r.date ? fmtDate(r.date, true) : 'sem data'} · {r.stats.cards} cards · {r.actionsCount ?? 0} ações · {r.insights ? 'com leitura' : 'sem leitura'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {importing && <ImportModal ctx={ctx} onClose={() => setImporting(false)} onDone={ids => { setImporting(false); if (ids.length === 1) setRetro(ids[0]); }} />}
    </div>
  );
};

export default RetroRetrosView;
