import { WorkItem } from '../types';

export interface ExportColumn<T> {
  header: string;
  key: string;
  width: number;
  value: (item: T) => string | number | null | undefined;
  // Se true, a célula vira um link clicável (texto "Abrir ↗") em vez do valor bruto.
  isLink?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface XlsxSheet<T = any> {
  name: string;
  items: T[];
  columns: ExportColumn<T>[];
}

// O Excel recusa abrir o arquivo se o nome da aba passar de 31 caracteres ou tiver : \ / ? * [ ]
const sheetName = (name: string) => (name.replace(/[:\\/?*[\]]/g, '-').trim().slice(0, 31) || 'Dados');

// Mesmo padrão (exceljs dinâmico + polyfill de Buffer + Blob/<a download>) já usado em
// CycleTimeAnalyticsDashboard.tsx/CeremoniesDashboard.tsx/QATrackerDashboard.tsx, só que
// parametrizado por coluna em vez de fixo — reaproveitável por qualquer tela.
export async function exportSheetsXlsx(sheets: XlsxSheet[], filename: string): Promise<void> {
  if (typeof (globalThis as Record<string, unknown>).Buffer === 'undefined') {
    const { Buffer: Buf } = await import('buffer');
    (globalThis as Record<string, unknown>).Buffer = Buf;
  }
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DS Metrics';
  wb.created = new Date();

  sheets.forEach(({ name, items, columns }) => {
    const ws = wb.addWorksheet(sheetName(name));
    ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width }));
    ws.getRow(1).font = { bold: true };

    items.forEach(item => {
      const rowValues: Record<string, string | number | null | undefined> = {};
      columns.forEach(c => {
        if (!c.isLink) rowValues[c.key] = c.value(item);
      });
      const row = ws.addRow(rowValues);
      columns.forEach(c => {
        if (c.isLink) {
          const link = c.value(item);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (link) row.getCell(c.key).value = { text: 'Abrir ↗', hyperlink: String(link) } as any;
        }
      });
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportItemsXlsx<T>(
  items: T[],
  columns: ExportColumn<T>[],
  filename: string,
  sheet = 'Dados'
): Promise<void> {
  return exportSheetsXlsx([{ name: sheet, items, columns }], filename);
}

// Colunas padrão pra exportar WorkItem[] — mesmas 12 colunas já usadas em CycleTimeAnalyticsDashboard.tsx.
export function getWorkItemColumns(): ExportColumn<WorkItem>[] {
  return [
    { header: 'ID', key: 'id', width: 10, value: i => i.workItemId },
    { header: 'Título', key: 'title', width: 50, value: i => i.title },
    { header: 'Tipo', key: 'type', width: 16, value: i => i.type },
    { header: 'Time', key: 'team', width: 18, value: i => i.team || '' },
    { header: 'Estado', key: 'state', width: 14, value: i => i.state },
    { header: 'Responsável', key: 'assignedTo', width: 22, value: i => i.assignedTo || '' },
    { header: 'Criado em', key: 'createdDate', width: 14, value: i => i.createdDate ? new Date(i.createdDate).toLocaleDateString('pt-BR') : '' },
    { header: 'Fechado em', key: 'closedDate', width: 14, value: i => i.closedDate ? new Date(i.closedDate).toLocaleDateString('pt-BR') : '' },
    { header: 'Cycle Time (dias)', key: 'cycleTime', width: 16, value: i => i.cycleTime ?? '' },
    { header: 'Lead Time (dias)', key: 'leadTime', width: 16, value: i => i.leadTime ?? '' },
    { header: 'Prioridade', key: 'priority', width: 12, value: i => i.priority ?? '' },
    { header: 'URL', key: 'url', width: 20, value: i => i.url || '', isLink: true },
  ];
}
