import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { nowDate, formatMAD } from '../src/utils/helpers';
import { usePermissions } from '../src/hooks/usePermissions';
import { logActivity } from '../src/utils/activityLogger';

const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليوز','غشت','شتنبر','أكتوبر','نونبر','دجنبر'];

type View2 = 'list' | 'detail';
type Sheet = 'none' | 'addMonth' | 'empMgr' | 'addEmp' | 'editEmp' | 'empAction' | 'empLog' | 'addExp';
type EmpAction = 'daf3a' | 'ghiyab' | 'salfa';
type ExpType = 'kra' | 'daw' | 'net' | 'other';

const EXP_TYPES = [
  { key: 'kra',   label: '🏠 كرا',    color: '#dc2626', bg: '#fee2e2' },
  { key: 'daw',   label: '💡 ضو',     color: '#f59e0b', bg: '#fef9c3' },
  { key: 'net',   label: '🌐 انترنت', color: '#2563eb', bg: '#dbeafe' },
  { key: 'other', label: '📋 أخرى',   color: '#64748b', bg: '#f8fafc' },
];

export default function StaffScreen() {
  const { app, auth, updateApp } = useAppStore();
  const perm = usePermissions();
  const { monthKey: currentMK, date, dateTime } = nowDate();
  const [d, mo, y] = date.split('/');
  const currentDay = parseInt(d);

  // ─── VIEW STATE ───
  const [view, setView] = useState<View2>('list');
  const [activeMK, setActiveMK] = useState(currentMK);

  // ─── SHEET STATE ───
  const [sheet, setSheet] = useState<Sheet>('none');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [empAction, setEmpAction] = useState<EmpAction>('daf3a');
  const [activeEmpKey, setActiveEmpKey] = useState('');
  const [expType, setExpType] = useState<ExpType>('other');
  const [editingExpIdx, setEditingExpIdx] = useState<{ type: string; idx: number } | null>(null);

  // Employee form
  const [empName, setEmpName] = useState('');
  const [empSalary, setEmpSalary] = useState('');
  const [empPayday, setEmpPayday] = useState('30');

  // Month picker
  const [pickerM, setPickerM] = useState(parseInt(mo));
  const [pickerY, setPickerY] = useState(parseInt(y));

  // ─── TRACKED MONTHS ───
  const staffMonths: string[] = useMemo(() => {
    const saved = app.staffMonths ?? [];
    if (!saved.includes(currentMK)) return [...saved, currentMK];
    return saved;
  }, [app.staffMonths, currentMK]);

  function addMonth() {
    const mk = `${pickerY}-${pickerM}`;
    if (staffMonths.includes(mk)) { Alert.alert('', 'هاد الشهر كيان أصلاً'); setSheet('none'); return; }
    updateApp(prev => ({ ...prev, staffMonths: [...(prev.staffMonths ?? []), mk] }));
    setSheet('none');
  }

  // ─── DATA HELPERS ───
  const monthExps = (mk: string): Record<string, any[]> => app.monthlyExpenses?.[mk] ?? {};

  function getExpenses(mk: string) {
    return Object.entries(monthExps(mk))
      .filter(([k]) => !k.startsWith('👤'))
      .flatMap(([, arr]) => arr)
      .reduce((s, e) => s + (e.amount || 0), 0);
  }

  function getIncome(mk: string) {
    return (app.todaySales ?? [])
      .filter((s: any) => s.monthKey === mk && !s.name?.startsWith('📦') && !s.name?.startsWith('🗑️'))
      .reduce((s: number, r: any) => s + (r.sell || 0), 0);
  }

  function empPaid(mk: string, empName: string) {
    return (monthExps(mk)[`👤 ${empName}`] ?? [])
      .filter((e: any) => e.name?.includes('دفعة') || e.name?.includes('سلفة'))
      .reduce((s: number, e: any) => s + (e.amount || 0), 0);
  }

  const employees = Object.entries(app.employees ?? {});

  // ─── EMPLOYEE ACTIONS ───
  function addEmployee() {
    if (!empName.trim() || !empSalary) { Alert.alert('', 'أدخل الاسم والراتب'); return; }
    const key = `emp_${Date.now()}`;
    updateApp(prev => ({ ...prev, employees: { ...prev.employees, [key]: { name: empName.trim(), salary: parseFloat(empSalary) || 0, payday: parseInt(empPayday) || 30 } } }));
    setEmpName(''); setEmpSalary(''); setEmpPayday('30'); setSheet('empMgr');
  }

  function editEmployee() {
    if (!empName.trim() || !empSalary) return;
    updateApp(prev => ({ ...prev, employees: { ...prev.employees, [activeEmpKey]: { ...prev.employees?.[activeEmpKey], name: empName.trim(), salary: parseFloat(empSalary) || 0, payday: parseInt(empPayday) || 30 } } }));
    setSheet('empMgr');
  }

  function deleteEmployee(key: string, name: string) {
    Alert.alert('حذف', `حذف "${name}" ؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => updateApp(prev => { const emps = { ...prev.employees }; delete emps[key]; return { ...prev, employees: emps }; }) },
    ]);
  }

  function recordEmpAction() {
    if (!amount) { Alert.alert('', 'أدخل المبلغ'); return; }
    const val = parseFloat(amount); if (!val) return;
    const emp = app.employees?.[activeEmpKey]; if (!emp) return;
    const label = empAction === 'daf3a' ? '💰 دفعة' : empAction === 'ghiyab' ? '🚫 غياب' : '✅ سلفة';
    const item = { id: `ep_${Date.now()}`, type: `👤 ${emp.name}`, name: label, amount: val, note: note.trim(), date, time: dateTime, by: auth?.name ?? '' };
    updateApp(prev => {
      const mExps = prev.monthlyExpenses?.[activeMK] ?? {};
      const k = `👤 ${emp.name}`;
      return { ...prev, monthlyExpenses: { ...prev.monthlyExpenses, [activeMK]: { ...mExps, [k]: [...(mExps[k] ?? []), item] } } };
    });
    logActivity('salary', `${label} لـ ${emp.name} — ${val} DH`, auth?.name ?? '', val);
    setAmount(''); setNote(''); setSheet('none');
  }

  // ─── EXPENSE ACTIONS ───
  function addExpense() {
    if (!amount) { Alert.alert('', 'أدخل المبلغ'); return; }
    const val = parseFloat(amount); if (!val) return;
    const cfg = EXP_TYPES.find(t => t.key === expType) ?? EXP_TYPES[3];
    if (editingExpIdx) {
      updateApp(prev => {
        const mExps = { ...(prev.monthlyExpenses?.[activeMK] ?? {}) };
        const arr = [...(mExps[editingExpIdx.type] ?? [])];
        arr[editingExpIdx.idx] = { ...arr[editingExpIdx.idx], amount: val, note: note.trim() };
        return { ...prev, monthlyExpenses: { ...prev.monthlyExpenses, [activeMK]: { ...mExps, [editingExpIdx.type]: arr } } };
      });
      setEditingExpIdx(null);
    } else {
      const item = { id: `exp_${Date.now()}`, type: cfg.label, name: note.trim() || cfg.label, amount: val, note: note.trim(), date, time: dateTime, by: auth?.name ?? '' };
      updateApp(prev => {
        const mExps = prev.monthlyExpenses?.[activeMK] ?? {};
        return { ...prev, monthlyExpenses: { ...prev.monthlyExpenses, [activeMK]: { ...mExps, [cfg.label]: [...(mExps[cfg.label] ?? []), item] } } };
      });
      logActivity('expense', `💸 مصروف: ${cfg.label} — ${val} DH`, auth?.name ?? '', val);
    }
    setAmount(''); setNote(''); setSheet('none');
  }

  function deleteExpense(type: string, idx: number) {
    Alert.alert('حذف', 'تأكيد الحذف؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: () => updateApp(prev => {
          const mExps = { ...(prev.monthlyExpenses?.[activeMK] ?? {}) };
          const arr = [...(mExps[type] ?? [])]; arr.splice(idx, 1);
          return { ...prev, monthlyExpenses: { ...prev.monthlyExpenses, [activeMK]: { ...mExps, [type]: arr } } };
        }),
      },
    ]);
  }

  const activeEmp = app.employees?.[activeEmpKey];
  const empLogs = activeEmpKey && activeEmp ? (monthExps(activeMK)[`👤 ${activeEmp.name}`] ?? []) : [];

  // ─── MONTH LABEL ───
  function mkLabel(mk: string) {
    const [yr, m] = mk.split('-');
    return `${MONTHS[parseInt(m) - 1]} ${yr}`;
  }

  // ===================== RENDER =====================
  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>الخدام والمصاريف 👷●</Text>
      </View>

      {/* Nav */}
      <View style={s.navRow}>
        <TouchableOpacity style={s.navRed} onPress={() => view === 'detail' ? setView('list') : router.push('/(tabs)/admin')}>
          <Text style={s.navTxt}>{view === 'detail' ? '← رجوع للأشهر' : '← رجوع للإدارة'}</Text>
        </TouchableOpacity>
        {perm.canViewStaff && (
          <TouchableOpacity style={s.navGreen} onPress={() => setSheet('empMgr')}>
            <Text style={s.navTxt}>تدبير الخدام 👷</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ══════════════ MONTH LIST VIEW ══════════════ */}
      {view === 'list' && (
        <ScrollView contentContainerStyle={s.scroll}>
          {/* Add month button */}
          <TouchableOpacity style={s.addMonthBtn} onPress={() => { setPickerM(parseInt(mo)); setPickerY(parseInt(y)); setSheet('addMonth'); }}>
            <Text style={s.addMonthTxt}>+ زيد شهر</Text>
          </TouchableOpacity>

          {/* Month picker inline */}
          {sheet === 'addMonth' && (
            <View style={s.pickerCard}>
              <View style={s.pickerRow}>
                <View style={s.yearBox}><Text style={s.yearTxt}>{pickerY}</Text></View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {MONTHS.map((mn, i) => (
                    <TouchableOpacity key={i} style={[s.monthChip, pickerM === i + 1 && s.monthChipOn]} onPress={() => setPickerM(i + 1)}>
                      <Text style={[s.monthChipTxt, pickerM === i + 1 && { color: '#fff' }]}>{mn}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={s.pickerBtns}>
                <TouchableOpacity style={s.pickerYear} onPress={() => setPickerY(y => y - 1)}><Text style={s.pickerYearTxt}>◄</Text></TouchableOpacity>
                <TouchableOpacity style={s.pickerYear} onPress={() => setPickerY(y => y + 1)}><Text style={s.pickerYearTxt}>►</Text></TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setSheet('none')}><Text style={s.cancelTxt}>إلغاء</Text></TouchableOpacity>
                <TouchableOpacity style={s.confirmBtnIndigo} onPress={addMonth}><Text style={s.confirmTxt}>✅ تأكيد</Text></TouchableOpacity>
              </View>
            </View>
          )}

          {/* Month cards */}
          {[...staffMonths].reverse().map(mk => {
            const exp = getExpenses(mk);
            const inc = getIncome(mk);
            const totalPaid = employees.reduce((s, [, e]) => s + empPaid(mk, e.name), 0);
            const net = inc - exp - totalPaid;
            const isNeg = net < 0;
            return (
              <TouchableOpacity key={mk} style={[s.monthCard, { borderRightColor: isNeg ? '#ef4444' : '#10b981' }]}
                onPress={() => { setActiveMK(mk); setView('detail'); }}>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={s.monthCardDate}>
                    {mkLabel(mk)} {mk === currentMK ? `📅${currentDay}` : ''}
                  </Text>
                  <View style={s.monthCardStats}>
                    <Text style={s.statChip}>{exp} 💵</Text>
                    <Text style={s.statChip}>{inc} 💰</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-start', paddingLeft: 12 }}>
                  <Text style={[s.netAmt, { color: isNeg ? '#ef4444' : '#10b981' }]}>
                    {formatMAD(Math.abs(net))}{isNeg ? '-' : ''}
                  </Text>
                  <Text style={s.netLabel}>الصافي</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* ══════════════ DETAIL VIEW ══════════════ */}
      {view === 'detail' && (() => {
        const exp = getExpenses(activeMK);
        const inc = getIncome(activeMK);
        const totalPaid = employees.reduce((s, [, e]) => s + empPaid(activeMK, e.name), 0);
        const net = inc - exp - totalPaid;
        const mExpsDetail = monthExps(activeMK);

        return (
          <ScrollView contentContainerStyle={s.scroll}>
            <Text style={s.detailDateLabel}>📅 {mkLabel(activeMK)}</Text>

            {/* INCOME */}
            <View style={s.section}>
              <Text style={[s.secTitle, { color: '#16a34a' }]}>الدخل 💰</Text>
              <View style={s.quickRow}>
                {[
                  { label: '🛒 مبيعات', color: '#16a34a', bg: '#dcfce7' },
                  { label: '🛠️ إصلاح',  color: '#7c3aed', bg: '#ede9fe' },
                  { label: '+ أخر',     color: '#64748b', bg: '#f8fafc' },
                ].map(b => (
                  <TouchableOpacity key={b.label} style={[s.qBtn, { backgroundColor: b.bg }]}>
                    <Text style={[s.qBtnTxt, { color: b.color }]}>{b.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {inc === 0 ? <Text style={s.emptyInline}>ما كاين حتى دخل</Text>
                : <View style={s.incRow}><Text style={s.incLabel}>🛒 المبيعات</Text><Text style={s.incVal}>{formatMAD(inc)}</Text></View>}
              <TotalRow label="مجموع الدخل:" val={formatMAD(inc)} color="#16a34a" />
            </View>

            {/* EXPENSES */}
            <View style={s.section}>
              <Text style={[s.secTitle, { color: '#dc2626' }]}>المصاريف 💸</Text>
              {perm.canAddExpense && (
                <View style={s.quickRow}>
                  {EXP_TYPES.map(t => (
                    <TouchableOpacity key={t.key} style={[s.qBtn, { backgroundColor: t.bg }]}
                      onPress={() => { setExpType(t.key as ExpType); setAmount(''); setNote(''); setEditingExpIdx(null); setSheet('addExp'); }}>
                      <Text style={[s.qBtnTxt, { color: t.color }]}>{t.key === 'other' ? '+ أخر' : t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {Object.entries(mExpsDetail).filter(([k]) => !k.startsWith('👤')).map(([type, items]) =>
                items.map((item: any, idx: number) => (
                  <View key={`${type}-${idx}`} style={s.expRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={s.expAmt}>{formatMAD(item.amount)}</Text>
                        <Text style={s.expType}>{type} 📌</Text>
                      </View>
                      {item.note ? <Text style={s.expNote}>{item.note}</Text> : null}
                    </View>
                    {perm.canAddExpense && (
                      <View style={s.expActions}>
                        <TouchableOpacity style={s.expEditBtn} onPress={() => { setAmount(String(item.amount)); setNote(item.note ?? ''); setEditingExpIdx({ type, idx }); setSheet('addExp'); }}>
                          <Text style={s.expEditTxt}>✏️ تعديل</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.expDelBtn} onPress={() => deleteExpense(type, idx)}>
                          <Text style={s.expDelTxt}>🗑️ حذف</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
              <TotalRow label="مجموع المصاريف:" val={formatMAD(exp)} color="#dc2626" />
            </View>

            {/* EMPLOYEES */}
            <View style={s.section}>
              <Text style={[s.secTitle, { color: '#2563eb' }]}>الخدام 👥</Text>
              {employees.length === 0 && <Text style={s.emptyInline}>ما كاين حتى خادم — زيدهم من "تدبير الخدام"</Text>}
              {employees.map(([key, emp]) => {
                const paid = empPaid(activeMK, emp.name);
                const remaining = (emp.salary || 0) - paid;
                return (
                  <View key={key} style={s.empCard}>
                    <View style={s.empTop}>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={s.empName}>{emp.name}</Text>
                        <Text style={s.empSal}>{formatMAD(emp.salary)}/شهر ⚙️</Text>
                      </View>
                      <View style={s.empCircle}><Text style={s.empCircleTxt}>{emp.name.charAt(0).toUpperCase()}</Text></View>
                    </View>
                    <View style={s.empBadges}>
                      <View style={s.badgeG}><Text style={s.badgeGTxt}>{formatMAD(paid)} 💰</Text></View>
                      <View style={s.badgeP}><Text style={s.badgePTxt}>يوم {emp.payday ?? 30} 📅</Text></View>
                    </View>
                    {remaining > 0 && <Text style={s.remaining}>{formatMAD(remaining)} ⏳ متبقي هاد الشهر</Text>}
                    {remaining <= 0 && paid > 0 && <Text style={[s.remaining, { color: '#16a34a' }]}>✅ تم الأداء الكامل</Text>}
                    <View style={s.empBtns4}>
                      {perm.canManageEmployees && ([['daf3a','💰 دفعة','#dcfce7','#16a34a'],['ghiyab','🚫 غياب','#fee2e2','#dc2626'],['salfa','✅ سلفة','#fef9c3','#d97706']] as const).map(([act, lbl, bg, col]) => (
                        <TouchableOpacity key={act} style={[s.empBtn4, { backgroundColor: bg }]}
                          onPress={() => { setActiveEmpKey(key); setEmpAction(act as EmpAction); setAmount(''); setNote(''); setSheet('empAction'); }}>
                          <Text style={[s.empBtn4Txt, { color: col }]}>{lbl}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity style={[s.empBtn4, { backgroundColor: '#ede9fe' }]}
                        onPress={() => { setActiveEmpKey(key); setSheet('empLog'); }}>
                        <Text style={[s.empBtn4Txt, { color: '#7c3aed' }]}>📋 سجل</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* SUMMARY */}
            <View style={[s.section, { borderWidth: 2, borderColor: '#dbeafe' }]}>
              <Text style={[s.secTitle, { color: '#1e293b' }]}>ملخص الشهر 📊</Text>
              <SumRow icon="💰" label="إجمالي الدخل" val={formatMAD(inc)} color="#10b981" />
              <SumRow icon="💸" label="المصاريف"     val={formatMAD(exp)} color="#ef4444" />
              <SumRow icon="👥" label="رواتب"        val={formatMAD(totalPaid)} color="#d97706" />
              <View style={{ height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 }} />
              <SumRow icon={net >= 0 ? '✅' : '⚠️'} label="الصافي"
                val={`${formatMAD(Math.abs(net))}${net < 0 ? '-' : ''}`}
                color={net >= 0 ? '#10b981' : '#ef4444'} big />
            </View>
            <View style={{ height: 100 }} />
          </ScrollView>
        );
      })()}

      {/* ─── ADD MONTH PICKER (only if not inline) ─── */}

      {/* ─── EMPLOYEE MANAGER ─── */}
      <Modal visible={sheet === 'empMgr'} transparent animationType="slide" onRequestClose={() => setSheet('none')}>
        <View style={s.overlay}>
          <View style={[s.sheetBox, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              {perm.canManageEmployees && (
                <TouchableOpacity style={[s.confirmBtnIndigo, { flex: 0, paddingHorizontal: 16, paddingVertical: 10 }]}
                  onPress={() => { setEmpName(''); setEmpSalary(''); setEmpPayday('30'); setSheet('addEmp'); }}>
                  <Text style={s.confirmTxt}>+ زيد خادم</Text>
                </TouchableOpacity>
              )}
              <Text style={s.sheetTitle}>👷 الخدام</Text>
              <TouchableOpacity onPress={() => setSheet('none')}><Text style={{ color: '#ef4444', fontSize: 18, fontWeight: '800' }}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView>
              {employees.length === 0 && <Text style={[s.emptyInline, { textAlign: 'center', paddingVertical: 30 }]}>ما كاين حتى خادم</Text>}
              {employees.map(([key, emp]) => (
                <View key={key} style={s.empMgrRow}>
                  {perm.canManageEmployees && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={[s.expDelBtn, { paddingHorizontal: 12 }]} onPress={() => deleteEmployee(key, emp.name)}>
                        <Text style={s.expDelTxt}>🗑️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.expEditBtn, { paddingHorizontal: 12 }]}
                        onPress={() => { setActiveEmpKey(key); setEmpName(emp.name); setEmpSalary(String(emp.salary)); setEmpPayday(String(emp.payday ?? 30)); setSheet('editEmp'); }}>
                        <Text style={s.expEditTxt}>✏️</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.empName}>{emp.name}</Text>
                    <Text style={s.empSal}>{formatMAD(emp.salary)}/شهر</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── ADD / EDIT EMPLOYEE ─── */}
      <Modal visible={sheet === 'addEmp' || sheet === 'editEmp'} transparent animationType="slide" onRequestClose={() => setSheet('empMgr')}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetBox}>
            <Text style={s.sheetTitle}>{sheet === 'editEmp' ? '✏️ تعديل' : '👷 خادم جديد'}</Text>
            <TextInput style={s.inp} placeholder="الاسم *" value={empName} onChangeText={setEmpName} textAlign="right" autoFocus placeholderTextColor="#9ca3af" />
            <TextInput style={[s.inp, { marginTop: 10 }]} placeholder="الراتب (DH) *" value={empSalary} onChangeText={setEmpSalary} keyboardType="numeric" textAlign="center" placeholderTextColor="#9ca3af" />
            <TextInput style={[s.inp, { marginTop: 10 }]} placeholder="يوم الأداء (مثلاً 30)" value={empPayday} onChangeText={setEmpPayday} keyboardType="numeric" textAlign="center" placeholderTextColor="#9ca3af" />
            <View style={s.btnsRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setSheet('empMgr')}><Text style={s.cancelTxt}>إلغاء</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtnIndigo, { flex: 2 }]} onPress={sheet === 'editEmp' ? editEmployee : addEmployee}><Text style={s.confirmTxt}>💾 حفظ</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── EMPLOYEE ACTION ─── */}
      <Modal visible={sheet === 'empAction'} transparent animationType="slide" onRequestClose={() => setSheet('none')}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetBox}>
            <Text style={s.sheetTitle}>
              {empAction === 'daf3a' ? '💰 دفعة' : empAction === 'ghiyab' ? '🚫 غياب' : '✅ سلفة'}
              {activeEmp ? ` — ${activeEmp.name}` : ''}
            </Text>
            <TextInput style={s.inp} placeholder="المبلغ (DH) *" value={amount} onChangeText={setAmount} keyboardType="numeric" textAlign="center" autoFocus placeholderTextColor="#9ca3af" />
            <TextInput style={[s.inp, { marginTop: 10 }]} placeholder="ملاحظة..." value={note} onChangeText={setNote} textAlign="right" placeholderTextColor="#9ca3af" />
            <View style={s.btnsRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setSheet('none')}><Text style={s.cancelTxt}>إلغاء</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtnIndigo, { flex: 2, backgroundColor: empAction === 'daf3a' ? '#10b981' : empAction === 'ghiyab' ? '#ef4444' : '#d97706' }]} onPress={recordEmpAction}>
                <Text style={s.confirmTxt}>تأكيد</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── EMPLOYEE LOG ─── */}
      <Modal visible={sheet === 'empLog'} transparent animationType="slide" onRequestClose={() => setSheet('none')}>
        <View style={s.overlay}>
          <View style={[s.sheetBox, { maxHeight: '70%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <TouchableOpacity onPress={() => setSheet('none')}><Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 18 }}>✕</Text></TouchableOpacity>
              <Text style={s.sheetTitle}>{activeEmp ? `📋 ${activeEmp.name}` : 'السجل'}</Text>
            </View>
            <ScrollView>
              {empLogs.length === 0
                ? <Text style={[s.emptyInline, { textAlign: 'center', paddingVertical: 30 }]}>ما كاين حتى سجل</Text>
                : [...empLogs].reverse().map((log: any, i: number) => (
                  <View key={i} style={s.logRow}>
                    <Text style={s.logDate}>{log.date}</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.logType}>{log.name}</Text>
                      <Text style={s.logAmt}>{formatMAD(log.amount)}</Text>
                    </View>
                  </View>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── ADD EXPENSE ─── */}
      <Modal visible={sheet === 'addExp'} transparent animationType="slide" onRequestClose={() => { setSheet('none'); setEditingExpIdx(null); }}>
        <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetBox}>
            <Text style={s.sheetTitle}>{editingExpIdx ? '✏️ تعديل مصروف' : '+ مصروف جديد'}</Text>
            {!editingExpIdx && (
              <View style={[s.quickRow, { marginBottom: 12 }]}>
                {EXP_TYPES.map(t => (
                  <TouchableOpacity key={t.key} style={[s.qBtn, { backgroundColor: expType === t.key ? t.color : t.bg }]}
                    onPress={() => setExpType(t.key as ExpType)}>
                    <Text style={[s.qBtnTxt, { color: expType === t.key ? '#fff' : t.color }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TextInput style={s.inp} placeholder="المبلغ (DH) *" value={amount} onChangeText={setAmount} keyboardType="numeric" textAlign="center" autoFocus placeholderTextColor="#9ca3af" />
            <TextInput style={[s.inp, { marginTop: 10 }]} placeholder="ملاحظة (اختياري)..." value={note} onChangeText={setNote} textAlign="right" placeholderTextColor="#9ca3af" />
            <View style={s.btnsRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setSheet('none'); setEditingExpIdx(null); }}><Text style={s.cancelTxt}>إلغاء</Text></TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtnIndigo, { flex: 2, backgroundColor: EXP_TYPES.find(t => t.key === expType)?.color ?? '#6b7280' }]} onPress={addExpense}>
                <Text style={s.confirmTxt}>💾 حفظ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

function TotalRow({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
      <Text style={{ fontSize: 20, fontWeight: '900', color }}>{val}</Text>
      <Text style={{ fontSize: 14, fontWeight: '800', color: '#1e293b' }}>{label}</Text>
    </View>
  );
}

function SumRow({ icon, label, val, color, big }: { icon: string; label: string; val: string; color: string; big?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
      <Text style={{ fontSize: big ? 20 : 16, fontWeight: '900', color }}>{val}</Text>
      <Text style={{ fontSize: big ? 15 : 14, fontWeight: big ? '900' : '700', color: '#64748b' }}>{icon} {label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#fff', paddingVertical: 14, alignItems: 'center', borderBottomLeftRadius: 28, borderBottomRightRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 4, marginBottom: 4 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#1e293b' },
  navRow: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: '#f8fafc' },
  navRed: { flex: 1, backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: 16, alignItems: 'center' },
  navGreen: { flex: 1, backgroundColor: '#10b981', paddingVertical: 12, borderRadius: 16, alignItems: 'center' },
  navTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  scroll: { padding: 14 },

  addMonthBtn: { backgroundColor: '#e0e7ff', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 14 },
  addMonthTxt: { color: '#4338ca', fontSize: 17, fontWeight: '900' },

  pickerCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, elevation: 3 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  yearBox: { backgroundColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  yearTxt: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  monthChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#e2e8f0' },
  monthChipOn: { backgroundColor: '#5c67f2' },
  monthChipTxt: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  pickerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pickerYear: { backgroundColor: '#e2e8f0', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  pickerYearTxt: { fontSize: 16, fontWeight: '800', color: '#5c67f2' },

  monthCard: {
    backgroundColor: '#ffffff', borderRadius: 20, padding: 18, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center',
    borderRightWidth: 5, elevation: 2,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  monthCardDate: { fontSize: 16, fontWeight: '900', color: '#1e293b', marginBottom: 4 },
  monthCardStats: { flexDirection: 'row', gap: 10 },
  statChip: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  netAmt: { fontSize: 20, fontWeight: '900' },
  netLabel: { fontSize: 12, color: '#64748b', fontWeight: '700' },

  detailDateLabel: { fontSize: 16, fontWeight: '800', color: '#5c67f2', textAlign: 'center', marginBottom: 14 },
  section: { backgroundColor: '#ffffff', borderRadius: 20, padding: 16, marginBottom: 12, elevation: 2, borderWidth: 1, borderColor: '#e2e8f0' },
  secTitle: { fontSize: 16, fontWeight: '900', textAlign: 'right', marginBottom: 12 },
  quickRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  qBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  qBtnTxt: { fontSize: 13, fontWeight: '800' },
  emptyInline: { fontSize: 13, color: '#64748b', fontWeight: '700', paddingVertical: 8 },
  incRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  incLabel: { fontSize: 14, color: '#1e293b', fontWeight: '700' },
  incVal: { fontSize: 14, color: '#10b981', fontWeight: '900' },

  expRow: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  expType: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  expAmt: { fontSize: 16, fontWeight: '900', color: '#ef4444' },
  expNote: { fontSize: 12, color: '#64748b', marginTop: 3 },
  expActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  expEditBtn: { flex: 1, backgroundColor: '#eef2ff', paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  expEditTxt: { color: '#5c67f2', fontWeight: '700', fontSize: 13 },
  expDelBtn: { flex: 1, backgroundColor: '#fee2e2', paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  expDelTxt: { color: '#ef4444', fontWeight: '700', fontSize: 13 },

  empCard: { backgroundColor: '#f8fafc', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  empTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  empCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#5c67f2', alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  empCircleTxt: { color: '#fff', fontSize: 20, fontWeight: '900' },
  empName: { fontSize: 15, fontWeight: '900', color: '#1e293b' },
  empSal: { fontSize: 12, color: '#7c3aed', fontWeight: '700', marginTop: 2 },
  empBadges: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  badgeG: { backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeGTxt: { color: '#10b981', fontWeight: '800', fontSize: 13 },
  badgeP: { backgroundColor: '#ede9fe', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgePTxt: { color: '#7c3aed', fontWeight: '800', fontSize: 13 },
  remaining: { fontSize: 12, color: '#d97706', fontWeight: '700', marginBottom: 8, textAlign: 'right' },
  empBtns4: { flexDirection: 'row', gap: 5 },
  empBtn4: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  empBtn4Txt: { fontSize: 11, fontWeight: '800' },
  empMgrRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },

  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheetBox: { backgroundColor: '#ffffff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44 },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: '#1e293b', textAlign: 'right', marginBottom: 16 },
  inp: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, fontSize: 15, color: '#1e293b', backgroundColor: '#f8fafc', fontWeight: '600' },
  btnsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', alignItems: 'center' },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: '#64748b' },
  confirmBtnIndigo: { flex: 2, padding: 14, borderRadius: 14, backgroundColor: '#5c67f2', alignItems: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  logDate: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  logType: { fontSize: 13, fontWeight: '700', color: '#1e293b', textAlign: 'right' },
  logAmt: { fontSize: 15, fontWeight: '900', color: '#5c67f2', marginTop: 2 },
});
