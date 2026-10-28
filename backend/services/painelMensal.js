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
// Retrabalho: verde até 31% (decisão confirmada).
const METAS_PADRAO = {
  fluxo: { label: 'Fluxo de Eficiência', unidade: '%', min: 45, max: 50, porTime: { sustentacao: { min: 50, max: 55 } } },
  cycle: { label: 'Cycle Time (P85, dias úteis)', unidade: 'd', min: 20, max: 34, porTime: { sustentacao: { min: 10, max: 12 } } },
  bugs: { label: 'Bugs Produção', unidade: '', min: 80, max: 100, porTime: { franquia: { min: 80, max: 100 } } },
  retrabalho: { label: 'Índice de Retrabalho', unidade: '%', min: null, max: 31, porTime: { franquia: { min: null, max: 31 } } },
  qtdP0: { label: 'Quantidade de P0', unidade: '', min: null, max: null },
  // Só a Sustentação acompanha SLA P0 (ver PERFIS_TIME) — o geral fica igual ao override só pra não aparecer
  // "sem meta" no cabeçalho da seção; nenhum outro time chega a usar esse valor geral.
  slaP0: { label: 'SLA P0 (≤7 dias)', unidade: '%', min: 60, max: 70, porTime: { sustentacao: { min: 60, max: 70 } } },
};

// Retrabalho = Bug (achado em desenvolvimento) + Issue (escapou para produção): trabalho de correção.
const TIPOS_RETRABALHO = ['Bug', 'Issue'];
const SLA_P0_DIAS = 7;

// Os 5 times da planilha de gestão com escopo de tipos confirmado contra o CSV da GetNaves (ver TIPOS_GETNAVES
// abaixo). Não inclui Franquia/CTC de propósito — ver TIMES_PADRAO_PAINEL.
const TIMES_PLANILHA = ['Sustentacao', 'Boltz', 'Estrategico', 'Tatico', 'Wakanda'];

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
const METRICAS_FRANQUIA = ['bugs', 'retrabalho', 'qtdP0'];
const METRICAS_PADRAO_TIME = ['fluxo', 'cycle', 'bugs', 'retrabalho', 'qtdP0'];
const PERFIS_TIME = { sustentacao: METRICAS_SUSTENTACAO, franquia: METRICAS_FRANQUIA };
function metricasDoTime(team) {
  return PERFIS_TIME[normalizarTime(team)] ?? METRICAS_PADRAO_TIME;
}

// Escopo por tipo, igual ao export da GetNaves: Issue, User Story e Eventuality. Confirmado com o CSV real de
// cada um dos 5 times da planilha (Bug, QA, Task e os demais tipos ficam de fora).
// ponytail: só estes 5 times têm a configuração confirmada; um time novo entra com todos os tipos até termos a dele.
const TIPOS_GETNAVES = Object.fromEntries(
  TIMES_PLANILHA.map(t => [normalizarTime(t), ['Issue', 'User Story', 'Eventuality']])
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

// Fluxo de Eficiência como a GetNaves: ativo ÷ (ativo + fila) em cada item, depois a média dos itens.
// Estados em minúsculo para casar com timeInStatusDays. Itens sem tempo nesses estados não entram.
// "Para Desenvolver" conta como fila (confirmado comparando, item a item, com a API da GetNave: sem essa
// coluna o erro total contra a planilha era de 36 pontos nos 9 meses de 2026 já fechados; com ela, 16).
// "Testing"/"CodeReview" (sem espaço) são nomes de coluna que Boltz/Tático/Estratégico usam e Sustentação
// não — mesmo sentido de "Testando QA"/code review, só com grafia diferente. Sem eles, centenas de dias
// desses 3 times ficavam de fora da conta (nem ativo nem fila), inflando o denominador artificialmente
// pequeno e derrubando o Fluxo em até 30 pontos. Confirmado via query no banco de produção (2026-10-28).
const ESTADOS_ATIVOS = ['active', 'testando qa', 'testing'];
const ESTADOS_FILA = ['aguardando code review', 'fazendo code review', 'aguardando qa', 'para desenvolver', 'codereview'];
const diasEm = (item, estados) =>
  Object.entries(item.timeInStatusDays ?? {})
    .filter(([estado]) => estados.includes(estado.toLowerCase()))
    .reduce((soma, [, dias]) => soma + dias, 0);
const eficienciaItem = (item) => {
  const ativo = diasEm(item, ESTADOS_ATIVOS);
  const fila = diasEm(item, ESTADOS_FILA);
  return ativo + fila === 0 ? null : (ativo / (ativo + fila)) * 100;
};

function buildPainelMensal(items, buckets, timesFiltro) {
  const filtroNorm = timesFiltro?.map(normalizarTime);
  const validos = items.filter(i =>
    i.team && i.team !== 'Sem Time' && noEscopo(i) && (!filtroNorm || filtroNorm.includes(normalizarTime(i.team)))
  );
  const times = [...new Set(validos.map(i => i.team))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const porTime = { fluxo: {}, cycle: {}, bugs: {}, retrabalho: {}, qtdP0: {}, slaP0: {} };

  for (const team of times) {
    const doTime = validos.filter(i => i.team === team);
    const concluidosTime = doTime.filter(i => COMPLETED_STATES.includes(i.state));
    const issuesTime = doTime.filter(i => i.type === 'Issue');

    const fluxo = [];
    const cycle = [];
    const bugs = [];
    const retrabalho = [];
    const qtdP0 = [];
    const slaP0 = [];

    for (const b of buckets) {
      // Itens concluídos cuja data de fechamento cai no período
      const noPeriodo = concluidosTime.filter(i => dentroDoPeriodo(i.closedDate, b));

      // Fluxo de Eficiência: média, item a item, como na GetNaves
      fluxo.push(media(noPeriodo.map(eficienciaItem).filter((v) => v !== null)));

      // Cycle Time em dias úteis (P85)
      cycle.push(p85(noPeriodo.map(i => i.cycleTimeBusinessDays).filter((v) => typeof v === 'number')));

      // Bugs Produção: Issues criadas no período (mesmo critério da série de Qualidade)
      bugs.push(issuesTime.filter(i => dentroDoPeriodo(i.createdDate, b)).length);

      // Índice de Retrabalho: % das entregas concluídas no período que são Bug ou Issue
      retrabalho.push(pct(noPeriodo.filter(i => TIPOS_RETRABALHO.includes(i.type)).length, noPeriodo.length));

      // P0 concluídos do período com Cycle Time preenchido: base da Quantidade de P0 e do SLA P0 (dentro de 7 dias)
      const p0 = noPeriodo.filter(isP0).filter(i => typeof i.cycleTime === 'number');
      qtdP0.push(p0.length);
      slaP0.push(pct(p0.filter(i => i.cycleTime <= SLA_P0_DIAS).length, p0.length));
    }

    porTime.fluxo[team] = fluxo;
    porTime.cycle[team] = cycle;
    porTime.bugs[team] = bugs;
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

  return {
    labels: buckets.map(b => b.label),
    times,
    porTime,
    mediaTodos: consolidar(() => true),
    mediaSemSustentacao: consolidar(t => !isSustentacao(t)),
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
  faixaDoTime,
  textoFaixa,
  dentroDaFaixa,
};
