import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { Colors, Radii } from '../../src/theme/colors';
import { scheduleReminderNotification, cancelReminderNotification } from '../../src/utils/notificationService';
import AppHeader from '../../src/components/AppHeader';

function fmtDate(d: Date) {
  return d.toLocaleDateString('ar-MA', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' });
}
function isOverdue(dt: string) { return new Date(dt) < new Date(); }

const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'];
const pad = (n: number) => String(n).padStart(2, '0');

function Spinner({ value, onInc, onDec, label }: { value: string; onInc: () => void; onDec: () => void; label: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1, gap: 4 }}>
      <TouchableOpacity onPress={onInc} style={{ padding: 8 }}>
        <Text style={{ fontSize: 20, color: '#9333ea', fontWeight: '900' }}>▲</Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 20, fontWeight: '900', color: '#1e293b', minWidth: 40, textAlign: 'center' }}>{value}</Text>
      <TouchableOpacity onPress={onDec} style={{ padding: 8 }}>
        <Text style={{ fontSize: 20, color: '#9333ea', fontWeight: '900' }}>▼</Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

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
  return (
    <View style={{ gap: 12, marginVertical: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Spinner value={String(value.getFullYear())} onInc={() => adj('year',1)}  onDec={() => adj('year',-1)}  label="سنة" />
        <Spinner value={MONTHS[value.getMonth()]}    onInc={() => adj('month',1)} onDec={() => adj('month',-1)} label="شهر" />
        <Spinner value={pad(value.getDate())}        onInc={() => adj('day',1)}   onDec={() => adj('day',-1)}   label="يوم" />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
        <Spinner value={pad(value.getMinutes())} onInc={() => adj('min',5)}  onDec={() => adj('min',-5)}  label="دقيقة" />
        <View style={{ justifyContent: 'center', paddingBottom: 18 }}><Text style={{ fontSize: 22, fontWeight: '900', color: '#1e293b' }}>:</Text></View>
        <Spinner value={pad(value.getHours())}   onInc={() => adj('hour',1)} onDec={() => adj('hour',-1)} label="ساعة" />
      </View>
    </View>
  );
}

export default function ReminderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { app, updateApp } = useAppStore();
  const reminder = (app.reminders ?? []).find(r => r.id === id);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(reminder?.title ?? '');
  const [note, setNote] = useState(reminder?.note ?? '');
  const [dateObj, setDateObj] = useState(new Date(reminder?.datetime ?? Date.now()));

  if (!reminder) {
    return (
      <SafeAreaView style={s.root}>
        <AppHeader title="تذكير" onBack={() => router.back()} />
        <Text style={{ textAlign: 'center', marginTop: 40, color: '#94a3b8' }}>ما كاين والو</Text>
      </SafeAreaView>
    );
  }

  const overdue = isOverdue(reminder.datetime);

  async function saveEdit() {
    if (!title.trim()) { Alert.alert('', 'أدخل عنوان'); return; }
    const datetime = dateObj.toISOString();
    if (reminder.notifId) cancelReminderNotification(reminder.notifId);
    const notifId = await scheduleReminderNotification(id, title.trim(), datetime) ?? undefined;
    updateApp(prev => ({
      ...prev,
      reminders: (prev.reminders ?? []).map(x => x.id === id ? { ...x, title: title.trim(), note: note.trim(), datetime, notifId } : x),
    }));
    setEditing(false);
  }

  function del() {
    Alert.alert('حذف', 'تمسح هاد التذكير؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'نعم', style: 'destructive', onPress: () => {
        if (reminder.notifId) cancelReminderNotification(reminder.notifId);
        updateApp(prev => ({ ...prev, reminders: (prev.reminders ?? []).filter(x => x.id !== id) }));
        router.back();
      }},
    ]);
  }

  return (
    <SafeAreaView style={s.root}>
      <AppHeader
        title="تذكير 📅"
        onBack={() => router.back()}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">

          {/* Status badge */}
          <View style={[s.badge, { backgroundColor: overdue ? '#fee2e2' : reminder.done ? '#dcfce7' : '#faf5ff' }]}>
            <Text style={[s.badgeTxt, { color: overdue ? '#dc2626' : reminder.done ? '#16a34a' : '#9333ea' }]}>
              {reminder.done ? '✅ مكمل' : overdue ? '⚠️ فات وقته' : '🕐 معلق'}
            </Text>
          </View>

          {/* Title */}
          {editing ? (
            <TextInput style={s.inp} value={title} onChangeText={setTitle}
              placeholder="العنوان *" placeholderTextColor="#94a3b8" autoFocus />
          ) : (
            <Text style={s.titleTxt}>{reminder.title}</Text>
          )}

          {/* Note */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>📝 ملاحظة</Text>
            {editing ? (
              <TextInput style={[s.inp, { minHeight: 100, textAlignVertical: 'top' }]}
                value={note} onChangeText={setNote}
                placeholder="أكتب تفاصيل..." placeholderTextColor="#94a3b8" multiline />
            ) : (
              <Text style={s.noteTxt}>{reminder.note?.trim() ? reminder.note : '—'}</Text>
            )}
          </View>

          {/* Date/time */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>📅 التاريخ والوقت</Text>
            {editing ? (
              <DateTimePick value={dateObj} onChange={setDateObj} />
            ) : (
              <Text style={[s.dateTxt, overdue && { color: '#dc2626' }]}>
                {fmtDate(new Date(reminder.datetime))} — {fmtTime(new Date(reminder.datetime))}
              </Text>
            )}
          </View>

          {!editing ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[s.editBtn, { flex: 1 }]} onPress={() => setEditing(true)}>
                <Text style={s.editTxt}>✏️ تعديل</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.delBtn, { flex: 1 }]} onPress={del}>
                <Text style={s.delTxt}>🗑 حذف</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <TouchableOpacity style={s.saveBtn} onPress={saveEdit}>
                <Text style={s.saveTxt}>✅ حفظ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setEditing(false); setTitle(reminder.title); setNote(reminder.note ?? ''); setDateObj(new Date(reminder.datetime)); }}>
                <Text style={{ color: '#64748b', fontWeight: '700', textAlign: 'center' }}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  badge: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'flex-end' },
  badgeTxt: { fontSize: 14, fontWeight: '800' },
  titleTxt: { fontSize: 24, fontWeight: '900', color: '#1e293b', textAlign: 'right' },
  section: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: '#94a3b8', textAlign: 'right' },
  noteTxt: { fontSize: 16, color: '#334155', textAlign: 'right', lineHeight: 26 },
  dateTxt: { fontSize: 15, fontWeight: '700', color: '#1e293b', textAlign: 'right' },
  inp: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg, padding: 13, fontSize: 15, color: '#1e293b', fontWeight: '600', textAlign: 'right' },
  editBtn: { backgroundColor: '#f5f3ff', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#9333ea' },
  editTxt: { color: '#9333ea', fontWeight: '900', fontSize: 15 },
  saveBtn: { backgroundColor: '#9333ea', borderRadius: 14, padding: 14, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  delBtn: { backgroundColor: '#fee2e2', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#fca5a5' },
  delTxt: { color: '#dc2626', fontWeight: '900', fontSize: 15 },
  cancelBtn: { backgroundColor: '#f1f5f9', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
});
