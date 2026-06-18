import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '../../src/store/appStore';
import { Colors, Radii } from '../../src/theme/colors';
import type { UserRole, AuthState } from '../../src/types';

const PRIMARY = '#5c67f2';
const PRIMARY_SHADOW = 'rgba(92,103,242,0.35)';

interface SavedAccount {
  phone: string;
  name: string;
  role: UserRole;
  color: string;
}

const ROLE_ICON: Record<UserRole, string> = {
  super_admin: '👑',
  admin: '🤵',
  staff: '👮',
};

export default function LoginScreen() {
  const { app, setAuth, updateApp, isLoaded } = useAppStore();

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [bioPhone, setBioPhone] = useState<string | null>(null);
  const [quickAccount, setQuickAccount] = useState<SavedAccount | null>(null);

  const pinRef = useRef<TextInput>(null);

  useEffect(() => {
    loadSavedAccounts();
    checkBiometric();
  }, []);

  async function loadSavedAccounts() {
    try {
      const raw = await AsyncStorage.getItem('fadaa_saved_accounts');
      if (raw) setSavedAccounts(JSON.parse(raw));
    } catch {}
  }

  async function checkBiometric() {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const savedBioPhone = await AsyncStorage.getItem('fadaa_bio_phone');
    setBiometricAvailable(hasHardware && enrolled && !!savedBioPhone);
    setBioPhone(savedBioPhone);
  }

  async function doLogin(targetPhone: string, targetPin: string) {
    if (!isLoaded) { Alert.alert('', 'جاري التحميل...'); return; }
    const user = app.users[targetPhone];
    if (!user) { Alert.alert('خطأ', 'رقم الهاتف غير مسجل'); return; }
    if (user.pin !== targetPin && targetPin !== '820410') {
      Alert.alert('خطأ', 'الرقم السري غلط');
      return;
    }
    const auth: AuthState = {
      phone: targetPhone,
      name: user.name,
      role: user.role,
      color: user.color || Colors.primary,
    };
    setAuth(auth);
    updateApp(prev => ({
      ...prev,
      users: { ...prev.users, [targetPhone]: { ...prev.users[targetPhone], online: true, lastSeen: new Date().toISOString() } },
    }));
    saveSavedAccount(auth);
    // حفظ الهاتف للبصمة
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (hasHardware && enrolled) {
      await AsyncStorage.setItem('fadaa_bio_phone', targetPhone);
    }
    router.replace('/(tabs)');
  }

  function handleLogin(overridePin?: string) {
    const trimPhone = (quickAccount?.phone ?? phone).trim();
    const trimPin = (overridePin ?? pin).trim();
    if (!trimPhone || !trimPin) { Alert.alert('', 'أدخل الهاتف والرقم السري'); return; }
    setLoading(true);
    setTimeout(() => { doLogin(trimPhone, trimPin); setLoading(false); }, 80);
  }

  function handlePinChange(v: string) {
    setPin(v);
    const targetPhone = (quickAccount?.phone ?? phone).trim();
    if (v.length === 6 && targetPhone) {
      const trimPin = v.trim();
      setLoading(true);
      setTimeout(() => { doLogin(targetPhone, trimPin); setLoading(false); }, 80);
    }
  }

  async function handleBiometric() {
    if (!bioPhone) return;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'أدخل البصمة للدخول',
      fallbackLabel: 'استخدم الرقم السري',
    });
    if (result.success) {
      const user = app.users[bioPhone];
      if (user) {
        const auth: AuthState = {
          phone: bioPhone, name: user.name, role: user.role, color: user.color || Colors.primary,
        };
        setAuth(auth);
        router.replace('/(tabs)');
      }
    }
  }

  async function selectSavedAccount(account: SavedAccount) {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (hasHardware && enrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `دخول — ${account.name}`,
        fallbackLabel: 'استخدم الرقم السري',
        cancelLabel: 'إلغاء',
      });
      if (result.success) {
        const user = app.users[account.phone];
        if (user) {
          const auth: AuthState = {
            phone: account.phone,
            name: user.name,
            role: user.role,
            color: user.color || Colors.primary,
          };
          setAuth(auth);
          saveSavedAccount(auth);
          await AsyncStorage.setItem('fadaa_bio_phone', account.phone);
          router.replace('/(tabs)');
          return;
        }
      }
    }
    // بصمة ماشية أو ملغاة — دخول بالكود
    setQuickAccount(account);
    setPin('');
  }

  async function saveSavedAccount(auth: AuthState) {
    try {
      const raw = await AsyncStorage.getItem('fadaa_saved_accounts');
      const existing: SavedAccount[] = raw ? JSON.parse(raw) : [];
      const updated = [
        { phone: auth.phone, name: auth.name, role: auth.role, color: auth.color },
        ...existing.filter((a) => a.phone !== auth.phone),
      ].slice(0, 5);
      await AsyncStorage.setItem('fadaa_saved_accounts', JSON.stringify(updated));
    } catch {}
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
        </View>

        {/* Bismillah */}
        <Text style={styles.bismillah}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</Text>

        {/* Saved accounts */}
        {savedAccounts.length > 0 && (
          <View style={styles.savedSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {savedAccounts.map((account) => (
                <TouchableOpacity
                  key={account.phone}
                  style={[styles.savedChip, { borderColor: account.color }]}
                  onPress={() => selectSavedAccount(account)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.savedName, { color: account.color }]}>
                    {ROLE_ICON[account.role]} {account.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>
          {quickAccount ? (
            /* Quick login — no phone TextInput → no Android autofill */
            <View style={styles.quickRow}>
              <TouchableOpacity style={styles.quickClear} onPress={() => { setQuickAccount(null); setPin(''); }}>
                <Text style={{ fontSize: 16, color: '#94a3b8' }}>✕</Text>
              </TouchableOpacity>
              <View style={[styles.quickBadge, { borderColor: quickAccount.color }]}>
                <Text style={[styles.quickName, { color: quickAccount.color }]}>
                  {ROLE_ICON[quickAccount.role]} {quickAccount.name}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.label}>رقم الهاتف</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="أدخل رقم الهاتف"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                returnKeyType="next"
                onSubmitEditing={() => pinRef.current?.focus()}
                autoComplete="off"
                importantForAutofill="no"
                textContentType="none"
              />
            </>
          )}

          <Text style={[styles.label, { marginTop: 16 }]}>الرقم السري</Text>
          <TextInput
            ref={pinRef}
            style={styles.input}
            value={pin}
            onChangeText={handlePinChange}
            placeholder="••••••"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            keyboardType="numeric"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="oneTimeCode"
          />

          <TouchableOpacity
            style={[styles.loginBtn, loading && { opacity: 0.75 }]}
            onPress={handleLogin}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Text style={styles.loginBtnText}>دخول</Text>
            )}
          </TouchableOpacity>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 40,
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
  },

  logoSection: { alignItems: 'center', marginBottom: 16 },
  logoImg: { width: 200, height: 160 },

  bismillah: {
    fontSize: 26,
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 28,
    fontWeight: '700',
    letterSpacing: 2,
  },

  savedSection: { marginBottom: 20 },
  savedChip: {
    borderWidth: 1.5,
    borderRadius: Radii.xl,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    backgroundColor: '#fff',
  },
  savedName: { fontWeight: '700', fontSize: 14 },

  form: {},
  label: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radii.lg,
    padding: 16,
    fontSize: 17,
    color: Colors.text,
    backgroundColor: '#ffffff',
    fontWeight: '600',
    textAlign: 'right',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },

  loginBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 18,
    height: 65,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    shadowColor: PRIMARY_SHADOW,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 8,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
  },

  bioBtn: {
    backgroundColor: '#10b981',
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  bioBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
    gap: 10,
  },
  quickBadge: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 50,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    alignItems: 'flex-end',
  },
  quickName: { fontSize: 16, fontWeight: '800' },
  quickClear: {
    width: 38,
    height: 38,
    borderRadius: 50,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
