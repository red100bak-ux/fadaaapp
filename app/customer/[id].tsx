import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { formatMAD, nowDate } from '../../src/utils/helpers';
import { logActivity } from '../../src/utils/activityLogger';
import AppHeader from '../../src/components/AppHeader';
import { usePermissions } from '../../src/hooks/usePermissions';
import type { CreditLog } from '../../src/types';

type Mode = 'zaad' | 'payment';

const GOLD       = '#d97706';
const GOLD_LIGHT = '#fffbeb';
const GOLD_BDR   = '#fde68a';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = decodeURIComponent(id ?? '');
  const { app, auth, updateApp } = useAppStore();

  const customer = app.credit?.[customerId];
  const perm = usePermissions();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('zaad');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  if (!customer) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.centered}>
          <Text style={s.notFound}>الزبون غير موجود</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: GOLD, marginTop: 12, fontWeight: '700' }}>رجوع</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const txns = [...(customer.logs ?? [])].reverse();
  const debt = customer.total ?? 0;

  function addEntry() {
    const val = parseFloat(amount);
    if (!val || val <= 0) { Alert.alert('', 'أدخل مبلغ صحيح'); return; }
    const { dateTime } = nowDate();
    const sign = mode === 'zaad' ? 1 : -1;
    const log: CreditLog = {
      t: mode === 'zaad' ? `🛒 زاد (${note || 'بضاعة'})` : `💰 سداد (${note || 'دفعة'})`,
      v: val * sign,
      d: dateTime,
      seller: auth?.name,
    };
    updateApp((prev) => {
      const c = prev.credit[customerId];
      return {
        ...prev,
        credit: {
          ...prev.credit,
          [customerId]: { ...c, total: (c.total || 0) + log.v, logs: [...c.logs, log] },
        },
      };
    });
    if (mode === 'zaad') {
      logActivity('credit_add', `💳 كريدي: ${customer.name} — ${val} د`, auth?.name ?? '', val);
    } else {
      logActivity('credit_pay', `💰 سداد: ${customer.name} — ${val} د`, auth?.name ?? '', val);
    }
    setSheetOpen(false);
    setAmount('');
    setNote('');
  }

  function sendWhatsApp() {
    const phone = customer?.phone?.replace(/[^0-9]/g, '') ?? '';
    if (!phone) { Alert.alert('', 'الزبون ليس عنده رقم هاتف'); return; }
    const intlPhone = phone.startsWith('0') ? '212' + phone.slice(1) : phone;
    const amt = Math.abs(debt).toFixed(2);
    const msg = debt > 0
      ? `السلام عليكم ${customer.name}،\nعندك كريدي عندنا بقيمة ${amt} د في فضاء الأخوين.\nشكراً 🙏`
      : `السلام عليكم ${customer.name}،\nتم تصفية حسابك عندنا في فضاء الأخوين. شكراً لتعاملك معنا 🙏`;
    Linking.openURL(`whatsapp://send?phone=${intlPhone}&text=${encodeURIComponent(msg)}`).catch(() => {
      Alert.alert('', 'تأكد من تثبيت واتساب على الجهاز');
    });
  }

  function deleteCustomer() {
    if (!perm.isAdmin) { Alert.alert('', 'غير مصرح'); return; }
    Alert.alert('حذف الزبون', `حذف "${customer.name}" وكل سجلاته؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: () => {
          updateApp((prev) => { const c = { ...prev.credit }; delete c[customerId]; return { ...prev, credit: c }; });
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={s.root}>
      <AppHeader
        title={customer.name}
        sub={customer.phone ? `📞 ${customer.phone}` : undefined}
        onBack={() => router.back()}
        leftAction={perm.isAdmin ? { label: '🗑️', onPress: deleteCustomer } : undefined}
      />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Big debt card */}
        <View style={s.debtCard}>
          <Text style={s.debtLabel}>كنتسالو الزبون:</Text>
          <Text style={[s.debtAmt, { color: debt === 0 ? '#2563eb' : debt > 0 ? '#dc2626' : '#10b981' }]}>
            {formatMAD(Math.abs(debt))}
          </Text>
          <Text style={s.debtSub}>
            {debt > 0 ? 'على الزبون' : debt < 0 ? 'للزبون (دفع زيادة)' : 'مسوّى ✓'}
          </Text>
        </View>

        {/* Action buttons */}
        <View style={s.actionRow}>
          {perm.canRecordZaad && (
            <TouchableOpacity
              style={s.actionRed}
              onPress={() => { setMode('zaad'); setAmount(''); setNote(''); setSheetOpen(true); }}
            >
              <Text style={s.actionTxt}>🛒 زاد (كريدي)</Text>
            </TouchableOpacity>
          )}
          {perm.canRecordPayment && (
            <TouchableOpacity
              style={s.actionGreen}
              onPress={() => { setMode('payment'); setAmount(''); setNote(''); setSheetOpen(true); }}
            >
              <Text style={s.actionTxt}>💰 سداد</Text>
            </TouchableOpacity>
          )}
        </View>

        {customer.phone ? (
          <TouchableOpacity style={s.waBtn} onPress={sendWhatsApp}>
            <Text style={s.waTxt}>📲 إرسال تذكير عبر واتساب</Text>
          </TouchableOpacity>
        ) : null}

        {/* Transactions list */}
        <Text style={s.secTitle}>سجل المعاملات ({customer.logs?.length ?? 0})</Text>

        {txns.length === 0
          ? <Text style={s.emptyTxt}>ما كاين حتى عملية</Text>
          : txns.map((log: CreditLog, i: number) => {
              const isDebit = log.v > 0;
              return (
                <View key={i} style={s.txRow}>
                  <Text style={s.txDate}>{log.d}{log.seller ? ` · ${log.seller}` : ''}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    {log.t ? <Text style={s.txNote}>{log.t}</Text> : null}
                    <Text style={[s.txAmt, { color: isDebit ? '#ef4444' : '#10b981' }]}>
                      {isDebit ? '+' : ''}{formatMAD(log.v)}
                    </Text>
                  </View>
                </View>
              );
            })}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Add entry modal */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetBox}>
            <Text style={s.sheetTitle}>
              {mode === 'zaad' ? '🛒 زاد (كريدي)' : '💰 سداد'}
            </Text>

            {/* Mode toggle */}
            <View style={s.modeRow}>
              <TouchableOpacity
                style={[s.modeBtn, mode === 'zaad' && { backgroundColor: '#fee2e2', borderColor: '#ef4444' }]}
                onPress={() => setMode('zaad')}
              >
                <Text style={[s.modeTxt, mode === 'zaad' && { color: '#ef4444' }]}>🛒 زاد</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modeBtn, mode === 'payment' && { backgroundColor: '#dcfce7', borderColor: '#10b981' }]}
                onPress={() => setMode('payment')}
              >
                <Text style={[s.modeTxt, mode === 'payment' && { color: '#10b981' }]}>💰 سداد</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={s.inp}
              placeholder="المبلغ (د) *"
              placeholderTextColor="#9ca3af"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              autoFocus
            />
            <TextInput
              style={[s.inp, { marginTop: 10 }]}
              placeholder={mode === 'zaad' ? 'اسم السلعة...' : 'دفعة...'}
              placeholderTextColor="#9ca3af"
              value={note}
              onChangeText={setNote}
            />
            <View style={s.btns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setSheetOpen(false)}>
                <Text style={s.cancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, { backgroundColor: mode === 'zaad' ? '#ef4444' : '#10b981' }]}
                onPress={addEntry}
              >
                <Text style={s.confirmTxt}>تأكيد</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 16, color: '#94a3b8', fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 60 },

  debtCard: {
    backgroundColor: GOLD_LIGHT, borderRadius: 14, padding: 10,
    marginBottom: 10, alignItems: 'flex-end',
    borderWidth: 1, borderColor: GOLD_BDR,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  debtLabel: { fontSize: 19, fontWeight: '800', color: GOLD, textAlign: 'right' },
  debtAmt:   { fontSize: 26, fontWeight: '900', textAlign: 'right' },
  debtSub:   { fontSize: 10, color: '#94a3b8', marginTop: 3, fontWeight: '600', textAlign: 'right' },

  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 10, justifyContent: 'center' },
  actionRed: {
    width: 150, backgroundColor: '#ef4444', paddingVertical: 20,
    borderRadius: 20, alignItems: 'center',
  },
  actionGreen: {
    width: 150, backgroundColor: '#10b981', paddingVertical: 20,
    borderRadius: 20, alignItems: 'center',
  },
  actionTxt: { color: '#fff', fontWeight: '900', fontSize: 15, textAlign: 'center' },

  waBtn: {
    backgroundColor: '#dcfce7', borderRadius: 16, paddingVertical: 14,
    alignItems: 'center', marginBottom: 16, alignSelf: 'center', width: 312,
    borderWidth: 1, borderColor: '#4ade80',
  },
  waTxt: { color: '#16a34a', fontWeight: '800', fontSize: 14, textAlign: 'center' },

  secTitle: {
    fontSize: 14, fontWeight: '800', color: '#1e293b',
    textAlign: 'left', marginBottom: 10, marginTop: 6,
  },
  emptyTxt: { fontSize: 14, color: '#94a3b8', fontWeight: '700', textAlign: 'center', paddingVertical: 24 },

  txRow: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  txDate: { fontSize: 12, color: '#94a3b8', fontWeight: '600', flex: 1, textAlign: 'left' },
  txNote: { fontSize: 12, color: '#64748b', marginBottom: 2, textAlign: 'left', fontWeight: '600' },
  txAmt:  { fontSize: 18, fontWeight: '900', textAlign: 'left' },

  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheetBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26,
    padding: 24, paddingBottom: 44,
  },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: '#1e293b', textAlign: 'left', marginBottom: 16, width: '100%' },
  modeRow:   { flexDirection: 'row', gap: 10, marginBottom: 16 },
  modeBtn: {
    flex: 1, padding: 12, borderRadius: 14, alignItems: 'center',
    borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  modeTxt: { fontSize: 14, fontWeight: '800', color: '#94a3b8', textAlign: 'left' },
  inp: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14,
    padding: 14, fontSize: 15, color: '#1e293b',
    backgroundColor: '#f8fafc', fontWeight: '600', textAlign: 'right',
  },
  btns:       { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn:  { flex: 1, padding: 14, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelTxt:  { fontSize: 15, fontWeight: '700', color: '#94a3b8' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 14, alignItems: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
