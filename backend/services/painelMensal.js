// Port manual de frontend/src/utils/painelMensal.ts para CommonJS, usado pelo e-mail quinzenal do
// Painel por Time (painelPorTimeDigest.js). Importar o .ts direto do backend não é seguro: a VPS de
// produção roda Node 20.20.1 (confirmado via SSH em 2026-10-28), que não faz type-stripping nativo de
// .ts (só a partir do Node 22.6+) — só funciona aqui no dev porque os .check.mjs rodam manualmente,
// nunca dentro do processo do backend.
//
// Isso é uma cópia deliberada, não uma reimplementação: mesma ordem, mesmas constantes, mesmos
// comentários do arquivo original. Se frontend/src/utils/painelMensal.ts mudar de novo, este arquivo
// precisa ser atualizado junto à mão (ver painelMensal.check.js, que prova paridade com os mesmos casos
// do check original). Upgrade path natural: apagar este port e importar o .ts direto quando a VPS for
// atualizada pra Node ≥22.

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

const getPercentile = (sorted, p) => {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, idx)];
};

// Faixas iniciais da planilha de gestão. Editáveis no painel (admin).
// Retrabalho: contagem de bugs internos, sem meta até a gestão definir uma (2026-11-24; antes era % ≤ 31).
const METAS_PADRAO = {
  fluxo: { label: 'Fluxo de Eficiência', unidade: '%', min: 45, max: 50, porTime: { sustentacao: { min: 50, max: 55 } } },
  cycle: { label: 'Cycle Time (P85, dias corridos)', unidade: 'd', min: 20, max: 34, porTime: { sustentacao: { min: 10, max: 12 } } },
  // Sem meta: a faixa 80–100 da planilha era do total da empresa colado em cada time (decisão de 2026-11-24)
  bugs: { label: 'Bugs Produção', unidade: '', min: null, max: null },
  bugsVersao: { label: 'Bugs Produção com versão', unidade: '', min: null, max: null },
  retrabalho: { label: 'Índice de Retrabalho', unidade: '', min: null, max: null },
  qtdP0: { label: 'Quantidade de P0', unidade: '', min: null, max: null },
  // Só a Sustentação acompanha SLA P0 (ver PERFIS_TIME) — o geral fica igual ao override só pra não aparecer
  // "sem meta" no cabeçalho da seção; nenhum outro time chega a usar esse valor geral.
  slaP0: { label: 'SLA P0 (≤7 dias)', unidade: '%', min: 60, max: 70, porTime: { sustentacao: { min: 60, max: 70 } } },
};

// Issue = bug que chegou em produção (Bugs Produção). Bug = bug interno, o que o QA pega antes de produção,
// sem versão publicada (Índice de Retrabalho) — definição da gestão em 2026-11-24.
const SLA_P0_DIAS = 7;

// Times da planilha de gestão com escopo de tipos confirmado contra o CSV da GetNaves (ver TIPOS_GETNAVES
// abaixo). Não inclui Franquia/CTC de propósito — ver TIMES_PADRAO_PAINEL. Estratégico tirado da lista a
// pedido do usuário (2026-10-29).
const TIMES_PLANILHA = ['Sustentacao', 'Boltz', 'Tatico', 'Wakanda'];

// Times marcados por padrão ao abrir a tela. Inclui Franquia/CTC (tem bloco próprio na planilha), mas ela NÃO
// entra em TIMES_PLANILHA: colocá-la lá também mudaria o escopo de tipos dela pra TIPOS_GETNAVES (só Issue/User
// Story/Eventuality), que exclui Bug — e a Franquia tem Bugs reais (126 no banco) que entram no Índice de
// Retrabalho. Sem validar isso contra um CSV real da GetNaves (como foi feito pros 5 times originais), ela fica
// com o fallback de "todos os tipos" que já existe pra time novo (ver noEscopo).
const TIMES_PADRAO_PAINEL = [...TIMES_PLANILHA, 'Franquia'];

const normalizarTime = (team) =>
  team.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

const isSustentacao = (team) => normalizarTime(team) === 'sustentacao';

// Quais métricas cada time acompanha, igual aos blocos da planilha de gestão. qtdP0 não está em nenhum bloco da
// planilha (é só da ferramenta), por isso entra nos 3 perfis sem distinção.
const METRICAS_SUSTENTACAO = ['fluxo', 'cycle', 'slaP0', 'retrabalho', 'qtdP0'];
const METRICAS_FRANQUIA = ['bugs', 'bugsVersao', 'retrabalho', 'qtdP0'];
const METRICAS_PADRAO_TIME = ['fluxo', 'cycle', 'bugs', 'bugsVersao', 'retrabalho', 'qtdP0'];
const PERFIS_TIME = { sustentacao: METRICAS_SUSTENTACAO, franquia: METRICAS_FRANQUIA };
function metricasDoTime(team) {
  return PERFIS_TIME[normalizarTime(team)] ?? METRICAS_PADRAO_TIME;
}

// Escopo por tipo, igual ao export da GetNaves: Issue, User Story e Eventuality. Confirmado com o CSV real de
// cada um dos 5 times da planilha (Bug, QA, Task e os demais tipos ficam de fora).
// ponytail: só estes 5 times têm a configuração confirmada; um time novo entra com todos os tipos até termos a dele.
// Estratégico saiu da lista padrão (TIMES_PLANILHA) em 2026-10-29, mas não do escopo: sem ele, Feature/Epic/Task
// antigas fechadas em lote entravam no Cycle Time do time (P85 de 955 d em ago/26).
const TIPOS_GETNAVES = Object.fromEntries(
  [...TIMES_PLANILHA, 'Estrategico'].map(t => [normalizarTime(t), ['Issue', 'User Story', 'Eventuality']])
);
const noEscopo = (item) => {
  const tipos = TIPOS_GETNAVES[normalizarTime(item.team ?? '')];
  return !tipos || tipos.includes(item.type);
};

// P0 = prioridade vazia ou 0 (mesma regra de RootCauseDashboard). Prioridade "1" (Crítica) NÃO entra.
const isP0 = (item) => {
  const p = item.priority;
  if (p === null || p === undefined || p === '') return true;
  const n = Number.parseFloat(String(p));
  return Number.isNaN(n) ? true : Math.floor(n) === 0;
};

// Bug em produção = Issue. "Com versão" = número de versão (ex.: 3.71.0.5) em Base Version, Delivered Version,
// root cause version ou numa tag. Em nov/2026 nenhum item do tipo Bug tinha versão no Azure DevOps, só Issues.
// Exige 3 partes porque o Delivered Version às vezes traz texto ("ANALISE", "PR Completo").
const VERSAO = /\d+\.\d+\.\d+/;
const temVersao = (item) =>
  [item.baseVersion, item.deliveredVersion, item.rootCauseVersion, [item.tags ?? ''].flat().join(';')]
    .some(v => VERSAO.test(v ?? ''));

// Issue Removed ou Disapproved não chegou a ser bug em produção: fica fora de Bugs Produção e do Índice do
// Departamento (pedido do usuário em 2026-11-26; eram 7 Issues em 2026 nos times do departamento).
const ESTADOS_DESCARTADOS = ['Removed', 'Disapproved'];
const issueValida = (i) => i.type === 'Issue' && !ESTADOS_DESCARTADOS.includes(i.state);

// Critério da gestão para bug em produção (linha BUGS da planilha Indicadores_2026; conferido em 2026-11-26):
// Issue do Tipo "Correção" (Análise/Alteração/Melhoria/Update não), vinda de cliente (Tipo Cliente preenchido),
// menos o cliente "SLA INTERNO DS". Reproduz jun–out/26 da planilha (130/132, 137/138, 150/157, 153/149, 145/145)
// e a "Média 25" = 127. /^corre/i cobre "Correção", "Correcao" e a grafia com acento quebrado do Azure DevOps.
const bugDeCliente = (i) =>
  /^corre/i.test(i.customType ?? '') && !!i.tipoCliente?.trim() && !/INTERNO/i.test(i.tipoCliente ?? '');
const bugProducao = (i) => issueValida(i) && bugDeCliente(i);

const dentroDoPeriodo = (data, b) => {
  if (!data) return false;
  const t = new Date(data).getTime();
  return !Number.isNaN(t) && t >= b.start.getTime() && t <= b.end.getTime();
};

const media = (valores) =>
  valores.length === 0 ? null : Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10;

// P85 (nearest-rank, mesmo método do resto da ferramenta). Igual ao cabeçalho "85% Percentil" da planilha.
// Sensível a fechamentos em massa: itens antigos fechados de uma vez entram no P85 do mês.
const p85 = (valores) => {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  return Math.round(getPercentile(s, 0.85) * 10) / 10;
};

const pct = (parte, total) =>
  total === 0 ? null : Math.round((parte / total) * 1000) / 10;

// Fluxo de Eficiência e Cycle Time na configuração da GetNaves (aba "conf e Filtros Tatico" da planilha; decisão
// do usuário em 2026-11-24, que reduziu o erro contra o histórico jan–out de 10 para 4 pontos no Fluxo do Tático):
// - só Issue e User Story;
// - Fluxo = ativo ÷ (ativo + fila) em cada item, depois a média. Ativo = Desenvolvendo (Active) e Testando QA;
//   fila = Aguardando/Fazendo code review e Aguardando QA. "Para Desenvolver" é To Do na GetNaves: fica fora;
// - Cycle Time = dias corridos do início do Doing até a conclusão (cicloDias, ver painelPorTimeDigest.js).
// Estados em minúsculo para casar com timeInStatusDays. Itens sem tempo nesses estados não entram no Fluxo.
// "Testing"/"CodeReview" (sem espaço) são nomes de coluna que Boltz/Tático/Estratégico usam e Sustentação
// não — mesmo sentido de "Testando QA"/code review, só com grafia diferente (confirmado no banco em 2026-10-28).
const TIPOS_FLUXO_CT = ['Issue', 'User Story'];
const ESTADOS_ATIVOS = ['active', 'testando qa', 'testing'];
const ESTADOS_FILA = ['aguardando code review', 'fazendo code review', 'aguardando qa', 'codereview'];
const diasEm = (item, estados) =>
  Object.entries(item.timeInStatusDays ?? {})
    .filter(([estado]) => estados.includes(estado.toLowerCase()))
    .reduce((soma, [, dias]) => soma + dias, 0);
const eficienciaItem = (item) => {
  const ativo = diasEm(item, ESTADOS_ATIVOS);
  const fila = diasEm(item, ESTADOS_FILA);
  return ativo + fila === 0 ? null : (ativo / (ativo + fila)) * 100;
};

// Índice do Departamento de Engenharia: Issues abertas no período pelos times do departamento (Sustentação,
// Franquia/CTC, Tático, Wakanda e Boltz — os mesmos de TIMES_PADRAO_PAINEL), somadas. Só Issue (bug em produção);
// Bug interno não entra. Fixo nesses times: não depende do filtro de times (decisão de 2026-11-26).
const doDepartamento = (team) =>
  TIMES_PADRAO_PAINEL.some(t => normalizarTime(t) === normalizarTime(team ?? ''));
const issuesDoDepartamento = (items, b) =>
  items.filter(i => issueValida(i) && doDepartamento(i.team) && dentroDoPeriodo(i.createdDate, b));

function buildPainelMensal(items, buckets, timesFiltro) {
  const filtroNorm = timesFiltro?.map(normalizarTime);
  const validos = items.filter(i =>
    i.team && i.team !== 'Sem Time' && noEscopo(i) && (!filtroNorm || filtroNorm.includes(normalizarTime(i.team)))
  );
  const times = [...new Set(validos.map(i => i.team))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const porTime = { fluxo: {}, cycle: {}, bugs: {}, bugsVersao: {}, retrabalho: {}, qtdP0: {}, slaP0: {} };

  for (const team of times) {
    const doTime = validos.filter(i => i.team === team);
    const concluidosTime = doTime.filter(i => COMPLETED_STATES.includes(i.state));
    const issuesTime = doTime.filter(bugProducao);
    // Bugs internos vêm de items, não de validos: o escopo da GetNaves (Issue/User Story/Eventuality) tira Bug
    const bugsInternos = items.filter(i => i.team === team && i.type === 'Bug');

    const fluxo = [];
    const cycle = [];
    const bugs = [];
    const bugsVersao = [];
    const retrabalho = [];
    const qtdP0 = [];
    const slaP0 = [];

    for (const b of buckets) {
      // Itens concluídos cuja data de fechamento cai no período
      const noPeriodo = concluidosTime.filter(i => dentroDoPeriodo(i.closedDate, b));

      // Fluxo de Eficiência (média, item a item) e Cycle Time (P85, dias corridos desde o Doing): só Issue e User Story
      const fluxoCt = noPeriodo.filter(i => TIPOS_FLUXO_CT.includes(i.type));
      fluxo.push(media(fluxoCt.map(eficienciaItem).filter((v) => v !== null)));
      cycle.push(p85(fluxoCt.map(i => i.cicloDias).filter((v) => typeof v === 'number')));

      // Bugs Produção: Issues criadas no período, no critério da gestão (bugProducao)
      const issuesPeriodo = issuesTime.filter(i => dentroDoPeriodo(i.createdDate, b));
      bugs.push(issuesPeriodo.length);
      bugsVersao.push(issuesPeriodo.filter(temVersao).length);

      // Índice de Retrabalho: bugs internos abertos no período (quando o QA pegou)
      retrabalho.push(bugsInternos.filter(i => dentroDoPeriodo(i.createdDate, b)).length);

      // P0 concluídos do período com Cycle Time preenchido: base da Quantidade de P0 e do SLA P0 (dentro de 7 dias)
      const p0 = noPeriodo.filter(isP0).filter(i => typeof i.cycleTime === 'number');
      qtdP0.push(p0.length);
      slaP0.push(pct(p0.filter(i => i.cycleTime <= SLA_P0_DIAS).length, p0.length));
    }

    porTime.fluxo[team] = fluxo;
    porTime.cycle[team] = cycle;
    porTime.bugs[team] = bugs;
    porTime.bugsVersao[team] = bugsVersao;
    porTime.retrabalho[team] = retrabalho;
    porTime.qtdP0[team] = qtdP0;
    porTime.slaP0[team] = slaP0;
  }

  // Médias consolidadas: média dos VALORES dos times, por período e por métrica
  const consolidar = (filtro) => {
    const out = {};
    for (const key of Object.keys(porTime)) {
      const timesDaMetrica = times.filter(t => filtro(t) && metricasDoTime(t).includes(key));
      out[key] = buckets.map((_, idx) => media(
        timesDaMetrica.map(t => porTime[key][t][idx]).filter((v) => typeof v === 'number')
      ));
    }
    return out;
  };

  // De items, não de validos: o departamento ignora o filtro de times
  const depto = buckets.map(b => issuesDoDepartamento(items, b));
  const porTimeDepto = (filtro) => Object.fromEntries(TIMES_PADRAO_PAINEL.map(t =>
    [t, depto.map(l => l.filter(i => filtro(i) && normalizarTime(i.team ?? '') === normalizarTime(t)).length)]));

  return {
    labels: buckets.map(b => b.label),
    times,
    porTime,
    mediaTodos: consolidar(() => true),
    mediaSemSustentacao: consolidar(t => !isSustentacao(t)),
    departamento: {
      // total/porTime = todas as Issues; gestao/gestaoPorTime = critério da gestão (bugDeCliente)
      total: depto.map(l => l.length),
      porTime: porTimeDepto(() => true),
      gestao: depto.map(l => l.filter(bugDeCliente).length),
      gestaoPorTime: porTimeDepto(bugDeCliente),
    },
  };
}

// Faixa aplicável a um time (override por time quando existir).
function faixaDoTime(meta, team) {
  const override = meta.porTime
    ? Object.entries(meta.porTime).find(([k]) => normalizarTime(k) === normalizarTime(team))?.[1]
    : undefined;
  return override ?? { min: meta.min, max: meta.max };
}

// Texto da meta, como aparece no painel e na exportação.
function textoFaixa(f, unidade) {
  if (f.min === null && f.max === null) return 'sem meta';
  if (f.min === null) return `≤ ${f.max}${unidade}`;
  if (f.max === null) return `≥ ${f.min}${unidade}`;
  return `entre ${f.min} e ${f.max}${unidade}`;
}

// Dentro da faixa? min/max null = sem limite naquele lado. Sem dado = null (nem verde nem vermelho).
function dentroDaFaixa(valor, faixa) {
  if (valor === null) return null;
  if (faixa.min !== null && valor < faixa.min) return false;
  if (faixa.max !== null && valor > faixa.max) return false;
  return true;
}

module.exports = {
  METAS_PADRAO,
  TIMES_PLANILHA,
  TIMES_PADRAO_PAINEL,
  normalizarTime,
  metricasDoTime,
  buildPainelMensal,
  issuesDoDepartamento,
  faixaDoTime,
  textoFaixa,
  dentroDaFaixa,
};
