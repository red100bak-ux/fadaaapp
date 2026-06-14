import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TABS = [
  { route: '/(tabs)/admin', label: 'الإدارة', icon: '⚙️' },
  { route: '/(tabs)/credit', label: 'الكريدي', icon: '📒' },
  { route: '/(tabs)', label: 'المحل', icon: '🏠' },
] as const;

export default function BottomNav() {
  const path = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.wrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={s.bar}>
        {TABS.map((tab) => {
          const active =
            path === tab.route ||
            (tab.route === '/(tabs)' && (path === '/' || path === '/(tabs)/index'));
          return (
            <TouchableOpacity
              key={tab.route}
              style={s.tab}
              onPress={() => router.push(tab.route as any)}
              activeOpacity={0.7}
            >
              <Text style={s.icon}>{tab.icon}</Text>
              <Text style={[s.label, active && s.labelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: '5%',
    paddingTop: 4,
    zIndex: 999,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 24,
    height: 68,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  icon: { fontSize: 22 },
  label: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  labelActive: { color: '#5c67f2' },
});
