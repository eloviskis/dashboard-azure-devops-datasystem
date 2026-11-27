// html2canvas-pro (não o html2canvas original) — o original não sabe interpretar oklch(), a função
// de cor que o Tailwind v4 usa por padrão em toda classe de cor/gradiente, e quebra em qualquer tela
// que tenha um card com gradiente (a maioria). O -pro é o fork feito exatamente pra isso.
import html2canvas from 'html2canvas-pro';
import { format } from 'date-fns';

export async function exportElementAsPng(el: HTMLElement, filenamePrefix = 'dashboard'): Promise<void> {
  const canvas = await html2canvas(el, { backgroundColor: '#0a192f', scale: 2, useCORS: true });
  const link = document.createElement('a');
  link.download = `${filenamePrefix}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
