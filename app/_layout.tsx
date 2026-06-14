import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initFirebase } from '../src/firebase/config';
import { loadAppData } from '../src/firebase/firestore';
import { useAppStore } from '../src/store/appStore';
import {
  setupNotifications,
  scheduleCheckNotifications,
  scheduleSalaryNotifications,
} from '../src/utils/notificationService';
import BottomNav from '../src/components/BottomNav';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

export default function RootLayout() {
  const { setApp, loadSavedAuth, startListening, auth } = useAppStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      await initFirebase();
      await loadSavedAuth();

      const data = await loadAppData();
      if (data) {
        setApp(data);
        try {
          const granted = await setupNotifications();
          if (granted) {
            scheduleCheckNotifications(data.supplierCredit ?? {}).catch(() => {});
            scheduleSalaryNotifications(data.employees ?? {}).catch(() => {});
          }
        } catch {}
      }

      startListening();
      setReady(true);
    }
    bootstrap();
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="folder/[id]" />
        <Stack.Screen name="customer/[id]" />
        <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
        <Stack.Screen name="suppliers" />
        <Stack.Screen name="repair" />
        <Stack.Screen name="staff" />
      </Stack>

      {auth && <BottomNav />}
    </SafeAreaProvider>
  );
}
