import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { storage } from './config';

export async function uploadItemImage(localUri: string): Promise<string> {
  const compressed = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 800 } }],
    { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG }
  );

  const response = await fetch(compressed.uri);
  const blob = await response.blob();

  const filename = `items/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  const storageRef = ref(storage, filename);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export async function deleteItemImage(imageUrl: string | undefined | null): Promise<void> {
  if (!imageUrl) return;
  // الصور القديمة في Cloudinary — ما نقدروش نمسحوهم، نتجاوزوهم
  if (imageUrl.includes('cloudinary.com')) return;
  try {
    const storageRef = ref(storage, imageUrl);
    await deleteObject(storageRef);
  } catch {
    // الصورة ممكن تكون محذوفة بالفعل
  }
}
