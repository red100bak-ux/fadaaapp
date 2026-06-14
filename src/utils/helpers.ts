import type { SaleRecord, StockItem, Folder } from '../types';

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Alias kept for any existing callers
export const generateNid = generateId;

export interface NowResult {
  date: string;     // DD/MM/YYYY
  time: string;     // HHhMM
  dateTime: string; // DD/MM/YYYY HHhMM
  monthKey: string; // YYYY-M
  yearKey: string;  // YYYY
}

export function nowDate(): NowResult {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const date = `${day}/${month}/${year}`;
  const time = `${hours}h${minutes}`;
  return {
    date,
    time,
    dateTime: `${date} ${time}`,
    monthKey: `${year}-${d.getMonth() + 1}`,
    yearKey: year,
  };
}

// Keep legacy exports
export function getDateString(): string {
  return nowDate().date;
}
export function getTimeString(): string {
  return nowDate().time;
}
export function getMonthKey(): string {
  return nowDate().monthKey;
}
export function getYearKey(): string {
  return nowDate().yearKey;
}

export function makeSaleRecord(
  overrides: Pick<SaleRecord, 'name' | 'sell' | 'buy' | 'cat' | 'seller'>,
): SaleRecord {
  const { date, time, monthKey, yearKey } = nowDate();
  return {
    nid: generateId(),
    time,
    dateString: date,
    monthKey,
    yearKey,
    ...overrides,
  };
}

export function formatMAD(n: number): string {
  if (!n || isNaN(n)) return '0 د';
  return n.toLocaleString('fr-MA') + ' د';
}

export function getItemsForFolder(
  stock: Record<string, StockItem>,
  folderName: string,
): Array<[string, StockItem]> {
  return Object.entries(stock).filter(([, item]) => item.cat === folderName);
}

export function countFolderItems(stock: Record<string, StockItem>, folderName: string): number {
  return getItemsForFolder(stock, folderName).length;
}

export function folderTotalQty(stock: Record<string, StockItem>, folderName: string): number {
  return getItemsForFolder(stock, folderName).reduce((s, [, i]) => s + (i.qty || 0), 0);
}

export function folderTotalValue(stock: Record<string, StockItem>, folderName: string): number {
  return getItemsForFolder(stock, folderName).reduce(
    (s, [, i]) => s + (i.sell || 0) * (i.qty || 0),
    0,
  );
}

export const FOLDER_COLORS: Record<string, { bg: string; fg: string }> = {
  'folder-new':    { bg: '#eef2ff', fg: '#5c67f2' },
  'folder-used':   { bg: '#ecfdf5', fg: '#10b981' },
  'folder-lcd':    { bg: '#eff6ff', fg: '#3b82f6' },
  'folder-repair': { bg: '#fff7ed', fg: '#f97316' },
  'folder-acc':    { bg: '#f5f3ff', fg: '#8b5cf6' },
};

export function getFolderColor(folder: Folder): { bg: string; fg: string } {
  return FOLDER_COLORS[folder.colorClass ?? ''] ?? { bg: '#f1f5f9', fg: '#64748b' };
}

export function creditGrandTotal(credit: Record<string, { total: number }>): number {
  return Object.values(credit).reduce((s, c) => s + (c.total || 0), 0);
}
