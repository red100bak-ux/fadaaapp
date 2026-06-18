import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { Colors, Radii, Shadow } from '../../src/theme/colors';
import { creditGrandTotal, formatMAD } from '../../src/utils/helpers';
import { usePermissions } from '../../src/hooks/usePermissions';
import AppHeader from '../../src/components/AppHeader';
import AppAlert, { AppAlertButton } from '../../src/components/AppAlert';

const ORANGE = '#d97706';
const ORANGE_LIGHT = '#fffbeb';
const ORANGE_BORDER = '#fde68a';

export default function CreditScreen() {
  const { app, auth, updateApp } = useAppStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [editModal, setEditModal] = useState(false);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [appAlert, setAppAlert] = useState<{ icon?: string; title: string; message?: string; buttons: AppAlertButton[] } | null>(null);

  const customers = useMemo(() => {
    return Object.entries(app.credit ?? {})
      .filter(([, c]) => !c.pendingDeletion)
      .sort(([, a], [, b]) => (b.total || 0) - (a.total || 0));
  }, [app.credit]);

  const grandTotal = creditGrandTotal(app.credit ?? {});

  const perm = usePermissions();
  const canEdit = perm.isAdmin;

  function addCustomer() {
    if (!newName.trim()) { setAppAlert({ icon: '✏️', title: 'اسم ناقص', message: 'أدخل اسم الزبون', buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] }); return; }
    const id = `CUST_${Date.now()}`;
    updateApp((prev) => ({
      ...prev,
      credit: {
        ...prev.credit,
        [id]: { name: newName.trim(), phone: newPhone.trim() || null, total: 0, logs: [] },
      },
    }));
    setNewName('');
    setNewPhone('');
    setShowAddForm(false);
  }

  function openCustomer(id: string) {
    router.push(`/customer/${encodeURIComponent(id)}`);
  }

  function openEdit(id: string, name: string, phone: string) {
    setEditId(id);
    setEditName(name);
    setEditPhone(phone || '');
    setEditModal(true);
  }

  function saveEdit() {
    if (!editName.trim()) { setAppAlert({ icon: '✏️', title: 'اسم ناقص', message: 'أدخل اسم الزبون', buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] }); return; }
    const oldName = app.credit?.[editId]?.name ?? editId;
    updateApp((prev) => {
      const logEntry = {
        id: `log_${Date.now()}`,
        type: 'other' as const,
        msg: `✏️ ${auth?.name} غيّر اسم الزبون من "${oldName}" إلى "${editName.trim()}"`,
        ts: new Date().toISOString(),
        by: auth?.name ?? '',
        read: false,
      };
      return {
        ...prev,
        credit: {
          ...prev.credit,
          [editId]: {
            ...prev.credit?.[editId],
            name: editName.trim(),
            phone: editPhone.trim() || null,
          },
        },
        activityLog: [logEntry, ...(prev.activityLog ?? [])],
      };
    });
    setEditModal(false);
  }

  function deleteCustomer(id: string, name: string) {
    setAppAlert({ icon: '🗑️', title: 'حذف الزبون', message: `حذف "${name}"؟`, buttons: [
      { label: 'إلغاء', onPress: () => setAppAlert(null) },
      { label: '🗑️ حذف', danger: true, onPress: () => {
        setAppAlert(null);
        updateApp((prev) => {
          const credit = { ...prev.credit };
          if (credit[id]) credit[id] = { ...credit[id], pendingDeletion: true };
          return { ...prev, credit };
        });
      }},
    ]});
  }

  return (
    <SafeAreaView style={styles.root}>
      <AppHeader title="دفتر الكريدي" sub={`مجموع: ${formatMAD(grandTotal)}`} subColor="#10b981" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={customers}
          keyExtractor={([id]) => id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>

              {/* Add form */}
              {canEdit && (
                <View style={styles.addCard}>
                  {showAddForm && (
                    <>
                      <TextInput
                        style={styles.addInput}
                        placeholder="اسم الزبون الجديد *"
                        placeholderTextColor={Colors.textMuted}
                        value={newName}
                        onChangeText={setNewName}
                        autoFocus
                      />
                      <TextInput
                        style={styles.addInput}
                        placeholder="📞 رقم الهاتف (اختياري)"
                        placeholderTextColor={Colors.textMuted}
                        value={newPhone}
                        onChangeText={setNewPhone}
                        keyboardType="phone-pad"
                      />
                    </>
                  )}
                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={showAddForm ? addCustomer : () => setShowAddForm(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.addBtnTxt}>
                      {showAddForm ? '✓ حفظ الزبون' : '+ إضافة زبون للكارني'}
                    </Text>
                  </TouchableOpacity>
                  {showAddForm && (
                    <TouchableOpacity
                      style={[styles.addBtn, { backgroundColor: '#e2e8f0', marginTop: -2 }]}
                      onPress={() => { setShowAddForm(false); setNewName(''); setNewPhone(''); }}
                    >
                      <Text style={[styles.addBtnTxt, { color: '#64748b' }]}>إلغاء</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          }
          renderItem={({ item: [id, customer] }) => (
            <TouchableOpacity
              style={styles.customerCard}
              onPress={() => openCustomer(id)}
              activeOpacity={0.75}
            >
              {/* RIGHT in RTL: name + phone + amount */}
              <View style={styles.customerInfo}>
                <Text style={styles.customerName}>{customer.name}</Text>
                {customer.phone ? (
                  <Text style={styles.customerPhone}>📞 {customer.phone}</Text>
                ) : null}
                <Text style={styles.customerTotal}>{formatMAD(customer.total || 0)}</Text>
              </View>

              {/* LEFT in RTL: ✏️ top, 🗑️ below — column layout */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.editBtnSmall}
                  onPress={() => openEdit(id, customer.name, customer.phone ?? '')}
                >
                  <Text style={styles.actionIcon}>✏️</Text>
                </TouchableOpacity>
                {canEdit && (
                  <TouchableOpacity
                    style={styles.deleteBtnSmall}
                    onPress={() => deleteCustomer(id, customer.name)}
                  >
                    <Text style={styles.actionIcon}>🗑️</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTxt}>لا يوجد زبائن كريدي</Text>
            </View>
          }
        />
      </KeyboardAvoidingView>

      {/* Edit modal */}
      <Modal visible={editModal} animationType="slide" transparent onRequestClose={() => setEditModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>✏️ تعديل الزبون</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="الاسم"
              placeholderTextColor={Colors.textMuted}
              value={editName}
              onChangeText={setEditName}
              autoFocus
            />
            <TextInput
              style={[styles.sheetInput, { marginTop: 12 }]}
              placeholder="رقم الهاتف (اختياري)"
              placeholderTextColor={Colors.textMuted}
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModal(false)}>
                <Text style={styles.cancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={saveEdit}>
                <Text style={styles.confirmTxt}>حفظ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <AppAlert
        visible={!!appAlert}
        icon={appAlert?.icon}
        title={appAlert?.title ?? ''}
        message={appAlert?.message}
        buttons={appAlert?.buttons ?? []}
        onDismiss={() => setAppAlert(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },

  header: {
    backgroundColor: Colors.card,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: Radii.xl,
    margin: 14,
    marginBottom: 10,
    alignItems: 'center',
    ...Shadow.card,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  greenDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.success,
    shadowColor: Colors.success, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 4, elevation: 3,
  },
  grandTotal: {
    fontSize: 17, fontWeight: '900', color: ORANGE,
    marginTop: 10, textAlign: 'center',
  },

  addCard: {
    backgroundColor: ORANGE_LIGHT,
    borderWidth: 1.5,
    borderColor: ORANGE_BORDER,
    borderRadius: Radii.xl,
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 16,
    gap: 10,
  },
  addInput: {
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
    textAlign: 'right',
  },
  addBtn: {
    backgroundColor: ORANGE,
    borderRadius: Radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  addBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },

  list: { paddingBottom: 110 },

  customerCard: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  actions: { flexDirection: 'column', gap: 6 },
  deleteBtnSmall: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center', justifyContent: 'center',
  },
  editBtnSmall: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.infoLight,
    alignItems: 'center', justifyContent: 'center',
  },
  actionIcon: { fontSize: 16 },

  customerInfo: { flex: 1 },
  customerName: { fontSize: 17, fontWeight: '800', color: Colors.text },
  customerPhone: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  customerTotal: { fontSize: 17, fontWeight: '900', color: ORANGE, marginTop: 4, textAlign: 'right' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTxt: { fontSize: 15, color: Colors.textMuted, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 16 },
  sheetInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg,
    padding: 14, fontSize: 15, color: Colors.text, backgroundColor: Colors.background, fontWeight: '600',
    textAlign: 'right',
  },
  sheetFooter: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: Radii.lg,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  confirmBtn: { flex: 2, padding: 14, borderRadius: Radii.lg, backgroundColor: ORANGE, alignItems: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
