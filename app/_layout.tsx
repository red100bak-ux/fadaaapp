import { useEffect, useRef, Component } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nManager, View, Text, ScrollView, StyleSheet, AppState, AppStateStatus, BackHandler, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initFirebase } from '../src/firebase/config';
import { useAppStore } from '../src/store/appStore';
import {
  setupNotifications,
  scheduleCheckNotifications,
  scheduleSalaryNotifications,
} from '../src/utils/notificationService';
import BottomNav from '../src/components/BottomNav';

I18nManager.allowRTL(true);
if (!__DEV__) I18nManager.forceRTL(true);

const LOCK_TIMEOUT = 60_000; // 60 ثانية

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e?.message ?? String(e) }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, padding: 24, backgroundColor: '#fff', justifyContent: 'center' }}>
          <Text style={{ color: 'red', fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>خطأ في التطبيق:</Text>
          <ScrollView>
            <Text style={{ color: '#333', fontSize: 13 }} selectable>{this.state.error}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  const { loadSavedAuth, startListening, auth, app } = useAppStore();
  const bgTimestamp = useRef<number | null>(null);

  useEffect(() => {
    async function bootstrap() {
      try {
        await Promise.race([
          initFirebase(),
          new Promise<void>(r => setTimeout(r, 4000)),
        ]);
        // إلا التطبيق كان مغلق أكثر من 60 ثانية → يمسح الجلسة ويطلب كود
        const bgTs = await AsyncStorage.getItem('fadaa_bg_ts');
        if (bgTs) {
          const elapsed = Date.now() - parseInt(bgTs, 10);
          if (elapsed >= LOCK_TIMEOUT) {
            await AsyncStorage.removeItem('fadaa_auth');
            await AsyncStorage.removeItem('fadaa_bg_ts');
          }
        }
        await loadSavedAuth();
        startListening();
        try {
          const granted = await setupNotifications();
          if (granted) {
            scheduleCheckNotifications(app.supplierCredit ?? {}).catch(() => {});
            scheduleSalaryNotifications(app.employees ?? {}).catch(() => {});
          }
        } catch {}
      } catch {}
    }
    bootstrap();
  }, []);

  // قفل التطبيق بعد 60 ثانية في الخلفية أو مع قفل الهاتف
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        bgTimestamp.current = Date.now();
        AsyncStorage.setItem('fadaa_bg_ts', String(Date.now())).catch(() => {});
      } else if (nextState === 'active') {
        AsyncStorage.removeItem('fadaa_bg_ts').catch(() => {});
        if (bgTimestamp.current !== null) {
          const elapsed = Date.now() - bgTimestamp.current;
          if (elapsed >= LOCK_TIMEOUT && useAppStore.getState().auth) {
            // Only remove session — keep biometric keys so fingerprint works on re-login
            useAppStore.setState({ auth: null });
            AsyncStorage.removeItem('fadaa_auth').catch(() => {});
            router.replace('/(auth)/login');
          }
          bgTimestamp.current = null;
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  // إلا RTL ما تطبقش — أول تثبيت على هاتف غير عربي (مشي في وضع التطوير)
  if (!__DEV__ && !I18nManager.isRTL) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🔄</Text>
        <Text style={{ fontSize: 20, fontWeight: '900', textAlign: 'center', color: '#1e293b', marginBottom: 8 }}>
          أغلق التطبيق وافتحه من جديد
        </Text>
        <Text style={{ fontSize: 14, textAlign: 'center', color: '#64748b', marginBottom: 32 }}>
          مرة وحدة فقط — باش يتطبق الاتجاه الصحيح
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: '#5c67f2', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 16 }}
          onPress={() => BackHandler.exitApp()}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>إغلاق التطبيق</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const liveColor = auth?.phone ? app.users[auth.phone]?.color : undefined;
  const userColor = liveColor || auth?.color;
  const bgColor = userColor ? userColor + '15' : '#f8fafc';

  return (
    <ErrorBoundary>
      <SafeAreaProvider style={{ flex: 1, backgroundColor: bgColor }}>
        <StatusBar style={userColor ? 'light' : 'dark'} backgroundColor={userColor ?? '#f8fafc'} />
        <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: bgColor } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)/login" options={{ contentStyle: { backgroundColor: '#ffffff' } }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="folder/[id]" />
          <Stack.Screen name="customer/[id]" />
          <Stack.Screen name="scan" options={{ presentation: 'transparentModal', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="suppliers" />
          <Stack.Screen name="repair" />
          <Stack.Screen name="staff" />
          <Stack.Screen name="calculator" options={{ contentStyle: { backgroundColor: '#0f172a' } }} />
          <Stack.Screen name="reminders" />
          <Stack.Screen name="notes" />
        </Stack>
        {auth && <BottomNav />}
        {auth?.role === 'demo' && (
          <View style={demoStyles.banner}>
            <Text style={demoStyles.bannerTxt}>🎭 وضع العرض — البيانات غير حقيقية</Text>
          </View>
        )}
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const demoStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    bottom: 70,
    left: 0, right: 0,
    backgroundColor: '#f59e0b',
    paddingVertical: 6,
    alignItems: 'center',
    zIndex: 999,
  },
  bannerTxt: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
});
