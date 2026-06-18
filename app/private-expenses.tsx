import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { Colors } from '../src/theme/colors';
import type { PrivateExpense } from '../src/types';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function nowDate() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const CATS = ['أكل', 'نقل', 'ملابس', 'صحة', 'ترفيه', 'أخرى'];

export default function PrivateExpensesScreen() {
  const { app, updateApp } = useAppStore();
  const expenses: PrivateExpense[] = app.privateExpenses ?? [];

  const [modal, setModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [cat, setCat] = useState('أخرى');
  const [editing, setEditing] = useState<PrivateExpense | null>(null);

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  function openAdd() {
    setEditing(null); setAmount(''); setNote(''); setCat('أخرى'); setModal(true);
  }

  function openEdit(e: PrivateExpense) {
    setEditing(e); setAmount(String(e.amount)); setNote(e.note); setCat(e.cat ?? 'أخرى'); setModal(true);
  }

  function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { Alert.alert('', 'أدخل مبلغ صحيح'); return; }
    if (editing) {
      updateApp(prev => ({
        ...prev,
        privateExpenses: (prev.privateExpenses ?? []).map(e =>
          e.id === editing.id ? { ...e, amount: amt, note: note.trim(), cat } : e
        ),
      }));
    } else {
      const entry: PrivateExpense = { id: genId(), amount: amt, note: note.trim(), cat, date: nowDate() };
      updateApp(prev => ({ ...prev, privateExpenses: [entry, ...(prev.privateExpenses ?? [])] }));
    }
    setModal(false);
  }

  function del(id: string) {
    Alert.alert('حذف', 'تمسح هاد المصروف؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'نعم', style: 'destructive', onPress: () =>
        updateApp(prev => ({ ...prev, privateExpenses: (prev.privateExpenses ?? []).filter(e => e.id !== id) }))
      },
    ]);
  }

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={openAdd} style={s.addBtn}>
          <Text style={s.addTxt}>+ إضافة</Text>
        </TouchableOpacity>
        <Text style={s.title}>💰 مصاريف خاصة</Text>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>{'→'}</Text>
        </TouchableOpacity>
      </View>

      {/* Total */}
      <View style={s.totalCard}>
        <Text style={s.totalLabel}>المجموع</Text>
        <Text style={s.totalVal}>{total.toFixed(2)} د</Text>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>💸</Text>
            <Text style={{ color: '#94a3b8', marginTop: 8 }}>لا توجد مصاريف</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardNote}>{item.note || '—'}</Text>
              <Text style={s.cardMeta}>{item.cat} · {item.date}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={s.cardAmt}>{item.amount} د</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => openEdit(item)}>
                  <Text style={{ fontSize: 16 }}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => del(item.id)}>
                  <Text style={{ fontSize: 16 }}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

      {/* Modal */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setModal(false)}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={s.sheet}>
                <Text style={s.sheetTitle}>{editing ? 'تعديل' : 'إضافة'} مصروف</Text>
                <TextInput
                  style={s.input}
                  placeholder="المبلغ"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                  textAlign="right"
                />
                <TextInput
                  style={s.input}
                  placeholder="ملاحظة (اختياري)"
                  placeholderTextColor="#94a3b8"
                  value={note}
                  onChangeText={setNote}
                  textAlign="right"
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                  {CATS.map(c => (
                    <TouchableOpacity key={c} onPress={() => setCat(c)}
                      style={[s.catChip, cat === c && s.catChipActive]}>
                      <Text style={[s.catTxt, cat === c && { color: '#fff' }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setModal(false)}>
                    <Text style={s.cancelTxt}>إلغاء</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.confirmBtn} onPress={save}>
                    <Text style={s.confirmTxt}>حفظ</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backBtn: { padding: 4 },
  backTxt: { fontSize: 20, color: Colors.text, fontWeight: '800' },
  title: { fontSize: 17, fontWeight: '900', color: '#1e293b' },
  addBtn: { backgroundColor: '#dc2626', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  addTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  totalCard: { margin: 16, backgroundColor: '#dc2626', borderRadius: 16, padding: 20, alignItems: 'center' },
  totalLabel: { color: '#fca5a5', fontSize: 13, fontWeight: '700' },
  totalVal: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  cardNote: { fontSize: 14, fontWeight: '800', color: '#1e293b', textAlign: 'right' },
  cardMeta: { fontSize: 12, color: '#94a3b8', marginTop: 3, textAlign: 'right' },
  cardAmt: { fontSize: 18, fontWeight: '900', color: '#dc2626' },
  empty: { alignItems: 'center', marginTop: 80 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, gap: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '900', color: '#1e293b', textAlign: 'center', marginBottom: 4 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 14, fontSize: 15, color: '#1e293b' },
  catChip: { backgroundColor: '#f1f5f9', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  catChipActive: { backgroundColor: '#dc2626' },
  catTxt: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  cancelBtn: { flex: 1, backgroundColor: '#f1f5f9', padding: 14, borderRadius: 12, alignItems: 'center' },
  cancelTxt: { color: '#64748b', fontWeight: '800' },
  confirmBtn: { flex: 1, backgroundColor: '#dc2626', padding: 14, borderRadius: 12, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontWeight: '800' },
});
