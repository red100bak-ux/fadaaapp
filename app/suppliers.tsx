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
import AppHeader from '../src/components/AppHeader';
import { logActivity } from '../src/utils/activityLogger';

type View2 = 'list' | 'detail';
type Sheet = 'none' | 'addSupplier' | 'editName' | 'transaction' | 'addCheck';
type TxType = 'add' | 'sub';


const pad = (n: number) => String(n).padStart(2, '0');

function DateSpinner({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  function adj(field: string, delta: number) {
    const d = new Date(value);
    if (field === 'day')   d.setDate(d.getDate() + delta);
    if (field === 'month') d.setMonth(d.getMonth() + delta);
    if (field === 'year')  d.setFullYear(d.getFullYear() + delta);
    onChange(d);
  }
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginVertical: 6 }}>
      {[
        { label: 'سنة', val: String(value.getFullYear()), f: 'year' },
        { label: 'شهر', val: String(value.getMonth() + 1).padStart(2, '0'), f: 'month' },
        { label: 'يوم', val: pad(value.getDate()), f: 'day' },
      ].map(({ label, val, f }) => (
        <View key={f} style={{ alignItems: 'center', flex: 1, gap: 4 }}>
          <TouchableOpacity onPress={() => adj(f, 1)} style={{ padding: 6 }}>
            <Text style={{ fontSize: 18, color: '#5c67f2', fontWeight: '900' }}>▲</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 15, fontWeight: '900', color: '#1e293b' }}>{val}</Text>
          <TouchableOpacity onPress={() => adj(f, -1)} style={{ padding: 6 }}>
            <Text style={{ fontSize: 18, color: '#5c67f2', fontWeight: '900' }}>▼</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '700' }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function SuppliersScreen() {
  const { app, auth, updateApp } = useAppStore();
  const [view, setView] = useState<View2>('list');
  const [selectedKey, setSelectedKey] = useState('');
  const [sheet, setSheet] = useState<Sheet>('none');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
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
  const [checkIssueDateObj, setCheckIssueDateObj] = useState(new Date());
  const [checkDueDateObj, setCheckDueDateObj] = useState(new Date());
  const [showCheckForm, setShowCheckForm] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const perm = usePermissions();
  const suppliers = Object.entries(app.supplierCredit ?? {}).filter(([, s]) => !s.pendingDeletion);
  const totalDebt = suppliers.reduce((s, [, v]) => s + (v.total ?? 0), 0);
  const selected = selectedKey ? app.supplierCredit?.[selectedKey] : null;

  function openDetail(key: string) { setSelectedKey(key); setView('detail'); }

  function addSupplier() {
    const name = newName.trim();
    if (!name) { Alert.alert('', 'أدخل اسم المورد'); return; }
    const key = `sup_${Date.now()}`;
    updateApp(prev => ({ ...prev, supplierCredit: { ...prev.supplierCredit, [key]: { name, phone: newPhone.trim() || undefined, total: 0, history: [], checks: [] } } }));
    setNewName(''); setNewPhone(''); setSheet('none'); setShowAddForm(false);
  }

  function saveEditName() {
    const name = editName.trim(); if (!name) return;
    updateApp(prev => ({ ...prev, supplierCredit: { ...prev.supplierCredit, [selectedKey]: { ...prev.supplierCredit?.[selectedKey], name } } }));
    setSheet('none');
  }

  function deleteSupplier(key: string, name: string) {
    Alert.alert('طلب حذف', `طلب حذف "${name}"؟\nسيُرسل للمدير للموافقة.`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'طلب الحذف', style: 'destructive', onPress: () => {
        updateApp(prev => ({ ...prev, supplierCredit: { ...prev.supplierCredit, [key]: { ...prev.supplierCredit[key], pendingDeletion: true, deletionRequestedBy: auth?.name ?? '' } } }));
        if (selectedKey === key) setView('list');
      }},
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
      logActivity('supplier_add', `📦 جاب سلعة من: ${supName} — ${val} د`, auth?.name ?? '', val);
    } else {
      logActivity('supplier_pay', `✅ تسديد لـ: ${supName} — ${val} د`, auth?.name ?? '', val);
    }
    setAmount(''); setNote(''); setSheet('none');
  }

  function addCheck() {
    if (!checkAmt) { Alert.alert('', 'أدخل مبلغ الشيك'); return; }
    if (!checkNum.trim()) { Alert.alert('', 'أدخل رقم الشيك'); return; }
    const val = parseFloat(checkAmt); if (!val) return;
    const fmtD = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
    const chk = {
      id: `chk_${Date.now()}`, amount: val,
      issueDate: fmtD(checkIssueDateObj), due: fmtD(checkDueDateObj),
      name: checkName.trim(), number: checkNum.trim(),
      type: checkType, note: checkNote.trim(), cashed: false, date: fmtD(checkIssueDateObj),
    };
    updateApp(prev => {
      const sc = { ...prev.supplierCredit };
      const sup = { ...sc[selectedKey] };
      return { ...prev, supplierCredit: { ...sc, [selectedKey]: { ...sup, checks: [...(sup.checks ?? []), chk] } } };
    });
    setCheckAmt(''); setCheckNote(''); setCheckName(''); setCheckNum('');
    setCheckIssueDateObj(new Date()); setCheckDueDateObj(new Date());
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
      <AppHeader title="كارني الموردين" sub={`مجموع الديون: ${formatMAD(totalDebt)}`} subColor="#ef4444" onBack={() => router.back()} />

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
              {showAddForm && (
                <>
                  <TextInput style={s.addInput} placeholder="اسم المورد الجديد *" value={newName} onChangeText={setNewName}
                    placeholderTextColor="#94a3b8" returnKeyType="next" autoFocus />
                  <TextInput style={[s.addInput, { marginTop: 8 }]} placeholder="رقم الهاتف (اختياري)" value={newPhone} onChangeText={setNewPhone}
                    placeholderTextColor="#94a3b8" keyboardType="phone-pad" returnKeyType="done" onSubmitEditing={addSupplier} />
                </>
              )}
              <TouchableOpacity style={s.addBtn} onPress={showAddForm ? addSupplier : () => setShowAddForm(true)}>
                <Text style={s.addBtnTxt}>{showAddForm ? '✓ حفظ المورد' : '+ إضافة مورد للكارني'}</Text>
              </TouchableOpacity>
              {showAddForm && (
                <TouchableOpacity style={[s.addBtn, { backgroundColor: '#94a3b8', marginTop: 6 }]}
                  onPress={() => { setShowAddForm(false); setNewName(''); setNewPhone(''); }}>
                  <Text style={s.addBtnTxt}>إلغاء</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          </>
        }
        ListEmptyComponent={<View style={s.empty}><Text style={{ fontSize: 40 }}>📦</Text><Text style={s.emptyTxt}>ما كاين حتى مورد</Text></View>}
        renderItem={({ item: [key, sup] }) => {
          const debt = sup.total ?? 0;
          return (
            <TouchableOpacity style={s.supCard} onPress={() => openDetail(key)} activeOpacity={0.8}>
              {/* RIGHT in RTL: supplier name/debt */}
              <View style={s.cardInfo}>
                <Text style={s.supName}>{sup.name}</Text>
                <Text style={[s.supDebt, { color: debt === 0 ? '#10b981' : '#ef4444' }]}>{formatMAD(debt)}</Text>
              </View>
              {/* LEFT in RTL: ✏️ top, 🗑️ below — column */}
              <View style={s.cardActions}>
                <TouchableOpacity style={s.editIcon} onPress={() => { setSelectedKey(key); setEditName(sup.name); setSheet('editName'); }}>
                  <Text style={{ fontSize: 16 }}>✏️</Text>
                </TouchableOpacity>
                {perm.canDeleteSupplier && (
                  <TouchableOpacity style={s.delIcon} onPress={() => deleteSupplier(key, sup.name)}>
                    <Text style={{ fontSize: 16 }}>🗑️</Text>
                  </TouchableOpacity>
                )}
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
            <TextInput style={s.inp} value={editName} onChangeText={setEditName} autoFocus placeholderTextColor="#9ca3af" />
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
      <AppHeader title={selected?.name ?? ''} onBack={() => setView('list')} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
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
              <TouchableOpacity style={s.addCheckBtn} onPress={() => { setCheckAmt(''); setCheckNote(''); setCheckName(''); setCheckNum(''); setCheckType('chik'); setCheckIssueDateObj(new Date()); setCheckDueDateObj(new Date()); setShowCheckForm(v => !v); }}>
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

              <TextInput style={s.checkInp} placeholder="الاسم على الشيك" value={checkName} onChangeText={setCheckName} placeholderTextColor="#94a3b8" />
              <TextInput style={s.checkInp} placeholder="رقم الشيك *" value={checkNum} onChangeText={setCheckNum} placeholderTextColor="#94a3b8" keyboardType="numeric" />

              <Text style={s.checkFieldLabel}>📅 تاريخ الشيك</Text>
              <View style={[s.checkDateBox, { paddingVertical: 4 }]}>
                <DateSpinner value={checkIssueDateObj} onChange={setCheckIssueDateObj} />
              </View>

              <Text style={s.checkFieldLabel}>⏰ تاريخ الصرف *</Text>
              <View style={[s.checkDateBox, { paddingVertical: 4 }]}>
                <DateSpinner value={checkDueDateObj} onChange={setCheckDueDateObj} />
              </View>

              <TextInput style={s.checkInp} placeholder="المبلغ (د) *" value={checkAmt} onChangeText={setCheckAmt} placeholderTextColor="#94a3b8" keyboardType="numeric" />

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
                  {(chk.number || (chk as any).num) ? <Text style={s.chkDate}>رقم: {chk.number || (chk as any).num}</Text> : null}
                  {(chk.due || (chk as any).dueDate) ? <Text style={s.chkDate}>صرف: {chk.due || (chk as any).dueDate}</Text> : null}
                  {chk.name ? <Text style={s.txNote}>{chk.name}</Text> : null}
                </View>
              </View>
            ))}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* TRANSACTION MODAL */}
      <Modal visible={sheet === 'transaction'} transparent animationType="slide" onRequestClose={() => setSheet('none')}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetBox}>
            <Text style={s.sheetTitle}>
              {txType === 'add' ? '📦 جاب سلعة (+)' : '🧾 تسديد / رفد (-)'}
            </Text>
            <TextInput style={s.inp} placeholder="المبلغ (د) *" value={amount} onChangeText={setAmount} keyboardType="numeric" autoFocus placeholderTextColor="#9ca3af" />
            <TextInput style={[s.inp, { marginTop: 10 }]} placeholder="ملاحظة..." value={note} onChangeText={setNote} placeholderTextColor="#9ca3af" />
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
            <TextInput style={s.inp} value={editName} onChangeText={setEditName} autoFocus placeholderTextColor="#9ca3af" />
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
  root: { flex: 1, backgroundColor: 'transparent' },
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
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
    flexDirection: 'row', alignItems: 'flex-start',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardInfo: { flex: 1 },
  supName: { fontSize: 17, fontWeight: '800', color: '#1e293b', marginBottom: 4 },
  supDebt: { fontSize: 18, fontWeight: '900', textAlign: 'right' },
  cardActions: { flexDirection: 'column', gap: 6 },
  delIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  editIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTxt: { fontSize: 14, color: '#94a3b8', fontWeight: '700', textAlign: 'center', paddingVertical: 12 },

  // Detail view
  editCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  editYellowBtn: { alignSelf: 'flex-start', backgroundColor: '#d97706', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 20 },
  editYellowTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },

  debtCard: { backgroundColor: '#eff6ff', borderRadius: 16, padding: 14, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: '#bfdbfe' },
  debtLabel: { fontSize: 14, fontWeight: '800', color: '#1e3a8a', marginBottom: 4 },
  debtAmt: { fontSize: 34, fontWeight: '900' },

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
  checkInp: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, fontSize: 15, color: '#1e293b', fontWeight: '600', marginBottom: 10, textAlign: 'right' },
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
  inp: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, fontSize: 15, color: '#1e293b', backgroundColor: '#f8fafc', fontWeight: '600', textAlign: 'right' },
  btns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: '#94a3b8' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 14, alignItems: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
