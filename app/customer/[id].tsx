import { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { Colors, Radii, Shadow } from '../../src/theme/colors';
import { formatMAD, nowDate } from '../../src/utils/helpers';
import { logActivity } from '../../src/utils/activityLogger';
import { usePermissions } from '../../src/hooks/usePermissions';
import type { CreditLog } from '../../src/types';

type Mode = 'zaad' | 'payment';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = decodeURIComponent(id ?? '');
  const { app, auth, updateApp } = useAppStore();

  const customer = app.credit?.[customerId];
  const perm = usePermissions();
  const [entryModal, setEntryModal] = useState(false);
  const [mode, setMode] = useState<Mode>('zaad');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const isAdmin = perm.isAdmin;

  if (!customer) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFound}>الزبون غير موجود</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: Colors.primary, marginTop: 12 }}>رجوع</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sortedLogs = [...customer.logs].reverse();

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
          [customerId]: {
            ...c,
            total: (c.total || 0) + log.v,
            logs: [...c.logs, log],
          },
        },
      };
    });
    if (mode === 'zaad') {
      logActivity('credit_add', `💳 كريدي: ${customer!.name} — ${val} DH`, auth?.name ?? '', val);
    } else {
      logActivity('credit_pay', `💰 سداد: ${customer!.name} — ${val} DH`, auth?.name ?? '', val);
    }
    setEntryModal(false);
    setAmount('');
    setNote('');
  }

  function sendWhatsApp() {
    const phone = customer?.phone?.replace(/[^0-9]/g, '') ?? '';
    if (!phone) { Alert.alert('', 'الزبون ليس عنده رقم هاتف'); return; }
    const intlPhone = phone.startsWith('0') ? '212' + phone.slice(1) : phone;
    const amount = Math.abs(customer!.total).toFixed(2);
    const msg = customer!.total > 0
      ? `السلام عليكم ${customer!.name}،\nعندك كريدي عندنا بقيمة ${amount} DH في فضاء الأخوين.\nشكراً 🙏`
      : `السلام عليكم ${customer!.name}،\nتم تصفية حسابك عندنا في فضاء الأخوين. شكراً لتعاملك معنا 🙏`;
    Linking.openURL(`whatsapp://send?phone=${intlPhone}&text=${encodeURIComponent(msg)}`).catch(() => {
      Alert.alert('', 'تأكد من تثبيت واتساب على الجهاز');
    });
  }

  function deleteCustomer() {
    if (!isAdmin) { Alert.alert('', 'غير مصرح'); return; }
    Alert.alert('حذف الزبون', `حذف "${customer.name}" وكل سجلاته؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: () => {
          updateApp((prev) => {
            const c = { ...prev.credit };
            delete c[customerId];
            return { ...prev, credit: c };
          });
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backTxt}>← رجوع</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName}>{customer.name}</Text>
          {customer.phone ? <Text style={styles.headerPhone}>📞 {customer.phone}</Text> : null}
        </View>
        {isAdmin && (
          <TouchableOpacity onPress={deleteCustomer}>
            <Text style={styles.deleteBtn}>🗑️</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Total card */}
      <View style={[styles.totalCard, { backgroundColor: customer.total > 0 ? Colors.dangerLight : Colors.successLight }]}>
        <Text style={styles.totalLabel}>المبلغ المستحق</Text>
        <Text style={[styles.totalVal, { color: customer.total > 0 ? Colors.danger : Colors.success }]}>
          {formatMAD(Math.abs(customer.total))}
        </Text>
        <Text style={styles.totalSub}>
          {customer.total > 0 ? 'على الزبون' : customer.total < 0 ? 'للزبون (دفع زيادة)' : 'مسوّى ✓'}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actionRow}>
        {perm.canRecordZaad && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: Colors.dangerLight, borderColor: Colors.danger + '40' }]}
            onPress={() => { setMode('zaad'); setEntryModal(true); }}
          >
            <Text style={[styles.actionTxt, { color: Colors.danger }]}>🛒 زاد (كريدي)</Text>
          </TouchableOpacity>
        )}
        {perm.canRecordPayment && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: Colors.successLight, borderColor: Colors.success + '40' }]}
            onPress={() => { setMode('payment'); setEntryModal(true); }}
          >
            <Text style={[styles.actionTxt, { color: Colors.success }]}>💰 سداد</Text>
          </TouchableOpacity>
        )}
        {customer.phone ? (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#dcfce7', borderColor: '#4ade80', flex: 0.7 }]}
            onPress={sendWhatsApp}
          >
            <Text style={[styles.actionTxt, { color: '#16a34a' }]}>📲 WA</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Logs */}
      <Text style={styles.logsTitle}>سجل المعاملات ({customer.logs.length})</Text>
      <FlatList
        data={sortedLogs}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        renderItem={({ item: log }) => {
          const isDebit = log.v > 0;
          return (
            <View style={styles.logRow}>
              <View style={[styles.logDot, { backgroundColor: isDebit ? Colors.danger : Colors.success }]} />
              <View style={styles.logMain}>
                <Text style={styles.logType}>{log.t}</Text>
                <Text style={styles.logDate}>{log.d} {log.seller ? `· ${log.seller}` : ''}</Text>
              </View>
              <Text style={[styles.logVal, { color: isDebit ? Colors.danger : Colors.success }]}>
                {isDebit ? '+' : ''}{formatMAD(log.v)}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTxt}>لا توجد معاملات بعد</Text>
          </View>
        }
      />

      {/* Add entry modal */}
      <Modal visible={entryModal} animationType="slide" transparent onRequestClose={() => setEntryModal(false)}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheet}>
            {/* Mode selector */}
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'zaad' && styles.modeBtnActive, { borderColor: Colors.danger }]}
                onPress={() => setMode('zaad')}
              >
                <Text style={[styles.modeTxt, mode === 'zaad' && { color: Colors.danger }]}>🛒 زاد</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'payment' && styles.modeBtnPay, { borderColor: Colors.success }]}
                onPress={() => setMode('payment')}
              >
                <Text style={[styles.modeTxt, mode === 'payment' && { color: Colors.success }]}>💰 سداد</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>المبلغ (درهم) *</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              textAlign="center"
              autoFocus
            />
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>ملاحظة (اختياري)</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder={mode === 'zaad' ? 'اسم السلعة...' : 'دفعة...'}
              placeholderTextColor={Colors.textMuted}
              value={note}
              onChangeText={setNote}
              textAlign="right"
            />
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEntryModal(false)}>
                <Text style={styles.cancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: mode === 'zaad' ? Colors.danger : Colors.success }]}
                onPress={addEntry}
              >
                <Text style={styles.confirmTxt}>تأكيد</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 16, color: Colors.textMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  backTxt: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerName: { fontSize: 17, fontWeight: '800', color: Colors.text },
  headerPhone: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  deleteBtn: { fontSize: 20, padding: 4 },
  totalCard: { margin: 16, borderRadius: Radii.xl, padding: 20, alignItems: 'center', ...Shadow.card },
  totalLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: '700', marginBottom: 6 },
  totalVal: { fontSize: 32, fontWeight: '900' },
  totalSub: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  actionBtn: {
    flex: 1, padding: 14, borderRadius: Radii.xl,
    alignItems: 'center', borderWidth: 1.5,
  },
  actionTxt: { fontSize: 14, fontWeight: '800' },
  logsTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, paddingHorizontal: 16, paddingVertical: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 110 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  logDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  logMain: { flex: 1 },
  logType: { fontSize: 13, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  logDate: { fontSize: 11, color: Colors.textMuted, marginTop: 2, textAlign: 'right' },
  logVal: { fontSize: 15, fontWeight: '900', minWidth: 70, textAlign: 'left' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyTxt: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  modeBtn: {
    flex: 1, padding: 12, borderRadius: Radii.lg,
    alignItems: 'center', borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  modeBtnActive: { backgroundColor: Colors.dangerLight },
  modeBtnPay: { backgroundColor: Colors.successLight },
  modeTxt: { fontSize: 14, fontWeight: '800', color: Colors.textMuted },
  fieldLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: '700', textAlign: 'right', marginBottom: 6 },
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
  confirmBtn: { flex: 2, padding: 14, borderRadius: Radii.lg, alignItems: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
