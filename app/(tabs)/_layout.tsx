import { Tabs } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { Redirect } from 'expo-router';

export default function TabsLayout() {
  const auth = useAppStore((s) => s.auth);
  const liveColor = useAppStore((s) => auth?.phone ? s.app.users[auth.phone]?.color : undefined);

  if (!auth) return <Redirect href="/(auth)/login" />;

  const bgColor = (liveColor || auth.color) ? (liveColor || auth.color) + '15' : '#f8fafc';

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' }, sceneStyle: { backgroundColor: bgColor } }}>
      <Tabs.Screen name="admin" options={{ title: 'الإدارة' }} />
      <Tabs.Screen name="credit" options={{ title: 'الكريدي' }} />
      <Tabs.Screen name="index" options={{ title: 'المحل' }} />
      <Tabs.Screen name="report" options={{ href: null }} />
    </Tabs>
  );
}
