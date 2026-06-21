import { useState, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform, Keyboard,
  ScrollView, FlatList, DevSettings, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { Colors, Radii } from '../../src/theme/colors';
import { THEME_COLORS } from '../../src/hooks/useThemeColor';
import { markAllRead, markOneRead, getActivityColor, getActivityIcon } from '../../src/utils/activityLogger';
import { contrastText } from '../../src/utils/helpers';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AppHeader from '../../src/components/AppHeader';
import { usePermissions } from '../../src/hooks/usePermissions';
import type { AppUser, UserRole, AdminButtonType } from '../../src/types';

const ROLES: UserRole[] = ['view', 'staff', 'admin', 'super_admin', 'demo'];
const ROLE_LABEL: Record<string, string> = {
  super_admin: 'سوبر أدمين',
  admin: 'أدمين',
  staff: 'مساعد',
  view: 'عرض فقط',
  demo: '🎭 عرض تجريبي',
};
const ROLE_DOT: Record<string, string> = {
  super_admin: '#16a34a',
  admin: '#7c3aed',
  staff: '#f59e0b',
  view: '#ec4899',
  demo: '#f59e0b',
};
const ROLE_COLOR: Record<UserRole, string> = {
  super_admin: Colors.primary,
  admin: Colors.success,
  staff: Colors.textMuted,
  view: '#ec4899',
  demo: '#f59e0b',
};
function canEdit(role: string) {
  return role === 'admin' || role === 'super_admin';
}

type Sheet = 'none' | 'users' | 'pending' | 'addUser' | 'editUser' | 'cloud';
type SyncStatus = 'idle' | 'ok' | 'error';

interface CloudBackup {
  ts: string;
  label: string;
}

interface AdminRow { id: string; types: [AdminButtonType, AdminButtonType | null] }

const DEFAULT_ADMIN_BTNS: AdminButtonType[] = [
  'add_stock', 'staff', 'report', 'suppliers', 'cloud', 'pending', 'users', 'scan_info',
  'calc', 'reminder', 'note',
];

const ADD_BTN_OPTIONS: { type: AdminButtonType; label: string; color: string }[] = [
  { type: 'calc',     label: 'حسابات 🧮',   color: '#059669' },
  { type: 'reminder', label: 'تذكير 📅',     color: '#9333ea' },
  { type: 'note',     label: 'ملاحظة 📝',   color: '#0284c7' },
];

function toRows(btns: AdminButtonType[]): AdminRow[] {
  const rows: AdminRow[] = [];
  for (let i = 0; i < btns.length; i += 2) {
    rows.push({ id: `r_${i}`, types: [btns[i], btns[i + 1] ?? null] });
  }
  return rows;
}

function fromRows(rows: AdminRow[]): AdminButtonType[] {
  return rows.flatMap(r => r.types.filter((t): t is AdminButtonType => t != null));
}

function getBellCard(type: string) {
  switch (type) {
    case 'sell':       return { bg: '#f0fdf4', badge: '#10b981', label: 'بيع',         icon: '💰' };
    case 'return':     return { bg: '#fff7ed', badge: '#f97316', label: 'روتور',       icon: '🔄' };
    case 'add_stock':  return { bg: '#eff6ff', badge: '#3b82f6', label: 'ستوك',        icon: '📦' };
    case 'credit_add': return { bg: '#fffbeb', badge: '#f59e0b', label: 'كريدي',       icon: '💳' };
    case 'credit_pay': return { bg: '#f0fdf4', badge: '#10b981', label: 'تسديد',       icon: '✅' };
    case 'expense':    return { bg: '#fef2f2', badge: '#dc2626', label: 'مصروف',       icon: '💸' };
    case 'salary':     return { bg: '#f5f3ff', badge: '#7c3aed', label: 'راتب',        icon: '👷' };
    case 'supplier_add':return { bg: '#fffbeb', badge: '#f59e0b', label: 'مورد',       icon: '🏪' };
    case 'supplier_pay':return { bg: '#f0fdf4', badge: '#10b981', label: 'دفع مورد',  icon: '✅' };
    case 'delete_req': return { bg: '#fef2f2', badge: '#dc2626', label: 'حذف',        icon: '🗑️' };
    default:           return { bg: '#eef2ff', badge: '#5c67f2', label: type,          icon: '📋' };
  }
}

export default function AdminScreen() {
  const { app, auth, clearAuth, updateApp, sync } = useAppStore();

  // جميع hooks يجب أن تكون قبل أي return مشروط
  const perm = usePermissions();
  const isSuper = auth?.role === 'super_admin';
  const isPransibal = !!(auth?.phone && app.users[auth.phone]?.isSuperAdmin);
  const liveColor = auth?.phone ? app.users[auth.phone]?.color : undefined;
  const sheetBg = '#ffffff';

  const [sheet, setSheet] = useState<Sheet>('none');
  const [bellModal, setBellModal] = useState(false);
  const [logoutModal, setLogoutModal] = useState(false);
  const [expandedBellId, setExpandedBellId] = useState<string | null>(null);
  const [editGridMode, setEditGridMode] = useState(false);
  const [addBtnModal, setAddBtnModal] = useState(false);
  const [privateFab, setPrivateFab] = useState(false);
  const [adminRows, setAdminRows] = useState<AdminRow[]>(() => {
    const saved = app.adminButtons as AdminButtonType[] | undefined;
    if (!saved?.length) return toRows(DEFAULT_ADMIN_BTNS);
    const merged = [...saved];
    for (const btn of DEFAULT_ADMIN_BTNS) {
      if (!merged.includes(btn)) merged.push(btn);
    }
    return toRows(merged);
  });
  const [bellTab, setBellTab] = useState<'alerts' | 'log'>('alerts');
  const [readAlerts, setReadAlerts] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('fadaa_read_alerts').then(raw => {
      if (raw) setReadAlerts(JSON.parse(raw));
    }).catch(() => {});
  }, []);
  const [search, setSearch] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [cloudBackups, setCloudBackups] = useState<CloudBackup[]>(() => app.cloudBackups ?? []);
  const [syncing, setSyncing] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editPin, setEditPin] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('staff');
  const [editColor, setEditColor] = useState(Colors.primary);
  const [editName, setEditName] = useState('');
  const [editPerms, setEditPerms] = useState({ canEditStock: false, canEditCredit: false, canEditSuppliers: false, canEditRepair: false, canViewStaff: false, canViewSuppliers: false });
  const [editPhone, setEditPhone] = useState('');
  const [editingResetPin, setEditingResetPin] = useState(false);
  const [newResetPin, setNewResetPin] = useState('');
  const [permsOpen, setPermsOpen] = useState(false);
  const [adminBtnsOpen, setAdminBtnsOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [editAllowedBtns, setEditAllowedBtns] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('staff');
  const [newColor, setNewColor] = useState(Colors.primary);

  // الإدارة: طلبات الحذف + شيكات + رواتب + ديون موردين
  const notifications = useMemo(() => {
    const result: Array<{ id: string; type: string; icon: string; title: string; sub: string; color: string; bc?: string }> = [];

    // طلبات الحذف
    Object.entries(app.stock ?? {}).forEach(([bc, item]) => {
      if (item.pendingDeletion)
        result.push({ id: `del_${bc}`, type: 'del', icon: '🗑️', title: `طلب حذف: ${item.name}`, sub: `من: ${item.deletionRequestedBy ?? 'موظف'}`, color: '#dc2626', bc });
    });

    // ستوك فارغ وقليل — super_admin فقط
    if (isSuper) {
      Object.entries(app.stock ?? {}).forEach(([bc, item]) => {
        if (!item.pendingDeletion && item.qty === 0)
          result.push({ id: `empty_${bc}`, type: 'empty', icon: '📭', title: `نفد الستوك: ${item.name}`, sub: item.cat, color: '#ea580c' });
        else if (!item.pendingDeletion && item.qty > 0 && item.qty <= 2)
          result.push({ id: `low_${bc}`, type: 'low', icon: '⚠️', title: `ستوك قليل: ${item.name}`, sub: `باقي ${item.qty} قطع`, color: '#d97706' });
      });
    }

    const today = new Date();
    const dayOfMonth = today.getDate();

    // شيكات قريبة أو متأخرة
    Object.entries(app.supplierCredit ?? {}).forEach(([, supp]) => {
      (supp.checks ?? []).forEach((chk, i) => {
        if (!chk.cashed && chk.due) {
          const diff = Math.ceil((new Date(chk.due).getTime() - today.getTime()) / 86400000);
          if (diff <= 7) {
            const late = diff < 0;
            result.push({ id: `chk_${i}_${chk.due}`, type: 'check', icon: late ? '🔴' : '📋',
              title: late ? `شيك متأخر: ${supp.name ?? '—'}` : `شيك قريب: ${supp.name ?? '—'}`,
              sub: `${chk.amount} د — ${late ? `تأخر ${Math.abs(diff)} يوم` : `بعد ${diff} يوم`}`,
              color: late ? '#dc2626' : '#7c3aed' });
          }
        }
      });
    });

    // رواتب اليوم
    Object.entries(app.employees ?? {}).forEach(([, emp]) => {
      if (emp.payday && Math.abs(dayOfMonth - emp.payday) <= 1) {
        result.push({ id: `sal_${emp.name}`, type: 'salary', icon: '👷',
          title: `يوم التخليص: ${emp.name}`,
          sub: `الراتب: ${emp.salary} د`,
          color: '#7c3aed' });
      }
    });

    // ديون موردين كبيرة (أكثر من 2000 د)
    Object.entries(app.supplierCredit ?? {}).forEach(([id, supp]) => {
      if ((supp.total ?? 0) > 2000) {
        result.push({ id: `debt_${id}`, type: 'debt', icon: '💸',
          title: `دين كبير: ${supp.name ?? id}`,
          sub: `${(supp.total ?? 0).toLocaleString('fr-MA')} د`,
          color: '#ea580c' });
      }
    });

    return result;
  }, [app.stock, app.supplierCredit, app.employees, isSuper]);

  const activityLog = app.activityLog ?? [];
  const adminLog = activityLog.filter(e => ['delete_req', 'expense', 'salary', 'supplier_pay'].includes(e.type));
  const opLog = activityLog.filter(e => ['sell', 'return', 'add_stock', 'credit_add', 'credit_pay', 'supplier_add'].includes(e.type));
  const unreadOpCount = opLog.filter(l => !l.read).length;
  const unreadAdminCount = adminLog.filter(l => !l.read).length;
  const unreadReminders = (app.reminders ?? []).filter(r => !r.done && !r.read).length;
  const pendingReminders = (app.reminders ?? []).filter(r => !r.done);
  const unreadSystemAlerts = notifications.filter(n => !readAlerts.includes(n.id)).length;
  const alertsBadge = unreadSystemAlerts + unreadAdminCount + unreadReminders;

  function markAlertRead(id: string) {
    setReadAlerts(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      AsyncStorage.setItem('fadaa_read_alerts', JSON.stringify(next)).catch(() => {});
      return next;
    });
  }
  const totalBadge = alertsBadge + unreadOpCount;


  if (!auth || auth.role === 'staff') return <Redirect href="/(tabs)" />;

  const CORE_FOLDERS = ['جديد', 'مستعمل', 'LCD', 'إصلاح مانيال'];
  const allStock = Object.values(app.stock ?? {}).filter(i => !i.pendingDeletion);
  const totalProducts = allStock.length;
  const totalQty = allStock.reduce((s, i) => s + (i.qty ?? 0), 0);
  const otherStock = allStock.filter(i => !CORE_FOLDERS.includes(i.cat ?? ''));
  const otherCount = otherStock.length;
  const otherQty = otherStock.reduce((s, i) => s + (i.qty ?? 0), 0);
  const todaySales = (app.todaySales ?? []).filter(s => s.sell > 0);
  const todayRevenue = todaySales.reduce((s, x) => s + (x.sell ?? 0), 0);
  const todayProfit = todaySales.reduce((s, x) => s + ((x.sell ?? 0) - (x.buy ?? 0)), 0);
  const usersCount = Object.keys(app.users ?? {}).length;

  const users = Object.entries(app.users ?? {})
    .filter(([k, u]) => !u.isSuperAdmin || k === auth?.phone)
    .sort(([, a], [, b]) => (b.isSuperAdmin ? 1 : 0) - (a.isSuperAdmin ? 1 : 0));
  const pendingStock = Object.entries(app.stock ?? {}).filter(([, i]) => i.pendingDeletion);

  function canSeeBtn(type: AdminButtonType): boolean {
    // إلا عنده خانات مخصصة — يشوف فقط اللي مسموحة له
    const userAllowed = auth?.phone ? app.users[auth.phone]?.allowedAdminButtons : undefined;
    if (userAllowed && !isPransibal) return userAllowed.includes(type);
    // Pransibal وsuper_admin — كيشوفو حسب الصلاحيات
    if (type === 'cloud')    return perm.canManageBackup;
    if (type === 'staff')    return perm.canViewStaff;
    if (type === 'suppliers') return perm.canViewSuppliers;
    if (type === 'users')    return perm.canManageUsers;
    if (type === 'pending')  return perm.canApproveDelete;
    if (type === 'report')   return perm.canViewReport;
    if (type === 'add_stock') return perm.canAddProduct;
    return true;
  }

  function getBtnMeta(type: AdminButtonType): { label: string; color: string; badge?: number; onPress: () => void } {
    switch (type) {
      case 'add_stock': return { label: 'إضافة الستوك ➕', color: '#10b981', onPress: () => router.push('/scan?mode=add_stock') };
      case 'staff':     return { label: 'الخدام والمصاريف 👷', color: '#7c3aed', onPress: () => router.push('/staff') };
      case 'report':    return { label: 'الحصيلة 📊', color: '#d97706', onPress: () => router.push('/(tabs)/report') };
      case 'suppliers': return { label: 'الموردين والرفد 📦', color: '#0284c7', onPress: () => router.push('/suppliers') };
      case 'cloud':     return { label: syncStatus === 'ok' ? '✅ سحابة' : syncStatus === 'error' ? '❌ سحابة' : 'سحابة ☁️', color: syncStatus === 'error' ? '#dc2626' : '#10b981', onPress: () => setSheet('cloud') };
      case 'pending':   return { label: 'طلبات الحذف 🛡️', color: '#f59e0b', badge: pendingStock.length || undefined, onPress: () => setSheet('pending') };
      case 'users':     return { label: 'الخدام 👥', color: '#6b7280', onPress: () => setSheet('users') };
      case 'scan_info': return { label: 'سكان الستوك 📷', color: '#4f46e5', onPress: () => router.push('/scan?mode=info') };
      case 'calc':      return { label: 'حسابات 🧮', color: '#059669', onPress: () => router.push('/calculator') };
      case 'reminder':  return { label: 'تذكير 📅', color: '#9333ea', onPress: () => router.push('/reminders') };
      case 'note':      return { label: 'ملاحظة 📝', color: '#0284c7', onPress: () => router.push('/notes') };
    }
  }

  function saveAdminRows(rows: AdminRow[]) {
    setAdminRows(rows);
    updateApp(prev => ({ ...prev, adminButtons: fromRows(rows) }));
  }

  function moveRow(idx: number, dir: 'up' | 'down') {
    const next = [...adminRows];
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    saveAdminRows(next);
  }

  function moveSingle(idx: number, dir: 'up' | 'down', list: AdminButtonType[]) {
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[idx], next[target]] = [next[target], next[idx]];
    saveAdminRows(toRows(next));
  }

  function removeBtn(_type: AdminButtonType) {
    // الحذف معطل — الترتيب فقط مسموح
  }

  function addBtn(type: AdminButtonType) {
    const flat = fromRows(adminRows);
    if (flat.includes(type)) { Alert.alert('', 'هاد الزر موجود'); return; }
    const newRows = toRows([...flat, type]);
    saveAdminRows(newRows);
    setAddBtnModal(false);
  }

  // Stock search
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return Object.entries(app.stock ?? {})
      .filter(([bc, item]) =>
        !item.pendingDeletion &&
        (item.name.toLowerCase().includes(q) || bc.includes(q))
      )
      .slice(0, 30);
  }, [app.stock, search]);

  function openEditUser(key: string, user: AppUser) {
    setEditingKey(key);
    setEditPin(user.pin);
    setEditRole(user.role);
    setEditColor(user.color || Colors.primary);
    setEditName(user.name);
    setEditPhone(key);
    setEditPerms({
      canEditStock:     !!(user.permissions?.canEditStock),
      canEditCredit:    !!(user.permissions?.canEditCredit),
      canEditSuppliers: !!(user.permissions?.canEditSuppliers),
      canEditRepair:    !!(user.permissions?.canEditRepair),
      canViewStaff:      !!(user.permissions?.canViewStaff),
      canViewSuppliers:  !!(user.permissions?.canViewSuppliers),
    });
    setEditAllowedBtns(user.allowedAdminButtons ?? []);
    setAdminBtnsOpen(false);
    setPermsOpen(false);
    setRoleOpen(false);
    setSheet('editUser');
  }

  function saveEditUser() {
    if (!editingKey) return;
    if (!editName.trim()) { Alert.alert('', 'الاسم مطلوب'); return; }
    if (editPhone.trim().length < 6) { Alert.alert('', 'رقم الهاتف غير صحيح'); return; }
    if (editPin.length < 4) { Alert.alert('', 'الرقم السري 4 أرقام على الأقل'); return; }
    const newKey = editPhone.trim();
    const isSelf = editingKey === auth?.phone;
    const editingSuper = app.users[editingKey]?.role === 'super_admin';
    updateApp((prev) => {
      const updated: AppUser = {
        ...prev.users[editingKey],
        name: editName.trim(),
        pin: editPin,
        color: editColor,
        role: editingSuper ? 'super_admin' : editRole,
        permissions: editingSuper ? prev.users[editingKey].permissions : editPerms,
        allowedAdminButtons: editingSuper ? undefined : (editAllowedBtns.length > 0 ? editAllowedBtns : undefined),
      };
      const newUsers = { ...prev.users };
      if (newKey !== editingKey) {
        delete newUsers[editingKey];
      }
      newUsers[newKey] = updated;
      return { ...prev, users: newUsers };
    });
    if (isSelf && newKey !== editingKey) {
      // تغيرت نمرتو، خاصو يسجل دخول من جديد
      Alert.alert('تم', 'تم تغيير الرقم. سجّل دخولك من جديد.');
    }
    setSheet('none');
  }

  function deleteUser(key: string, user: AppUser) {
    if (!isSuper) { Alert.alert('', 'غير مصرح'); return; }
    Alert.alert('حذف المستخدم', `حذف "${user.name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: () => {
          updateApp((prev) => { const u = { ...prev.users }; delete u[key]; return { ...prev, users: u }; });
        },
      },
    ]);
  }

  function addUser() {
    if (!newName.trim()) { Alert.alert('', 'أدخل الاسم'); return; }
    if (!newPhone.trim() || newPhone.trim().length < 6) { Alert.alert('', 'أدخل رقم هاتف صحيح'); return; }
    if (newPin.length < 4) { Alert.alert('', 'الرقم السري 4 أرقام على الأقل'); return; }
    if (app.users?.[newPhone.trim()]) { Alert.alert('', 'هذا الرقم موجود بالفعل'); return; }
    updateApp((prev) => ({
      ...prev,
      users: { ...prev.users, [newPhone.trim()]: { name: newName.trim(), role: newRole, pin: newPin, color: newColor } },
    }));
    setSheet('none');
    setNewName(''); setNewPhone(''); setNewPin(''); setNewRole('staff');
  }

  function approveDelete(itemKey: string) {
    const img = app.stock[itemKey]?.img;
    import('../../src/firebase/storage').then(({ deleteItemImage }) => deleteItemImage(img));
    updateApp((prev) => { const s = { ...prev.stock }; delete s[itemKey]; return { ...prev, stock: s }; });
  }

  function rejectDelete(itemKey: string) {
    updateApp((prev) => ({
      ...prev,
      stock: { ...prev.stock, [itemKey]: { ...prev.stock[itemKey], pendingDeletion: false, deletionRequestedBy: undefined } },
    }));
  }

  function approveDeleteCustomer(id: string) {
    updateApp((prev) => { const c = { ...prev.credit }; delete c[id]; return { ...prev, credit: c }; });
  }
  function rejectDeleteCustomer(id: string) {
    updateApp((prev) => ({ ...prev, credit: { ...prev.credit, [id]: { ...prev.credit[id], pendingDeletion: false, deletionRequestedBy: undefined } } }));
  }

  function approveDeleteSupplier(key: string) {
    updateApp((prev) => { const sc = { ...prev.supplierCredit }; delete sc[key]; return { ...prev, supplierCredit: sc }; });
  }
  function rejectDeleteSupplier(key: string) {
    updateApp((prev) => ({ ...prev, supplierCredit: { ...prev.supplierCredit, [key]: { ...prev.supplierCredit[key], pendingDeletion: false, deletionRequestedBy: undefined } } }));
  }

  function approveDeleteEmployee(key: string) {
    updateApp((prev) => { const e = { ...prev.employees }; delete e[key]; return { ...prev, employees: e }; });
  }
  function rejectDeleteEmployee(key: string) {
    updateApp((prev) => ({ ...prev, employees: { ...prev.employees, [key]: { ...prev.employees[key], pendingDeletion: false, deletionRequestedBy: undefined } } }));
  }

  const pendingCustomers  = Object.entries(app.credit ?? {}).filter(([, c]) => c.pendingDeletion);
  const pendingSuppliers  = Object.entries(app.supplierCredit ?? {}).filter(([, s]) => s.pendingDeletion);
  const pendingEmployees  = Object.entries(app.employees ?? {}).filter(([, e]) => e.pendingDeletion);
  const totalPendingAll   = pendingStock.length + pendingCustomers.length + pendingSuppliers.length + pendingEmployees.length;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <AppHeader
          title="فضاء الأخوين"
          sub="⚙️ الإدارة والتحكم"
          onBell={(isPransibal || isSuper) ? () => setBellModal(true) : undefined}
          bellBadge={(isPransibal || isSuper) ? totalBadge : undefined}
          leftAction={{ label: '🔒 خروج', onPress: () => setLogoutModal(true) }}
          leftAction2={__DEV__ ? { label: '🔄', onPress: () => DevSettings.reload() } : undefined}
        />


        {/* طلبات الحذف الشاملة — Pransibal فقط */}
        {isPransibal && totalPendingAll > 0 && (
          <View style={{ marginHorizontal: 12, marginBottom: 10, borderRadius: 14, backgroundColor: '#fef2f2', borderWidth: 2, borderColor: '#fca5a5', overflow: 'hidden' }}>
            <View style={{ backgroundColor: '#dc2626', paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: '#dc2626', fontWeight: '900', fontSize: 12 }}>{totalPendingAll}</Text>
              </View>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>🗑️ طلبات الحذف</Text>
            </View>

            {pendingStock.map(([bc, item]) => (
              <View key={bc} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#fee2e2' }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={{ backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }} onPress={() => approveDelete(bc)}>
                    <Text style={{ color: '#16a34a', fontWeight: '900', fontSize: 12 }}>✓ موافق</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }} onPress={() => rejectDelete(bc)}>
                    <Text style={{ color: '#64748b', fontWeight: '900', fontSize: 12 }}>✗ رفض</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e293b' }}>📦 {item.name}</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>من: {item.deletionRequestedBy ?? '—'}</Text>
                </View>
              </View>
            ))}

            {pendingCustomers.map(([id, c]) => (
              <View key={id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#fee2e2' }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={{ backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }} onPress={() => approveDeleteCustomer(id)}>
                    <Text style={{ color: '#16a34a', fontWeight: '900', fontSize: 12 }}>✓ موافق</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }} onPress={() => rejectDeleteCustomer(id)}>
                    <Text style={{ color: '#64748b', fontWeight: '900', fontSize: 12 }}>✗ رفض</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e293b' }}>📒 {c.name}</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>من: {c.deletionRequestedBy ?? '—'}</Text>
                </View>
              </View>
            ))}

            {pendingSuppliers.map(([key, s]) => (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#fee2e2' }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={{ backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }} onPress={() => approveDeleteSupplier(key)}>
                    <Text style={{ color: '#16a34a', fontWeight: '900', fontSize: 12 }}>✓ موافق</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }} onPress={() => rejectDeleteSupplier(key)}>
                    <Text style={{ color: '#64748b', fontWeight: '900', fontSize: 12 }}>✗ رفض</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e293b' }}>🏪 {s.name ?? key}</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>من: {s.deletionRequestedBy ?? '—'}</Text>
                </View>
              </View>
            ))}

            {pendingEmployees.map(([key, e]) => (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={{ backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }} onPress={() => approveDeleteEmployee(key)}>
                    <Text style={{ color: '#16a34a', fontWeight: '900', fontSize: 12 }}>✓ موافق</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }} onPress={() => rejectDeleteEmployee(key)}>
                    <Text style={{ color: '#64748b', fontWeight: '900', fontSize: 12 }}>✗ رفض</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e293b' }}>👷 {e.name}</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>من: {e.deletionRequestedBy ?? '—'}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Grid edit toggle — super_admin only */}
        {isSuper && (
          <TouchableOpacity
            style={[styles.editGridBtn, editGridMode && { backgroundColor: '#10b981' }]}
            onPress={() => setEditGridMode(v => !v)}
          >
            <Text style={styles.editGridTxt}>{editGridMode ? '✅ حفظ الترتيب' : '✏️ ترتيب الأزرار'}</Text>
          </TouchableOpacity>
        )}

        {/* Buttons grid */}
        <View style={styles.grid}>
          {(() => {
            const visibleBtns = editGridMode
              ? fromRows(adminRows)
              : fromRows(adminRows).filter(t => canSeeBtn(t));
            const pairs: [AdminButtonType, AdminButtonType | null][] = [];
            for (let i = 0; i < visibleBtns.length; i += 2) {
              pairs.push([visibleBtns[i], visibleBtns[i + 1] ?? null]);
            }
            return pairs.map(([t1, t2], pairIdx) => {
              const i1 = pairIdx * 2;
              const i2 = i1 + 1;
              const m1 = getBtnMeta(t1);
              const m2 = t2 ? getBtnMeta(t2) : null;
              return (
                <View key={t1} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  {/* Button 1 */}
                  <View style={{ flex: 1 }}>
                    {editGridMode && (
                      <View style={[styles.rowArrows, { justifyContent: 'center' }]}>
                        <TouchableOpacity onPress={() => moveSingle(i1, 'up', visibleBtns)} disabled={i1 === 0}>
                          <Text style={[styles.arrowTxt, i1 === 0 && { opacity: 0.2 }]}>▲</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => moveSingle(i1, 'down', visibleBtns)} disabled={i1 === visibleBtns.length - 1}>
                          <Text style={[styles.arrowTxt, i1 === visibleBtns.length - 1 && { opacity: 0.2 }]}>▼</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[styles.btn, { backgroundColor: m1.color }]}
                      onPress={editGridMode ? undefined : m1.onPress}
                      activeOpacity={editGridMode ? 1 : 0.85}
                    >
                      {m1.badge != null && m1.badge > 0 && <View style={styles.badge}><Text style={styles.badgeTxt}>{m1.badge}</Text></View>}
                      <Text style={styles.btnTxt}>{m1.label}</Text>
                    </TouchableOpacity>
                  </View>
                  {/* Button 2 */}
                  {m2 && t2 ? (
                    <View style={{ flex: 1 }}>
                      {editGridMode && (
                        <View style={[styles.rowArrows, { justifyContent: 'center' }]}>
                          <TouchableOpacity onPress={() => moveSingle(i2, 'up', visibleBtns)} disabled={i2 === 0}>
                            <Text style={[styles.arrowTxt, i2 === 0 && { opacity: 0.2 }]}>▲</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => moveSingle(i2, 'down', visibleBtns)} disabled={i2 === visibleBtns.length - 1}>
                            <Text style={[styles.arrowTxt, i2 === visibleBtns.length - 1 && { opacity: 0.2 }]}>▼</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      <TouchableOpacity
                        style={[styles.btn, { backgroundColor: m2.color }]}
                        onPress={editGridMode ? undefined : m2.onPress}
                        activeOpacity={editGridMode ? 1 : 0.85}
                      >
                        {m2.badge != null && m2.badge > 0 && <View style={styles.badge}><Text style={styles.badgeTxt}>{m2.badge}</Text></View>}
                        <Text style={styles.btnTxt}>{m2.label}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : <View style={{ flex: 1 }} />}
                </View>
              );
            });
          })()}
        </View>

        {/* Add button — edit mode + super_admin */}
        {isSuper && editGridMode && (
          <TouchableOpacity style={styles.addBtnRow} onPress={() => setAddBtnModal(true)}>
            <Text style={styles.addBtnTxt}>+ إضافة زر</Text>
          </TouchableOpacity>
        )}

        {/* إحصائيات — Pransibal و Super Admin فقط */}
        {isSuper && (
          <View style={{ marginHorizontal: 12, marginTop: 10, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', overflow: 'hidden' }}>
            {[
              { emoji: '📦', num: totalProducts,   label: 'سلعة',         bg: '#eff6ff', color: '#3b82f6' },
              { emoji: '🔢', num: totalQty,         label: 'قطعة',         bg: '#f0fdf4', color: '#16a34a' },
              { emoji: '💰', num: todayRevenue,     label: 'مبيعات اليوم', bg: '#fffbeb', color: '#d97706' },
              { emoji: '📊', num: `${todayProfit >= 0 ? '+' : ''}${todayProfit}`, label: 'ربح اليوم', bg: todayProfit >= 0 ? '#f0fdf4' : '#fef2f2', color: todayProfit >= 0 ? '#16a34a' : '#dc2626' },
              { emoji: '👥', num: usersCount,       label: 'خدام',         bg: '#f5f3ff', color: '#7c3aed' },
              { emoji: '🎧', num: `${otherCount} / ${otherQty}ق`, label: 'أخرى',  bg: '#fdf4ff', color: '#a21caf' },
            ].map((item, i, arr) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: item.bg, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: '#e2e8f0' }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: item.color }}>{item.num} <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '700' }}>{item.label}</Text></Text>
                <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Users Sheet — NEW DESIGN */}
      <Modal visible={sheet === 'users'} animationType="slide" transparent onRequestClose={() => setSheet('none')}>
        <View style={styles.overlay}>
          <View style={[styles.sheetLarge, {  maxHeight: '92%' , backgroundColor: sheetBg }]}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <TouchableOpacity style={uSt.addBtn} onPress={() => setSheet('addUser')}>
                <Text style={uSt.addBtnTxt}>إضافة +</Text>
              </TouchableOpacity>
              <Text style={[styles.sheetTitle, { color: '#d97706' }]}>إدارة الخدامة 👥</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Reset PIN card */}
              <View style={uSt.resetCard}>
                <View style={{ flex: 1, alignItems: 'flex-start' }}>
                  <Text style={uSt.resetTitle}>🔒 كود تصفير الحصيلة</Text>
                  {editingResetPin ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TextInput
                        style={uSt.resetInput}
                        value={newResetPin} onChangeText={setNewResetPin}
                        keyboardType="numeric" maxLength={8}
                        autoFocus placeholder="الكود الجديد" placeholderTextColor="#9ca3af"
                      />
                      <TouchableOpacity style={[uSt.resetEditBtn, { backgroundColor: '#16a34a' }]}
                        onPress={() => {
                          if (newResetPin.length < 4) { Alert.alert('', 'الكود 4 أرقام على الأقل'); return; }
                          updateApp(prev => ({ ...prev, resetPin: newResetPin }));
                          setEditingResetPin(false);
                        }}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>✅ حفظ</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Text style={[uSt.resetSub, { color: '#92400e', fontWeight: '900' }]}>{app.resetPin ?? '——'}</Text>
                      <Text style={uSt.resetSub}>:الرقم السري الحالي</Text>
                    </View>
                  )}
                </View>
                {!editingResetPin && (
                  <TouchableOpacity style={uSt.resetEditBtn} onPress={() => { setNewResetPin(app.resetPin ?? ''); setEditingResetPin(true); }}>
                    <Text style={uSt.resetEditTxt}>تعديل ✏️</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* User list */}
              {users.map(([key, user]) => {
                const dot = ROLE_DOT[user.role] ?? '#6b7280';
                const editable = canEdit(user.role);
                return (
                  <View key={key} style={uSt.userRow}>
                    {/* RIGHT in RTL: info */}
                    <View style={{ flex: 1 }}>
                      {/* Name + dot + role badge — right to left */}
                      <View style={uSt.userNameRow}>
                        <Text style={{ fontSize: 16 }}>👤</Text>
                        <View style={{ backgroundColor: user.color || Colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{user.name}</Text>
                        </View>
                        {isSuper && (
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: user.online ? '#16a34a' : '#ef4444', borderWidth: 1.5, borderColor: '#fff', shadowColor: user.online ? '#16a34a' : '#ef4444', shadowOpacity: 0.6, shadowRadius: 3, elevation: 2 }} />
                        )}
                        <View style={[uSt.dot, { backgroundColor: dot }]} />
                        <View style={[uSt.roleBadge2, { borderColor: dot }]}>
                          <Text style={[uSt.roleBadgeTxt, { color: dot }]}>{ROLE_LABEL[user.role] ?? user.role}</Text>
                        </View>
                      </View>

                      {/* Phone + code */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <Text style={[uSt.userPhone2, { color: '#d97706', fontWeight: '900' }]}>{user.pin}</Text>
                        <Text style={uSt.userPhone2}>🔑</Text>
                        <Text style={uSt.userPhone2}>{key}</Text>
                        <Text style={uSt.userPhone2}>📞</Text>
                      </View>
                    </View>

                    {/* badge + أيقونات */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5 }}>
                      {user.role !== 'super_admin' && (
                        <View style={[uSt.statusBadge, { backgroundColor: editable ? '#dcfce7' : '#fee2e2', borderColor: editable ? '#86efac' : '#fca5a5' }]}>
                          <Text style={[uSt.statusTxt, { color: editable ? '#16a34a' : '#dc2626' }]}>
                            {editable ? '✅ تعديل' : '✗ محظور'}
                          </Text>
                        </View>
                      )}
                      <View style={uSt.userIcons}>
                        <TouchableOpacity style={uSt.editIcon} onPress={() => openEditUser(key, user)}>
                          <Text style={{ fontSize: 16 }}>✏️</Text>
                        </TouchableOpacity>
                        {isSuper && key !== auth?.phone && (
                          <TouchableOpacity style={uSt.delIcon} onPress={() => deleteUser(key, user)}>
                            <Text style={{ fontSize: 16 }}>🗑️</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}

              <View style={{ height: 16 }} />
            </ScrollView>

            {/* Close button */}
            <TouchableOpacity style={uSt.closeBtn} onPress={() => setSheet('none')}>
              <Text style={uSt.closeBtnTxt}>✕ إغلاق النافذة</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Pending deletions sheet */}
      <Modal visible={sheet === 'pending'} animationType="slide" transparent onRequestClose={() => setSheet('none')}>
        <View style={styles.overlay}>
          <View style={[styles.sheetLarge, {  flex: 1, maxHeight: '80%' , backgroundColor: sheetBg }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>🗑️ طلبات الحذف ({pendingStock.length})</Text>
              <TouchableOpacity style={styles.closeSheetBtn} onPress={() => setSheet('none')}>
                <Text style={styles.closeSheetTxt}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              style={{ flex: 1 }}
              data={pendingStock}
              keyExtractor={([k]) => k}
              ListEmptyComponent={
                <View style={styles.emptyCenter}>
                  <Text style={{ fontSize: 40 }}>✅</Text>
                  <Text style={styles.emptyTxt}>لا توجد طلبات حذف</Text>
                </View>
              }
              renderItem={({ item: [key, item] }) => (
                <View style={styles.pendingCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pendingName}>{item.name}</Text>
                    <Text style={styles.pendingMeta}>📁 {item.cat} · طلب: {item.deletionRequestedBy ?? '—'}</Text>
                  </View>
                  <View style={styles.pendingActions}>
                    <TouchableOpacity
                      style={[styles.pendingBtn, { backgroundColor: '#dcfce7' }]}
                      onPress={() => approveDelete(key)}
                    >
                      <Text style={[styles.pendingBtnTxt, { color: '#16a34a' }]}>✓ موافقة</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pendingBtn, { backgroundColor: '#fee2e2' }]}
                      onPress={() => rejectDelete(key)}
                    >
                      <Text style={[styles.pendingBtnTxt, { color: '#dc2626' }]}>✗ رفض</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Edit user modal */}
      <Modal visible={sheet === 'editUser'} animationType="slide" transparent onRequestClose={() => {}}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.overlay} onPress={Keyboard.dismiss}>
          <Pressable style={[styles.sheet, { padding: 12, paddingBottom: 16 }]} onPress={() => {}}>
            <Text style={[styles.sheetTitle, { fontSize: 14, marginBottom: 8 }]}>✏️ تعديل المستخدم</Text>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { fontSize: 11, marginBottom: 3 }]}>الاسم *</Text>
                <TextInput style={[styles.sheetInput, { padding: 8, fontSize: 13 }]} value={editName} onChangeText={setEditName} autoFocus />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { fontSize: 11, marginBottom: 3 }]}>رقم الهاتف *</Text>
                <TextInput style={[styles.sheetInput, { padding: 8, fontSize: 13 }]} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { fontSize: 11, marginBottom: 3 }]}>الرقم السري *</Text>
            <TextInput
              style={[styles.sheetInput, { padding: 8, fontSize: 13, marginBottom: 6 }]}
              value={editPin} onChangeText={setEditPin} keyboardType="numeric" secureTextEntry maxLength={8}
            />

            {isSuper && editingKey && (
              <>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, marginTop: 8, marginBottom: 4, borderRadius: 10, backgroundColor: '#fff7ed', paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#f97316' }}
                  onPress={() => setRoleOpen(v => !v)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#f97316' }}>{roleOpen ? '▲' : '▼'}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#f97316' }}>👑 الدور — {ROLE_LABEL[editRole] ?? editRole}</Text>
                </TouchableOpacity>
                {roleOpen && ROLES.filter((r) => r !== 'super_admin' || isPransibal).map((r) => (
                  <TouchableOpacity key={r}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
                    onPress={() => setEditRole(r)}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: editRole === r ? '#f97316' : '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{editRole === r ? '✓' : ''}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b' }}>{ROLE_LABEL[r]}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {isSuper && editingKey && (
              <>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, marginTop: 8, marginBottom: 4, borderRadius: 10, backgroundColor: '#f5f3ff', paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#7c3aed' }}
                  onPress={() => setPermsOpen(v => !v)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#7c3aed' }}>{permsOpen ? '▲' : '▼'}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#7c3aed' }}>✏️ إذونات التعديل</Text>
                </TouchableOpacity>
                {permsOpen && ([
                  { key: 'canEditStock',     label: 'تعديل الستوك' },
                  { key: 'canEditCredit',    label: 'تعديل الكريدي' },
                  { key: 'canEditSuppliers', label: 'تعديل الموردين' },
                  { key: 'canEditRepair',    label: 'تعديل الإصلاح' },
                  { key: 'canViewStaff',     label: 'الخدام والمصاريف' },
                  { key: 'canViewSuppliers', label: 'الموردين والرفد' },
                ] as { key: keyof typeof editPerms; label: string }[]).map(({ key, label }) => (
                  <TouchableOpacity key={key}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
                    onPress={() => setEditPerms(p => ({ ...p, [key]: !p[key] }))}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: editPerms[key] ? '#7c3aed' : '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{editPerms[key] ? '✓' : ''}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b' }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {isPransibal && editingKey && (
              <>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, marginTop: 8, marginBottom: 4, borderRadius: 10, backgroundColor: '#f0fdf4', paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#16a34a' }}
                  onPress={() => setAdminBtnsOpen(v => !v)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#16a34a' }}>{adminBtnsOpen ? '▲' : '▼'}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#16a34a' }}>⚙️ خانات الإدارة</Text>
                </TouchableOpacity>
                {adminBtnsOpen && ([
                  { key: 'add_stock', label: '📦 إضافة ستوك' },
                  { key: 'report',    label: '📊 الحصيلة' },
                  { key: 'suppliers', label: '🏪 الموردين' },
                  { key: 'staff',     label: '👷 الخدام' },
                  { key: 'pending',   label: '🗑️ طلبات الحذف' },
                  { key: 'calc',      label: '🧮 الحسابات' },
                  { key: 'reminder',  label: '📅 التذكير' },
                  { key: 'note',      label: '📝 الملاحظات' },
                ] as { key: string; label: string }[]).map(({ key, label }) => {
                  const isOn = editAllowedBtns.includes(key);
                  return (
                    <TouchableOpacity key={key}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
                      onPress={() => setEditAllowedBtns(p => isOn ? p.filter(k => k !== key) : [...p, key])}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: isOn ? '#16a34a' : '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>{isOn ? '✓' : ''}</Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b' }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            <Text style={[styles.fieldLabel, { fontSize: 11, marginBottom: 3 }]}>🎨 اللون</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {THEME_COLORS.map((c) => (
                <TouchableOpacity
                  key={c.hex}
                  style={[{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.hex }, editColor === c.hex && { borderWidth: 2.5, borderColor: '#1e293b' }]}
                  onPress={() => setEditColor(c.hex)}
                />
              ))}
            </View>

            <View style={[styles.sheetFooter, { marginTop: 8 }]}>
              <TouchableOpacity style={[styles.cancelBtn, { padding: 10 }]} onPress={() => setSheet('users')}>
                <Text style={styles.cancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: editColor, padding: 10 }]} onPress={saveEditUser}>
                <Text style={styles.confirmTxt}>حفظ</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cloud Sync Sheet */}
      <Modal visible={sheet === 'cloud'} animationType="slide" transparent onRequestClose={() => setSheet('none')}>
        <View style={styles.overlay}>
          <View style={[styles.sheetLarge, {  maxHeight: '90%' , backgroundColor: sheetBg }]}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <TouchableOpacity style={styles.closeSheetBtn} onPress={() => setSheet('none')}>
                <Text style={styles.closeSheetTxt}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>سحابة ☁️</Text>
            </View>

            {/* Action buttons */}
            <TouchableOpacity
              style={[cloudSt.actionBtn, { backgroundColor: '#22c55e' }]}
              onPress={async () => {
                setSyncing(true);
                try {
                  await sync();
                  const now = new Date();
                  const label = `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} — ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
                  const backup: CloudBackup = { ts: now.toISOString(), label };
                  const updated = [backup, ...cloudBackups].slice(0, 10);
                  setCloudBackups(updated);
                  updateApp(prev => ({ ...prev, cloudBackups: updated }));
                  setSyncStatus('ok');
                  Alert.alert('✅', 'تم الحفظ في السحابة');
                } catch { setSyncStatus('error'); Alert.alert('❌', 'فشل الحفظ'); }
                setSyncing(false);
              }}
            >
              <Text style={cloudSt.actionTxt}>{syncing ? '⏳ جاري الحفظ...' : '☁️ احفظ الآن في السحابة'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[cloudSt.actionBtn, { backgroundColor: '#2563eb' }]}
              onPress={async () => {
                try {
                  const now = new Date();
                  const label = `fadaa_backup_${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}_${now.getHours()}-${now.getMinutes()}`;
                  const json = JSON.stringify(app, null, 2);
                  const uri = FileSystem.documentDirectory + `${label}.json`;
                  await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
                  const canShare = await Sharing.isAvailableAsync();
                  if (canShare) {
                    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'حفظ ملف البيانات' });
                  } else {
                    Alert.alert('✅', `تم حفظ الملف:\n${uri}`);
                  }
                } catch (e) { Alert.alert('خطأ', 'فشل تحميل الملف'); }
              }}>
              <Text style={cloudSt.actionTxt}>⬇️ تحميل ملف JSON</Text>
            </TouchableOpacity>

            <View style={cloudSt.divider} />

            {/* Backups list */}
            <View style={cloudSt.backupsHeader}>
              <TouchableOpacity style={cloudSt.refreshBtn}
                onPress={() => Alert.alert('', 'تم التحديث')}>
                <Text style={cloudSt.refreshTxt}>تحديث 🔄</Text>
              </TouchableOpacity>
              <Text style={cloudSt.backupsTitle}>النسخ السحابية (آخر {cloudBackups.length})</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {cloudBackups.length === 0 && (
                <Text style={{ textAlign: 'center', color: '#9ca3af', fontWeight: '700', paddingVertical: 20 }}>
                  ما كاين حتى نسخة احتياطية
                </Text>
              )}
              {cloudBackups.map((bk, i) => (
                <View key={bk.ts} style={cloudSt.backupRow}>
                  <View style={cloudSt.backupBtns}>
                    <TouchableOpacity style={cloudSt.backupBtnBlue}
                      onPress={() => Alert.alert('تحميل', `تحميل نسخة: ${bk.label}`)}>
                      <Text style={cloudSt.backupBtnTxt}>⬇️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={cloudSt.backupBtnGreen}
                      onPress={() => Alert.alert('استرجاع', `استرجاع من: ${bk.label} ؟\nهذا سيستبدل البيانات الحالية`, [
                        { text: 'إلغاء', style: 'cancel' },
                        { text: 'استرجاع', style: 'destructive', onPress: () => Alert.alert('✅', 'تم الاسترجاع') },
                      ])}>
                      <Text style={cloudSt.backupBtnTxt}>رجع 🔄</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {i === 0 && <View style={cloudSt.latestBadge}><Text style={cloudSt.latestTxt}>الأحدث</Text></View>}
                      <Text style={cloudSt.backupDate}>📅 {bk.label}</Text>
                    </View>
                  </View>
                </View>
              ))}
              <View style={{ height: 30 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bell modal — 2 tabs */}
      <Modal visible={bellModal} animationType="none" transparent onRequestClose={() => setBellModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setBellModal(false)} />
          <View style={styles.bellDropdown}>
            <View style={styles.bellDropHead}>
              <TouchableOpacity onPress={() => setBellModal(false)}>
                <Text style={{ fontSize: 18, color: '#94a3b8', fontWeight: '700', paddingHorizontal: 4 }}>✕</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {totalBadge > 0 && (
                  <View style={{ backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{totalBadge}</Text>
                  </View>
                )}
                <Text style={styles.bellDropTitle}>الإشعارات</Text>
              </View>
            </View>
            <View style={styles.bellTabs}>
              <TouchableOpacity style={[styles.bellTabBtn, bellTab === 'log' && styles.bellTabActive]} onPress={() => setBellTab('log')}>
                <Text style={[styles.bellTabTxt, bellTab === 'log' && styles.bellTabTxtActive]}>
                  إشعارات {unreadOpCount > 0 ? `(${unreadOpCount})` : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.bellTabBtn, bellTab === 'alerts' && styles.bellTabActive]} onPress={() => setBellTab('alerts')}>
                <Text style={[styles.bellTabTxt, bellTab === 'alerts' && styles.bellTabTxtActive]}>
                  تنبيهات {alertsBadge > 0 ? `(${alertsBadge})` : ''}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }} contentContainerStyle={{ padding: 10, paddingTop: 6 }}>

              {bellTab === 'alerts' ? (() => {
                const hasContent = notifications.length > 0 || adminLog.length > 0 || pendingReminders.length > 0;
                return !hasContent ? (
                  <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                    <Text style={{ fontSize: 36, marginBottom: 8 }}>✅</Text>
                    <Text style={{ fontSize: 14, color: '#374151', fontWeight: '800' }}>كل شيء على ما يرام</Text>
                  </View>
                ) : (
                  <>
                    {/* System alerts */}
                    {notifications.map((n) => {
                      const isRead = readAlerts.includes(n.id);
                      return (
                      <TouchableOpacity key={n.id} activeOpacity={0.8}
                        onPress={() => markAlertRead(n.id)}
                        style={[styles.bellCard, {
                          backgroundColor: isRead ? '#f8fafc' : n.color + '18',
                          borderColor: isRead ? '#e2e8f0' : n.color + '88',
                          borderWidth: isRead ? 1 : 2,
                          opacity: isRead ? 0.55 : 1,
                        }]}>
                        <View style={styles.bellCardTop}>
                          <View style={[styles.bellBadgePill, { backgroundColor: isRead ? '#94a3b8' : n.color }]}>
                            <Text style={styles.bellBadgeTxt}>
                              {n.type === 'del' ? 'حذف' : n.type === 'empty' ? 'نفد' : n.type === 'low' ? 'قليل' : n.type === 'check' ? 'شيك' : n.type === 'salary' ? 'راتب' : 'دين'}
                            </Text>
                          </View>
                          <Text style={styles.bellCardMsg} numberOfLines={2}>{n.title}</Text>
                          {!isRead && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: n.color }} />}
                        </View>
                        <Text style={styles.bellCardSub}>{n.sub}</Text>
                        {n.type === 'del' && isSuper && !isRead && (
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <TouchableOpacity style={styles.bellApprove} onPress={() => n.bc && approveDelete(n.bc)}>
                              <Text style={{ color: '#dc2626', fontWeight: '900', fontSize: 12 }}>✓ موافق</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.bellReject} onPress={() => n.bc && rejectDelete(n.bc)}>
                              <Text style={{ color: '#16a34a', fontWeight: '900', fontSize: 12 }}>✗ رفض</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </TouchableOpacity>
                      );
                    })}
                    {/* Admin activity log */}
                    {adminLog.map((entry) => {
                      const card = getBellCard(entry.type);
                      const timeStr = new Date(entry.ts).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });
                      const dateStr = new Date(entry.ts).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
                      const userColor = (Object.values(app.users ?? {}) as any[]).find((u: any) => u.name === entry.by)?.color ?? '#5c67f2';
                      return (
                        <Pressable key={entry.id} onPress={() => !entry.read && markOneRead(entry.id)}
                          style={[styles.bellCard, { backgroundColor: entry.read ? '#ffffff' : card.bg, borderColor: entry.read ? '#e2e8f0' : card.badge, borderWidth: entry.read ? 1 : 2 }]}
                        >
                          <View style={styles.bellCardTop}>
                            <View style={[styles.bellBadgePill, { backgroundColor: card.badge }]}>
                              <Text style={styles.bellBadgeTxt}>{card.icon} {card.label}</Text>
                            </View>
                            <Text style={styles.bellCardMsg} numberOfLines={1}>{entry.msg}</Text>
                            {!entry.read && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: card.badge }} />}
                          </View>
                          <View style={styles.bellCardFoot}>
                            <Text style={styles.bellCardDate}>{timeStr} · {dateStr}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              {entry.amount !== undefined && <Text style={[styles.bellCardAmount, { color: card.badge }]}>{entry.amount} د</Text>}
                              {!!entry.by?.trim() && (
                                <View style={[styles.bellUserBadge, { backgroundColor: userColor }]}>
                                  <Text style={[styles.bellUserTxt, { color: '#fff' }]}>👤 {entry.by}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                    {/* Reminders */}
                    {pendingReminders.map(r => {
                      const overdue = new Date(r.datetime) < new Date();
                      return (
                        <Pressable key={r.id}
                          onPress={() => !r.read && updateApp(prev => ({ ...prev, reminders: (prev.reminders ?? []).map(x => x.id === r.id ? { ...x, read: true } : x) }))}
                          style={[styles.bellCard, { backgroundColor: r.read ? '#ffffff' : '#faf5ff', borderColor: r.read ? '#e2e8f0' : '#9333ea', borderWidth: r.read ? 1 : 2 }]}>
                          <View style={styles.bellCardTop}>
                            <View style={[styles.bellBadgePill, { backgroundColor: '#9333ea' }]}>
                              <Text style={styles.bellBadgeTxt}>📅 تذكير</Text>
                            </View>
                            <Text style={styles.bellCardMsg} numberOfLines={2}>{r.title}</Text>
                            {!r.read && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#9333ea' }} />}
                          </View>
                          <Text style={[styles.bellCardDate, overdue ? { color: '#dc2626' } : {}]}>
                            {overdue ? '⚠️ ' : '🕐 '}
                            {new Date(r.datetime).toLocaleDateString('ar-MA', { day: '2-digit', month: 'long' })} — {new Date(r.datetime).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </>
                );
              })() : (
                /* ── إشعارات العمليات التجارية فقط ── */
                (() => {
                  const sortedOpLog = [...opLog].sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1));
                  return opLog.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                      <Text style={{ fontSize: 36, marginBottom: 8 }}>📋</Text>
                      <Text style={{ fontSize: 14, color: '#374151', fontWeight: '800' }}>لا يوجد نشاط بعد</Text>
                    </View>
                  ) : (
                  sortedOpLog.map((entry) => {
                    const card = getBellCard(entry.type);
                    const timeStr = new Date(entry.ts).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });
                    const dateStr = new Date(entry.ts).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const userColor = (Object.values(app.users ?? {}) as any[]).find((u: any) => u.name === entry.by)?.color ?? '#5c67f2';
                    return (
                      <Pressable
                        key={entry.id}
                        onPress={() => !entry.read && markOneRead(entry.id)}
                        style={[styles.bellCard, {
                          backgroundColor: entry.read ? '#ffffff' : card.bg,
                          borderColor: entry.read ? '#e2e8f0' : card.badge,
                          borderWidth: entry.read ? 1 : 2,
                        }]}
                      >
                        <View style={styles.bellCardTop}>
                          <View style={[styles.bellBadgePill, { backgroundColor: card.badge }]}>
                            <Text style={styles.bellBadgeTxt}>{card.icon} {card.label}</Text>
                          </View>
                          <Text style={styles.bellCardMsg} numberOfLines={1}>{entry.msg}</Text>
                          {!entry.read && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: card.badge }} />}
                        </View>
                        <View style={styles.bellCardFoot}>
                          <Text style={styles.bellCardDate}>{timeStr} · {dateStr}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            {entry.amount !== undefined && (
                              <Text style={[styles.bellCardAmount, { color: card.badge }]}>{entry.amount} د</Text>
                            )}
                            {!!entry.by?.trim() && (
                              <View style={[styles.bellUserBadge, { backgroundColor: userColor }]}>
                                <Text style={[styles.bellUserTxt, { color: '#fff' }]}>👤 {entry.by}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                  );
                })()
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.bellClose}
              onPress={() => { markAllRead(); setBellModal(false); }}
            >
              <Text style={styles.bellCloseTxt}>إغلاق وتحديد كمقروء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add button picker modal */}
      <Modal visible={addBtnModal} transparent animationType="fade" onRequestClose={() => setAddBtnModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setAddBtnModal(false)}>
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 20, margin: 20, gap: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: '900', color: '#1e293b', textAlign: 'right', marginBottom: 4 }}>اختر نوع الزر</Text>
            {ADD_BTN_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.type}
                style={{ backgroundColor: opt.color, borderRadius: 18, paddingVertical: 18, alignItems: 'center' }}
                onPress={() => addBtn(opt.type)}
              >
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add user modal */}
      <Modal visible={sheet === 'addUser'} animationType="slide" transparent onRequestClose={() => setSheet('users')}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}>
            <View style={[styles.sheet, { backgroundColor: sheetBg }]}>
              <Text style={styles.sheetTitle}>👤 موظف جديد</Text>
              <Text style={styles.fieldLabel}>الاسم *</Text>
              <TextInput style={styles.sheetInput} value={newName} onChangeText={setNewName} autoFocus />
              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>رقم الهاتف *</Text>
              <TextInput style={styles.sheetInput} value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>الرقم السري *</Text>
              <TextInput style={styles.sheetInput} value={newPin} onChangeText={setNewPin} keyboardType="numeric" secureTextEntry maxLength={8} />
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>الدور</Text>
              <View style={styles.roleRow}>
                {ROLES.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleBtn, newRole === r && { backgroundColor: ROLE_COLOR[r] + '20', borderColor: ROLE_COLOR[r] }]}
                    onPress={() => setNewRole(r)}
                  >
                    <Text style={[styles.roleBtnTxt, newRole === r && { color: ROLE_COLOR[r] }]}>{ROLE_LABEL[r]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>🎨 لون التطبيق</Text>
              <View style={uSt.colorGrid}>
                {THEME_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c.hex}
                    style={[uSt.colorSwatch, { backgroundColor: c.hex }, newColor === c.hex && uSt.colorSelected]}
                    onPress={() => setNewColor(c.hex)}
                  />
                ))}
              </View>
              <View style={[uSt.colorPreview, { backgroundColor: newColor }]}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>معاينة اللون</Text>
              </View>
              <View style={styles.sheetFooter}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setSheet('users')}>
                  <Text style={styles.cancelTxt}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: newColor }]} onPress={addUser}>
                  <Text style={styles.confirmTxt}>إضافة</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ LOGOUT MODAL ═══ */}
      <Modal visible={logoutModal} animationType="fade" transparent onRequestClose={() => setLogoutModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 28, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 16 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🔒</Text>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#1e293b', marginBottom: 8 }}>تخرج؟</Text>
            <Text style={{ fontSize: 14, color: '#64748b', fontWeight: '600', marginBottom: 28 }}>غادي تخرج من الحساب</Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#ef4444', alignItems: 'center' }} onPress={() => { setLogoutModal(false); clearAuth(); router.replace('/(auth)/login'); }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>نعم، خرج</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0' }} onPress={() => setLogoutModal(false)}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#64748b' }}>لا</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ FAB سوبر أدمين ═══ */}
      {isPransibal && (
        <TouchableOpacity
          style={{ position: 'absolute', bottom: 140, left: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
          onPress={() => setPrivateFab(true)}
        >
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '300', lineHeight: 30 }}>+</Text>
        </TouchableOpacity>
      )}

      {/* ═══ Private FAB Sheet ═══ */}
      <Modal visible={privateFab} transparent animationType="slide" onRequestClose={() => setPrivateFab(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setPrivateFab(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#1e293b', textAlign: 'center', marginBottom: 4 }}>🔒 منطقة خاصة</Text>
              {[
                { icon: '💰', label: 'مصاريف خاصة', color: '#dc2626', route: '/private-expenses' },
                { icon: '📝', label: 'ملاحظات', color: '#0284c7', route: '/notes' },
                { icon: '🔐', label: 'أسرار وأكواد', color: '#7c3aed', route: '/secrets' },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.route}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: opt.color + '15', padding: 16, borderRadius: 14 }}
                  onPress={() => { setPrivateFab(false); router.push(opt.route as any); }}
                >
                  <Text style={{ fontSize: 26 }}>{opt.icon}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: opt.color }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const uSt = StyleSheet.create({
  addBtn: { backgroundColor: '#16a34a', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  addBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },

  resetCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: '#fbbf24', backgroundColor: '#fffbeb',
    borderRadius: 14, padding: 14, marginBottom: 14,
  },
  resetTitle: { fontSize: 15, fontWeight: '800', color: '#92400e', textAlign: 'right' },
  resetSub: { fontSize: 13, color: '#6b7280', fontWeight: '600', textAlign: 'right', marginTop: 4 },
  resetEditBtn: { backgroundColor: '#fef9c3', borderWidth: 1, borderColor: '#fbbf24', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  resetEditTxt: { color: '#92400e', fontWeight: '800', fontSize: 13 },
  resetInput: { flex: 1, borderWidth: 1.5, borderColor: '#fbbf24', borderRadius: 10, padding: 10, fontSize: 15, color: '#1e293b', backgroundColor: '#fff', fontWeight: '700', textAlign: 'right' },

  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8, marginBottom: 8 },
  colorSwatch: { width: 38, height: 38, borderRadius: 19 },
  colorSelected: { borderWidth: 3, borderColor: '#1e293b', transform: [{ scale: 1.15 }] },
  colorPreview: { borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginBottom: 4 },

  userRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  userIcons: { flexDirection: 'column', gap: 6 },
  delIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  editIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },

  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  userName2: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  roleBadge2: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  roleBadgeTxt: { fontSize: 11, fontWeight: '700' },
  userPhone2: { fontSize: 13, color: '#64748b', fontWeight: '600', textAlign: 'right', marginBottom: 6 },
  statusBadge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  statusTxt: { fontSize: 12, fontWeight: '800' },

  closeBtn: { backgroundColor: '#ef4444', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  closeBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
});

const adSt = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  statCard: {
    flex: 1, minWidth: 48, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 2,
  },
  statEmoji: { fontSize: 13, marginBottom: 1 },
  statNum: { fontSize: 12, fontWeight: '900', color: '#1e293b' },
  statLabel: { fontSize: 8, fontWeight: '700', color: '#64748b' },
});

const cloudSt = StyleSheet.create({
  actionBtn: { borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 10 },
  actionTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 14 },
  backupsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  backupsTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  refreshBtn: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#bbf7d0', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  refreshTxt: { color: '#16a34a', fontWeight: '800', fontSize: 13 },
  backupRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#bbf7d0', borderRadius: 14, padding: 12, marginBottom: 8,
    backgroundColor: '#f0fdf4',
  },
  backupBtns: { flexDirection: 'row', gap: 8 },
  backupBtnBlue: { backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  backupBtnGreen: { backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  backupBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  backupDate: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  latestBadge: { backgroundColor: '#bbf7d0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  latestTxt: { color: '#15803d', fontWeight: '800', fontSize: 11 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: 16, paddingTop: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 4,
    marginBottom: 4,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  headerSub: { fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 },
  logoutBtn: {
    backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12,
  },
  logoutTxt: { fontSize: 13, color: '#ef4444', fontWeight: '700' },
  bellBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 22 },

  grid: { gap: 0 },
  row: { flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1, borderRadius: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
    position: 'relative',
  },
  btnFull: {
    borderRadius: 24, paddingVertical: 24, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
  },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  rowArrows: { flexDirection: 'column', justifyContent: 'center', gap: 4, paddingRight: 6 },
  arrowTxt: { fontSize: 18, color: '#64748b', fontWeight: '900' },
  removeBtnX: {
    position: 'absolute', top: 6, right: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  removeBtnXTxt: { color: '#fff', fontSize: 15, fontWeight: '900', lineHeight: 18 },
  editGridBtn: {
    backgroundColor: '#1e293b', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 20,
    alignSelf: 'flex-end', marginBottom: 10,
  },
  editGridTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  addBtnRow: {
    borderRadius: 18, paddingVertical: 16, alignItems: 'center',
    borderWidth: 2, borderColor: '#10b981', borderStyle: 'dashed', marginTop: 4,
  },
  addBtnTxt: { color: '#10b981', fontSize: 16, fontWeight: '800' },

  badge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: '#fff', borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { fontSize: 11, fontWeight: '900', color: '#f59e0b' },

  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  sheetLarge: { backgroundColor: '#ffffff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '80%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetHeaderBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#1e293b', textAlign: 'right' },
  closeSheetBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#e2e8f0',
    alignItems: 'center', justifyContent: 'center',
  },
  closeSheetTxt: { fontSize: 16, color: '#64748b', fontWeight: '800' },
  addSmallBtn: { backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  addSmallTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },

  userCard: {
    backgroundColor: '#f8fafc', borderRadius: 16, padding: 12, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#e2e8f0',
  },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  roleLabel: { fontSize: 11, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '700', color: '#1e293b', textAlign: 'right' },
  userPhone: { fontSize: 12, color: '#64748b', textAlign: 'right', marginTop: 2 },
  userActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  editBtn: { backgroundColor: '#eef2ff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  editBtnTxt: { color: '#5c67f2', fontWeight: '700', fontSize: 12 },

  pendingCard: {
    backgroundColor: '#f8fafc', borderRadius: 16, padding: 12, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#ef4444', borderWidth: 1, borderColor: '#e2e8f0',
    gap: 10,
  },
  pendingName: { fontSize: 14, fontWeight: '700', color: '#1e293b', textAlign: 'right' },
  pendingMeta: { fontSize: 12, color: '#64748b', marginTop: 2, textAlign: 'right' },
  pendingActions: { flexDirection: 'row', gap: 8 },
  pendingBtn: { flex: 1, padding: 9, borderRadius: 10, alignItems: 'center' },
  pendingBtnTxt: { fontSize: 13, fontWeight: '700' },

  emptyCenter: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTxt: { fontSize: 14, color: '#64748b', fontWeight: '600' },

  fieldLabel: { fontSize: 13, color: '#64748b', fontWeight: '700', textAlign: 'right', marginBottom: 6 },
  sheetInput: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14,
    padding: 14, fontSize: 15, color: '#1e293b', backgroundColor: '#f8fafc', fontWeight: '600',
    textAlign: 'right',
  },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  roleBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.lg,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  roleBtnTxt: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  sheetFooter: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: 14,
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', alignItems: 'center',
  },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: '#64748b' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  bellDropdown: { position: 'absolute', top: 70, left: 10, right: 10, backgroundColor: '#fff', borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12, overflow: 'hidden' },
  bellDropHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  bellDropTitle: { fontSize: 15, fontWeight: '900', color: '#1e293b' },
  bellTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  bellTabBtn: { flex: 1, paddingVertical: 8, borderRadius: 14, alignItems: 'center', backgroundColor: '#f1f5f9' },
  bellTabActive: { backgroundColor: '#1e293b' },
  bellTabTxt: { fontSize: 13, fontWeight: '800', color: '#64748b' },
  bellTabTxtActive: { color: '#fff' },
  bellSectionLabel: { fontSize: 12, fontWeight: '900', color: '#94a3b8', textAlign: 'right', marginBottom: 8, marginTop: 6, paddingHorizontal: 4 },
  bellCard: { borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1 },
  bellCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  bellBadgePill: { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  bellBadgeTxt: { color: '#fff', fontWeight: '900', fontSize: 10 },
  bellCardMsg: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1e293b', textAlign: 'right' },
  bellCardSub: { fontSize: 12, color: '#64748b', textAlign: 'right', fontWeight: '600' },
  bellCardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  bellCardDate: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  bellCardAmount: { fontSize: 13, fontWeight: '900' },
  bellUserBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  bellUserTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  bellApprove: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5' },
  bellReject: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
  bellClose: { margin: 10, padding: 13, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center' },
  bellCloseTxt: { fontSize: 14, fontWeight: '700', color: '#64748b' },
});
