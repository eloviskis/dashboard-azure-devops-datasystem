// Dias úteis entre duas datas (início e fim incluídos), descontando só sábado e domingo.
// Sem calendário de feriados — ponytail: feriados nacionais/estaduais não são descontados; se a planilha
// divergir por causa deles, o upgrade é uma lista de feriados por ano passada pra função.
function calcularDiasUteis(dataInicio, dataFim) {
  // new Date(null) vira 1970 (válido), então vazio precisa ser rejeitado antes
  if (!dataInicio || !dataFim) return null;
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio > fim) return null;

  let diasUteis = 0;
  const atual = new Date(inicio);
  while (atual <= fim) {
    const diaSemana = atual.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) diasUteis++;
    atual.setDate(atual.getDate() + 1);
  }
  return diasUteis;
}

// Dia civil em Brasília (UTC-3). A GetNaves conta o fim pelo dia, não pelo horário.
function diaBRT(ts) {
  return new Date(new Date(ts).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}

module.exports = { calcularDiasUteis, diaBRT };
