import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

const BTNS = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '⌫', '='],
];

export default function CalculatorScreen() {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState('');
  const [op, setOp] = useState('');
  const [fresh, setFresh] = useState(false);

  function press(key: string) {
    if (key === 'C') { setDisplay('0'); setPrev(''); setOp(''); setFresh(false); return; }
    if (key === '⌫') { setDisplay(d => d.length > 1 ? d.slice(0, -1) : '0'); return; }
    if (key === '±') { setDisplay(d => d.startsWith('-') ? d.slice(1) : '-' + d); return; }
    if (key === '%') { setDisplay(d => String(parseFloat(d) / 100)); return; }

    if (['÷', '×', '−', '+'].includes(key)) {
      setPrev(display);
      setOp(key);
      setFresh(true);
      return;
    }

    if (key === '=') {
      if (!op || !prev) return;
      const a = parseFloat(prev), b = parseFloat(display);
      let res = 0;
      if (op === '+') res = a + b;
      if (op === '−') res = a - b;
      if (op === '×') res = a * b;
      if (op === '÷') res = b !== 0 ? a / b : 0;
      const str = parseFloat(res.toFixed(8)).toString();
      setDisplay(str);
      setPrev(''); setOp(''); setFresh(false);
      return;
    }

    if (key === '.') {
      if (fresh) { setDisplay('0.'); setFresh(false); return; }
      if (display.includes('.')) return;
      setDisplay(d => d + '.');
      return;
    }

    if (fresh) { setDisplay(key); setFresh(false); return; }
    setDisplay(d => d === '0' ? key : d + key);
  }

  const isOp = (k: string) => ['÷', '×', '−', '+'].includes(k);

  return (
    <SafeAreaView style={st.root}>
      <View style={st.topBar}>
        <View style={{ width: 36 }} />
        <Text style={st.title}>حسابات 🧮</Text>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/admin')}>
          <Text style={st.back}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={st.displayWrap}>
        {op ? <Text style={st.opIndicator}>{prev} {op}</Text> : null}
        <Text style={st.display} numberOfLines={1} adjustsFontSizeToFit>{display}</Text>
      </View>

      <View style={st.grid}>
        {BTNS.map((row, i) => (
          <View key={i} style={st.row}>
            {row.map(key => (
              <TouchableOpacity
                key={key}
                style={[
                  st.btn,
                  key === '=' && { backgroundColor: '#10b981' },
                  isOp(key) && { backgroundColor: '#f59e0b' },
                  key === 'C' && { backgroundColor: '#ef4444' },
                  key === '0' && { flex: 2 },
                ]}
                onPress={() => press(key)}
                activeOpacity={0.75}
              >
                <Text style={[st.btnTxt, (key === '=' || isOp(key) || key === 'C') && { color: '#fff' }]}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  back: { fontSize: 22, color: '#94a3b8', fontWeight: '800' },
  title: { fontSize: 18, fontWeight: '900', color: '#fff' },
  displayWrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: 16 },
  opIndicator: { fontSize: 18, color: '#64748b', textAlign: 'right', marginBottom: 4 },
  display: { fontSize: 72, fontWeight: '300', color: '#fff', textAlign: 'right' },
  grid: { padding: 12, gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, aspectRatio: 1, borderRadius: 999, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' },
  btnTxt: { fontSize: 26, fontWeight: '500', color: '#e2e8f0' },
});
