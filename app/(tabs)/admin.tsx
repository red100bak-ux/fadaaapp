import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform,
  ScrollView, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { Colors, Radii } from '../../src/theme/colors';
import { markAllRead, getActivityColor, getActivityIcon } from '../../src/utils/activityLogger';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { AppUser, UserRole } from '../../src/types';

const ROLES: UserRole[] = ['view', 'staff', 'admin', 'super_admin'];
const ROLE_LABEL: Record<string, string> = {
  super_admin: 'سوبر أدمين',
  admin: 'أدمين',
  staff: 'مساعد',
  view: 'عرض فقط',
};
const ROLE_DOT: Record<string, string> = {
  super_admin: '#16a34a',
  admin: '#7c3aed',
  staff: '#f59e0b',
  view: '#ec4899',
};
const ROLE_COLOR: Record<UserRole, string> = {
  super_admin: Colors.primary,
  admin: Colors.success,
  staff: Colors.textMuted,
  view: '#ec4899',
};
function canEdit(role: string) {
  return role === 'admin' || role === 'super_admin';
}

type Sheet = 'none' | 'users' | 'pending' | 'addUser' | 'editUser' | 'cloud';
type SyncStatus = 'idle' | 'ok' | 'error';

interface CloudBackup {
  ts: string;      // ISO timestamp
  label: string;   // "2026/6/13 — 06:17"
}

export default function AdminScreen() {
  const { app, auth, clearAuth, updateApp, sync } = useAppStore();

  // جميع hooks يجب أن تكون قبل أي return مشروط
  const isSuper = auth?.role === 'super_admin';

  const [sheet, setSheet] = useState<Sheet>('none');
  const [bellModal, setBellModal] = useState(false);
  const [bellTab, setBellTab] = useState<'alerts' | 'log'>('alerts');
  const [search, setSearch] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [cloudBackups, setCloudBackups] = useState<CloudBackup[]>(() => app.cloudBackups ?? []);
  const [syncing, setSyncing] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editPin, setEditPin] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('staff');
  const [editingResetPin, setEditingResetPin] = useState(false);
  const [newResetPin, setNewResetPin] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('staff');

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
              sub: `${chk.amount} DH — ${late ? `تأخر ${Math.abs(diff)} يوم` : `بعد ${diff} يوم`}`,
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
          sub: `الراتب: ${emp.salary} DH`,
          color: '#7c3aed' });
      }
    });

    // ديون موردين كبيرة (أكثر من 2000 DH)
    Object.entries(app.supplierCredit ?? {}).forEach(([id, supp]) => {
      if ((supp.total ?? 0) > 2000) {
        result.push({ id: `debt_${id}`, type: 'debt', icon: '💸',
          title: `دين كبير: ${supp.name ?? id}`,
          sub: `${(supp.total ?? 0).toLocaleString('fr-MA')} DH`,
          color: '#ea580c' });
      }
    });

    return result;
  }, [app.stock, app.supplierCredit, app.employees, isSuper]);

  const activityLog = app.activityLog ?? [];
  const unreadCount = activityLog.filter((l) => !l.read).length;
  const totalBadge = notifications.length + unreadCount;

  if (!auth || auth.role === 'staff') return <Redirect href="/(tabs)" />;

  const users = Object.entries(app.users ?? {});
  const pendingStock = Object.entries(app.stock ?? {}).filter(([, i]) => i.pendingDeletion);

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
    setSheet('editUser');
  }

  function saveEditUser() {
    if (!editingKey) return;
    if (editPin.length < 4) { Alert.alert('', 'الرقم السري 4 أرقام على الأقل'); return; }
    updateApp((prev) => ({
      ...prev,
      users: { ...prev.users, [editingKey]: { ...prev.users[editingKey], pin: editPin, role: editRole } },
    }));
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
      users: { ...prev.users, [newPhone.trim()]: { name: newName.trim(), role: newRole, pin: newPin, color: '#5c67f2' } },
    }));
    setSheet('none');
    setNewName(''); setNewPhone(''); setNewPin(''); setNewRole('staff');
  }

  function approveDelete(itemKey: string) {
    updateApp((prev) => { const s = { ...prev.stock }; delete s[itemKey]; return { ...prev, stock: s }; });
  }

  function rejectDelete(itemKey: string) {
    updateApp((prev) => ({
      ...prev,
      stock: { ...prev.stock, [itemKey]: { ...prev.stock[itemKey], pendingDeletion: false, deletionRequestedBy: undefined } },
    }));
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => Alert.alert('خروج', 'تريد تسجيل الخروج؟', [
              { text: 'لا', style: 'cancel' },
              { text: 'نعم', style: 'destructive', onPress: () => { clearAuth(); router.replace('/(auth)/login'); } },
            ])}
          >
            <Text style={styles.logoutTxt}>🔒 خروج</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              <Text style={{ color: syncStatus === 'error' ? '#ef4444' : '#10b981' }}>●</Text>
              {' '}فضاء الأخوين
            </Text>
            <Text style={styles.headerSub}>⚙️ الإدارة والتحكم</Text>
          </View>
          <TouchableOpacity style={styles.bellBtn} onPress={() => setBellModal(true)}>
            <Text style={styles.bellIcon}>🔔</Text>
            {totalBadge > 0 && (
              <View style={[styles.badge, { top: 2, left: 2, backgroundColor: '#ef4444', width: 18, height: 18 }]}>
                <Text style={[styles.badgeTxt, { color: '#fff' }]}>{totalBadge}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Buttons grid */}
        <View style={styles.grid}>
          {/* Row 1: Cloud + Delete requests */}
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, {
                backgroundColor: syncStatus === 'error' ? '#dc2626' : '#10b981'
              }]}
              onPress={() => setSheet('cloud')}
              activeOpacity={0.85}
            >
              <Text style={styles.btnTxt}>
                {syncStatus === 'ok' ? '✅ سحابة' : syncStatus === 'error' ? '❌ سحابة' : 'سحابة ☁️'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#f59e0b' }]}
              onPress={() => setSheet('pending')}
              activeOpacity={0.85}
            >
              {pendingStock.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{pendingStock.length}</Text>
                </View>
              )}
              <Text style={styles.btnTxt}>طلبات الحذف 🛡️</Text>
            </TouchableOpacity>
          </View>

          {/* Row 2: الخدام والمصاريف - full width */}
          <TouchableOpacity
            style={[styles.btnFull, { backgroundColor: '#7c3aed' }]}
            onPress={() => router.push('/staff')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnTxt}>الخدام والمصاريف 👷</Text>
          </TouchableOpacity>

          {/* Row 3: الخدام + إضافة الستوك */}
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#6b7280' }]}
              onPress={() => setSheet('users')}
              activeOpacity={0.85}
            >
              <Text style={styles.btnTxt}>الخدام 👥</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#10b981' }]}
              onPress={() => router.push('/scan')}
              activeOpacity={0.85}
            >
              <Text style={styles.btnTxt}>إضافة الستوك ➕</Text>
            </TouchableOpacity>
          </View>

          {/* Row 4: الموردين + الحصيلة */}
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#0284c7' }]}
              onPress={() => router.push('/suppliers')}
              activeOpacity={0.85}
            >
              <Text style={styles.btnTxt}>الموردين والرفد 📦</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#d97706' }]}
              onPress={() => router.push('/(tabs)/report')}
              activeOpacity={0.85}
            >
              <Text style={styles.btnTxt}>الحصيلة 📊</Text>
            </TouchableOpacity>
          </View>

          {/* Row 5: سكان الستوك - full width */}
          <TouchableOpacity
            style={[styles.btnFull, { backgroundColor: '#4f46e5' }]}
            onPress={() => router.push('/scan')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnTxt}>سكان الستوك 📷</Text>
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 ابحث في الستوك..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>

        {/* Search results */}
        {searchResults.length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.map(([bc, item]) => (
              <View key={bc} style={styles.resultRow}>
                <Text style={styles.resultName}>{item.name}</Text>
                <Text style={styles.resultMeta}>📁 {item.cat} · {item.qty} قطعة · {item.sell} DH</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Users Sheet — NEW DESIGN */}
      <Modal visible={sheet === 'users'} animationType="slide" transparent onRequestClose={() => setSheet('none')}>
        <View style={styles.overlay}>
          <View style={[styles.sheetLarge, { maxHeight: '92%' }]}>
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
                <View style={{ flex: 1 }}>
                  <Text style={uSt.resetTitle}>كود تصفير الحصيلة 🔒</Text>
                  {editingResetPin ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity style={[uSt.resetEditBtn, { backgroundColor: '#16a34a' }]}
                        onPress={() => {
                          if (newResetPin.length < 4) { Alert.alert('', 'الكود 4 أرقام على الأقل'); return; }
                          updateApp(prev => ({ ...prev, resetPin: newResetPin }));
                          setEditingResetPin(false);
                        }}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>✅ حفظ</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={uSt.resetInput}
                        value={newResetPin} onChangeText={setNewResetPin}
                        keyboardType="numeric" maxLength={8} textAlign="center"
                        autoFocus placeholder="الكود الجديد" placeholderTextColor="#9ca3af"
                      />
                    </View>
                  ) : (
                    <Text style={uSt.resetSub}>الرقم السري الحالي: {app.resetPin ?? '——'}</Text>
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
                    {/* Left: delete + edit icons */}
                    <View style={uSt.userIcons}>
                      {isSuper && key !== auth?.phone && (
                        <TouchableOpacity style={uSt.delIcon} onPress={() => deleteUser(key, user)}>
                          <Text style={{ fontSize: 17 }}>🗑️</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={uSt.editIcon} onPress={() => openEditUser(key, user)}>
                        <Text style={{ fontSize: 17 }}>✏️</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Right: info */}
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      {/* Name + dot + role badge */}
                      <View style={uSt.userNameRow}>
                        <View style={[uSt.roleBadge2, { borderColor: dot }]}>
                          <Text style={[uSt.roleBadgeTxt, { color: dot }]}>{ROLE_LABEL[user.role] ?? user.role}</Text>
                        </View>
                        <View style={[uSt.dot, { backgroundColor: dot }]} />
                        <Text style={uSt.userName2}>{user.name}</Text>
                        <Text style={{ fontSize: 16 }}>👤</Text>
                      </View>

                      {/* Phone */}
                      <Text style={uSt.userPhone2}>📞 {key}    🔑 <Text style={{ color: '#d97706', fontWeight: '900' }}>الكود: {user.pin}</Text></Text>

                      {/* Status badge */}
                      <View style={[uSt.statusBadge, { backgroundColor: editable ? '#dcfce7' : '#fee2e2', borderColor: editable ? '#86efac' : '#fca5a5' }]}>
                        <Text style={[uSt.statusTxt, { color: editable ? '#16a34a' : '#dc2626' }]}>
                          {editable ? '✅ تعديل' : '✗ محظور'}
                        </Text>
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
          <View style={[styles.sheetLarge, { flex: 1, maxHeight: '80%' }]}>
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
      <Modal visible={sheet === 'editUser'} animationType="slide" transparent onRequestClose={() => setSheet('users')}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>✏️ تعديل المستخدم</Text>
            <Text style={styles.fieldLabel}>الرقم السري الجديد *</Text>
            <TextInput
              style={styles.sheetInput}
              value={editPin}
              onChangeText={setEditPin}
              keyboardType="numeric"
              secureTextEntry
              textAlign="center"
              maxLength={8}
              autoFocus
            />
            {isSuper && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>الدور</Text>
                <View style={styles.roleRow}>
                  {ROLES.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleBtn, editRole === r && { backgroundColor: ROLE_COLOR[r] + '20', borderColor: ROLE_COLOR[r] }]}
                      onPress={() => setEditRole(r)}
                    >
                      <Text style={[styles.roleBtnTxt, editRole === r && { color: ROLE_COLOR[r] }]}>{ROLE_LABEL[r]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSheet('users')}>
                <Text style={styles.cancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={saveEditUser}>
                <Text style={styles.confirmTxt}>حفظ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cloud Sync Sheet */}
      <Modal visible={sheet === 'cloud'} animationType="slide" transparent onRequestClose={() => setSheet('none')}>
        <View style={styles.overlay}>
          <View style={[styles.sheetLarge, { maxHeight: '90%' }]}>
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

      {/* Bell / Notifications modal */}
      <Modal visible={bellModal} animationType="slide" transparent onRequestClose={() => { markAllRead(); setBellModal(false); }}>
        <View style={styles.overlay}>
          <View style={[styles.sheetLarge, { maxHeight: '85%' }]}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>🔔 الإشعارات</Text>
              {totalBadge > 0 && (
                <View style={{ backgroundColor: '#ef4444', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>{totalBadge}</Text>
                </View>
              )}
            </View>

            {/* Tabs */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', backgroundColor: bellTab === 'alerts' ? Colors.primary : '#e2e8f0' }}
                onPress={() => setBellTab('alerts')}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: bellTab === 'alerts' ? '#fff' : '#64748b' }}>
                  تنبيهات {notifications.length > 0 ? `(${notifications.length})` : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', backgroundColor: bellTab === 'log' ? Colors.primary : '#f3f4f6' }}
                onPress={() => setBellTab('log')}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: bellTab === 'log' ? '#fff' : '#64748b' }}>
                  السجل {unreadCount > 0 ? `(${unreadCount})` : ''}
                </Text>
              </TouchableOpacity>
            </View>

            {bellTab === 'alerts' ? (
              notifications.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ fontSize: 48, marginBottom: 10 }}>✅</Text>
                  <Text style={{ fontSize: 15, color: '#64748b', fontWeight: '700' }}>كل شيء على ما يرام</Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                  {notifications.map((n) => (
                    <View key={n.id} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingVertical: 13, paddingHorizontal: 12, marginBottom: 8,
                      backgroundColor: '#fafafa', borderRadius: 12,
                      borderRightWidth: 4, borderRightColor: n.color,
                      borderWidth: 1, borderColor: '#f3f4f6',
                    }}>
                      <Text style={{ fontSize: 20 }}>{n.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#1e293b', textAlign: 'right' }}>{n.title}</Text>
                        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 3, textAlign: 'right' }}>{n.sub}</Text>
                      </View>
                      {n.type === 'del' && isSuper && (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity
                            style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: '#fee2e2' }}
                            onPress={() => n.bc && approveDelete(n.bc)}
                          >
                            <Text style={{ color: '#ef4444', fontWeight: '900', fontSize: 13 }}>✓</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: '#f0fdf4' }}
                            onPress={() => n.bc && rejectDelete(n.bc)}
                          >
                            <Text style={{ color: '#16a34a', fontWeight: '900', fontSize: 13 }}>✗</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                </ScrollView>
              )
            ) : (
              activityLog.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ fontSize: 48, marginBottom: 10 }}>📋</Text>
                  <Text style={{ fontSize: 15, color: '#64748b', fontWeight: '700' }}>لا يوجد سجل بعد</Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                  {activityLog.map((entry) => {
                    const color = getActivityColor(entry.type);
                    const icon = getActivityIcon(entry.type);
                    const timeStr = new Date(entry.ts).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' });
                    const dateStr = new Date(entry.ts).toLocaleDateString('ar-MA', { day: '2-digit', month: '2-digit' });
                    return (
                      <View key={entry.id} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingVertical: 11, paddingHorizontal: 12, marginBottom: 7,
                        backgroundColor: entry.read ? '#fafafa' : color + '10',
                        borderRadius: 12, borderRightWidth: 3, borderRightColor: color,
                        borderWidth: 1, borderColor: entry.read ? '#f3f4f6' : color + '40',
                      }}>
                        <View style={{ alignItems: 'center', gap: 2 }}>
                          <Text style={{ fontSize: 18 }}>{icon}</Text>
                          {!entry.read && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: entry.read ? '600' : '800', color: '#1e293b', textAlign: 'right' }}>
                            {entry.msg}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2, textAlign: 'right', fontWeight: '600' }}>
                            👤 {entry.by} · {dateStr} {timeStr}
                          </Text>
                        </View>
                        {entry.amount !== undefined && (
                          <Text style={{ fontSize: 13, fontWeight: '900', color }}>{entry.amount} DH</Text>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              )
            )}

            <TouchableOpacity
              style={{ marginTop: 14, padding: 14, borderRadius: 14, backgroundColor: '#e2e8f0', alignItems: 'center' }}
              onPress={() => { markAllRead(); setBellModal(false); }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#64748b' }}>إغلاق وتحديد كمقروء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add user modal */}
      <Modal visible={sheet === 'addUser'} animationType="slide" transparent onRequestClose={() => setSheet('users')}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>👤 موظف جديد</Text>
              <Text style={styles.fieldLabel}>الاسم *</Text>
              <TextInput style={styles.sheetInput} value={newName} onChangeText={setNewName} textAlign="right" autoFocus />
              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>رقم الهاتف *</Text>
              <TextInput style={styles.sheetInput} value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" textAlign="right" />
              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>الرقم السري *</Text>
              <TextInput style={styles.sheetInput} value={newPin} onChangeText={setNewPin} keyboardType="numeric" secureTextEntry textAlign="center" maxLength={8} />
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
              <View style={styles.sheetFooter}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setSheet('users')}>
                  <Text style={styles.cancelTxt}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={addUser}>
                  <Text style={styles.confirmTxt}>إضافة</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  resetInput: { flex: 1, borderWidth: 1.5, borderColor: '#fbbf24', borderRadius: 10, padding: 10, fontSize: 15, color: '#1e293b', backgroundColor: '#fff', fontWeight: '700' },

  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  userIcons: { flexDirection: 'column', gap: 8 },
  delIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  editIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },

  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  userName2: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  roleBadge2: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  roleBadgeTxt: { fontSize: 12, fontWeight: '700' },
  userPhone2: { fontSize: 13, color: '#64748b', fontWeight: '600', textAlign: 'right', marginBottom: 6 },
  statusBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  statusTxt: { fontSize: 13, fontWeight: '800' },

  closeBtn: { backgroundColor: '#ef4444', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  closeBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
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
  root: { flex: 1, backgroundColor: '#f8fafc' },
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

  grid: { gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  btn: {
    flex: 1, borderRadius: 24, paddingVertical: 24, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
    position: 'relative',
  },
  btnFull: {
    borderRadius: 24, paddingVertical: 24, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 5,
  },
  btnTxt: { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center' },

  badge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: '#fff', borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { fontSize: 11, fontWeight: '900', color: '#f59e0b' },

  searchWrap: { marginTop: 14 },
  searchInput: {
    backgroundColor: '#ffffff', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14,
    fontSize: 15, color: '#1e293b', borderWidth: 2, borderColor: '#e2e8f0', fontWeight: '600',
  },
  searchResults: { marginTop: 8, gap: 6 },
  resultRow: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  resultName: { fontSize: 14, fontWeight: '700', color: '#1e293b', textAlign: 'right' },
  resultMeta: { fontSize: 12, color: '#64748b', marginTop: 3, textAlign: 'right' },

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
});
