import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { Colors, Radii, Shadow } from '../../src/theme/colors';
import { getFolderColor, getItemsForFolder, makeSaleRecord, generateId, formatMAD } from '../../src/utils/helpers';
import { sendNow } from '../../src/utils/notificationService';
import { logActivity } from '../../src/utils/activityLogger';
import { usePermissions } from '../../src/hooks/usePermissions';
import type { StockItem } from '../../src/types';

const EMPTY_FORM = { name: '', sell: '', buy: '', qty: '1', supplier: '' };

export default function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const folderId = decodeURIComponent(id ?? '');
  const { app, auth, updateApp } = useAppStore();

  const folder = app.folders?.find((f) => f.id === folderId);
  const col = folder ? getFolderColor(folder) : { bg: '#f1f5f9', fg: '#64748b' };

  const [search, setSearch] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [editBarcode, setEditBarcode] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [itemModal, setItemModal] = useState<{ bc: string; item: StockItem } | null>(null);
  const [sellConfirm, setSellConfirm] = useState<{ bc: string; item: StockItem } | null>(null);

  const perm = usePermissions();

  const allItems = useMemo(
    () => getItemsForFolder(app.stock, folder?.name ?? ''),
    [app.stock, folder?.name],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return allItems;
    const q = search.toLowerCase();
    return allItems.filter(([bc, item]) =>
      item.name.toLowerCase().includes(q) || bc.includes(q),
    );
  }, [allItems, search]);

  if (!folder) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFound}>المجلد غير موجود</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: Colors.primary, marginTop: 12 }}>رجوع</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function openAdd() {
    setEditBarcode(null);
    setForm(EMPTY_FORM);
    setAddModal(true);
  }

  function openEdit(bc: string, item: StockItem) {
    setEditBarcode(bc);
    setForm({
      name: item.name,
      sell: String(item.sell),
      buy: String(item.buy),
      qty: String(item.qty),
      supplier: item.supplier ?? '',
    });
    setItemModal(null);
    setAddModal(true);
  }

  function saveItem() {
    if (!form.name.trim() || !form.sell || !form.buy) {
      Alert.alert('', 'أدخل الاسم والأسعار');
      return;
    }
    const bc = editBarcode ?? generateId();
    const item: StockItem = {
      name: form.name.trim(),
      cat: folder!.name,
      sell: parseFloat(form.sell) || 0,
      buy: parseFloat(form.buy) || 0,
      qty: parseInt(form.qty) || 1,
      supplier: form.supplier.trim() || undefined,
      addedBy: auth?.name,
    };

    updateApp((prev) => {
      const newStock = { ...prev.stock, [bc]: item };
      if (!editBarcode) {
        const record = makeSaleRecord({
          name: `📦 جاب سلعة: ${item.name}`,
          sell: item.sell * item.qty,
          buy: item.buy * item.qty,
          cat: folder!.name,
          seller: auth?.name ?? '',
        });
        return { ...prev, stock: newStock, todaySales: [...prev.todaySales, record] };
      }
      return { ...prev, stock: newStock };
    });
    if (!editBarcode) {
      logActivity('add_stock', `📦 أضاف: ${item.name} (${item.qty} قطعة)`, auth?.name ?? '');
    }
    setAddModal(false);
  }

  function sellItem(bc: string, item: StockItem) {
    if (item.qty <= 0) { Alert.alert('', 'المخزون فارغ'); return; }
    setSellConfirm({ bc, item });
  }

  function confirmSell() {
    if (!sellConfirm) return;
    const { bc, item } = sellConfirm;
    updateApp((prev) => {
      const newQty = item.qty - 1;
      const newStock = { ...prev.stock, [bc]: { ...item, qty: newQty } };
      if (newQty <= 0) {
        delete newStock[bc];
        sendNow('📭 نفد الستوك', `${item.name} — ${folder!.name}`).catch(() => {});
      } else if (newQty <= 2) {
        sendNow('⚠️ ستوك قليل', `${item.name} — باقي ${newQty} قطع`).catch(() => {});
      }
      const record = makeSaleRecord({
        name: item.name, sell: item.sell, buy: item.buy,
        cat: folder!.name, seller: auth?.name ?? '',
      });
      return { ...prev, stock: newStock, todaySales: [...prev.todaySales, record] };
    });
    logActivity('sell', `🛒 باع: ${item.name} — ${formatMAD(item.sell)}`, auth?.name ?? '', item.sell);
    setSellConfirm(null);
    setItemModal(null);
  }

  function deleteItem(bc: string, item: StockItem) {
    if (!perm.canDeleteDirect && !perm.canRequestDelete) {
      Alert.alert('', 'غير مصرح بالحذف'); return;
    }
    if (perm.canRequestDelete && !perm.canDeleteDirect) {
      // Staff: request deletion approval
      updateApp((prev) => ({
        ...prev,
        stock: {
          ...prev.stock,
          [bc]: { ...item, pendingDeletion: true, deletionRequestedBy: auth?.name },
        },
      }));
      logActivity('delete_req', `🗑️ طلب حذف: ${item.name}`, auth?.name ?? '');
      Alert.alert('', 'تم إرسال طلب الحذف للمراجعة');
    } else {
      Alert.alert('حذف', `حذف "${item.name}"؟`, [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف', style: 'destructive',
          onPress: () => {
            updateApp((prev) => {
              const s = { ...prev.stock };
              delete s[bc];
              const record = makeSaleRecord({
                name: `📌 حذف: ${item.name}`,
                sell: 0, buy: item.buy, cat: folder!.name, seller: auth?.name ?? '',
              });
              return { ...prev, stock: s, todaySales: [...prev.todaySales, record] };
            });
            setItemModal(null);
          },
        },
      ]);
    }
  }

  function f(k: keyof typeof EMPTY_FORM, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: col.bg }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={[styles.backTxt, { color: col.fg }]}>← رجوع</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerIcon}>{folder.icon}</Text>
          <Text style={[styles.headerTitle, { color: col.fg }]}>{folder.name}</Text>
          <Text style={styles.headerCount}>{allItems.length} صنف</Text>
        </View>
        {perm.canAddProduct && (
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: col.fg }]} onPress={openAdd}>
            <Text style={styles.addBtnTxt}>+ إضافة</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 ابحث..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
      </View>

      {/* Items list */}
      <FlatList
        data={filtered}
        keyExtractor={([bc]) => bc}
        contentContainerStyle={styles.list}
        renderItem={({ item: [bc, item] }) => (
          <TouchableOpacity
            style={[styles.itemCard, item.pendingDeletion && styles.itemPending]}
            onPress={() => setItemModal({ bc, item })}
            activeOpacity={0.75}
          >
            <View style={styles.itemLeft}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.supplier ? <Text style={styles.itemSup}>📦 {item.supplier}</Text> : null}
              {item.pendingDeletion && (
                <Text style={styles.pendingTag}>⏳ طلب حذف معلق</Text>
              )}
            </View>
            <View style={styles.itemRight}>
              <View style={[styles.qtyBadge, { backgroundColor: item.qty === 0 ? Colors.dangerLight : col.bg }]}>
                <Text style={[styles.qtyTxt, { color: item.qty === 0 ? Colors.danger : col.fg }]}>
                  {item.qty}
                </Text>
              </View>
              <Text style={styles.itemSell}>{formatMAD(item.sell)}</Text>
              <Text style={styles.itemBuy}>ش: {formatMAD(item.buy)}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTxt}>لا توجد سلع</Text>
          </View>
        }
      />

      {/* Item action modal */}
      <Modal visible={!!itemModal} animationType="slide" transparent onRequestClose={() => setItemModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {itemModal && (
              <>
                <Text style={styles.sheetTitle}>{itemModal.item.name}</Text>
                <View style={styles.itemDetailRow}>
                  <DetailChip label="بيع" value={formatMAD(itemModal.item.sell)} color={Colors.success} />
                  <DetailChip label="شراء" value={formatMAD(itemModal.item.buy)} color={Colors.primary} />
                  <DetailChip label="كمية" value={String(itemModal.item.qty)} color={Colors.text} />
                </View>
                {itemModal.item.supplier ? (
                  <Text style={styles.itemSupDetail}>📦 {itemModal.item.supplier}</Text>
                ) : null}
                {itemModal.item.addedBy ? (
                  <Text style={styles.itemSupDetail}>👤 أضافه: {itemModal.item.addedBy}</Text>
                ) : null}

                <View style={styles.actionRow}>
                  {perm.canSell && (
                    <ActionBtn label="🛒 بيع" color={Colors.success} onPress={() => sellItem(itemModal.bc, itemModal.item)} />
                  )}
                  {perm.canEditProduct && !itemModal.item.pendingDeletion && (
                    <ActionBtn label="✏️ تعديل" color={Colors.primary} onPress={() => openEdit(itemModal.bc, itemModal.item)} />
                  )}
                  {(perm.canDeleteDirect || perm.canRequestDelete) && (
                    <ActionBtn label="🗑️ حذف" color={Colors.danger} onPress={() => deleteItem(itemModal.bc, itemModal.item)} />
                  )}
                </View>

                <TouchableOpacity style={styles.closeSheetBtn} onPress={() => setItemModal(null)}>
                  <Text style={styles.closeSheetTxt}>إغلاق</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ═══ SELL CONFIRMATION DIALOG ═══ */}
      <Modal visible={!!sellConfirm} animationType="fade" transparent onRequestClose={() => setSellConfirm(null)}>
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            {/* Cart icon */}
            <View style={styles.dialogIconWrap}>
              <Text style={{ fontSize: 44 }}>🛒</Text>
            </View>
            <Text style={styles.dialogTitle}>تأكيد البيع</Text>
            <Text style={styles.dialogMsg}>
              {'واش متأكد تبيع '}
              <Text style={{ fontWeight: '900', color: '#1e293b' }}>{sellConfirm?.item.name}</Text>
              {' بـ '}
              <Text style={{ fontWeight: '900', color: '#10b981' }}>{formatMAD(sellConfirm?.item.sell ?? 0)}</Text>
              {'؟'}
            </Text>
            <View style={styles.dialogBtns}>
              <TouchableOpacity style={styles.dialogCancel} onPress={() => setSellConfirm(null)}>
                <Text style={styles.dialogCancelTxt}>❌ إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogConfirm} onPress={confirmSell}>
                <Text style={styles.dialogConfirmTxt}>✅ نعم، تأكيد</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add/Edit modal */}
      <Modal visible={addModal} animationType="slide" transparent onRequestClose={() => setAddModal(false)}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheetLarge}>
            <Text style={styles.sheetTitle}>{editBarcode ? 'تعديل سلعة' : `إضافة إلى ${folder.name}`}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <FormField label="الاسم *" value={form.name} onChangeText={(v) => f('name', v)} placeholder="اسم السلعة" />
              <FormField label="سعر البيع (د) *" value={form.sell} onChangeText={(v) => f('sell', v)} keyboard="numeric" placeholder="0" />
              <FormField label="سعر الشراء (د) *" value={form.buy} onChangeText={(v) => f('buy', v)} keyboard="numeric" placeholder="0" />
              <FormField label="الكمية" value={form.qty} onChangeText={(v) => f('qty', v)} keyboard="numeric" placeholder="1" />
              <FormField label="المورد" value={form.supplier} onChangeText={(v) => f('supplier', v)} placeholder="اسم المورد" />
            </ScrollView>
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setAddModal(false)}>
                <Text style={styles.cancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: col.fg }]} onPress={saveItem}>
                <Text style={styles.confirmTxt}>💾 حفظ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

function DetailChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={chipStyles.wrap}>
      <Text style={chipStyles.label}>{label}</Text>
      <Text style={[chipStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

function ActionBtn({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[actionStyles.btn, { backgroundColor: color + '15', borderColor: color + '40' }]}
      onPress={onPress}
    >
      <Text style={[actionStyles.txt, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FormField({
  label, value, onChangeText, placeholder, keyboard,
}: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboard?: 'numeric' | 'default';
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={formStyles.label}>{label}</Text>
      <TextInput
        style={formStyles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboard ?? 'default'}
        textAlign="right"
      />
    </View>
  );
}

const chipStyles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.background, borderRadius: Radii.md, padding: 10, alignItems: 'center' },
  label: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginBottom: 2 },
  value: { fontSize: 15, fontWeight: '800' },
});

const actionStyles = StyleSheet.create({
  btn: { flex: 1, padding: 12, borderRadius: Radii.lg, alignItems: 'center', borderWidth: 1 },
  txt: { fontSize: 14, fontWeight: '800' },
});

const formStyles = StyleSheet.create({
  label: { fontSize: 13, color: Colors.textMuted, fontWeight: '700', textAlign: 'right', marginBottom: 4 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg,
    padding: 13, fontSize: 15, color: Colors.text, backgroundColor: Colors.background, fontWeight: '600',
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 16, color: Colors.textMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { padding: 4 },
  backTxt: { fontSize: 14, fontWeight: '700' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerIcon: { fontSize: 22 },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  headerCount: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  addBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radii.xl },
  addBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchInput: {
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radii.lg, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: Colors.text,
  },
  list: { padding: 16, paddingBottom: 110 },
  itemCard: {
    backgroundColor: Colors.card, borderRadius: Radii.xxl, padding: 16,
    marginBottom: 10, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', ...Shadow.card,
    borderWidth: 1, borderColor: Colors.border,
  },
  itemPending: { opacity: 0.6, borderWidth: 1.5, borderColor: Colors.danger },
  itemLeft: { flex: 1, marginLeft: 8 },
  itemName: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  itemSup: { fontSize: 11, color: Colors.textMuted, marginTop: 3, textAlign: 'right' },
  pendingTag: { fontSize: 10, color: Colors.danger, fontWeight: '700', marginTop: 3, textAlign: 'right' },
  itemRight: { alignItems: 'flex-end', gap: 4 },
  qtyBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  qtyTxt: { fontSize: 13, fontWeight: '900' },
  itemSell: { fontSize: 14, fontWeight: '800', color: Colors.success },
  itemBuy: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTxt: { fontSize: 15, color: Colors.textMuted, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  sheetLarge: {
    backgroundColor: Colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 36, maxHeight: '88%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 16 },
  itemDetailRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  itemSupDetail: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginBottom: 4 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 12 },
  closeSheetBtn: {
    marginTop: 4, padding: 12, borderRadius: Radii.lg,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  closeSheetTxt: { fontSize: 14, color: Colors.textMuted, fontWeight: '700' },
  sheetFooter: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: Radii.lg,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  confirmBtn: { flex: 2, padding: 14, borderRadius: Radii.lg, alignItems: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  /* Sell confirmation dialog */
  dialogOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  dialogCard: { backgroundColor: '#fff', borderRadius: 28, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 16 },
  dialogIconWrap: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#fce7f3', borderWidth: 3, borderColor: '#10b981', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  dialogTitle: { fontSize: 22, fontWeight: '900', color: '#1e293b', marginBottom: 12, textAlign: 'center' },
  dialogMsg: { fontSize: 15, color: '#64748b', fontWeight: '600', textAlign: 'center', lineHeight: 26, marginBottom: 24 },
  dialogBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  dialogCancel: { flex: 1, paddingVertical: 16, borderRadius: 18, backgroundColor: '#f1f5f9', alignItems: 'center' },
  dialogCancelTxt: { fontSize: 15, fontWeight: '800', color: '#ef4444' },
  dialogConfirm: { flex: 2, paddingVertical: 16, borderRadius: 18, backgroundColor: '#10b981', alignItems: 'center' },
  dialogConfirmTxt: { fontSize: 15, fontWeight: '900', color: '#fff' },
});
