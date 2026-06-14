import { Tabs } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { Redirect } from 'expo-router';

export default function TabsLayout() {
  const auth = useAppStore((s) => s.auth);

  if (!auth) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="admin" options={{ title: 'الإدارة' }} />
      <Tabs.Screen name="credit" options={{ title: 'الكريدي' }} />
      <Tabs.Screen name="index" options={{ title: 'المحل' }} />
      <Tabs.Screen name="report" options={{ href: null }} />
    </Tabs>
  );
}
