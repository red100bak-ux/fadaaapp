import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { Colors, Radii } from '../src/theme/colors';
import type { Note } from '../src/types';
import AppHeader from '../src/components/AppHeader';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

function nowStr() {
  return new Date().toLocaleDateString('ar-MA', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function NotesScreen() {
  const { app, updateApp } = useAppStore();
  const notes: Note[] = app.notes ?? [];

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [viewNote, setViewNote] = useState<Note | null>(null);

  function openAdd() {
    setEditing(null); setTitle(''); setContent(''); setSheetUrl(''); setModal(true);
  }

  function openEdit(n: Note) {
    setEditing(n); setTitle(n.title); setContent(n.content); setSheetUrl((n as any).sheetUrl ?? ''); setModal(true);
  }

  function save() {
    const t = title.trim();
    if (!t) { Alert.alert('', 'أدخل عنوان الملاحظة'); return; }
    if (editing) {
      updateApp(prev => ({
        ...prev,
        notes: (prev.notes ?? []).map(n => n.id === editing.id
          ? { ...n, title: t, content: content.trim(), sheetUrl: sheetUrl.trim() } as any
          : n
        ),
      }));
    } else {
      const entry = { id: genId(), title: t, content: content.trim(), sheetUrl: sheetUrl.trim(), createdAt: new Date().toISOString() };
      updateApp(prev => ({ ...prev, notes: [entry as any, ...(prev.notes ?? [])] }));
    }
    setModal(false);
  }

  function del(id: string) {
    Alert.alert('حذف', 'تمسح هاد الملاحظة؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'نعم', style: 'destructive', onPress: () =>
        updateApp(prev => ({ ...prev, notes: (prev.notes ?? []).filter(n => n.id !== id) }))
      },
    ]);
  }

  function openSheet(url: string) {
    if (!url) return;
    Linking.openURL(url).catch(() => Alert.alert('', 'ما قدرناش نفتح الرابط'));
  }

  return (
    <SafeAreaView style={st.root}>
      <AppHeader
        title="ملاحظات 📝"
        onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/admin')}
        rightAction={{ label: '+ إضافة', onPress: openAdd }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
        {notes.length === 0 && (
          <Text style={st.empty}>ما كاين والو — زد ملاحظة جديدة ⬆️</Text>
        )}
        {notes.map(n => (
          <TouchableOpacity key={n.id} style={st.card} onPress={() => setViewNote(n)} activeOpacity={0.85}>
            <View style={{ flex: 1 }}>
              <Text style={st.cardTitle}>{n.title}</Text>
              {n.content ? <Text style={st.cardContent} numberOfLines={2}>{n.content}</Text> : null}
              {(n as any).sheetUrl ? (
                <TouchableOpacity style={st.sheetChip} onPress={() => openSheet((n as any).sheetUrl)}>
                  <Text style={st.sheetChipTxt}>📊 Google Sheets</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={st.cardDate}>{nowStr()}</Text>
            </View>
            <View style={{ gap: 10, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => openEdit(n)}>
                <Text style={{ fontSize: 18 }}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => del(n.id)}>
                <Text style={{ fontSize: 18 }}>🗑</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Add / Edit modal */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView style={st.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}>
            <View style={st.sheet}>
              <Text style={st.sheetTitle}>{editing ? 'تعديل ملاحظة ✏️' : 'ملاحظة جديدة 📝'}</Text>

              <Text style={st.label}>العنوان *</Text>
              <TextInput style={st.input} value={title} onChangeText={setTitle} placeholder="عنوان الملاحظة" placeholderTextColor="#94a3b8" autoFocus />

              <Text style={st.label}>المحتوى</Text>
              <TextInput
                style={[st.input, { height: 100, textAlignVertical: 'top' }]}
                value={content} onChangeText={setContent}
                placeholder="اكتب هنا..." placeholderTextColor="#94a3b8" multiline
              />

              <Text style={st.label}>رابط Google Sheets (اختياري)</Text>
              <TextInput
                style={st.input} value={sheetUrl} onChangeText={setSheetUrl}
                placeholder="https://docs.google.com/spreadsheets/..."
                placeholderTextColor="#94a3b8"
                keyboardType="url" autoCapitalize="none"
              />
              {sheetUrl.trim() ? (
                <TouchableOpacity style={st.testLink} onPress={() => openSheet(sheetUrl.trim())}>
                  <Text style={st.testLinkTxt}>📊 افتح الـ Sheet للتأكد</Text>
                </TouchableOpacity>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                <TouchableOpacity style={st.cancelBtn} onPress={() => setModal(false)}>
                  <Text style={{ color: '#64748b', fontWeight: '700' }}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.saveBtn} onPress={save}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>✅ حفظ</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* View note modal */}
      <Modal visible={!!viewNote} transparent animationType="fade" onRequestClose={() => setViewNote(null)}>
        <TouchableOpacity style={st.overlay} activeOpacity={1} onPress={() => setViewNote(null)}>
          {viewNote && (
            <View style={[st.sheet, { margin: 20, borderRadius: 24 }]}>
              <Text style={[st.sheetTitle, { marginBottom: 12 }]}>{viewNote.title}</Text>
              {viewNote.content ? <Text style={{ fontSize: 15, color: '#334155', lineHeight: 24, textAlign: 'right', marginBottom: 14 }}>{viewNote.content}</Text> : null}
              {(viewNote as any).sheetUrl ? (
                <TouchableOpacity style={[st.saveBtn, { marginTop: 4 }]} onPress={() => { openSheet((viewNote as any).sheetUrl); setViewNote(null); }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>📊 فتح Google Sheets</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: 18, fontWeight: '900', color: '#1e293b' },
  back: { fontSize: 20, color: '#94a3b8', fontWeight: '800', paddingHorizontal: 6 },
  addBtn: { backgroundColor: '#0284c7', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  empty: { textAlign: 'center', color: '#94a3b8', fontSize: 15, marginTop: 60 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1.5, borderColor: Colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b', textAlign: 'right', marginBottom: 4 },
  cardContent: { fontSize: 13, color: '#64748b', textAlign: 'right', lineHeight: 20, marginBottom: 6 },
  cardDate: { fontSize: 11, color: '#cbd5e1', textAlign: 'right', marginTop: 6 },
  sheetChip: { backgroundColor: '#f0fdf4', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-end', borderWidth: 1, borderColor: '#86efac', marginBottom: 4 },
  sheetChipTxt: { fontSize: 12, fontWeight: '800', color: '#15803d' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: '#1e293b', textAlign: 'right' },
  label: { fontSize: 13, color: '#64748b', fontWeight: '700', textAlign: 'right', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg, padding: 13, fontSize: 15, color: '#1e293b', fontWeight: '600', textAlign: 'right' },
  testLink: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 10, alignItems: 'center', marginTop: 6, borderWidth: 1, borderColor: '#86efac' },
  testLinkTxt: { color: '#15803d', fontWeight: '800', fontSize: 13 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: Radii.lg, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  saveBtn: { flex: 2, padding: 14, borderRadius: Radii.lg, backgroundColor: '#0284c7', alignItems: 'center' },
});
