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

const ORANGE = '#d97706';
const ORANGE_LIGHT = '#fffbeb';
const ORANGE_BORDER = '#fde68a';

export default function CreditScreen() {
  const { app, auth, updateApp } = useAppStore();
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [editModal, setEditModal] = useState(false);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const customers = useMemo(() => {
    return Object.entries(app.credit ?? {})
      .filter(([, c]) => !c.pendingDeletion)
      .sort(([, a], [, b]) => (b.total || 0) - (a.total || 0));
  }, [app.credit]);

  const grandTotal = creditGrandTotal(app.credit ?? {});

  const perm = usePermissions();
  const canEdit = perm.isAdmin;

  function addCustomer() {
    if (!newName.trim()) { Alert.alert('', 'أدخل اسم الزبون'); return; }
    const id = `CUST_${Date.now()}`;
    updateApp((prev) => ({
      ...prev,
      credit: {
        ...prev.credit,
        [id]: { name: newName.trim(), phone: newPhone.trim() || undefined, total: 0, logs: [] },
      },
    }));
    setNewName('');
    setNewPhone('');
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
    if (!editName.trim()) { Alert.alert('', 'أدخل اسم الزبون'); return; }
    updateApp((prev) => ({
      ...prev,
      credit: {
        ...prev.credit,
        [editId]: {
          ...prev.credit?.[editId],
          name: editName.trim(),
          phone: editPhone.trim() || undefined,
        },
      },
    }));
    setEditModal(false);
  }

  function deleteCustomer(id: string, name: string) {
    Alert.alert('حذف الزبون', `هل تريد حذف "${name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: () => {
          updateApp((prev) => {
            const credit = { ...prev.credit };
            if (credit[id]) credit[id] = { ...credit[id], pendingDeletion: true };
            return { ...prev, credit };
          });
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.root}>
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
              {/* Header */}
              <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Text style={styles.headerTitle}>📒 دفتر الكريدي (الزبائن)</Text>
                  <View style={styles.greenDot} />
                </View>
                <Text style={styles.grandTotal}>
                  مجموع الكريدي: DH {grandTotal.toLocaleString('fr-MA')}
                </Text>
              </View>

              {/* Add form */}
              {canEdit && (
                <View style={styles.addCard}>
                  <TextInput
                    style={styles.addInput}
                    placeholder="اسم الزبون الجديد"
                    placeholderTextColor={Colors.textMuted}
                    value={newName}
                    onChangeText={setNewName}
                    textAlign="right"
                  />
                  <TextInput
                    style={styles.addInput}
                    placeholder="📞 رقم الهاتف (اختياري)"
                    placeholderTextColor={Colors.textMuted}
                    value={newPhone}
                    onChangeText={setNewPhone}
                    keyboardType="phone-pad"
                    textAlign="right"
                  />
                  <TouchableOpacity style={styles.addBtn} onPress={addCustomer} activeOpacity={0.8}>
                    <Text style={styles.addBtnTxt}>+ إضافة زبون للكارني</Text>
                  </TouchableOpacity>
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
              {/* Left: action buttons */}
              {canEdit && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.deleteBtnSmall}
                    onPress={() => deleteCustomer(id, customer.name)}
                  >
                    <Text style={styles.actionIcon}>🗑️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.editBtnSmall}
                    onPress={() => openEdit(id, customer.name, customer.phone ?? '')}
                  >
                    <Text style={styles.actionIcon}>✏️</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Right: name + amount */}
              <View style={styles.customerInfo}>
                <Text style={styles.customerName}>{customer.name}</Text>
                <Text style={styles.customerTotal}>DH {(customer.total || 0).toLocaleString('fr-MA')}</Text>
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
              textAlign="right"
              autoFocus
            />
            <TextInput
              style={[styles.sheetInput, { marginTop: 12 }]}
              placeholder="رقم الهاتف (اختياري)"
              placeholderTextColor={Colors.textMuted}
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
              textAlign="right"
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

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

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
    paddingHorizontal: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  actions: { flexDirection: 'row', gap: 8 },
  deleteBtnSmall: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.dangerLight,
    alignItems: 'center', justifyContent: 'center',
  },
  editBtnSmall: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.infoLight,
    alignItems: 'center', justifyContent: 'center',
  },
  actionIcon: { fontSize: 18 },

  customerInfo: { flex: 1, alignItems: 'flex-end' },
  customerName: { fontSize: 17, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  customerTotal: { fontSize: 17, fontWeight: '900', color: ORANGE, marginTop: 2, textAlign: 'right' },

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
