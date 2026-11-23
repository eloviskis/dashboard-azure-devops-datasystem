// backend/services/retroPrompts.js
// Prompts da aba Retrô, copiados do protótipo (docs/retro/referencia-retro-em-acao.html, Anexo A da spec).
const { retroText } = require('./retroRules');

const STATE_LABEL = { sugerida: 'Sugestão', aberta: 'A fazer', andamento: 'Em andamento', validacao: 'Validar', concluida: 'Fechada', descartada: 'Descartada' };
const fmtBr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

// A.1 — estruturar o texto extraído de um PDF do EasyRetro.
const pdfStructurePrompt = (text) => `Este é o texto extraído de um PDF exportado do EasyRetro (uma retrospectiva ágil). A ordem é: título do quadro, "Gerado <data>", "Sumário" com contadores (ignore), "Cards" e então cada coluna: o nome da coluna, uma linha de descrição da coluna e os cards dela, um por vez. Um número solto (como 1 ou 2) logo depois de um card é a contagem de votos ou de comentários daquele card. Quando há contagem de comentários, as linhas seguintes que respondem ao card são comentários dele. Linhas "---" juntam cards mesclados: mantenha tudo num único card, com "\\n---\\n" entre as partes. Um card pode ocupar várias linhas: junte as linhas de um mesmo card.

Texto:
${String(text).slice(0, 30000)}

Responda somente com JSON: {"title":"título do quadro","columns":[{"name":"nome da coluna","description":"descrição da coluna","cards":[{"t":"texto do card","v":0,"c":["comentário"]}]}]}
Em "v" ponha os votos (0 se não souber se o número era voto ou comentário e não houver comentário depois). Não invente nem resuma: copie o texto dos cards.`;

// A.2 — leitura da retro e sugestões de ação.
function retroAnalysisPrompt({ retro, teamLabel, existingActions, typeNames }) {
  const existentes = existingActions.slice(0, 40).map(a => `- ${a.title} (${STATE_LABEL[a.state] || a.state})`).join('\n') || '(nenhuma)';
  return `Você ajuda a liderança de times de desenvolvimento de software a transformar retrospectivas em ações concretas.

Retro: ${retro.title}
Time: ${teamLabel}
Data: ${fmtBr(retro.date) || 'sem data'}

Colunas e cards (votos entre colchetes; "↳" são comentários do time):
${retroText(retro, 16000)}

Ações que este time já tem (não repita nem crie variações delas):
${existentes}

Tipos de ação disponíveis (use 1 ou 2 por ação, escritos exatamente como abaixo):
${typeNames.map(n => `- ${n}`).join('\n')}

Responda somente com JSON neste formato:
{"resumo":"2 a 3 frases sobre o clima e os pontos centrais","temas":[{"tema":"rótulo curto","tom":"positivo|atencao|critico","detalhe":"1 frase"}],"elogios":["elogio curto com o nome de quem foi citado"],"acoes":[{"titulo":"começa com verbo no infinitivo, até 80 caracteres","detalhe":"o que fazer e como saber que foi feito, 1 a 2 frases","origem":["trecho curto do card que motivou"],"prioridade":"alta|media|baixa","responsavel":"nome citado nos cards como dono da ação, ou texto vazio","recorrente":false,"tags":["tipo da lista acima"]}]}
(Use "recorrente": true quando a ação for um hábito que o time precisa manter sempre, sem data de fim, como olhar um painel na daily.)

Regras: de 3 a 7 ações, pequenas o bastante para caber em duas semanas; dê prioridade a cards com votos, comentários e temas repetidos; não invente fatos nem nomes; ignore cards só de brincadeira; escreva em português do Brasil.`;
}

// A.3 — feedback para o time.
function teamFeedbackPrompt({ teamLabel, today, retros, actions }) {
  const retrosTxt = retros.map(r => {
    const head = `### ${r.title} (${fmtBr(r.date) || 'sem data'})`;
    if (r.insights?.resumo) {
      const temas = (r.insights.temas || []).map(t => `${t.tema} [${t.tom}]`).join('; ');
      return `${head}\n${r.insights.resumo}${temas ? `\nTemas: ${temas}` : ''}`;
    }
    return `${head}\n${retroText(r, 4000)}`;
  }).join('\n\n').slice(0, 18000);
  const acoesTxt = actions.map(a => [
    `- ${a.title}`, STATE_LABEL[a.state] || a.state, (a.typeNames || []).join(', ') || 'sem tipo', a.ownerName || 'sem responsável',
    a.recurring ? 'recorrente, sem data' : (fmtBr(a.due_date) || 'sem prazo'), ...(a.late ? ['ATRASADA'] : []), `atualizações: ${a.updatesCount || 0}`,
  ].join(' | ')).join('\n') || '(nenhuma)';
  return `Você é um agile coach escrevendo um feedback curto, honesto e respeitoso para o time "${teamLabel}", com base nas retrospectivas e no andamento das ações combinadas. Hoje é ${fmtBr(today)}.

Retrospectivas:
${retrosTxt || '(nenhuma)'}

Ações do time:
${acoesTxt}

Responda somente com JSON:
{"mensagem":"um parágrafo de 3 a 5 frases dirigido ao time, reconhecendo o que vai bem e apontando o principal ponto de atenção","manter":["até 3 itens"],"melhorar":["até 3 itens"],"proximo_passo":"uma ação concreta para a próxima sprint"}

Escreva em português do Brasil, sem expor críticas a pessoas específicas e sem inventar fatos.`;
}

module.exports = { pdfStructurePrompt, retroAnalysisPrompt, teamFeedbackPrompt, STATE_LABEL };
