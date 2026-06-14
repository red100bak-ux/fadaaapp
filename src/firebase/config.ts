import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAn33kRhxuc7cgwcL4kW_WcX939uJOjJSM',
  authDomain: 'fadaa-elakhwyn.firebaseapp.com',
  databaseURL: 'https://fadaa-elakhwyn-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'fadaa-elakhwyn',
  storageBucket: 'fadaa-elakhwyn.firebasestorage.app',
  messagingSenderId: '780922885099',
  appId: '1:780922885099:web:763bc7c5f9e707cb203fae',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
export const auth = getAuth(app);

export async function initFirebase() {
  try {
    await enableIndexedDbPersistence(db);
  } catch (e: any) {
    if (e.code !== 'failed-precondition' && e.code !== 'unimplemented') {
      console.warn('Persistence error:', e.code);
    }
  }
  try {
    await signInAnonymously(auth);
  } catch (e: any) {
    console.warn('Auth error:', e.code);
  }
}
