import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppData, AuthState, Folder } from '../types';
import { saveAppData, subscribeToAppData } from '../firebase/firestore';

export const DEFAULT_FOLDERS: Folder[] = [
  { id: 'f1', name: 'جديد', icon: '📱', active: true, colorClass: 'folder-new' },
  { id: 'f2', name: 'مستعمل', icon: '♻️', active: true, colorClass: 'folder-used' },
  { id: 'f3', name: 'LCD', icon: '📺', active: true, colorClass: 'folder-lcd' },
  { id: 'f_repair', name: 'إصلاح مانيال', icon: '🛠️', active: true, special: 'repair', colorClass: 'folder-repair' },
  { id: 'f4', name: 'سماعات', icon: '🎧', active: true, colorClass: 'folder-acc' },
  { id: 'f5', name: 'شواحن', icon: '🔌', active: true, colorClass: 'folder-acc' },
  { id: 'f6', name: 'كابلات', icon: '🪢', active: true, colorClass: 'folder-acc' },
];

const EMPTY_APP: AppData = {
  stock: {},
  credit: {},
  supplierCredit: {},
  todaySales: [],
  suppliers: [],
  users: {
    '0661876525': {
      name: 'ماستر',
      role: 'super_admin',
      pin: '820410',
      isSuperAdmin: true,
    },
  },
  resetPin: '0000',
  partsList: [
    { id: 'afficheur', name: '📱 لافيشور' },
    { id: 'batterie', name: '🔋 الباتري' },
    { id: 'connecteur', name: '🔌 كونيكتور شارج' },
    { id: 'general', name: '⚙️ إصلاح عام' },
  ],
  employees: {},
  monthlyExpenses: {},
  monthlyIncome: {},
  folders: DEFAULT_FOLDERS,
};

interface AppStore {
  app: AppData;
  auth: AuthState | null;
  isLoaded: boolean;
  unsubscribe: (() => void) | null;

  setApp: (data: AppData) => void;
  updateApp: (updater: (prev: AppData) => AppData) => void;
  sync: () => void;
  startListening: () => void;
  stopListening: () => void;

  setAuth: (auth: AuthState) => void;
  clearAuth: () => void;
  loadSavedAuth: () => Promise<AuthState | null>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  app: EMPTY_APP,
  auth: null,
  isLoaded: false,
  unsubscribe: null,

  setApp: (data) => {
    const merged = ensureAppStructure(data);
    set({ app: merged, isLoaded: true });
  },

  updateApp: (updater) => {
    const next = updater(get().app);
    set({ app: next });
    saveAppData(next);
  },

  sync: () => {
    saveAppData(get().app);
  },

  startListening: () => {
    const existing = get().unsubscribe;
    if (existing) existing();

    const unsub = subscribeToAppData(
      (data) => {
        const merged = ensureAppStructure(data);
        set({ app: merged, isLoaded: true });
      },
      (e) => console.error('Firestore listener error', e),
    );
    set({ unsubscribe: unsub });
  },

  stopListening: () => {
    const unsub = get().unsubscribe;
    if (unsub) {
      unsub();
      set({ unsubscribe: null });
    }
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
      const raw = await AsyncStorage.getItem('fadaa_auth');
      if (!raw) return null;
      const auth = JSON.parse(raw) as AuthState;
      set({ auth });
      return auth;
    } catch {
      return null;
    }
  },
}));

function ensureAppStructure(data: Partial<AppData>): AppData {
  const base = { ...EMPTY_APP, ...data };
  if (!base.stock) base.stock = {};
  if (!base.credit) base.credit = {};
  if (!base.supplierCredit) base.supplierCredit = {};
  if (!base.todaySales) base.todaySales = [];
  if (!base.suppliers) base.suppliers = [];
  if (!base.users || Object.keys(base.users).length === 0) {
    base.users = EMPTY_APP.users;
  }
  if (!base.partsList || base.partsList.length === 0) base.partsList = EMPTY_APP.partsList;
  if (!base.employees) base.employees = {};
  if (!base.monthlyExpenses) base.monthlyExpenses = {};
  if (!base.monthlyIncome) base.monthlyIncome = {};
  if (!base.resetPin) base.resetPin = '0000';
  if (!base.folders || base.folders.length === 0) base.folders = DEFAULT_FOLDERS;
  if (!base.activityLog) base.activityLog = [];
  return base as AppData;
}
