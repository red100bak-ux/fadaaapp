import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppData, AuthState, Folder, MonthlyDoc } from '../types';
import {
  saveMasterData, subscribeMasterData,
  saveMonthData, loadMonthData, subscribeMonthData,
} from '../firebase/firestore';

// ── Month key helpers ────────────────────────────────────────────
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// تحويل الفورمات القديم "2026-6" للجديد "2026_06"
function normalizeMonthKey(mk: string): string {
  if (!mk) return mk;
  // Old format: "YYYY-M" or "YYYY-MM" (with dash)
  const dashMatch = mk.match(/^(\d{4})-(\d{1,2})$/);
  if (dashMatch) {
    return `${dashMatch[1]}_${dashMatch[2].padStart(2, '0')}`;
  }
  return mk;
}

function isOldMonthKey(mk: string): boolean {
  return /^\d{4}-\d{1,2}$/.test(mk);
}

function prevMonthKey(): string {
  const now = new Date();
  let m = now.getMonth(); // 0-indexed
  let y = now.getFullYear();
  if (m === 0) { m = 12; y--; }
  return `${y}_${String(m).padStart(2, '0')}`;
}

function monthKeyFromDate(dateStr: string): string {
  // "DD/MM/YYYY" → "YYYY_MM"
  const parts = (dateStr ?? '').split('/');
  if (parts.length === 3 && parts[2] && parts[1]) return `${parts[2]}_${parts[1].padStart(2, '0')}`;
  return currentMonthKey();
}

function monthKeyFromTs(ts: string): string {
  try {
    const d = new Date(ts);
    return `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch {
    return currentMonthKey();
  }
}

// ── إزالة المكررات بناءً على nid/id ──────────────────────────────
function dedup<T extends { nid?: string; id?: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter(item => {
    const key = item.nid ?? item.id ?? '';
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Merge months into full AppData ───────────────────────────────
function mergeAppData(core: Partial<AppData>, months: Record<string, MonthlyDoc>): AppData {
  const allSales   = dedup(Object.values(months).flatMap(m => m.sales   ?? []));
  const allArchive = dedup(Object.values(months).flatMap(m => m.archive ?? []));
  const allLog     = dedup(Object.values(months).flatMap(m => m.log     ?? []));
  return ensureAppStructure({
    ...core,
    todaySales: allSales,
    archiveSales: allArchive,
    activityLog: allLog,
  });
}

// ── Migration: old format had everything in master ────────────────
async function migrateIfNeeded(
  rawMaster: any,
  setMonths: (m: Record<string, MonthlyDoc>) => void,
  onDone: (core: Partial<AppData>, months: Record<string, MonthlyDoc>) => void,
) {
  const { todaySales, archiveSales, activityLog, ...core } = rawMaster as AppData;

  if (!todaySales?.length && !archiveSales?.length && !activityLog?.length) {
    onDone(core, {});
    return;
  }

  // Group growing arrays by month
  const buckets: Record<string, MonthlyDoc> = {};
  const addToBucket = (mk: string) => {
    if (!buckets[mk]) buckets[mk] = { sales: [], archive: [], log: [] };
    return buckets[mk];
  };

  for (const s of (todaySales ?? []))  addToBucket(s.monthKey ?? currentMonthKey()).sales.push(s);
  for (const a of (archiveSales ?? [])) addToBucket(monthKeyFromDate(a.soldAt)).archive.push(a);
  for (const l of (activityLog ?? []))  addToBucket(monthKeyFromTs(l.ts)).log.push(l);

  // Save monthly docs
  await Promise.all(Object.entries(buckets).map(([mk, d]) => saveMonthData(mk, d)));

  // Update salesMonths index and save clean master
  const salesMonths = Object.keys(buckets).sort();
  const cleanCore = { ...core, salesMonths };
  await saveMasterData(cleanCore);

  onDone(cleanCore, buckets);
}

// ── Migration: تحويل month keys من فورمات قديم "2026-6" لجديد "2026_06" ──
async function migrateOldMonthKeys(salesMonths: string[]): Promise<string[] | null> {
  const oldKeys = salesMonths.filter(isOldMonthKey);
  if (oldKeys.length === 0) return null;

  for (const oldMk of oldKeys) {
    const newMk = normalizeMonthKey(oldMk);
    try {
      const oldData = await loadMonthData(oldMk);
      if (!oldData) continue;
      const newData = await loadMonthData(newMk);
      const merged: MonthlyDoc = {
        sales:   [...(newData?.sales   ?? []), ...(oldData.sales   ?? [])],
        archive: [...(newData?.archive ?? []), ...(oldData.archive ?? [])],
        log:     [...(newData?.log     ?? []), ...(oldData.log     ?? [])],
      };
      await saveMonthData(newMk, merged);
    } catch {}
  }

  // نحدثو salesMonths بالفورمات الجديد
  const newMonths = salesMonths.map(mk => normalizeMonthKey(mk));
  return [...new Set(newMonths)].sort();
}

// ── Default data ─────────────────────────────────────────────────
export const DEFAULT_FOLDERS: Folder[] = [
  { id: 'f1', name: 'جديد',          icon: '📱', active: true, colorClass: 'folder-new'    },
  { id: 'f2', name: 'مستعمل',        icon: '♻️', active: true, colorClass: 'folder-used'   },
  { id: 'f3', name: 'LCD',           icon: '📺', active: true, colorClass: 'folder-lcd'    },
  { id: 'f_repair', name: 'إصلاح مانيال', icon: '🛠️', active: true, special: 'repair', colorClass: 'folder-repair' },
  { id: 'f4', name: 'سماعات',        icon: '🎧', active: true, colorClass: 'folder-acc'   },
  { id: 'f5', name: 'شواحن',         icon: '🔌', active: true, colorClass: 'folder-acc'   },
  { id: 'f6', name: 'كابلات',        icon: '🪢', active: true, colorClass: 'folder-acc'   },
  { id: 'f_click', name: 'CLICK',    icon: '👆', active: true, special: 'click', colorClass: 'folder-acc' },
];

const EMPTY_APP: AppData = {
  stock: {}, credit: {}, supplierCredit: {}, todaySales: [], suppliers: [],
  users: { '0661876525': { name: 'ماستر', role: 'super_admin', pin: '820410', isSuperAdmin: true } },
  resetPin: '0000',
  partsList: [
    { id: 'afficheur', name: '📱 لافيشور'     },
    { id: 'batterie',  name: '🔋 الباتري'      },
    { id: 'connecteur',name: '🔌 كونيكتور شارج' },
    { id: 'general',   name: '⚙️ إصلاح عام'   },
  ],
  employees: {}, monthlyExpenses: {}, monthlyIncome: {}, folders: DEFAULT_FOLDERS,
};

// ── Store interface ───────────────────────────────────────────────
interface AppStore {
  app: AppData;
  auth: AuthState | null;
  isLoaded: boolean;
  isOnline: boolean;

  // internal (split state)
  _core: Partial<AppData>;
  _months: Record<string, MonthlyDoc>;
  _unsubs: (() => void)[];

  setApp: (data: AppData) => void;
  updateApp: (updater: (prev: AppData) => AppData) => void;
  sync: () => void;
  startListening: () => void;
  stopListening: () => void;
  ensureMonthsLoaded: (monthKeys: string[]) => Promise<void>;

  setAuth: (auth: AuthState) => void;
  clearAuth: () => void;
  loadSavedAuth: () => Promise<AuthState | null>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  app: EMPTY_APP,
  auth: null,
  isLoaded: false,
  isOnline: false,
  _core: {},
  _months: {},
  _unsubs: [],

  setApp: (data) => {
    const merged = ensureAppStructure(data);
    set({ app: merged, isLoaded: true });
  },

  sync: () => {
    const { todaySales, archiveSales, activityLog, ...core } = get().app;
    saveMasterData(core);
  },

  updateApp: (updater) => {
    const prev = get().app;
    const next = updater(prev);

    const { todaySales, archiveSales, activityLog, ...core } = next;

    const curMk = currentMonthKey();
    const prevMonths = get()._months;

    // تطبيع monthKeys القديمة قبل الحفظ
    const normalizeSales = (todaySales ?? []).map(s => ({
      ...s,
      monthKey: normalizeMonthKey(s.monthKey ?? curMk),
    }));
    const normalizeLog = (activityLog ?? []).map(l => ({
      ...l,
      monthKey: normalizeMonthKey((l as any).monthKey ?? monthKeyFromTs(l.ts)),
    }));

    // Recompute all currently-loaded months from the new data
    const allMonthKeys = new Set([
      ...Object.keys(prevMonths).map(normalizeMonthKey),
      ...normalizeSales.map(s => s.monthKey),
      curMk,
    ]);

    const newMonths: Record<string, MonthlyDoc> = {};
    for (const mk of allMonthKeys) {
      newMonths[mk] = {
        sales:   normalizeSales.filter(s => s.monthKey === mk),
        archive: (archiveSales ?? []).filter(a => monthKeyFromDate(a.soldAt) === mk),
        log:     normalizeLog.filter(l => (l as any).monthKey === mk),
      };
    }

    // Keep salesMonths index up to date
    const existingSalesMonths = (core.salesMonths ?? get()._core.salesMonths ?? []) as string[];
    const salesMonths = Array.from(new Set([...existingSalesMonths, ...Object.keys(newMonths)])).sort();
    const newCore = { ...core, salesMonths };

    const newApp = mergeAppData(newCore, newMonths);
    set({ _core: newCore, _months: newMonths, app: newApp });

    // Save master (core only)
    saveMasterData(newCore);

    // Save only changed monthly docs
    for (const [mk, monthData] of Object.entries(newMonths)) {
      const prev = prevMonths[mk];
      if (!prev ||
          prev.sales.length   !== monthData.sales.length   ||
          prev.archive.length !== monthData.archive.length ||
          prev.log.length     !== monthData.log.length) {
        saveMonthData(mk, monthData);
      }
    }

    AsyncStorage.setItem('fadaa_app_cache', JSON.stringify(newApp)).catch(() => {});
  },

  startListening: () => {
    get()._unsubs.forEach(u => u());

    // Load local cache immediately for offline support
    AsyncStorage.getItem('fadaa_app_cache').then((raw) => {
      if (raw && !get().isLoaded) {
        try {
          const cached = JSON.parse(raw);
          const merged = ensureAppStructure(cached);
          // Extract cached months
          const cmk = currentMonthKey();
          const pmk = prevMonthKey();
          const months: Record<string, MonthlyDoc> = {
            [cmk]: {
              sales:   (merged.todaySales   ?? []).filter(s => s.monthKey === cmk),
              archive: (merged.archiveSales ?? []).filter(a => monthKeyFromDate(a.soldAt) === cmk),
              log:     (merged.activityLog  ?? []).filter(l => monthKeyFromTs(l.ts) === cmk),
            },
            [pmk]: {
              sales:   (merged.todaySales   ?? []).filter(s => s.monthKey === pmk),
              archive: (merged.archiveSales ?? []).filter(a => monthKeyFromDate(a.soldAt) === pmk),
              log:     (merged.activityLog  ?? []).filter(l => monthKeyFromTs(l.ts) === pmk),
            },
          };
          set({ app: merged, _core: merged, _months: months, isLoaded: true });
        } catch {}
      }
    }).catch(() => {});

    const cmk = currentMonthKey();
    const pmk = prevMonthKey();
    const unsubs: (() => void)[] = [];

    // Subscribe to master document
    const unsubMaster = subscribeMasterData(
      async (rawCore) => {
        // Check if this is old format (has todaySales in master)
        if ((rawCore as any).todaySales?.length > 0 || (rawCore as any).archiveSales?.length > 0) {
          await migrateIfNeeded(rawCore, () => {}, (core, months) => {
            const allMonths = { ...get()._months, ...months };
            const newApp = mergeAppData(core, allMonths);
            set({ _core: core, _months: allMonths, app: newApp, isLoaded: true });
            AsyncStorage.setItem('fadaa_app_cache', JSON.stringify(newApp)).catch(() => {});
          });
          return;
        }

        const newCore = { ...get()._core, ...rawCore };
        // تنظيف المكررات من Firebase مرة وحيدة
        const curMk2 = currentMonthKey();
        AsyncStorage.getItem('fadaa_dedup_done').then(async (done) => {
          if (done) return;
          try {
            const monthData = await loadMonthData(curMk2);
            if (!monthData) return;
            const cleanSales   = dedup(monthData.sales   ?? []);
            const cleanArchive = dedup(monthData.archive ?? []);
            const cleanLog     = dedup(monthData.log     ?? []);
            if (cleanSales.length < (monthData.sales?.length ?? 0) ||
                cleanArchive.length < (monthData.archive?.length ?? 0) ||
                cleanLog.length < (monthData.log?.length ?? 0)) {
              await saveMonthData(curMk2, { sales: cleanSales, archive: cleanArchive, log: cleanLog });
            }
            AsyncStorage.setItem('fadaa_dedup_done', '1');
          } catch {}
        }).catch(() => {});
        const newApp  = mergeAppData(newCore, get()._months);
        set({ _core: newCore, app: newApp, isLoaded: true, isOnline: true });
        AsyncStorage.setItem('fadaa_app_cache', JSON.stringify(newApp)).catch(() => {});
      },
      (e) => { console.error('Master listener error', e); set({ isOnline: false }); },
    );
    unsubs.push(unsubMaster);

    // Subscribe to current month (real-time)
    const unsubCur = subscribeMonthData(
      cmk,
      (monthData) => {
        const newMonths = { ...get()._months, [cmk]: monthData };
        const newApp    = mergeAppData(get()._core, newMonths);
        set({ _months: newMonths, app: newApp });
        AsyncStorage.setItem('fadaa_app_cache', JSON.stringify(newApp)).catch(() => {});
      },
      (e) => console.error('Month listener error', e),
    );
    unsubs.push(unsubCur);

    // Load previous month once (no real-time needed)
    if (pmk !== cmk) {
      loadMonthData(pmk).then((data) => {
        const monthData = data ?? { sales: [], archive: [], log: [] };
        const newMonths = { ...get()._months, [pmk]: monthData };
        const newApp    = mergeAppData(get()._core, newMonths);
        set({ _months: newMonths, app: newApp });
      });
    }

    set({ _unsubs: unsubs });

    // Migration نظيفة مرة وحيدة — تحويل بيانات من "2026-6" لـ "2026_06"
    AsyncStorage.getItem('fadaa_month_migrated').then(async (done) => {
      if (done === '1') return;
      const allKeys: string[] = (get()._core as any)?.salesMonths ?? [];
      const oldKeys = allKeys.filter(isOldMonthKey);
      if (oldKeys.length === 0) {
        AsyncStorage.setItem('fadaa_month_migrated', '1');
        return;
      }
      for (const oldMk of oldKeys) {
        const newMk = normalizeMonthKey(oldMk);
        try {
          const oldData = await loadMonthData(oldMk);
          if (!oldData) continue;
          const newData = await loadMonthData(newMk);
          // تصحيح monthKey داخل كل record
          const fixKey = (s: any) => ({ ...s, monthKey: normalizeMonthKey(s.monthKey ?? oldMk) });
          const merged: MonthlyDoc = {
            sales:   dedup([...(newData?.sales ?? []), ...(oldData.sales ?? []).map(fixKey)]),
            archive: dedup([...(newData?.archive ?? []), ...(oldData.archive ?? [])]),
            log:     dedup([...(newData?.log ?? []), ...(oldData.log ?? []).map(fixKey)]),
          };
          await saveMonthData(newMk, merged);
        } catch {}
      }
      // تحديث salesMonths بالفورمات الصحيح
      const updatedMonths = [...new Set(allKeys.map(normalizeMonthKey))].sort();
      saveMasterData({ ...(get()._core as any), salesMonths: updatedMonths });
      AsyncStorage.setItem('fadaa_month_migrated', '1');
    }).catch(() => {});
  },

  stopListening: () => {
    get()._unsubs.forEach(u => u());
    set({ _unsubs: [] });
  },

  // Load specific months on demand (for year/archive views in report)
  ensureMonthsLoaded: async (monthKeys: string[]) => {
    const already  = get()._months;
    const toLoad   = monthKeys.filter(mk => !(mk in already));
    if (toLoad.length === 0) return;

    const results  = await Promise.all(toLoad.map(mk => loadMonthData(mk)));
    const newMonths = { ...already };
    for (let i = 0; i < toLoad.length; i++) {
      newMonths[toLoad[i]] = results[i] ?? { sales: [], archive: [], log: [] };
    }

    const newApp = mergeAppData(get()._core, newMonths);
    set({ _months: newMonths, app: newApp });
  },

  setAuth: (auth) => {
    set({ auth });
    AsyncStorage.setItem('fadaa_auth', JSON.stringify(auth));
  },

  clearAuth: () => {
    set({ auth: null });
    AsyncStorage.multiRemove(['fadaa_auth', 'fadaa_bio_phone', 'fadaa_bio_cred_id']);
  },

  loadSavedAuth: async () => {
    try {
      const raw  = await AsyncStorage.getItem('fadaa_auth');
      if (!raw) return null;
      const auth = JSON.parse(raw) as AuthState;
      set({ auth });
      return auth;
    } catch {
      return null;
    }
  },
}));

// ── Ensure all required fields exist ────────────────────────────
function ensureAppStructure(data: Partial<AppData>): AppData {
  const base = { ...EMPTY_APP, ...data };
  if (!base.stock)          base.stock          = {};
  if (!base.credit)         base.credit         = {};
  if (!base.supplierCredit) base.supplierCredit = {};
  if (!base.todaySales)     base.todaySales     = [];
  if (!base.suppliers)      base.suppliers      = [];
  if (!base.users || Object.keys(base.users).length === 0) base.users = EMPTY_APP.users;
  if (!base.partsList  || base.partsList.length  === 0) base.partsList  = EMPTY_APP.partsList;
  if (!base.employees)      base.employees      = {};
  if (!base.monthlyExpenses)base.monthlyExpenses = {};
  if (!base.monthlyIncome)  base.monthlyIncome  = {};
  if (!base.resetPin)       base.resetPin       = '0000';
  if (!base.folders || base.folders.length === 0) base.folders = DEFAULT_FOLDERS;
  // تأكد أن مجلد CLICK موجود مع special: 'click'
  if (base.folders && !base.folders.find((f: any) => f.special === 'click')) {
    const clickFolder = DEFAULT_FOLDERS.find(f => f.special === 'click');
    if (clickFolder) base.folders = [...base.folders, clickFolder];
  }
  if (!base.activityLog)    base.activityLog    = [];
  return base as AppData;
}
