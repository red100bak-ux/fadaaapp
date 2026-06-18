import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export interface AppAlertButton {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
}

interface Props {
  visible: boolean;
  icon?: string;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  onDismiss?: () => void;
}

export default function AppAlert({ visible, icon, title, message, buttons, onDismiss }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={s.overlay}>
        <View style={s.card}>
          {icon ? <Text style={s.icon}>{icon}</Text> : null}
          <Text style={s.title}>{title}</Text>
          {message ? <Text style={s.msg}>{message}</Text> : null}
          <View style={[s.btns, buttons.length === 1 && { justifyContent: 'center' }]}>
            {buttons.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  s.btn,
                  btn.primary ? s.btnPrimary : btn.danger ? s.btnDanger : s.btnCancel,
                  buttons.length === 1 && { flex: 1 },
                ]}
                onPress={btn.onPress}
                activeOpacity={0.82}
              >
                <Text style={[s.btnTxt, (btn.primary || btn.danger) ? s.btnTxtLight : s.btnTxtRed]}>
                  {btn.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.48)',
    padding: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 18,
  },
  icon: { fontSize: 48, marginBottom: 12 },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1e293b',
    marginBottom: 10,
    textAlign: 'center',
  },
  msg: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 24,
  },
  btns: { flexDirection: 'row', gap: 12, width: '100%' },
  btn: { flex: 1, paddingVertical: 16, borderRadius: 18, alignItems: 'center' },
  btnPrimary: { flex: 2, backgroundColor: '#10b981' },
  btnDanger:  { flex: 2, backgroundColor: '#ef4444' },
  btnCancel:  { backgroundColor: '#f1f5f9' },
  btnTxt:     { fontSize: 15, fontWeight: '800' },
  btnTxtLight:{ color: '#fff' },
  btnTxtRed:  { color: '#ef4444' },
});
