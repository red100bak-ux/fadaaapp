import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppStore } from '../store/appStore';

interface Props {
  title: string;
  sub?: string;
  subColor?: string;
  bellBadge?: number;
  onBell?: () => void;
  onBack?: () => void;
  leftAction?: { label: string; onPress: () => void };
  leftAction2?: { label: string; onPress: () => void };
  rightAction?: { label: string; onPress: () => void };
}

export default function AppHeader({ title, sub, subColor, bellBadge = 0, onBell, onBack, leftAction, leftAction2, rightAction }: Props) {
  const auth = useAppStore((s) => s.auth);
  const liveColor = useAppStore((s) => auth?.phone ? s.app.users[auth.phone]?.color : undefined);
  const color = liveColor || auth?.color || '#5c67f2';

  return (
    <View style={[s.bar, { borderColor: color }]}>
      {/* يمين بصريًا (أول في JSX = يمين في RTL): جرس أو زر يمين */}
      <View style={s.bellSide}>
        {onBell ? (
          <TouchableOpacity style={[s.bellWrap, { backgroundColor: color }]} onPress={onBell}>
            <Text style={s.bellIcon}>🔔</Text>
            {bellBadge > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeTxt}>{bellBadge > 99 ? '99+' : bellBadge}</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : rightAction ? (
          <TouchableOpacity style={[s.btn, { borderColor: color }]} onPress={rightAction.onPress}>
            <Text style={[s.btnTxt, { color }]}>{rightAction.label}</Text>
          </TouchableOpacity>
        ) : <View style={s.bellWrap} />}
      </View>

      {/* وسط: العنوان */}
      <View style={s.center}>
        <Text style={[s.title, { color }]} numberOfLines={1}>
          <Text style={{ color }}>● </Text>{title}
        </Text>
        {sub ? <Text style={[s.sub, subColor ? { color: subColor } : null]}>{sub}</Text> : null}
      </View>

      {/* يسار بصريًا (آخر في JSX = يسار في RTL): رجوع أو أزرار */}
      <View style={s.actionSide}>
        {onBack && (
          <TouchableOpacity style={[s.btn, { borderColor: color }]} onPress={onBack}>
            <Text style={[s.btnTxt, { color }]}>{'→'}</Text>
          </TouchableOpacity>
        )}
        {leftAction2 && (
          <TouchableOpacity style={[s.btn, { borderColor: color }]} onPress={leftAction2.onPress}>
            <Text style={[s.btnTxt, { color }]}>{leftAction2.label}</Text>
          </TouchableOpacity>
        )}
        {leftAction && (
          <TouchableOpacity style={[s.btn, { borderColor: color }]} onPress={leftAction.onPress}>
            <Text style={[s.btnTxt, { color }]}>{leftAction.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 18,
    borderWidth: 2,
    backgroundColor: '#ffffff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  bellSide:   { minWidth: 48, alignItems: 'flex-start' },
  center:     { flex: 1, alignItems: 'center' },
  actionSide: { flexDirection: 'row', gap: 6, minWidth: 80, justifyContent: 'flex-end' },
  title:  { fontSize: 16, fontWeight: '900', color: '#1e293b', textAlign: 'center' },
  sub:    { fontSize: 15, color: '#64748b', fontWeight: '700', textAlign: 'center' },
  btn: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btnTxt: { fontWeight: '800', fontSize: 13 },
  bellWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 20 },
  badge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: '#ef4444', borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
});
