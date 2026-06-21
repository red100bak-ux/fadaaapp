import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Keyboard, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { nowDate, formatMAD, makeSaleRecord, normalizeMonthKey } from '../src/utils/helpers';
import AppHeader from '../src/components/AppHeader';
import AppAlert, { AppAlertButton } from '../src/components/AppAlert';

const ORANGE = '#ea580c';
const ORANGE_BORDER = '#fdba74';

export default function RepairScreen() {
  const { app, auth, updateApp, ensureMonthsLoaded } = useAppStore();
  const [archiveOpen, setArchiveOpen] = useState(false);

  // ── Customer (on main screen) ──
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // ── Repair form modal ──
  const [addModal, setAddModal] = useState(false);
  const [model, setModel] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [partsOpen, setPartsOpen] = useState(false);
  const [customParts, setCustomParts] = useState<{ id: string; name: string }[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // ── تفاصيل إصلاح ──
  const [detailItem, setDetailItem] = useState<typeof todayRepairs[0] | null>(null);
  const [editSell, setEditSell] = useState('');
  const [editBuy, setEditBuy]   = useState('');
  const [editingDetail, setEditingDetail] = useState(false);

  // ── تسليم ──
  const [deliverModal, setDeliverModal] = useState(false);
  const [deliverTo, setDeliverTo] = useState('');
  const [appAlert, setAppAlert] = useState<{ icon?: string; title: string; message?: string; buttons: AppAlertButton[] } | null>(null);

  function extractModel(label: string): string {
    let s = label.replace(/^🛠️\s*/, '');
    const di = s.indexOf(' — ');
    const pi = s.indexOf(' (');
    let end = s.length;
    if (di > -1) end = Math.min(end, di);
    if (pi > -1) end = Math.min(end, pi);
    return s.substring(0, end).trim() || s;
  }

  const partsList = app.partsList ?? [];
  const repairFolder = (app.folders ?? []).find(
    (f) => f.special === 'repair' || f.name === 'إصلاح مانيال'
  );
  const repairCat = repairFolder?.name ?? 'إصلاح مانيال';

  const now = new Date();
  const curMk = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { date: todayDate } = nowDate();

  const allRepairs = useMemo(
    () => (app.todaySales ?? []).filter((s) => s.cat === repairCat).reverse(),
    [app.todaySales, repairCat]
  );

  const currentRepairs = useMemo(
    () => allRepairs.filter((s) => normalizeMonthKey(s.monthKey ?? curMk) === curMk),
    [allRepairs, curMk]
  );

  const archiveRepairs = useMemo(
    () => allRepairs.filter((s) => s.monthKey && normalizeMonthKey(s.monthKey) !== curMk),
    [allRepairs, curMk]
  );

  // كل إصلاحات الشهر الحالي (مشي فقط اليوم)
  const todayRepairs = currentRepairs;

  // تحميل الشهور القديمة باش يبان الأرشيف
  useEffect(() => {
    const salesMonths = (app as any)._core?.salesMonths as string[] | undefined;
    if (salesMonths?.length) {
      const oldMonths = salesMonths.filter((mk: string) => mk !== curMk);
      if (oldMonths.length) ensureMonthsLoaded(oldMonths);
    }
  }, []);

  function togglePart(id: string) {
    setSelectedParts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function deleteRepair(nid: string) {
    setAppAlert({ icon: '🗑️', title: 'حذف الإصلاح', message: 'واش متأكد تحذف هاد الإصلاح؟', buttons: [
      { label: 'إلغاء', onPress: () => setAppAlert(null) },
      { label: '🗑️ حذف', danger: true, onPress: () => {
        setAppAlert(null);
        updateApp(prev => ({ ...prev, todaySales: prev.todaySales.filter(s => s.nid !== nid) }));
        setDetailItem(null);
      }},
    ]});
  }

  function startEditDetail(item: typeof todayRepairs[0]) {
    setEditSell(String(item.sell));
    setEditBuy(String(item.buy));
    setEditingDetail(true);
  }

  function saveEditDetail() {
    if (!detailItem) return;
    updateApp(prev => ({
      ...prev,
      todaySales: prev.todaySales.map(s =>
        s.nid === detailItem.nid
          ? { ...s, sell: parseFloat(editSell) || s.sell, buy: parseFloat(editBuy) || s.buy }
          : s
      ),
    }));
    setDetailItem(prev => prev ? { ...prev, sell: parseFloat(editSell) || prev.sell, buy: parseFloat(editBuy) || prev.buy } : prev);
    setEditingDetail(false);
  }

  async function confirmDeliver() {
    if (!detailItem) return;
    const { date, dateTime } = nowDate();
    const repairMk = detailItem.monthKey;
    if (repairMk && repairMk !== curMk) {
      await ensureMonthsLoaded([repairMk]);
    }
    const to = deliverTo.trim() || 'الزبون';
    updateApp(prev => ({
      ...prev,
      todaySales: prev.todaySales.map(s =>
        s.nid === detailItem.nid
          ? { ...s, deliveredAt: dateTime, deliveredTo: to, deliveredBy: auth?.name ?? '' }
          : s
      ),
    }));
    setDetailItem(prev => prev ? { ...prev, deliveredAt: dateTime, deliveredTo: to, deliveredBy: auth?.name ?? '' } : prev);
    setDeliverModal(false);
    setDeliverTo('');
  }

  function openModal() {
    setModel('');
    setBuyPrice('');
    setSellPrice('');
    setSelectedParts([]);
    setCustomParts([]);
    setPartsOpen(false);
    setShowCustomInput(false);
    setCustomInput('');
    setAddModal(true);
  }

  function closeModal() {
    Keyboard.dismiss();
    setAddModal(false);
  }

  function addCustomPart() {
    const name = customInput.trim();
    if (!name) return;
    const id = `custom_${Date.now()}`;
    setCustomParts(prev => [...prev, { id, name }]);
    setSelectedParts(prev => [...prev, id]);
    setCustomInput('');
    setShowCustomInput(false);
  }

  function saveRepair() {
    if (!model.trim()) { setAppAlert({ icon: '📱', title: 'ناقص', message: 'أدخل موديل الهاتف', buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] }); return; }
    if (!sellPrice) { setAppAlert({ icon: '💰', title: 'ناقص', message: 'أدخل سعر الإصلاح للزبون', buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] }); return; }
    const allParts = [...partsList, ...customParts];
    const partsLabel = selectedParts
      .map((id) => allParts.find((p) => p.id === id)?.name ?? id)
      .join(', ');
    const label = `🛠️ ${model.trim()}${partsLabel ? ` — ${partsLabel}` : ''}${customerName ? ` (${customerName}${customerPhone ? ` — 📞${customerPhone}` : ''})` : ''}`;
    const record = makeSaleRecord({
      name: label,
      sell: parseFloat(sellPrice) || 0,
      buy: parseFloat(buyPrice) || 0,
      cat: repairCat,
      seller: auth?.name ?? '',
    });
    updateApp((prev) => ({ ...prev, todaySales: [...prev.todaySales, record] }));
    closeModal();
    setAppAlert({ icon: '✅', title: 'تم تسجيل الإصلاح', buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] });
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <AppHeader title="إصلاح الهواتف 🔧" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* اسم الزبون + رقم هاتفه */}
        <TextInput
          style={s.customerInput}
          placeholder="اسم الزبون (اختياري)"
          value={customerName}
          onChangeText={setCustomerName}
          placeholderTextColor="#fca5a5"
        />
        <TextInput
          style={[s.customerInput, { backgroundColor: '#fff0fb', borderColor: '#f9a8d4', marginTop: -6 }]}
          placeholder="📞 رقم الهاتف (اختياري)"
          value={customerPhone}
          onChangeText={setCustomerPhone}
          placeholderTextColor="#f9a8d4"
          keyboardType="phone-pad"
        />

        {/* زر إضافة إصلاح */}
        <TouchableOpacity style={s.addRepairBtn} onPress={openModal}>
          <Text style={s.addRepairTxt}>➕ إضافة هاتف للإصلاح</Text>
        </TouchableOpacity>

        {/* الأرشيف — إصلاحات الشهور السابقة */}
        {archiveRepairs.length > 0 && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff7ed', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, borderWidth: 1.5, borderColor: '#f97316' }}
            onPress={() => setArchiveOpen(v => !v)}
          >
            <View style={{ backgroundColor: '#f97316', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>{archiveRepairs.length}</Text>
            </View>
            <Text style={{ fontWeight: '900', fontSize: 14, color: '#f97316' }}>📦 الأرشيف {archiveOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
        )}
        {archiveOpen && archiveRepairs.map((item, i) => (
          <TouchableOpacity
            key={item.nid ?? i}
            style={{ backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#e2e8f0' }}
            onPress={() => { setEditingDetail(false); setDetailItem(item); }}
          >
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e293b' }} numberOfLines={1}>{extractModel(item.name)}</Text>
            <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.dateString}</Text>
            {item.deliveredAt && (
              <Text style={{ fontSize: 10, color: '#16a34a', fontWeight: '800', marginTop: 2 }}>✅ تسلّم: {item.deliveredTo}</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* سجل اليوم */}
        <View style={s.logCard}>
          <Text style={s.logTitle}>📋 سجل إصلاحات الشهر:</Text>
          <View style={s.logDivider} />
          {todayRepairs.length === 0 ? (
            <Text style={s.emptyTxt}>ما مسجلة حتى عملية اليوم.</Text>
          ) : (
            todayRepairs.map((item, i) => (
              <View
                key={item.nid ?? i}
                style={[s.repairItem, i === todayRepairs.length - 1 && { borderBottomWidth: 0 }]}
              >
                {/* اسم الإصلاح + التاريخ — اضغط للتفاصيل */}
                <TouchableOpacity style={{ flex: 1 }} onPress={() => { setEditingDetail(false); setDetailItem(item); }} activeOpacity={0.7}>
                  <Text style={s.repairName} numberOfLines={1}>{extractModel(item.name)}</Text>
                  <Text style={s.repairTime}>{item.dateString} — {item.time}</Text>
                  {item.deliveredAt ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <Text style={{ fontSize: 10, color: '#16a34a', fontWeight: '800' }}>✅ تسلّم: {item.deliveredTo}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>

                {/* ✏️ فوق / 🗑️ تحت — على اليسار */}
                <View style={s.itemActions}>
                  <TouchableOpacity style={s.actionEdit} onPress={() => { setDetailItem(item); startEditDetail(item); }}>
                    <Text style={{ fontSize: 15 }}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionDelete} onPress={() => deleteRepair(item.nid)}>
                    <Text style={{ fontSize: 15 }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ═══ MODAL التفاصيل ═══ */}
      <Modal visible={!!detailItem} animationType="slide" transparent onRequestClose={() => setDetailItem(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {detailItem && (() => {
              const profit = detailItem.sell - detailItem.buy;
              const sellerColor = Object.values(app.users ?? {}).find(u => u.name === detailItem.seller)?.color ?? '#64748b';
              return (
                <>
                  <Text style={[s.modalTitle, { marginBottom: 4 }]}>🛠️ تفاصيل الإصلاح</Text>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    {/* الاسم الكامل */}
                    <View style={s.detailCard}>
                      <Text style={s.detailLabel}>الوصف</Text>
                      <Text style={s.detailValue}>{detailItem.name}</Text>
                    </View>

                    {/* التاريخ والوقت */}
                    <View style={s.detailCard}>
                      <Text style={s.detailLabel}>📅 التاريخ والوقت</Text>
                      <Text style={s.detailValue}>{detailItem.dateString} — {detailItem.time}</Text>
                    </View>

                    {/* المسؤول */}
                    <View style={[s.detailCard, { alignItems: 'flex-start' }]}>
                      <Text style={s.detailLabel}>المسؤول</Text>
                      <View style={[s.sellerBadge, { backgroundColor: sellerColor + '22', borderColor: sellerColor }]}>
                        <Text style={[s.sellerBadgeTxt, { color: sellerColor, fontSize: 14 }]}>👤 {detailItem.seller}</Text>
                      </View>
                    </View>

                    {/* الأسعار */}
                    <View style={s.priceRow}>
                      <View style={[s.detailCard, { flex: 1 }]}>
                        <Text style={s.detailLabel}>التكلفة</Text>
                        <Text style={[s.detailValue, { color: '#ef4444' }]}>{formatMAD(detailItem.buy)}</Text>
                      </View>
                      <View style={[s.detailCard, { flex: 1 }]}>
                        <Text style={s.detailLabel}>للزبون</Text>
                        <Text style={[s.detailValue, { color: '#1d4ed8' }]}>{formatMAD(detailItem.sell)}</Text>
                      </View>
                      <View style={[s.detailCard, { flex: 1 }]}>
                        <Text style={s.detailLabel}>الربح</Text>
                        <Text style={[s.detailValue, { color: profit >= 0 ? '#10b981' : '#ef4444' }]}>
                          {profit >= 0 ? '+' : ''}{formatMAD(profit)}
                        </Text>
                      </View>
                    </View>

                    {/* التسليم */}
                    {detailItem.deliveredAt ? (
                      <View style={[s.detailCard, { borderColor: '#86efac', borderWidth: 2, backgroundColor: '#f0fdf4' }]}>
                        <Text style={[s.detailLabel, { color: '#16a34a' }]}>📦 تم التسليم</Text>
                        <Text style={[s.detailValue, { color: '#15803d' }]}>لـ: {detailItem.deliveredTo}</Text>
                        <Text style={[s.detailLabel, { marginTop: 4 }]}>بواسطة: {detailItem.deliveredBy} — {detailItem.deliveredAt}</Text>
                      </View>
                    ) : (
                      <View style={[s.detailCard, { borderColor: '#fde68a', borderWidth: 2, backgroundColor: '#fffbeb' }]}>
                        <Text style={[s.detailLabel, { color: '#d97706' }]}>⏳ في انتظار التسليم</Text>
                      </View>
                    )}

                    <View style={{ height: 12 }} />
                  </ScrollView>

                  <View style={s.modalBtns}>
                    {!detailItem.deliveredAt && (
                      <TouchableOpacity
                        style={[s.saveBtn, { flex: 1, backgroundColor: '#16a34a' }]}
                        onPress={() => { setDeliverTo(detailItem.name.match(/\(([^)]+)/)?.[1]?.split('—')[0]?.trim() ?? ''); setDeliverModal(true); }}
                      >
                        <Text style={s.saveTxt}>📦 تسليم</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[s.saveBtn, { flex: 1 }]} onPress={() => { setDetailItem(null); setEditingDetail(false); }}>
                      <Text style={s.saveTxt}>← رجوع</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ═══ MODAL التسليم ═══ */}
      <Modal visible={deliverModal} transparent animationType="fade" onRequestClose={() => setDeliverModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 24 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '100%', gap: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#15803d' }}>📦 تسليم الهاتف</Text>
            <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '600' }}>اكتب اسم اللي تسلّم الهاتف</Text>
            <TextInput
              style={{ backgroundColor: '#f0fdf4', borderRadius: 14, padding: 14, fontSize: 15, color: '#1e293b', fontWeight: '700', borderWidth: 1.5, borderColor: '#86efac', textAlign: 'right' }}
              placeholder="اسم المستلم"
              placeholderTextColor="#94a3b8"
              value={deliverTo}
              onChangeText={setDeliverTo}
              autoFocus
              onSubmitEditing={confirmDeliver}
              returnKeyType="done"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={{ flex: 1, backgroundColor: '#f1f5f9', borderRadius: 14, padding: 14, alignItems: 'center' }} onPress={() => setDeliverModal(false)}>
                <Text style={{ color: '#64748b', fontWeight: '800' }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 2, backgroundColor: '#16a34a', borderRadius: 14, padding: 14, alignItems: 'center' }} onPress={confirmDeliver}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>✅ تأكيد التسليم</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ MODAL إضافة إصلاح ═══ */}
      <Modal visible={addModal} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>⚙️ معلومات الهاتف والقطع</Text>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

              {/* Parts dropdown header */}
              <TouchableOpacity style={s.partsHeader} onPress={() => setPartsOpen(v => !v)} activeOpacity={0.8}>
                <Text style={s.dropArrow}>{partsOpen ? '▲' : '▼'}</Text>
                {selectedParts.length === 0 ? (
                  <Text style={s.partsHeaderTxt}>اختر قطع الغيار / الخدمات</Text>
                ) : (
                  <View style={s.chipsWrap}>
                    {selectedParts.map(id => {
                      const allP = [...partsList, ...customParts];
                      const name = allP.find(p => p.id === id)?.name ?? id;
                      return (
                        <View key={id} style={s.chip}>
                          <Text style={s.chipTxt}>{name}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </TouchableOpacity>

              {/* Expanded dropdown body */}
              {partsOpen && (
                <View style={s.dropBody}>
                  {[...partsList, ...customParts].length === 0 ? (
                    <Text style={s.emptyParts}>ما كاين حتى قطعة — أضف من الإدارة أو استخدم "+"</Text>
                  ) : (
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator style={{ maxHeight: 180 }}>
                      {[...partsList, ...customParts].map((p, i, arr) => {
                        const on = selectedParts.includes(p.id);
                        return (
                          <TouchableOpacity
                            key={p.id}
                            style={[s.partRow, i < arr.length - 1 && s.partRowBorder]}
                            onPress={() => togglePart(p.id)}
                            activeOpacity={0.7}
                          >
                            <View style={[s.checkbox, on && s.checkboxOn]}>
                              {on && <Text style={s.checkmark}>✓</Text>}
                            </View>
                            <Text style={[s.partName, on && { color: ORANGE, fontWeight: '900' }]}>
                              {p.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}

                  {showCustomInput ? (
                    <View style={s.customRow}>
                      <TextInput
                        style={s.customInputField}
                        placeholder="اسم الخدمة..."
                        placeholderTextColor="#94a3b8"
                        value={customInput}
                        onChangeText={setCustomInput}
                        autoFocus
                        onSubmitEditing={addCustomPart}
                        textAlign="right"
                        returnKeyType="done"
                      />
                      <TouchableOpacity style={s.customConfirm} onPress={addCustomPart}>
                        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.customCancel} onPress={() => { Keyboard.dismiss(); setShowCustomInput(false); setCustomInput(''); }}>
                        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={s.addCustomBtn} onPress={() => setShowCustomInput(true)}>
                      <Text style={s.addCustomTxt}>＋ خدمة مخصصة</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* موديل الهاتف */}
              <TextInput
                style={s.modelInput}
                placeholder="موديل الهاتف (مثلا: Samsung A51)"
                value={model}
                onChangeText={setModel}
                placeholderTextColor="#94a3b8"
              />

              {/* الأسعار */}
              <View style={s.priceRow}>
                <View style={s.priceBox}>
                  <Text style={s.priceLabel}>التكلفة</Text>
                  <TextInput
                    style={s.priceInput}
                    placeholder="0 د"
                    value={buyPrice}
                    onChangeText={setBuyPrice}
                    keyboardType="numeric"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={s.priceBox}>
                  <Text style={s.priceLabel}>الثمن للزبون</Text>
                  <TextInput
                    style={s.priceInput}
                    placeholder="0 د"
                    value={sellPrice}
                    onChangeText={setSellPrice}
                    keyboardType="numeric"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              <View style={{ height: 16 }} />
            </ScrollView>

            {/* أزرار الـ Modal — خارج ScrollView مباشرة */}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.saveBtn} onPress={saveRepair}>
                <Text style={s.saveTxt}>🔧 تسجيل</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={closeModal}>
                <Text style={s.cancelTxt}>✖️ إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: 16, paddingBottom: 40 },

  customerInput: {
    backgroundColor: '#fff1f2',
    borderRadius: 50,
    paddingHorizontal: 22,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '600',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#fecdd3',
    textAlign: 'right',
  },

  addRepairBtn: {
    backgroundColor: ORANGE,
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  addRepairTxt: { color: '#fff', fontWeight: '900', fontSize: 17 },

  logCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  logTitle: { fontSize: 17, fontWeight: '900', color: '#1e293b' },
  logDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 12 },
  emptyTxt: { fontSize: 14, color: '#94a3b8', paddingVertical: 16, fontWeight: '600' },
  repairItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  repairName: { fontSize: 14, fontWeight: '800', color: '#1e293b', lineHeight: 20 },
  repairTime: { fontSize: 11, color: '#94a3b8', fontWeight: '600', marginTop: 1 },

  itemActions: { flexDirection: 'column', gap: 3 },
  actionEdit: {
    backgroundColor: '#eff6ff', borderRadius: 7,
    padding: 5, alignItems: 'center', justifyContent: 'center',
  },
  actionDelete: {
    backgroundColor: '#fef2f2', borderRadius: 7,
    padding: 5, alignItems: 'center', justifyContent: 'center',
  },

  detailCard: {
    backgroundColor: '#f8fafc', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0',
    alignItems: 'flex-start',
  },
  detailLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '700', marginBottom: 4 },
  detailValue: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  sellerBadge: {
    borderRadius: 20, borderWidth: 1.5,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  sellerBadgeTxt: { fontSize: 12, fontWeight: '900' },
  repairArrow: { fontSize: 16, color: '#cbd5e1', fontWeight: '900' },
  repairSell: { fontSize: 15, fontWeight: '900', color: '#1e293b' },
  repairProfit: { fontSize: 13, fontWeight: '800' },

  // ── Modal ──
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 18,
    maxHeight: '90%',
  },
  modalTitle: { fontSize: 17, fontWeight: '900', color: ORANGE, marginBottom: 16 },
  modalBtns: {
    flexDirection: 'row', gap: 10,
    paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },

  // ── Dropdown ──
  partsHeader: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
  },
  partsHeaderTxt: { fontSize: 15, fontWeight: '700', color: '#94a3b8', flex: 1 },
  dropArrow: { fontSize: 12, color: '#94a3b8', marginLeft: 6 },
  chipsWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'flex-end' },
  chip: { backgroundColor: ORANGE + '22', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: ORANGE_BORDER },
  chipTxt: { fontSize: 12, fontWeight: '800', color: ORANGE },

  dropBody: {
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    backgroundColor: '#fafafa',
    overflow: 'hidden',
  },
  partRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    justifyContent: 'space-between',
  },
  partRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  partName: { fontSize: 15, fontWeight: '700', color: '#1e293b', flex: 1, marginRight: 8 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2,
    borderColor: '#cbd5e1', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: ORANGE, borderColor: ORANGE },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '900' },
  emptyParts: { fontSize: 13, color: '#94a3b8', paddingHorizontal: 14, paddingVertical: 12, fontWeight: '600' },

  addCustomBtn: { padding: 13, alignItems: 'flex-start', paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff' },
  addCustomTxt: { fontSize: 14, fontWeight: '900', color: ORANGE },
  customRow: {
    flexDirection: 'row', alignItems: 'center', padding: 8, gap: 6,
    borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff',
  },
  customInputField: {
    flex: 1, backgroundColor: '#f8fafc', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1e293b',
    fontWeight: '700', borderWidth: 1.5, borderColor: '#e2e8f0', textAlign: 'right',
  },
  customConfirm: { backgroundColor: '#16a34a', borderRadius: 10, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  customCancel:  { backgroundColor: '#ef4444', borderRadius: 10, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },

  // ── Form inputs ──
  modelInput: {
    backgroundColor: '#f8fafc', borderRadius: 14, padding: 16,
    fontSize: 15, color: '#1e293b', fontWeight: '600',
    marginBottom: 14, borderWidth: 1.5, borderColor: '#e2e8f0', textAlign: 'right',
  },
  priceRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  priceBox: { flex: 1, alignItems: 'flex-end' },
  priceLabel: { fontSize: 13, color: '#64748b', fontWeight: '700', marginBottom: 6 },
  priceInput: {
    width: '100%', backgroundColor: '#f8fafc', borderRadius: 14, padding: 14,
    fontSize: 16, color: '#1e293b', fontWeight: '700',
    borderWidth: 1.5, borderColor: '#e2e8f0', textAlign: 'right',
  },

  // ── أزرار ──
  cancelBtn: {
    flex: 1, backgroundColor: '#ef4444',
    paddingVertical: 16, borderRadius: 16, alignItems: 'center',
  },
  cancelTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  saveBtn: {
    flex: 2, backgroundColor: ORANGE,
    paddingVertical: 16, borderRadius: 16, alignItems: 'center',
  },
  saveTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
