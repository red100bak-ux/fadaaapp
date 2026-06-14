import { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { nowDate, formatMAD } from '../src/utils/helpers';
import { usePermissions } from '../src/hooks/usePermissions';
import { logActivity } from '../src/utils/activityLogger';

type View2 = 'list' | 'detail';
type Sheet = 'none' | 'addSupplier' | 'editName' | 'transaction' | 'addCheck';
type TxType = 'add' | 'sub';

export default function SuppliersScreen() {
  const { app, auth, updateApp } = useAppStore();
  const [view, setView] = useState<View2>('list');
  const [selectedKey, setSelectedKey] = useState('');
  const [sheet, setSheet] = useState<Sheet>('none');
  const [newName, setNewName] = useState('');
  const [editName, setEditName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [txType, setTxType] = useState<TxType>('add');
  // Check fields
  const [checkAmt, setCheckAmt] = useState('');
  const [checkDue, setCheckDue] = useState('');
  const [checkNote, setCheckNote] = useState('');
  const [checkName, setCheckName] = useState('');
  const [checkNum, setCheckNum] = useState('');
  const [checkType, setCheckType] = useState<'chik' | 'kombiala'>('chik');
  const [showCheckForm, setShowCheckForm] = useState(false);

  const perm = usePermissions();
  const suppliers = Object.entries(app.supplierCredit ?? {});
  const totalDebt = suppliers.reduce((s, [, v]) => s + (v.total ?? 0), 0);
  const selected = selectedKey ? app.supplierCredit?.[selectedKey] : null;

  function openDetail(key: string) { setSelectedKey(key); setView('detail'); }

  function addSupplier() {
    const name = newName.trim();
    if (!name) { Alert.alert('', 'أدخل اسم المورد'); return; }
    const key = `sup_${Date.now()}`;
    updateApp(prev => ({ ...prev, supplierCredit: { ...prev.supplierCredit, [key]: { name, total: 0, history: [], checks: [] } } }));
    setNewName(''); setSheet('none');
  }

  function saveEditName() {
    const name = editName.trim(); if (!name) return;
    updateApp(prev => ({ ...prev, supplierCredit: { ...prev.supplierCredit, [selectedKey]: { ...prev.supplierCredit?.[selectedKey], name } } }));
    setSheet('none');
  }

  function deleteSupplier(key: string, name: string) {
    Alert.alert('حذف', `حذف "${name}" ؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => { updateApp(prev => { const sc = { ...prev.supplierCredit }; delete sc[key]; return { ...prev, supplierCredit: sc }; }); if (selectedKey === key) setView('list'); } },
    ]);
  }

  function recordTxn() {
    if (!amount) { Alert.alert('', 'أدخل المبلغ'); return; }
    const val = parseFloat(amount); if (!val) return;
    const { dateTime, date } = nowDate();
    const delta = txType === 'add' ? val : -val;
    const supName = app.supplierCredit?.[selectedKey]?.name ?? selectedKey;
    updateApp(prev => {
      const sc = { ...prev.supplierCredit };
      const sup = { ...sc[selectedKey] };
      const history = [...(sup.history ?? []), { type: txType, amount: val, note: note.trim(), date, time: dateTime, by: auth?.name ?? '' }];
      return { ...prev, supplierCredit: { ...sc, [selectedKey]: { ...sup, total: (sup.total ?? 0) + delta, history } } };
    });
    if (txType === 'add') {
      logActivity('supplier_add', `📦 جاب سلعة من: ${supName} — ${val} DH`, auth?.name ?? '', val);
    } else {
      logActivity('supplier_pay', `✅ تسديد لـ: ${supName} — ${val} DH`, auth?.name ?? '', val);
    }
    setAmount(''); setNote(''); setSheet('none');
  }

  function addCheck() {
    if (!checkAmt) { Alert.alert('', 'أدخل مبلغ الشيك'); return; }
    if (!checkNum.trim()) { Alert.alert('', 'أدخل رقم الشيك'); return; }
    const val = parseFloat(checkAmt); if (!val) return;
    const { date } = nowDate();
    const chk = {
      id: `chk_${Date.now()}`, amount: val,
      issueDate: date, dueDate: checkDue.trim() || '',
      name: checkName.trim(), num: checkNum.trim(),
      type: checkType, note: checkNote.trim(), cashed: false, date,
    };
    updateApp(prev => {
      const sc = { ...prev.supplierCredit };
      const sup = { ...sc[selectedKey] };
      return { ...prev, supplierCredit: { ...sc, [selectedKey]: { ...sup, checks: [...(sup.checks ?? []), chk] } } };
    });
    setCheckAmt(''); setCheckDue(''); setCheckNote(''); setCheckName(''); setCheckNum('');
    setShowCheckForm(false);
  }

  function cashCheck(checkId: string) {
    updateApp(prev => {
      const sc = { ...prev.supplierCredit };
      const sup = { ...sc[selectedKey] };
      const checks = (sup.checks ?? []).map((c: any) => c.id === checkId ? { ...c, cashed: true } : c);
      return { ...prev, supplierCredit: { ...sc, [selectedKey]: { ...sup, checks } } };
    });
  }

  // ════════════════════════════════════════════════
  // LIST VIEW
  // ════════════════════════════════════════════════
  if (view === 'list') return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>كارني الموردين 📦●</Text>
        <Text style={s.totalDebt}>مجموع الديون: {formatMAD(totalDebt)}</Text>
      </View>

      <FlatList
        data={suppliers}
        keyExtractor={([k]) => k}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <>
            <TouchableOpacity style={s.backBtn} onPress={() => router.push('/(tabs)/admin')}>
              <Text style={s.backTxt}>← رجوع للإدارة</Text>
            </TouchableOpacity>
            {perm.canAddSupplier && (
            <View style={s.addCard}>
              <TextInput style={s.addInput} placeholder="اسم المورد الجديد" value={newName} onChangeText={setNewName}
                textAlign="right" placeholderTextColor="#94a3b8" returnKeyType="done" onSubmitEditing={addSupplier} />
              <TouchableOpacity style={s.addBtn} onPress={addSupplier}>
                <Text style={s.addBtnTxt}>+ إضافة مورد للكارني</Text>
              </TouchableOpacity>
            </View>
          )}
          </>
        }
        ListEmptyComponent={<View style={s.empty}><Text style={{ fontSize: 40 }}>📦</Text><Text style={s.emptyTxt}>ما كاين حتى مورد</Text></View>}
        renderItem={({ item: [key, sup] }) => {
          const debt = sup.total ?? 0;
          return (
            <TouchableOpacity style={s.supCard} onPress={() => openDetail(key)} activeOpacity={0.8}>
              <View style={s.cardActions}>
                {perm.canDeleteSupplier && (
                  <TouchableOpacity style={s.delIcon} onPress={() => deleteSupplier(key, sup.name)}>
                    <Text style={{ fontSize: 18 }}>🗑️</Text>
                  </TouchableOpacity>
                )}
                {perm.canEditSupplier && (
                  <TouchableOpacity style={s.editIcon} onPress={() => { setSelectedKey(key); setEditName(sup.name); setSheet('editName'); }}>
                    <Text style={{ fontSize: 18 }}>✏️</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={s.cardInfo}>
                <Text style={s.supName}>{sup.name}</Text>
                <Text style={[s.supDebt, { color: debt === 0 ? '#10b981' : '#ef4444' }]}>{formatMAD(debt)}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Edit name modal (from list) */}
      <Modal visible={sheet === 'editName'} transparent animationType="slide" onRequestClose={() => setSheet('none')}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetBox}>
            <Text style={s.sheetTitle}>✏️ تعديل اسم المورد</Text>
            <TextInput style={s.inp} value={editName} onChangeText={setEditName} textAlign="right" autoFocus placeholderTextColor="#9ca3af" />
            <View style={s.btns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setSheet('none')}><Text style={s.cancelTxt}>إلغاء</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: '#d97706' }]} onPress={saveEditName}><Text style={s.confirmTxt}>💾 حفظ</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );

  // ════════════════════════════════════════════════
  // DETAIL VIEW
  // ════════════════════════════════════════════════
  const debt = selected?.total ?? 0;
  const txns: any[] = selected?.history ?? [];
  const checks: any[] = selected?.checks ?? [];

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header: supplier name */}
      <View style={s.header}>
        <Text style={s.headerTitle}>{selected?.name ?? ''}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Back button */}
        <TouchableOpacity style={s.backBtn} onPress={() => setView('list')}>
          <Text style={s.backTxt}>← رجوع للقائمة</Text>
        </TouchableOpacity>

        {/* Edit button */}
        <View style={s.editCard}>
          <TouchableOpacity style={s.editYellowBtn} onPress={() => { setEditName(selected?.name ?? ''); setSheet('editName'); }}>
            <Text style={s.editYellowTxt}>تعديل ✏️</Text>
          </TouchableOpacity>
        </View>

        {/* Debt display */}
        <View style={s.debtCard}>
          <Text style={s.debtLabel}>كيسالنا المورد:</Text>
          <Text style={[s.debtAmt, { color: debt === 0 ? '#2563eb' : '#dc2626' }]}>{formatMAD(debt)}</Text>
        </View>

        {/* Action buttons */}
        {perm.canSupplierTransaction && (
          <View style={s.actionRow}>
            <TouchableOpacity style={s.actionGreen} onPress={() => { setTxType('add'); setAmount(''); setNote(''); setSheet('transaction'); }}>
              <Text style={s.actionTxt}>📦 جاب سلعة (+)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionRed} onPress={() => { setTxType('sub'); setAmount(''); setNote(''); setSheet('transaction'); }}>
              <Text style={s.actionTxt}>💸 تسديد / رفد (-)</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Transactions list */}
        {txns.length === 0
          ? <Text style={s.emptyTxt}>ما كاين حتى عملية</Text>
          : [...txns].reverse().map((tx: any, i: number) => (
            <View key={i} style={s.txRow}>
              <Text style={s.txDate}>{tx.date}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                {tx.note ? <Text style={s.txNote}>{tx.note}</Text> : null}
                <Text style={[s.txAmt, { color: tx.type === 'add' ? '#ef4444' : '#10b981' }]}>
                  {tx.type === 'add' ? '+' : '-'}{formatMAD(tx.amount)}
                </Text>
              </View>
            </View>
          ))}

        {/* Checks section */}
        <View style={s.checksCard}>
          <View style={s.checksHeader}>
            {perm.canManageChecks && (
              <TouchableOpacity style={s.addCheckBtn} onPress={() => { setCheckAmt(''); setCheckDue(''); setCheckNote(''); setCheckName(''); setCheckNum(''); setCheckType('chik'); setShowCheckForm(v => !v); }}>
                <Text style={s.addCheckTxt}>+ إضافة شيك</Text>
              </TouchableOpacity>
            )}
            <Text style={s.checksTitle}>الشيكات 💳</Text>
          </View>

          {/* Inline check form */}
          {showCheckForm && (
            <View style={s.checkForm}>
              {/* شيك / كمبيالة toggle */}
              <View style={s.checkToggle}>
                <TouchableOpacity style={[s.checkToggleBtn, checkType === 'kombiala' && s.checkToggleBtnOn]} onPress={() => setCheckType('kombiala')}>
                  <Text style={[s.checkToggleTxt, checkType === 'kombiala' && { color: '#fff' }]}>كمبيالة 📋</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.checkToggleBtn, checkType === 'chik' && s.checkToggleBtnOn]} onPress={() => setCheckType('chik')}>
                  <Text style={[s.checkToggleTxt, checkType === 'chik' && { color: '#fff' }]}>شيك 🧾</Text>
                </TouchableOpacity>
              </View>

              <TextInput style={s.checkInp} placeholder="الاسم على الشيك" value={checkName} onChangeText={setCheckName} textAlign="right" placeholderTextColor="#94a3b8" />
              <TextInput style={s.checkInp} placeholder="رقم الشيك *" value={checkNum} onChangeText={setCheckNum} textAlign="right" placeholderTextColor="#94a3b8" keyboardType="numeric" />

              <Text style={s.checkFieldLabel}>تاريخ الشيك</Text>
              <View style={s.checkDateBox}>
                <Text style={{ color: '#94a3b8', fontSize: 13 }}>∨</Text>
                <Text style={s.checkDateTxt}>{nowDate().date}</Text>
              </View>

              <Text style={s.checkFieldLabel}>تاريخ الصرف (Due Date) *</Text>
              <View style={s.checkDateBox}>
                <Text style={{ color: '#94a3b8', fontSize: 13 }}>∨</Text>
                <TextInput style={{ flex: 1, textAlign: 'right', fontSize: 15, color: '#1e293b', fontWeight: '600' }}
                  placeholder="dd/mm/yyyy" value={checkDue} onChangeText={setCheckDue}
                  placeholderTextColor="#94a3b8" keyboardType="numeric" />
              </View>

              <TextInput style={s.checkInp} placeholder="المبلغ (DH) *" value={checkAmt} onChangeText={setCheckAmt} textAlign="right" placeholderTextColor="#94a3b8" keyboardType="numeric" />

              <View style={s.checkBtns}>
                <TouchableOpacity style={s.checkCancelBtn} onPress={() => setShowCheckForm(false)}>
                  <Text style={s.checkCancelTxt}>إلغاء ✕</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.checkSaveBtn} onPress={addCheck}>
                  <Text style={s.checkSaveTxt}>✅ حفظ</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {checks.length === 0 && !showCheckForm
            ? <Text style={[s.emptyTxt, { textAlign: 'center' }]}>ما كاين حتى شيك مسجل</Text>
            : checks.map((chk: any, i: number) => (
              <View key={i} style={[s.chkRow, chk.cashed && { opacity: 0.5 }]}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {!chk.cashed && perm.canManageChecks && (
                    <TouchableOpacity style={s.cashedBtn} onPress={() => cashCheck(chk.id)}>
                      <Text style={s.cashedTxt}>✅ صرف</Text>
                    </TouchableOpacity>
                  )}
                  {chk.cashed && <Text style={s.cashedLabel}>✅ مصروف</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.chkAmt}>{formatMAD(chk.amount)}</Text>
                  {chk.num ? <Text style={s.chkDate}>رقم: {chk.num}</Text> : null}
                  {chk.dueDate ? <Text style={s.chkDate}>صرف: {chk.dueDate}</Text> : null}
                  {chk.name ? <Text style={s.txNote}>{chk.name}</Text> : null}
                </View>
              </View>
            ))}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* TRANSACTION MODAL */}
      <Modal visible={sheet === 'transaction'} transparent animationType="slide" onRequestClose={() => setSheet('none')}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetBox}>
            <Text style={s.sheetTitle}>
              {txType === 'add' ? '📦 جاب سلعة (+)' : '🧾 تسديد / رفد (-)'}
            </Text>
            <TextInput style={s.inp} placeholder="المبلغ (DH) *" value={amount} onChangeText={setAmount} keyboardType="numeric" textAlign="center" autoFocus placeholderTextColor="#9ca3af" />
            <TextInput style={[s.inp, { marginTop: 10 }]} placeholder="ملاحظة..." value={note} onChangeText={setNote} textAlign="right" placeholderTextColor="#9ca3af" />
            <View style={s.btns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setSheet('none')}><Text style={s.cancelTxt}>إلغاء</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: txType === 'add' ? '#10b981' : '#ef4444' }]} onPress={recordTxn}>
                <Text style={s.confirmTxt}>تأكيد</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* EDIT NAME MODAL */}
      <Modal visible={sheet === 'editName'} transparent animationType="slide" onRequestClose={() => setSheet('none')}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetBox}>
            <Text style={s.sheetTitle}>✏️ تعديل اسم المورد</Text>
            <TextInput style={s.inp} value={editName} onChangeText={setEditName} textAlign="right" autoFocus placeholderTextColor="#9ca3af" />
            <View style={s.btns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setSheet('none')}><Text style={s.cancelTxt}>إلغاء</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: '#d97706' }]} onPress={saveEditName}><Text style={s.confirmTxt}>💾 حفظ</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#fff', paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', borderBottomLeftRadius: 28, borderBottomRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 4, marginBottom: 2 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#1e293b', marginBottom: 2 },
  totalDebt: { fontSize: 15, fontWeight: '800', color: '#ef4444' },

  list: { padding: 16, paddingBottom: 60 },
  scroll: { padding: 16, paddingBottom: 60 },

  backBtn: { alignSelf: 'flex-end', backgroundColor: '#ef4444', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, marginBottom: 14 },
  backTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },

  addCard: { backgroundColor: '#dbeafe', borderRadius: 18, padding: 16, marginBottom: 16 },
  addInput: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15, color: '#1e293b', fontWeight: '600', marginBottom: 10, textAlign: 'right' },
  addBtn: { backgroundColor: '#5c67f2', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  addBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },

  supCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardInfo: { flex: 1, alignItems: 'flex-end' },
  supName: { fontSize: 17, fontWeight: '800', color: '#1e293b', marginBottom: 4 },
  supDebt: { fontSize: 18, fontWeight: '900' },
  cardActions: { flexDirection: 'row', gap: 8, marginLeft: 8 },
  delIcon: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  editIcon: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTxt: { fontSize: 14, color: '#94a3b8', fontWeight: '700', textAlign: 'center', paddingVertical: 12 },

  // Detail view
  editCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  editYellowBtn: { alignSelf: 'flex-start', backgroundColor: '#d97706', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 20 },
  editYellowTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },

  debtCard: { backgroundColor: '#eff6ff', borderRadius: 22, padding: 28, marginBottom: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#bfdbfe' },
  debtLabel: { fontSize: 17, fontWeight: '800', color: '#1e3a8a', marginBottom: 10 },
  debtAmt: { fontSize: 48, fontWeight: '900' },

  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  actionRed: { flex: 1, backgroundColor: '#ef4444', paddingVertical: 20, borderRadius: 20, alignItems: 'center' },
  actionGreen: { flex: 1, backgroundColor: '#10b981', paddingVertical: 20, borderRadius: 20, alignItems: 'center' },
  actionTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },

  txRow: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 1 },
  txDate: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  txAmt: { fontSize: 18, fontWeight: '900' },
  txNote: { fontSize: 12, color: '#94a3b8', marginBottom: 2, textAlign: 'right' },

  checksCard: { backgroundColor: '#eff6ff', borderRadius: 22, padding: 16, marginTop: 16, borderWidth: 1.5, borderColor: '#bfdbfe' },
  checksHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  checksTitle: { fontSize: 16, fontWeight: '900', color: '#1e3a8a', textDecorationLine: 'underline' },
  addCheckBtn: { backgroundColor: '#5c67f2', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  addCheckTxt: { color: '#fff', fontWeight: '900', fontSize: 14 },

  chkRow: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chkAmt: { fontSize: 17, fontWeight: '900', color: '#1e293b', textAlign: 'right' },
  chkDate: { fontSize: 12, color: '#94a3b8', fontWeight: '600', marginTop: 2 },
  cashedBtn: { backgroundColor: '#dcfce7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  cashedTxt: { color: '#10b981', fontWeight: '800', fontSize: 13 },
  cashedLabel: { fontSize: 13, color: '#10b981', fontWeight: '700' },

  checkForm: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1.5, borderColor: '#93c5fd', borderStyle: 'dashed' },
  checkToggle: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  checkToggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
  checkToggleBtnOn: { backgroundColor: '#5c67f2' },
  checkToggleTxt: { fontSize: 14, fontWeight: '800', color: '#64748b' },
  checkInp: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, fontSize: 15, color: '#1e293b', fontWeight: '600', marginBottom: 10 },
  checkFieldLabel: { fontSize: 13, color: '#64748b', fontWeight: '700', textAlign: 'right', marginBottom: 6 },
  checkDateBox: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  checkDateTxt: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  checkBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  checkCancelBtn: { flex: 1, backgroundColor: '#ef4444', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  checkCancelTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  checkSaveBtn: { flex: 2, backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  checkSaveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },

  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheetBox: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 44 },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: '#1e293b', textAlign: 'right', marginBottom: 16 },
  inp: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, fontSize: 15, color: '#1e293b', backgroundColor: '#f8fafc', fontWeight: '600' },
  btns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: '#94a3b8' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 14, alignItems: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
