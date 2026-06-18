import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './config';
import type { AppData, MonthlyDoc } from '../types';

// ── Document references ──────────────────────────────────────────
const MASTER_REF = doc(db, 'storeData', 'v97_master');

function monthRef(monthKey: string) {
  // "2026_06" → storeData/v97_s_202606
  return doc(db, 'storeData', `v97_s_${monthKey.replace('_', '')}`);
}

// ── Helpers ──────────────────────────────────────────────────────
function strip(obj: any): any {
  if (Array.isArray(obj)) return obj.map(strip);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, strip(v)])
    );
  }
  return obj;
}

// ── Master document (core, no growing arrays) ────────────────────
export function subscribeMasterData(
  onData: (data: Partial<AppData>) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    MASTER_REF,
    (snap) => { if (snap.exists()) onData(snap.data() as Partial<AppData>); },
    (e) => onError?.(e),
  );
}

export async function saveMasterData(data: Partial<AppData>): Promise<void> {
  try {
    // Never write growing arrays to master
    const { todaySales, archiveSales, activityLog, ...core } = data as AppData;
    await setDoc(MASTER_REF, strip(core));
  } catch (e) {
    console.error('saveMasterData error', e);
  }
}

// ── Monthly sales documents ───────────────────────────────────────
export async function saveMonthData(monthKey: string, data: MonthlyDoc): Promise<void> {
  try {
    await setDoc(monthRef(monthKey), strip(data));
  } catch (e) {
    console.error('saveMonthData error', e);
  }
}

export async function loadMonthData(monthKey: string): Promise<MonthlyDoc | null> {
  try {
    const snap = await getDoc(monthRef(monthKey));
    if (snap.exists()) return snap.data() as MonthlyDoc;
    return null;
  } catch (e) {
    console.error('loadMonthData error', e);
    return null;
  }
}

export function subscribeMonthData(
  monthKey: string,
  onData: (data: MonthlyDoc) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    monthRef(monthKey),
    (snap) => {
      if (snap.exists()) onData(snap.data() as MonthlyDoc);
      else onData({ sales: [], archive: [], log: [] });
    },
    (e) => onError?.(e),
  );
}

// ── Legacy: full document save (kept for migration) ───────────────
export async function saveAppData(data: AppData): Promise<void> {
  await saveMasterData(data);
  // Monthly data is handled by the store
}
