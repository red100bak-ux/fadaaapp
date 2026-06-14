import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { nowDate, formatMAD, makeSaleRecord } from '../src/utils/helpers';

const ORANGE = '#ea580c';
const ORANGE_BORDER = '#fdba74';

export default function RepairScreen() {
  const { app, auth, updateApp } = useAppStore();
  const [model, setModel] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [selectedParts, setSelectedParts] = useState<string[]>([]);

  const partsList = app.partsList ?? [];
  const repairFolder = (app.folders ?? []).find(
    (f) => f.special === 'repair' || f.name === 'إصلاح مانيال'
  );
  const repairCat = repairFolder?.name ?? 'إصلاح مانيال';

  const allRepairs = useMemo(
    () => (app.todaySales ?? []).filter((s) => s.cat === repairCat).reverse(),
    [app.todaySales, repairCat]
  );

  const { date: todayDate } = nowDate();
  const todayRepairs = allRepairs.filter((s) => s.dateString === todayDate);

  function togglePart(id: string) {
    setSelectedParts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function resetForm() {
    setModel('');
    setCustomerName('');
    setBuyPrice('');
    setSellPrice('');
    setSelectedParts([]);
  }

  function saveRepair() {
    if (!model.trim()) { Alert.alert('', 'أدخل موديل الهاتف'); return; }
    if (!sellPrice) { Alert.alert('', 'أدخل سعر الإصلاح للزبون'); return; }
    const partsLabel = selectedParts
      .map((id) => partsList.find((p) => p.id === id)?.name ?? id)
      .join(', ');
    const label = `🛠️ ${model.trim()}${partsLabel ? ` — ${partsLabel}` : ''}${customerName ? ` (${customerName})` : ''}`;
    const record = makeSaleRecord({
      name: label,
      sell: parseFloat(sellPrice) || 0,
      buy: parseFloat(buyPrice) || 0,
      cat: repairCat,
      seller: auth?.name ?? '',
    });
    updateApp((prev) => ({ ...prev, todaySales: [...prev.todaySales, record] }));
    resetForm();
    Alert.alert('✅', 'تم تسجيل الإصلاح');
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>قسم إصلاح الهواتف 🔧<Text style={{ color: '#10b981' }}>●</Text></Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backTxt}>رجوع للمحل ←</Text>
        </TouchableOpacity>

        {/* Customer name — pink pill */}
        <TextInput
          style={s.customerInput}
          placeholder="اسم الزبون (اختياري)"
          value={customerName}
          onChangeText={setCustomerName}
          textAlign="right"
          placeholderTextColor="#fca5a5"
        />

        {/* Main form card — orange border */}
        <View style={s.formCard}>
          <Text style={s.formTitle}>⚙️ معلومات الهاتف والقطع:</Text>

          {/* Parts header box */}
          <View style={s.partsHeader}>
            <Text style={s.partsHeaderTxt}>اختر قطع الغيار / الخدمات</Text>
          </View>

          {/* Inline parts list */}
          {partsList.length === 0 ? (
            <Text style={s.emptyParts}>ما كاين حتى قطعة — أضف من الإدارة</Text>
          ) : (
            <ScrollView
              style={s.partsScrollArea}
              nestedScrollEnabled
              showsVerticalScrollIndicator={true}
            >
              {partsList.map((p, i) => {
                const on = selectedParts.includes(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.partRow, i < partsList.length - 1 && s.partRowBorder]}
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

          {/* Phone model */}
          <TextInput
            style={s.modelInput}
            placeholder="موديل الهاتف (مثلا: Samsung A51)"
            value={model}
            onChangeText={setModel}
            textAlign="right"
            placeholderTextColor="#94a3b8"
          />

          {/* Price row */}
          <View style={s.priceRow}>
            <View style={s.priceBox}>
              <Text style={s.priceLabel}>التكلفة</Text>
              <TextInput
                style={s.priceInput}
                placeholder="DH 0"
                value={buyPrice}
                onChangeText={setBuyPrice}
                keyboardType="numeric"
                textAlign="center"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={s.priceBox}>
              <Text style={s.priceLabel}>الثمن للزبون</Text>
              <TextInput
                style={s.priceInput}
                placeholder="DH 0"
                value={sellPrice}
                onChangeText={setSellPrice}
                keyboardType="numeric"
                textAlign="center"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          {/* Action buttons */}
          <View style={s.btnRow}>
            <TouchableOpacity style={s.cancelBtn} onPress={resetForm}>
              <Text style={s.cancelTxt}>✖️ إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.saveBtn} onPress={saveRepair}>
              <Text style={s.saveTxt}>🔧 تسجيل الحصيلة</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Today's log */}
        <View style={s.logCard}>
          <Text style={s.logTitle}>📋 سجل الإصلاحات اليوم:</Text>
          <View style={s.logDivider} />
          {todayRepairs.length === 0 ? (
            <Text style={s.emptyTxt}>ما مسجلة حتى عملية اليوم.</Text>
          ) : (
            todayRepairs.map((item, i) => {
              const profit = item.sell - item.buy;
              return (
                <View
                  key={item.nid ?? i}
                  style={[s.repairItem, i === todayRepairs.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.repairName}>{item.name}</Text>
                    <Text style={s.repairMeta}>{item.time} · {item.seller}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.repairSell}>{formatMAD(item.sell)}</Text>
                    <Text style={[s.repairProfit, { color: profit >= 0 ? '#10b981' : '#ef4444' }]}>
                      {profit >= 0 ? '+' : ''}{formatMAD(profit)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },

  header: {
    backgroundColor: '#fff',
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 4,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#1e293b' },

  scroll: { padding: 16, paddingBottom: 40 },

  backBtn: {
    alignSelf: 'flex-end',
    backgroundColor: '#ef4444',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 18,
    marginBottom: 14,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  backTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },

  customerInput: {
    backgroundColor: '#fff1f2',
    borderRadius: 50,
    paddingHorizontal: 22,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '600',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#fecdd3',
    textAlign: 'right',
  },

  formCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    borderWidth: 2,
    borderColor: ORANGE_BORDER,
    marginBottom: 16,
  },
  formTitle: { fontSize: 16, fontWeight: '900', color: ORANGE, textAlign: 'right', marginBottom: 14 },

  partsHeader: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'flex-end',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  partsHeaderTxt: { fontSize: 15, fontWeight: '700', color: '#94a3b8' },

  partsScrollArea: {
    maxHeight: 220,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 12,
    backgroundColor: '#fafafa',
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    justifyContent: 'space-between',
  },
  partRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  partName: { fontSize: 15, fontWeight: '700', color: '#1e293b', textAlign: 'right', flex: 1, marginRight: 8 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: ORANGE, borderColor: ORANGE },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '900' },
  emptyParts: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 12, fontWeight: '600' },

  modelInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '600',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    textAlign: 'right',
  },

  priceRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  priceBox: { flex: 1, alignItems: 'center' },
  priceLabel: { fontSize: 13, color: '#64748b', fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  priceInput: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '700',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    textAlign: 'center',
  },

  btnRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  cancelTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  saveBtn: {
    flex: 2,
    backgroundColor: ORANGE,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  saveTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },

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
  logTitle: { fontSize: 16, fontWeight: '900', color: '#1e293b', textAlign: 'right' },
  logDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 12 },
  emptyTxt: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 16,
    fontWeight: '600',
  },

  repairItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  repairName: { fontSize: 13, fontWeight: '700', color: '#1e293b', textAlign: 'right', marginBottom: 2 },
  repairMeta: { fontSize: 11, color: '#64748b' },
  repairSell: { fontSize: 14, fontWeight: '900', color: '#1e293b' },
  repairProfit: { fontSize: 12, fontWeight: '700' },
});
