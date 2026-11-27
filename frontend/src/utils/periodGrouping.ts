import { eachWeekOfInterval, eachMonthOfInterval, eachYearOfInterval, endOfWeek, endOfMonth, endOfYear, format, subDays, subMonths, subYears, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type PeriodGroupMode = 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface PeriodBucket {
  label: string;
  start: Date;
  end: Date;
}

// Corta [start, end] em baldes semanais/quinzenais/mensais/anuais — mesmo formato de rótulo já usado
// nos seletores que já existem no app (ExecutiveHomeDashboard, TeamThroughputTrendChart, etc.), pra
// não reimplementar essa lógica de novo em cada tela nova que ganha o seletor.
export function getPeriodBuckets(start: Date, end: Date, mode: PeriodGroupMode): PeriodBucket[] {
  if (mode === 'weekly') {
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map(weekStart => ({
      label: format(weekStart, 'dd/MM', { locale: ptBR }),
      start: weekStart,
      end: endOfWeek(weekStart, { weekStartsOn: 1 }),
    }));
  }
  if (mode === 'biweekly') {
    // date-fns não tem helper quinzenal — mesmo loop manual já usado nos seletores existentes.
    const buckets: PeriodBucket[] = [];
    let cursor = new Date(start);
    while (cursor < end) {
      const periodEnd = addDays(cursor, 13);
      const bucketEnd = periodEnd > end ? end : periodEnd;
      buckets.push({
        label: `${format(cursor, 'dd/MM')}-${format(bucketEnd, 'dd/MM')}`,
        start: new Date(cursor),
        end: bucketEnd,
      });
      cursor = addDays(cursor, 14);
    }
    return buckets;
  }
  if (mode === 'monthly') {
    return eachMonthOfInterval({ start, end }).map(monthStart => ({
      label: format(monthStart, 'MMM/yy', { locale: ptBR }),
      start: monthStart,
      end: endOfMonth(monthStart),
    }));
  }
  // yearly
  try {
    return eachYearOfInterval({ start, end }).map(yearStart => ({
      label: format(yearStart, 'yyyy'),
      start: yearStart,
      end: endOfYear(yearStart),
    }));
  } catch {
    return [];
  }
}

// Atalho pra "últimos N baldes até agora" — pros gráficos que hoje têm uma janela fixa (ex: últimas
// 12 semanas) em vez de um intervalo de datas explícito escolhido pelo usuário.
export function getLastNPeriods(mode: PeriodGroupMode, n: number, end: Date = new Date()): PeriodBucket[] {
  const start = mode === 'weekly' ? subDays(end, n * 7)
    : mode === 'biweekly' ? subDays(end, n * 14)
    : mode === 'monthly' ? subMonths(end, n)
    : subYears(end, n);
  return getPeriodBuckets(start, end, mode);
}

// Row de botões padrão (Semanal/Quinzenal/Mensal/Anual) — só os rótulos/valores, cada tela continua
// desenhando seu próprio botão com o estilo pill já estabelecido.
export const PERIOD_GROUP_MODE_OPTIONS: { value: PeriodGroupMode; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
];
