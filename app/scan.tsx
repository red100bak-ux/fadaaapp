import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Vibration,
  Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { Colors, Radii, Shadow } from '../src/theme/colors';
import { formatMAD, makeSaleRecord, nowDate } from '../src/utils/helpers';
import { sendNow } from '../src/utils/notificationService';
import { logActivity } from '../src/utils/activityLogger';
import type { StockItem } from '../src/types';

type ScanMode = 'sell' | 'credit' | 'return';

export default function ScanScreen() {
  const { app, auth, updateApp } = useAppStore();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back', { physicalDevices: ['wide-angle-camera'] });
  const codeScanner = useCodeScanner({
    codeTypes: ['qr', 'ean-13', 'ean-8', 'code-128', 'code-39', 'pdf-417', 'upc-e'],
    onCodeScanned: (codes) => {
      if (scanned || codes.length === 0) return;
      const value = codes[0]?.value;
      if (value) handleBarcode({ data: value });
    },
  });
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const scanMode = (mode as ScanMode) || 'sell';

  const [scanned, setScanned] = useState(false);
  const [found, setFound] = useState<{ bc: string; item: StockItem } | null>(null);
  const [returnConfirm, setReturnConfirm] = useState<{ bc: string; item: StockItem } | null>(null);
  const [sellModal, setSellModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [creditModal, setCreditModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [form, setForm] = useState({ name: '', sell: '', buy: '', qty: '1', supplier: '' });
  const [selectedFolder, setSelectedFolder] = useState('');

  function handleBarcode({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    Vibration.vibrate(60);

    const bc = data.trim();
    const item = app.stock?.[bc];

    if (scanMode === 'return') {
      if (!item) {
        Alert.alert('⛔', 'هاد الباركود ما كاينش في الستوك', [{ text: 'عاود', onPress: () => setScanned(false) }]);
        return;
      }
      const soldCount = (app.todaySales ?? []).filter((s: any) => s.name === item.name && s.sell > 0).length;
      const returnCount = (app.todaySales ?? []).filter((s: any) => s.name === item.name && s.sell < 0).length;
      if (soldCount === 0 || returnCount >= soldCount) {
        Alert.alert('⛔ ممنوع', `${item.name}\nما تبيعتش اليوم أو رجعت كلها`, [{ text: 'عاود', onPress: () => setScanned(false) }]);
        return;
      }
      setFound({ bc, item });
      setReturnConfirm({ bc, item });
      return;
    }

    if (item) {
      setFound({ bc, item });
      if (scanMode === 'sell') {
        setSellModal(true);
      } else if (scanMode === 'credit') {
        setSelectedCustomerId('');
        setCreditModal(true);
      }
    } else if (scanMode === 'sell') {
      Alert.alert(
        '🔍 ما لقاتاش',
        `الباركود: ${bc}\nبغيت تضيفو للستوك؟`,
        [
          { text: 'إلغاء', onPress: () => setScanned(false) },
          {
            text: 'إضافة', onPress: () => {
              setManualCode(bc);
              setForm({ name: '', sell: '', buy: '', qty: '1', supplier: '' });
              setSelectedFolder(app.folders?.find(f => f.active)?.name ?? '');
              setAddModal(true);
            },
          },
        ],
      );
    } else {
      Alert.alert('', 'هاد السلعة ما كاينة في الستوك');
      setScanned(false);
    }
  }

  function sellOne() {
    if (!found) return;
    const { bc, item } = found;
    if (item.qty <= 0) { 
      Alert.alert('🛑 STOP', 'المخزون فارغ! ما يمكنكش تبيع كتر ملي في الستوك'); 
      return; 
    }
    updateApp((prev) => {
      const newQty = item.qty - 1;
      const newStock = { ...prev.stock, [bc]: { ...item, qty: newQty } };
      if (newQty <= 0) {
        sendNow('📭 نفد الستوك', `${item.name}`).catch(() => {});
      } else if (newQty <= 2) {
        sendNow('⚠️ ستوك قليل', `${item.name} — باقي ${newQty} قطع`).catch(() => {});
      }
      const record = makeSaleRecord({
        name: item.name,
        sell: item.sell,
        buy: item.buy,
        cat: item.cat,
        seller: auth?.name ?? '',
      });
      return { ...prev, stock: newStock, todaySales: [...prev.todaySales, record] };
    });
    logActivity('sell', `🛒 باع: ${item.name} — ${formatMAD(item.sell)}`, auth?.name ?? '', item.sell);
    setSellModal(false);
    setFound(null);
    setScanned(false);
    Alert.alert('✅ تم البيع', `${item.name} — ${item.sell} DH`);
  }

  function saveNewItem() {
    if (!form.name.trim() || !form.sell || !form.buy) {
      Alert.alert('', 'أدخل الاسم والأسعار');
      return;
    }
    const bc = manualCode || `BC_${Date.now()}`;
    const folder = app.folders?.find((f) => f.name === selectedFolder) ?? app.folders?.find((f) => f.active) ?? { name: 'جديد' };
    const item: StockItem = {
      name: form.name.trim(),
      cat: folder.name,
      sell: parseFloat(form.sell) || 0,
      buy: parseFloat(form.buy) || 0,
      qty: parseInt(form.qty) || 1,
      supplier: form.supplier.trim() || undefined,
      addedBy: auth?.name,
    };
    updateApp((prev) => ({
      ...prev,
      stock: { ...prev.stock, [bc]: item },
    }));
    setAddModal(false);
    setScanned(false);
    setManualCode('');
    Alert.alert('✅ تمت الإضافة', item.name);
  }

  function addCreditEntry() {
    if (!found || !selectedCustomerId) {
      Alert.alert('', 'اختار الزبون أولاً');
      return;
    }
    const item = found.item;
    const { dateTime } = nowDate();
    updateApp((prev) => {
      const c = prev.credit[selectedCustomerId];
      if (!c) return prev;
      return {
        ...prev,
        credit: {
          ...prev.credit,
          [selectedCustomerId]: {
            ...c,
            total: (c.total || 0) + item.sell,
            logs: [...c.logs, {
              t: `🛒 زاد بسكان (${item.name})`,
              v: item.sell,
              d: dateTime,
              seller: auth?.name,
            }],
          },
        },
      };
    });
    logActivity('credit_add', `💳 كريدي سكان: ${item.name} → ${app.credit[selectedCustomerId]?.name}`, auth?.name ?? '', item.sell);
    setCreditModal(false);
    setFound(null);
    setScanned(false);
    Alert.alert('✅ تم تسجيل الكريدي', `${item.name} — ${item.sell} DH`);
  }

  function confirmReturn() {
    if (!returnConfirm) return;
    const { bc, item } = returnConfirm;
    updateApp((prev) => {
      const newQty = item.qty + 1;
      const newStock = { ...prev.stock, [bc]: { ...item, qty: newQty } };
      const record = makeSaleRecord({
        name: item.name,
        sell: -(item.sell),
        buy: -(item.buy),
        cat: item.cat,
        seller: auth?.name ?? '',
      });
      return { ...prev, stock: newStock, todaySales: [...prev.todaySales, record] };
    });
    logActivity('return', `↩️ رجع: ${item.name}`, auth?.name ?? '', item.sell);
    setReturnConfirm(null);
    setFound(null);
    setScanned(false);
    Alert.alert('↩️ تم الروتور', `${item.name} رجع للستوك`);
  }

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.permWrap}>
          <Text style={styles.permIcon}>📷</Text>
          <Text style={styles.permTitle}>الكاميرا محتاجة</Text>
          <Text style={styles.permSub}>الكاميرا ضرورية لمسح الباركود</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnTxt}>السماح بالكاميرا</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Camera */}
      <View style={styles.cameraWrap}>
        {!scanned && device && (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={!scanned}
            codeScanner={codeScanner}
          />
        )}

        {/* Overlay */}
        <View style={styles.overlay}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
              <Text style={styles.closeTxt}>✕</Text>
            </TouchableOpacity>
            <View style={{ width: 36 }} />
          </View>

          {!scanned && (
            <>
              <View style={styles.frame}>
                <View style={[styles.corner, styles.tl]} />
                <View style={[styles.corner, styles.tr]} />
                <View style={[styles.corner, styles.bl]} />
                <View style={[styles.corner, styles.br]} />
                <Text style={styles.frameHint}>وجّه الكاميرا نحو الباركود</Text>
              </View>
            </>
          )}


          {scanned && !found && (
            <View style={styles.scanAgainWrap}>
              <TouchableOpacity style={styles.scanAgainBtn} onPress={() => setScanned(false)}>
                <Text style={styles.scanAgainTxt}>🔄 عاود المسح</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Found product card */}
      {found && (
        <View style={styles.foundCard}>
          <View style={styles.foundInfo}>
            <Text style={styles.foundName}>{found.item.name}</Text>
            <Text style={styles.foundCat}>📁 {found.item.cat}</Text>
            {found.item.supplier ? <Text style={styles.foundSup}>📦 {found.item.supplier}</Text> : null}
            <Text style={styles.foundCode}>🔖 {found.bc}</Text>
          </View>
          <View style={styles.foundPrices}>
            <View style={[styles.qtyBadge, { backgroundColor: found.item.qty > 2 ? Colors.successLight : Colors.dangerLight }]}>
              <Text style={[styles.qtyTxt, { color: found.item.qty > 2 ? Colors.success : Colors.danger }]}>
                {found.item.qty}
              </Text>
            </View>
            <Text style={styles.foundSell}>{found.item.sell} DH</Text>
            <Text style={styles.foundBuy}>ش: {found.item.buy} DH</Text>
          </View>
        </View>
      )}

      {/* Action buttons */}
      {found && scanMode === 'sell' && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: Colors.successLight, borderColor: Colors.success + '40' }]}
            onPress={() => setSellModal(true)}
          >
            <Text style={[styles.actionTxt, { color: Colors.success }]}>🛒 بيع</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: Colors.primaryLight, borderColor: Colors.primary + '40' }]}
            onPress={() => { setFound(null); setScanned(false); }}
          >
            <Text style={[styles.actionTxt, { color: Colors.primary }]}>🔄 عاود</Text>
          </TouchableOpacity>
        </View>
      )}
      {found && scanMode === 'credit' && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]}
            onPress={() => setCreditModal(true)}
          >
            <Text style={[styles.actionTxt, { color: '#d97706' }]}>💳 اختار الزبون</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: Colors.primaryLight, borderColor: Colors.primary + '40' }]}
            onPress={() => { setFound(null); setScanned(false); }}
          >
            <Text style={[styles.actionTxt, { color: Colors.primary }]}>🔄 عاود</Text>
          </TouchableOpacity>
        </View>
      )}
      {found && scanMode === 'return' && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#fef2f2', borderColor: Colors.danger + '40' }]}
            onPress={() => setReturnConfirm({ bc: found.bc, item: found.item })}
          >
            <Text style={[styles.actionTxt, { color: Colors.danger }]}>↩️ روتور</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: Colors.primaryLight, borderColor: Colors.primary + '40' }]}
            onPress={() => { setFound(null); setScanned(false); }}
          >
            <Text style={[styles.actionTxt, { color: Colors.primary }]}>🔄 عاود</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sell confirm dialog — centered */}
      <Modal visible={sellModal} transparent animationType="fade" onRequestClose={() => setSellModal(false)}>
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <View style={styles.dialogIconWrap}>
              <Text style={{ fontSize: 44 }}>🛒</Text>
            </View>
            <Text style={styles.dialogTitle}>تأكيد البيع</Text>
            {found && (
              <Text style={styles.dialogMsg}>
                {'واش متأكد تبيع '}
                <Text style={{ fontWeight: '900', color: '#1e293b' }}>{found.item.name}</Text>
                {' بـ '}
                <Text style={{ fontWeight: '900', color: '#10b981' }}>{formatMAD(found.item.sell)}</Text>
                {'؟'}
              </Text>
            )}
            <View style={styles.dialogBtns}>
              <TouchableOpacity style={styles.dialogCancel} onPress={() => setSellModal(false)}>
                <Text style={styles.dialogCancelTxt}>❌ إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogConfirm} onPress={sellOne}>
                <Text style={styles.dialogConfirmTxt}>✅ نعم، تأكيد</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Credit by scan modal */}
      <Modal visible={creditModal} transparent animationType="slide" onRequestClose={() => { setCreditModal(false); setScanned(false); setFound(null); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { maxHeight: '80%' }]}>
            <Text style={styles.sheetTitle}>💳 كريدي عبر السكان</Text>
            {found && (
              <View style={{ backgroundColor: '#fef3c7', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#92400e', textAlign: 'right' }}>{found.item.name}</Text>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#d97706', textAlign: 'right', marginTop: 4 }}>
                  {found.item.sell} DH
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 13, color: Colors.textMuted, fontWeight: '700', textAlign: 'right', marginBottom: 8 }}>
              اختر الزبون:
            </Text>
            <FlatList
              data={Object.entries(app.credit ?? {})}
              keyExtractor={([id]) => id}
              style={{ maxHeight: 260 }}
              renderItem={({ item: [id, cust] }) => (
                <TouchableOpacity
                  style={{
                    padding: 13, borderRadius: 12, marginBottom: 7, flexDirection: 'row',
                    alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: selectedCustomerId === id ? '#fef3c7' : Colors.background,
                    borderWidth: 1.5,
                    borderColor: selectedCustomerId === id ? '#f59e0b' : Colors.border,
                  }}
                  onPress={() => setSelectedCustomerId(id)}
                >
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    {selectedCustomerId === id && <Text style={{ fontSize: 16 }}>✓</Text>}
                    <Text style={{ fontSize: 12, color: Colors.textMuted }}>{cust.total > 0 ? `${cust.total} DH` : '✅'}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}>{cust.name}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ textAlign: 'center', color: Colors.textMuted, paddingVertical: 20 }}>لا يوجد زبائن</Text>
              }
            />
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setCreditModal(false); setFound(null); setScanned(false); }}>
                <Text style={styles.cancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#d97706' }]} onPress={addCreditEntry}>
                <Text style={styles.confirmTxt}>✓ تسجيل الكريدي</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Return confirm dialog — centered red */}
      <Modal visible={!!returnConfirm} transparent animationType="fade" onRequestClose={() => { setReturnConfirm(null); setScanned(false); }}>
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <View style={[styles.dialogIconWrap, { backgroundColor: '#fef2f2', borderColor: Colors.danger }]}>
              <Text style={{ fontSize: 44 }}>↩️</Text>
            </View>
            <Text style={styles.dialogTitle}>تأكيد الروتور</Text>
            {returnConfirm && (
              <Text style={styles.dialogMsg}>
                {'واش متأكد ترجع '}
                <Text style={{ fontWeight: '900', color: '#1e293b' }}>{returnConfirm.item.name}</Text>
                {' بـ '}
                <Text style={{ fontWeight: '900', color: Colors.danger }}>{formatMAD(returnConfirm.item.sell)}</Text>
                {'؟'}
              </Text>
            )}
            <View style={styles.dialogBtns}>
              <TouchableOpacity style={styles.dialogCancel} onPress={() => { setReturnConfirm(null); setFound(null); setScanned(false); }}>
                <Text style={styles.dialogCancelTxt}>❌ إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogConfirm, { backgroundColor: Colors.danger }]} onPress={confirmReturn}>
                <Text style={styles.dialogConfirmTxt}>↩️ نعم، روتور</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add new item modal */}
      <Modal visible={addModal} transparent animationType="slide" onRequestClose={() => { setAddModal(false); setScanned(false); }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { maxHeight: '85%' }]}>
            <Text style={styles.sheetTitle}>➕ إضافة سلعة جديدة</Text>
            <Text style={styles.codeLabel}>🔖 الباركود: {manualCode}</Text>
            <Text style={[ffStyles.label, { marginBottom: 8 }]}>المجلد / الفئة *</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
              contentContainerStyle={{ paddingHorizontal: 2, gap: 8 }}
            >
              {(app.folders ?? []).filter(f => f.active).map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={{
                    paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20,
                    backgroundColor: selectedFolder === f.name ? Colors.primary : Colors.background,
                    borderWidth: 1.5,
                    borderColor: selectedFolder === f.name ? Colors.primary : Colors.border,
                  }}
                  onPress={() => setSelectedFolder(f.name)}
                >
                  <Text style={{ fontSize: 13, color: selectedFolder === f.name ? '#fff' : Colors.text, fontWeight: '700' }}>
                    {f.icon} {f.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView showsVerticalScrollIndicator={false}>
              <FormField label="الاسم *" value={form.name} onChange={(v) => setForm(p => ({ ...p, name: v }))} placeholder="اسم السلعة" />
              <FormField label="سعر البيع (DH) *" value={form.sell} onChange={(v) => setForm(p => ({ ...p, sell: v }))} kb="numeric" placeholder="0" />
              <FormField label="سعر الشراء (DH) *" value={form.buy} onChange={(v) => setForm(p => ({ ...p, buy: v }))} kb="numeric" placeholder="0" />
              <FormField label="الكمية" value={form.qty} onChange={(v) => setForm(p => ({ ...p, qty: v }))} kb="numeric" placeholder="1" />
              <FormField label="المورد" value={form.supplier} onChange={(v) => setForm(p => ({ ...p, supplier: v }))} placeholder="اختياري" />
            </ScrollView>
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setAddModal(false); setScanned(false); }}>
                <Text style={styles.cancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={saveNewItem}>
                <Text style={styles.confirmTxt}>💾 حفظ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

function FormField({ label, value, onChange, placeholder, kb }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; kb?: 'numeric';
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={ffStyles.label}>{label}</Text>
      <TextInput
        style={ffStyles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={kb ?? 'default'}
        textAlign="right"
      />
    </View>
  );
}

const ffStyles = StyleSheet.create({
  label: { fontSize: 13, color: Colors.textMuted, fontWeight: '700', textAlign: 'right', marginBottom: 4 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg,
    padding: 13, fontSize: 15, color: Colors.text, backgroundColor: Colors.background, fontWeight: '600',
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background, padding: 32, gap: 12 },
  permIcon: { fontSize: 60, marginBottom: 8 },
  permTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  permSub: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', fontWeight: '600' },
  permBtn: { backgroundColor: Colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: Radii.xl, marginTop: 8 },
  permBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

  cameraWrap: { flex: 1, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
  topBar: {
    width: '100%', paddingTop: 16, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.55)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  scanTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  frame: {
    width: 260, height: 260, marginTop: 100,
    alignItems: 'center', justifyContent: 'center',
  },
  frameHint: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', marginTop: 8 },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: '#fff', borderWidth: 3 },
  tl: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
  tr: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
  bl: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
  br: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
  modeToggle: {
    backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 15, paddingVertical: 9, borderRadius: 16,
  },
  camSelector: {
    position: 'absolute',
    bottom: 24,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  camBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
  },
  camBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  camBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  camBtnTxtActive: { color: '#000' },

  scanAgainWrap: { marginTop: 40 },
  scanAgainBtn: { backgroundColor: Colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: Radii.xl },
  scanAgainTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

  foundCard: {
    backgroundColor: Colors.card, margin: 12, borderRadius: Radii.xl, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12, ...Shadow.card,
    borderWidth: 2, borderColor: Colors.primary + '30',
  },
  foundInfo: { flex: 1, alignItems: 'flex-end' },
  foundName: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  foundCat: { fontSize: 12, color: Colors.textMuted, marginTop: 3, textAlign: 'right' },
  foundSup: { fontSize: 12, color: '#0369a1', marginTop: 2, textAlign: 'right' },
  foundCode: { fontSize: 11, color: Colors.textMuted, marginTop: 3, textAlign: 'right' },
  foundPrices: { alignItems: 'center', gap: 6 },
  qtyBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  qtyTxt: { fontSize: 18, fontWeight: '900' },
  foundSell: { fontSize: 15, fontWeight: '900', color: Colors.text },
  foundBuy: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingBottom: 12 },
  actionBtn: { flex: 1, padding: 16, borderRadius: Radii.xl, alignItems: 'center', borderWidth: 1.5 },
  actionTxt: { fontSize: 16, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 16 },
  codeLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: '700', textAlign: 'right', marginBottom: 16, backgroundColor: Colors.background, padding: 10, borderRadius: 10 },
  sheetFooter: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: Radii.lg,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  confirmBtn: { flex: 2, padding: 14, borderRadius: Radii.lg, backgroundColor: Colors.primary, alignItems: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  /* Centered sell/return dialog */
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

  returnIconWrap: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#fef2f2', borderWidth: 2, borderColor: Colors.danger + '60',
    alignItems: 'center', justifyContent: 'center',
  },
});
