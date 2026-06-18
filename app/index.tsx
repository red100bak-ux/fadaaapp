import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAppStore } from '../src/store/appStore';

export default function Index() {
  const { auth, isLoaded } = useAppStore();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#5c67f2" />
      </View>
    );
  }

  return <Redirect href={auth ? '/(tabs)' : '/(auth)/login'} />;
}
