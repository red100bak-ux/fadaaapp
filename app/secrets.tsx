import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import type { Secret } from '../src/types';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

export default function SecretsScreen() {
  const { app, updateApp } = useAppStore();
  const secrets: Secret[] = app.secrets ?? [];

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Secret | null>(null);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  function openAdd() {
    setEditing(null); setLabel(''); setValue(''); setNote(''); setModal(true);
  }

  function openEdit(s: Secret) {
    setEditing(s); setLabel(s.label); setValue(s.value); setNote(s.note ?? ''); setModal(true);
  }

  function save() {
    if (!label.trim() || !value.trim()) { Alert.alert('', 'أدخل التسمية والقيمة'); return; }
    if (editing) {
      updateApp(prev => ({
        ...prev,
        secrets: (prev.secrets ?? []).map(s =>
          s.id === editing.id ? { ...s, label: label.trim(), value: value.trim(), note: note.trim() } : s
        ),
      }));
    } else {
      const entry: Secret = { id: genId(), label: label.trim(), value: value.trim(), note: note.trim(), createdAt: new Date().toISOString() };
      updateApp(prev => ({ ...prev, secrets: [entry, ...(prev.secrets ?? [])] }));
    }
    setModal(false);
  }

  function del(id: string) {
    Alert.alert('حذف', 'تمسح هاد السر؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'نعم', style: 'destructive', onPress: () =>
        updateApp(prev => ({ ...prev, secrets: (prev.secrets ?? []).filter(s => s.id !== id) }))
      },
    ]);
  }

  function copy(val: string) {
    Clipboard.setString(val);
    Alert.alert('', '✅ تم النسخ');
  }

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={openAdd} style={s.addBtn}>
          <Text style={s.addTxt}>+ إضافة</Text>
        </TouchableOpacity>
        <Text style={s.title}>🔐 أسرار وأكواد</Text>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backTxt}>{'→'}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={secrets}
        keyExtractor={s => s.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>🔒</Text>
            <Text style={{ color: '#94a3b8', marginTop: 8 }}>لا توجد أسرار محفوظة</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => openEdit(item)}>
                  <Text style={{ fontSize: 16 }}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => del(item.id)}>
                  <Text style={{ fontSize: 16 }}>🗑️</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.cardLabel}>{item.label}</Text>
            </View>
            {/* Value row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f1f5f9', borderRadius: 10, padding: 10 }}>
              <TouchableOpacity onPress={() => copy(item.value)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 16 }}>📋</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setRevealed(r => ({ ...r, [item.id]: !r[item.id] }))} style={{ padding: 4 }}>
                <Text style={{ fontSize: 16 }}>{revealed[item.id] ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
              <Text style={[s.cardVal, { flex: 1 }]} numberOfLines={revealed[item.id] ? undefined : 1}>
                {revealed[item.id] ? item.value : '••••••••••••'}
              </Text>
            </View>
            {item.note ? <Text style={s.cardNote}>{item.note}</Text> : null}
          </View>
        )}
      />

      {/* Modal */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setModal(false)}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={s.sheet}>
                <Text style={s.sheetTitle}>{editing ? 'تعديل' : 'إضافة'} سر أو كود</Text>
                <TextInput
                  style={s.input}
                  placeholder="التسمية (مثال: API key GitHub)"
                  placeholderTextColor="#94a3b8"
                  value={label}
                  onChangeText={setLabel}
                  textAlign="right"
                />
                <TextInput
                  style={[s.input, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}
                  placeholder="القيمة / الكود"
                  placeholderTextColor="#94a3b8"
                  value={value}
                  onChangeText={setValue}
                  textAlign="right"
                  multiline
                />
                <TextInput
                  style={s.input}
                  placeholder="ملاحظة (اختياري)"
                  placeholderTextColor="#94a3b8"
                  value={note}
                  onChangeText={setNote}
                  textAlign="right"
                />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
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
  backTxt: { fontSize: 20, color: '#1e293b', fontWeight: '800' },
  title: { fontSize: 17, fontWeight: '900', color: '#1e293b' },
  addBtn: { backgroundColor: '#7c3aed', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  addTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  cardLabel: { fontSize: 15, fontWeight: '900', color: '#1e293b' },
  cardVal: { fontSize: 14, fontWeight: '700', color: '#7c3aed', textAlign: 'right' },
  cardNote: { fontSize: 12, color: '#94a3b8', marginTop: 8, textAlign: 'right' },
  empty: { alignItems: 'center', marginTop: 80 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, gap: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '900', color: '#1e293b', textAlign: 'center', marginBottom: 4 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 14, fontSize: 15, color: '#1e293b' },
  cancelBtn: { flex: 1, backgroundColor: '#f1f5f9', padding: 14, borderRadius: 12, alignItems: 'center' },
  cancelTxt: { color: '#64748b', fontWeight: '800' },
  confirmBtn: { flex: 1, backgroundColor: '#7c3aed', padding: 14, borderRadius: 12, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontWeight: '800' },
});
