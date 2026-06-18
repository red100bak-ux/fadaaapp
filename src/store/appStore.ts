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

function prevMonthKey(): string {
  const now = new Date();
  let m = now.getMonth(); // 0-indexed
  let y = now.getFullYear();
  if (m === 0) { m = 12; y--; } else {}
  return `${y}_${String(m).padStart(2, '0')}`;
}

function monthKeyFromDate(dateStr: string): string {
  // "DD/MM/YYYY" → "YYYY_MM"
  const parts = (dateStr ?? '').split('/');
  if (parts.length === 3) return `${parts[2]}_${parts[1]}`;
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

// ── Merge months into full AppData ───────────────────────────────
function mergeAppData(core: Partial<AppData>, months: Record<string, MonthlyDoc>): AppData {
  const allSales   = Object.values(months).flatMap(m => m.sales   ?? []);
  const allArchive = Object.values(months).flatMap(m => m.archive ?? []);
  const allLog     = Object.values(months).flatMap(m => m.log     ?? []);
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

// ── Default data ─────────────────────────────────────────────────
export const DEFAULT_FOLDERS: Folder[] = [
  { id: 'f1', name: 'جديد',          icon: '📱', active: true, colorClass: 'folder-new'    },
  { id: 'f2', name: 'مستعمل',        icon: '♻️', active: true, colorClass: 'folder-used'   },
  { id: 'f3', name: 'LCD',           icon: '📺', active: true, colorClass: 'folder-lcd'    },
  { id: 'f_repair', name: 'إصلاح مانيال', icon: '🛠️', active: true, special: 'repair', colorClass: 'folder-repair' },
  { id: 'f4', name: 'سماعات',        icon: '🎧', active: true, colorClass: 'folder-acc'   },
  { id: 'f5', name: 'شواحن',         icon: '🔌', active: true, colorClass: 'folder-acc'   },
  { id: 'f6', name: 'كابلات',        icon: '🪢', active: true, colorClass: 'folder-acc'   },
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
  _core: {},
  _months: {},
  _unsubs: [],

  setApp: (data) => {
    const merged = ensureAppStructure(data);
    set({ app: merged, isLoaded: true });
  },

  sync: () => {
    if (get().auth?.role === 'demo') return;
    const { todaySales, archiveSales, activityLog, ...core } = get().app;
    saveMasterData(core);
  },

  updateApp: (updater) => {
    const prev = get().app;
    const next = updater(prev);

    // Demo mode — local only, no Firebase
    if (get().auth?.role === 'demo') {
      set({ app: ensureAppStructure(next) });
      return;
    }
    const { todaySales, archiveSales, activityLog, ...core } = next;

    const curMk = currentMonthKey();
    const prevMonths = get()._months;

    // Recompute all currently-loaded months from the new data
    const allMonthKeys = new Set([
      ...Object.keys(prevMonths),
      ...(todaySales ?? []).map(s => s.monthKey ?? curMk),
      curMk,
    ]);

    const newMonths: Record<string, MonthlyDoc> = {};
    for (const mk of allMonthKeys) {
      newMonths[mk] = {
        sales:   (todaySales   ?? []).filter(s => (s.monthKey ?? curMk) === mk),
        archive: (archiveSales ?? []).filter(a => monthKeyFromDate(a.soldAt) === mk),
        log:     (activityLog  ?? []).filter(l => monthKeyFromTs(l.ts) === mk),
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

    // Demo mode — empty local data, no Firebase at all
    if (get().auth?.role === 'demo') {
      set({ app: ensureAppStructure(EMPTY_APP), isLoaded: true, _core: {}, _months: {}, _unsubs: [] });
      return;
    }

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
        const newApp  = mergeAppData(newCore, get()._months);
        set({ _core: newCore, app: newApp, isLoaded: true });
        AsyncStorage.setItem('fadaa_app_cache', JSON.stringify(newApp)).catch(() => {});
      },
      (e) => console.error('Master listener error', e),
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
  },

  stopListening: () => {
    get()._unsubs.forEach(u => u());
    set({ _unsubs: [] });
  },

  // Load specific months on demand (for year/archive views in report)
  ensureMonthsLoaded: async (monthKeys: string[]) => {
    if (get().auth?.role === 'demo') return;
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
  if (!base.activityLog)    base.activityLog    = [];
  return base as AppData;
}
