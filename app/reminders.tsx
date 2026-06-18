import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, KeyboardAvoidingView, Platform, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { Colors, Radii } from '../src/theme/colors';
import { scheduleReminderNotification, cancelReminderNotification } from '../src/utils/notificationService';
import type { Reminder } from '../src/types';
import AppHeader from '../src/components/AppHeader';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

function fmtDate(d: Date) {
  return d.toLocaleDateString('ar-MA', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' });
}
function isOverdue(dt: string) { return new Date(dt) < new Date(); }

// ─── Pure-JS date/time picker ──────────────────────────────────────────────
function Spinner({ value, onInc, onDec, label }: { value: string; onInc: () => void; onDec: () => void; label: string }) {
  return (
    <View style={sp.wrap}>
      <TouchableOpacity onPress={onInc} style={sp.arrow}><Text style={sp.arrowTxt}>▲</Text></TouchableOpacity>
      <Text style={sp.val}>{value}</Text>
      <TouchableOpacity onPress={onDec} style={sp.arrow}><Text style={sp.arrowTxt}>▼</Text></TouchableOpacity>
      <Text style={sp.lbl}>{label}</Text>
    </View>
  );
}
const sp = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6, flex: 1 },
  arrow: { padding: 8 },
  arrowTxt: { fontSize: 20, color: '#9333ea', fontWeight: '900' },
  val: { fontSize: 22, fontWeight: '900', color: '#1e293b', minWidth: 40, textAlign: 'center' },
  lbl: { fontSize: 11, color: '#94a3b8', fontWeight: '700' },
});

function DateTimePick({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  function adj(field: string, delta: number) {
    const d = new Date(value);
    if (field === 'day')   d.setDate(d.getDate() + delta);
    if (field === 'month') d.setMonth(d.getMonth() + delta);
    if (field === 'year')  d.setFullYear(d.getFullYear() + delta);
    if (field === 'hour')  d.setHours((d.getHours() + delta + 24) % 24);
    if (field === 'min')   d.setMinutes((d.getMinutes() + delta + 60) % 60);
    onChange(d);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  return (
    <View style={{ gap: 12, marginVertical: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Spinner value={String(value.getFullYear())}     onInc={() => adj('year',1)}  onDec={() => adj('year',-1)}  label="سنة" />
        <Spinner value={MONTHS[value.getMonth()]}        onInc={() => adj('month',1)} onDec={() => adj('month',-1)} label="شهر" />
        <Spinner value={pad(value.getDate())}            onInc={() => adj('day',1)}   onDec={() => adj('day',-1)}   label="يوم" />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
        <Spinner value={pad(value.getMinutes())} onInc={() => adj('min',5)}  onDec={() => adj('min',-5)}  label="دقيقة" />
        <View style={{ justifyContent: 'center', paddingBottom: 18 }}><Text style={{ fontSize: 22, fontWeight: '900', color: '#1e293b' }}>:</Text></View>
        <Spinner value={pad(value.getHours())}   onInc={() => adj('hour',1)} onDec={() => adj('hour',-1)} label="ساعة" />
      </View>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────
export default function RemindersScreen() {
  const { app, updateApp } = useAppStore();
  const reminders: Reminder[] = app.reminders ?? [];

  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [dateObj, setDateObj] = useState(new Date());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function tapReminder(id: string) {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) {
      updateApp(prev => ({
        ...prev,
        reminders: (prev.reminders ?? []).map(x => x.id === id ? { ...x, read: true } : x),
      }));
    }
  }

  function openAdd() { setTitle(''); setNote(''); setDateObj(new Date()); setEditingId(null); setModal(true); }

  function openEdit(r: Reminder) {
    setTitle(r.title);
    setNote(r.note ?? '');
    setDateObj(new Date(r.datetime));
    setEditingId(r.id);
    setModal(true);
  }

  async function save() {
    if (!title.trim()) { Alert.alert('', 'أدخل عنوان التذكير'); return; }
    const datetime = dateObj.toISOString();
    if (editingId) {
      const r = reminders.find(x => x.id === editingId);
      if (r?.notifId) cancelReminderNotification(r.notifId);
      const notifId = await scheduleReminderNotification(editingId, title.trim(), datetime) ?? undefined;
      updateApp(prev => ({
        ...prev,
        reminders: (prev.reminders ?? []).map(x => x.id === editingId ? { ...x, title: title.trim(), note: note.trim(), datetime, notifId } : x),
      }));
    } else {
      const id = genId();
      const notifId = await scheduleReminderNotification(id, title.trim(), datetime) ?? undefined;
      const entry: Reminder = { id, title: title.trim(), note: note.trim(), datetime, done: false, notifId };
      updateApp(prev => ({ ...prev, reminders: [entry, ...(prev.reminders ?? [])] }));
    }
    setModal(false);
  }

  function toggleDone(id: string) {
    const r = reminders.find(x => x.id === id);
    if (r && !r.done && r.notifId) cancelReminderNotification(r.notifId);
    updateApp(prev => ({
      ...prev,
      reminders: (prev.reminders ?? []).map(x => x.id === id ? { ...x, done: !x.done } : x),
    }));
  }

  function del(id: string) {
    const r = reminders.find(x => x.id === id);
    Alert.alert('حذف', 'تمسح هاد التذكير؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'نعم', style: 'destructive', onPress: () => {
        if (r?.notifId) cancelReminderNotification(r.notifId);
        updateApp(prev => ({ ...prev, reminders: (prev.reminders ?? []).filter(x => x.id !== id) }));
      }},
    ]);
  }

  const pending = [...reminders.filter(r => !r.done)].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const done = reminders.filter(r => r.done);

  return (
    <SafeAreaView style={st.root}>
      <AppHeader
        title="تذكير 📅"
        onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/admin')}
        leftAction={{ label: '+ إضافة', onPress: openAdd }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
        {pending.length === 0 && done.length === 0 && (
          <Text style={st.empty}>ما كاين والو — زد تذكير جديد ⬆️</Text>
        )}
        {pending.map(r => {
          const expanded = expandedId === r.id;
          const overdue = isOverdue(r.datetime);
          return (
            <TouchableOpacity key={r.id} activeOpacity={0.85}
              style={[st.card, overdue && st.cardOverdue, !r.read && st.cardUnread]}
              onPress={() => { tapReminder(r.id); router.push(`/reminder/${r.id}`); }}
            >
              <TouchableOpacity style={st.doneBtn} onPress={() => toggleDone(r.id)}>
                <Text style={st.doneBtnTxt}>✓</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {!r.read && <View style={st.unreadDot} />}
                  <Text style={st.cardTitle}>{r.title}</Text>
                </View>
                <Text style={[st.cardDate, overdue && { color: '#dc2626' }]}>
                  {overdue ? '⚠️ ' : '🕐 '}
                  {fmtDate(new Date(r.datetime))} — {fmtTime(new Date(r.datetime))}
                </Text>
              </View>
              <View style={{ gap: 8, alignItems: 'center' }}>
                <TouchableOpacity onPress={() => router.push(`/reminder/${r.id}`)}>
                  <Text style={{ fontSize: 22, color: '#9333ea' }}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => del(r.id)}>
                  <Text style={{ fontSize: 22, color: '#94a3b8' }}>🗑</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
        {done.length > 0 && (
          <>
            <Text style={st.sectionLabel}>مكملة ✅</Text>
            {done.map(r => (
              <View key={r.id} style={[st.card, { opacity: 0.55 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.cardTitle, { color: '#94a3b8', textDecorationLine: 'line-through' }]}>{r.title}</Text>
                  <Text style={[st.cardDate, { color: '#94a3b8' }]}>{fmtDate(new Date(r.datetime))} — {fmtTime(new Date(r.datetime))}</Text>
                </View>
                <View style={{ gap: 8, alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => toggleDone(r.id)}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#9333ea', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>↩</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => del(r.id)}>
                    <Text style={{ fontSize: 16, color: '#94a3b8' }}>🗑</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView style={st.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={st.sheet}>
            <Text style={st.sheetTitle}>{editingId ? 'تعديل التذكير ✏️' : 'تذكير جديد 📅'}</Text>
            <Text style={st.label}>العنوان *</Text>
            <TextInput
              style={st.input} value={title} onChangeText={setTitle}
              placeholder="مثال: دفع المورد" placeholderTextColor="#94a3b8" autoFocus
            />
            <Text style={st.label}>ملاحظة</Text>
            <TextInput
              style={[st.input, { minHeight: 70, textAlignVertical: 'top' }]}
              value={note} onChangeText={setNote}
              placeholder="تفاصيل إضافية..." placeholderTextColor="#94a3b8"
              multiline
            />
            <Text style={st.label}>التاريخ والوقت</Text>
            <DateTimePick value={dateObj} onChange={setDateObj} />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setModal(false)}>
                <Text style={{ color: '#64748b', fontWeight: '700' }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.saveBtn} onPress={save}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>✅ حفظ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: 18, fontWeight: '900', color: '#1e293b' },
  back: { fontSize: 20, color: '#94a3b8', fontWeight: '800', paddingHorizontal: 6 },
  addBtn: { backgroundColor: '#9333ea', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  empty: { textAlign: 'center', color: '#94a3b8', fontSize: 15, marginTop: 60 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardOverdue: { borderColor: '#fca5a5', backgroundColor: '#fff5f5' },
  cardUnread: { borderColor: '#9333ea', borderWidth: 2, backgroundColor: '#faf5ff' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#9333ea' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b', textAlign: 'right', marginBottom: 4 },
  cardDate: { fontSize: 12, color: '#64748b', fontWeight: '600', textAlign: 'right' },
  doneBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  doneBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: '#94a3b8', textAlign: 'right', marginTop: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: '#1e293b', textAlign: 'right', marginBottom: 16 },
  label: { fontSize: 13, color: '#64748b', fontWeight: '700', textAlign: 'right', marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg, padding: 13, fontSize: 15, color: '#1e293b', marginBottom: 12, fontWeight: '600', textAlign: 'right' },
  cancelBtn: { flex: 1, padding: 14, borderRadius: Radii.lg, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  saveBtn: { flex: 2, padding: 14, borderRadius: Radii.lg, backgroundColor: '#9333ea', alignItems: 'center' },
});
