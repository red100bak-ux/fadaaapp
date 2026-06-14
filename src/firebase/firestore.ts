import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './config';
import type { AppData } from '../types';

const DOC_REF = doc(db, 'storeData', 'v97_master');

export async function loadAppData(): Promise<AppData | null> {
  try {
    const snap = await getDoc(DOC_REF);
    if (snap.exists()) {
      return snap.data() as AppData;
    }
    return null;
  } catch (e) {
    console.error('loadAppData error', e);
    return null;
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  try {
    await setDoc(DOC_REF, data, { merge: true });
  } catch (e) {
    console.error('saveAppData error', e);
  }
}

export function subscribeToAppData(
  onData: (data: AppData) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    DOC_REF,
    (snap) => {
      if (snap.exists()) onData(snap.data() as AppData);
    },
    (e) => onError?.(e),
  );
}
