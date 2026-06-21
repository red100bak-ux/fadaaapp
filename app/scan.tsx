import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Vibration,
  Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, FlatList, Image, ActivityIndicator,
  PanResponder, I18nManager,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';

// expo-camera — works in Expo Go
import { CameraView, useCameraPermissions } from 'expo-camera';

// vision-camera imported lazily inside VisionCameraView — static import crashes Expo Go

import { useAppStore } from '../src/store/appStore';
import { usePermissions } from '../src/hooks/usePermissions';
import { Colors, Radii, Shadow } from '../src/theme/colors';
import { formatMAD, makeSaleRecord, nowDate, generateId } from '../src/utils/helpers';
import { uploadItemImage } from '../src/firebase/storage';
import { sendNow } from '../src/utils/notificationService';
import { logActivity } from '../src/utils/activityLogger';
import AppAlert from '../src/components/AppAlert';
import type { StockItem, ArchiveSale } from '../src/types';

type ScanMode = 'sell' | 'credit' | 'return' | 'add_stock' | 'info';

// Detect Expo Go — vision-camera native modules are not bundled there
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// ─── Expo Go camera (expo-camera) ──────────────────────────────────────────
function ExpoCameraView({
  scanned,
  onBarcode,
  onClose,
}: {
  scanned: boolean;
  onBarcode: (d: { data: string }) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) {
    return <View style={styles.cameraWrap} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.cameraWrap, { backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: 14 }]}>
        <Text style={{ fontSize: 60 }}>📷</Text>
        <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text }}>الكاميرا محتاجة</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnTxt}>السماح بالكاميرا</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.cameraWrap}>
      {!scanned && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={({ data }) => onBarcode({ data })}
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'pdf417', 'upc_e'],
          }}
        />
      )}
      <CameraOverlay scanned={scanned} onClose={onClose} />
    </View>
  );
}

// ─── Dev/Prod build camera (react-native-vision-camera) ────────────────────
function VisionCameraView({
  scanned,
  onBarcode,
  onClose,
}: {
  scanned: boolean;
  onBarcode: (d: { data: string }) => void;
  onClose: () => void;
}) {
  // lazy require — only runs when this component is mounted (never in Expo Go)
  const vc = require('react-native-vision-camera');
  const { hasPermission, requestPermission } = vc.useCameraPermission();
  const device = vc.useCameraDevice('back', { physicalDevices: ['wide-angle-camera'] });
  const codeScanner = vc.useCodeScanner({
    codeTypes: ['qr', 'ean-13', 'ean-8', 'code-128', 'code-39', 'pdf-417', 'upc-e'],
    onCodeScanned: (codes: any[]) => {
      if (scanned || codes.length === 0) return;
      const value = codes[0]?.value;
      if (value) onBarcode({ data: value });
    },
  });

  if (!hasPermission) {
    return (
      <View style={[styles.cameraWrap, { backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: 14 }]}>
        <Text style={{ fontSize: 60 }}>📷</Text>
        <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text }}>الكاميرا محتاجة</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnTxt}>السماح بالكاميرا</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const NativeCamera = vc.Camera;
  return (
    <View style={styles.cameraWrap}>
      {device && (
        <NativeCamera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={!scanned}
          codeScanner={codeScanner}
          onError={() => {}}
        />
      )}
      <CameraOverlay scanned={scanned} onClose={onClose} />
    </View>
  );
}

// ─── Shared camera overlay (frame + close button) ──────────────────────────
function CameraOverlay({ scanned, onClose }: { scanned: boolean; onClose: () => void }) {
  return (
    <View style={styles.overlay}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
        <View style={{ width: 36 }} />
      </View>
      {!scanned && (
        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          <Text style={styles.frameHint}>وجّه الكاميرا نحو الباركود</Text>
        </View>
      )}
    </View>
  );
}

// ─── Main scan screen ───────────────────────────────────────────────────────
export default function ScanScreen() {
  const { app, auth, updateApp } = useAppStore();
  const perm = usePermissions();
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const scanMode = (mode as ScanMode) || 'sell';

  const [scanned, setScanned] = useState(false);
  const [found, setFound] = useState<{ bc: string; item: StockItem } | null>(null);
  const [returnConfirm, setReturnConfirm] = useState<{ bc: string; item: StockItem } | null>(null);
  const [returnReasonModal, setReturnReasonModal] = useState(false);
  const [sellModal, setSellModal] = useState(false);
  const [sellSuccess, setSellSuccess] = useState<{ name: string; sell: number; profit: number; seller: string } | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [creditModal, setCreditModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [form, setForm] = useState({ name: '', sell: '', buy: '', qty: '', supplier: '', barcode: '', cat: '' });
  const [selectedFolder, setSelectedFolder] = useState('');
  const [newImg, setNewImg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [showPhotoCamera, setShowPhotoCamera] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [photoFlash, setPhotoFlash] = useState<'off' | 'on'>('off');
  const [scanBarcode, setScanBarcode] = useState(false);
  const photoCameraRef = useRef<CameraView>(null);
  const isCapturing = useRef(false);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [addSupplierModal, setAddSupplierModal] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const formScrollRef = useRef<ScrollView>(null);
  const sNameRef = useRef<any>(null);
  const sBuyRef = useRef<any>(null);
  const sSellRef = useRef<any>(null);
  const sQtyRef = useRef<any>(null);
  const [freeCropMode, setFreeCropMode] = useState(false);
  const [cropBox, setCropBox] = useState({ x: 16, y: 16, w: 300, h: 340 });
  const cropBoxRef = useRef({ x: 16, y: 16, w: 300, h: 340 });
  const fcContRef = useRef({ w: 375, h: 380 });
  const fcInitRef = useRef(false);
  const grabRef = useRef<'tl' | 'tr' | 'bl' | 'br' | 'tm' | 'bm' | 'lm' | 'rm' | 'mv' | null>(null);
  const fcStartRef = useRef({ ox: 0, oy: 0, box: { x: 16, y: 16, w: 300, h: 340 } });
  const syncCB = (b: { x: number; y: number; w: number; h: number }) => { cropBoxRef.current = b; setCropBox({ ...b }); };
  const clampV = (v: number, mn: number, mx: number) => Math.max(mn, Math.min(mx, v));
  const CHIT = 44, EMID = 36, CMIN = 60;
  const freeCropPR = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const { locationX: plx, locationY: ly } = evt.nativeEvent;
      const cw0 = fcContRef.current.w;
      const lx = I18nManager.isRTL ? cw0 - plx : plx;
      const b = cropBoxRef.current;
      if (Math.abs(lx - b.x) < CHIT && Math.abs(ly - b.y) < CHIT) grabRef.current = 'tl';
      else if (Math.abs(lx - (b.x + b.w)) < CHIT && Math.abs(ly - b.y) < CHIT) grabRef.current = 'tr';
      else if (Math.abs(lx - b.x) < CHIT && Math.abs(ly - (b.y + b.h)) < CHIT) grabRef.current = 'bl';
      else if (Math.abs(lx - (b.x + b.w)) < CHIT && Math.abs(ly - (b.y + b.h)) < CHIT) grabRef.current = 'br';
      else if (Math.abs(lx - (b.x + b.w / 2)) < EMID && Math.abs(ly - b.y) < EMID) grabRef.current = 'tm';
      else if (Math.abs(lx - (b.x + b.w / 2)) < EMID && Math.abs(ly - (b.y + b.h)) < EMID) grabRef.current = 'bm';
      else if (Math.abs(lx - b.x) < EMID && Math.abs(ly - (b.y + b.h / 2)) < EMID) grabRef.current = 'lm';
      else if (Math.abs(lx - (b.x + b.w)) < EMID && Math.abs(ly - (b.y + b.h / 2)) < EMID) grabRef.current = 'rm';
      else grabRef.current = 'mv';
      fcStartRef.current = { ox: lx, oy: ly, box: { ...cropBoxRef.current } };
    },
    onPanResponderMove: (_, { dx, dy }) => {
      const g = grabRef.current;
      const { box: b } = fcStartRef.current;
      const { w: cw, h: ch } = fcContRef.current;
      const ldx = I18nManager.isRTL ? -dx : dx;
      if (g === 'mv') syncCB({ x: clampV(b.x + ldx, 0, cw - b.w), y: clampV(b.y + dy, 0, ch - b.h), w: b.w, h: b.h });
      else if (g === 'tl') { const nx = clampV(b.x + ldx, 0, b.x + b.w - CMIN), ny = clampV(b.y + dy, 0, b.y + b.h - CMIN); syncCB({ x: nx, y: ny, w: b.x + b.w - nx, h: b.y + b.h - ny }); }
      else if (g === 'tr') { const ny = clampV(b.y + dy, 0, b.y + b.h - CMIN); syncCB({ x: b.x, y: ny, w: clampV(b.w + ldx, CMIN, cw - b.x), h: b.y + b.h - ny }); }
      else if (g === 'bl') { const nx = clampV(b.x + ldx, 0, b.x + b.w - CMIN); syncCB({ x: nx, y: b.y, w: b.x + b.w - nx, h: clampV(b.h + dy, CMIN, ch - b.y) }); }
      else if (g === 'br') syncCB({ x: b.x, y: b.y, w: clampV(b.w + ldx, CMIN, cw - b.x), h: clampV(b.h + dy, CMIN, ch - b.y) });
      else if (g === 'tm') { const ny = clampV(b.y + dy, 0, b.y + b.h - CMIN); syncCB({ x: b.x, y: ny, w: b.w, h: b.y + b.h - ny }); }
      else if (g === 'bm') syncCB({ x: b.x, y: b.y, w: b.w, h: clampV(b.h + dy, CMIN, ch - b.y) });
      else if (g === 'lm') { const nx = clampV(b.x + ldx, 0, b.x + b.w - CMIN); syncCB({ x: nx, y: b.y, w: b.x + b.w - nx, h: b.h }); }
      else if (g === 'rm') syncCB({ x: b.x, y: b.y, w: clampV(b.w + ldx, CMIN, cw - b.x), h: b.h });
    },
    onPanResponderRelease: () => { grabRef.current = null; },
  })).current;
  const [alertModal, setAlertModal] = useState<{
    icon: string; title: string; message: string;
    btns: Array<{ label: string; onPress: () => void; primary?: boolean }>;
  } | null>(null);

  function showAlert(icon: string, title: string, message: string, btns: Array<{ label: string; onPress: () => void; primary?: boolean }>) {
    setAlertModal({ icon, title, message, btns });
  }

  function handleBarcode({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    Vibration.vibrate(60);

    const bc = data.trim();
    let item = app.stock?.[bc];
    let mainBc = bc;
    // البحث في linkedBarcodes إلا ما كانش الباركود رئيسياً
    if (!item) {
      for (const [stockBc, stockItem] of Object.entries(app.stock ?? {})) {
        const linked = stockItem.linkedBarcodes?.find(l => l.bc === bc);
        if (linked) {
          item = stockItem;
          mainBc = stockBc;
          break;
        }
      }
    }

    if (scanMode === 'info') {
      if (item) {
        setFound({ bc: mainBc, item });
      } else {
        showAlert('🔍', 'ما لقاتاش', 'هاد السلعة ما كاينة في الستوك', [
          { label: 'إلغاء', onPress: () => { setAlertModal(null); router.back(); } },
          { label: '🔄 عاود', onPress: () => { setAlertModal(null); setScanned(false); }, primary: true },
        ]);
      }
      return;
    }

    if (scanMode === 'add_stock') {
      if (item) {
        // المنتج موجود — +1 تلقائياً
        const newQty = item.qty + 1;
        updateApp((prev) => ({
          ...prev,
          stock: { ...prev.stock, [mainBc]: { ...item, qty: newQty } },
        }));
        logActivity('add_stock', `📦 زاد: ${item.name} (+1 — باقي: ${newQty})`, auth?.name ?? '');
        showAlert('✅', `+1 — ${item.name}`, `الكمية الجديدة: ${newQty}`, [
          { label: 'عاود سكان', onPress: () => { setAlertModal(null); setScanned(false); }, primary: true },
          { label: 'تعديل', onPress: () => { setAlertModal(null); setFound({ bc: mainBc, item: { ...item, qty: newQty } }); } },
        ]);
      } else {
        setManualCode(bc);
        const defaultCat = app.folders?.find((fl) => fl.active)?.name || '';
        setForm({ name: '', sell: '', buy: '', qty: '', supplier: '', barcode: bc, cat: defaultCat });
        setNewImg(null);
        setAddModal(true);
      }
      return;
    }

    if (scanMode === 'return') {
      if (!item) {
        showAlert('⛔', 'ما لقاتاش', 'هاد الباركود ما كاينش في الستوك', [
          { label: 'إلغاء', onPress: () => { setAlertModal(null); router.back(); } },
          { label: '🔄 عاود', onPress: () => { setAlertModal(null); setScanned(false); }, primary: true },
        ]);
        return;
      }
      const soldCount = (app.todaySales ?? []).filter((s: any) => s.name === item.name && s.sell > 0).length;
      const returnCount = (app.todaySales ?? []).filter((s: any) => s.name === item.name && s.sell < 0).length;
      if (soldCount === 0 || returnCount >= soldCount) {
        showAlert('⛔', 'ممنوع', `${item.name} — ما تبيعتش اليوم أو رجعت كلها`, [
          { label: 'إلغاء', onPress: () => { setAlertModal(null); router.back(); } },
          { label: '🔄 عاود', onPress: () => { setAlertModal(null); setScanned(false); }, primary: true },
        ]);
        return;
      }
      setFound({ bc: mainBc, item });
      setReturnConfirm({ bc: mainBc, item });
      return;
    }

    if (item) {
      setFound({ bc: mainBc, item });
      if (scanMode === 'sell') {
        if (item.soldAt) {
          showAlert('📵', 'مباع', `${item.name}\nبيع بتاريخ: ${item.soldAt}${item.soldBy ? `\nمن طرف: ${item.soldBy}` : ''}`, [
            { label: 'حسناً', onPress: () => { setAlertModal(null); setScanned(false); }, primary: true },
          ]);
        } else {
          setSellModal(true);
        }
      } else if (scanMode === 'credit') {
        setSelectedCustomerId('');
        setCreditModal(true);
      }
    } else if (scanMode === 'sell') {
      showAlert('🔍', 'ما لقاتاش', 'هاد السلعة ما كاينة في الستوك', [
        { label: 'إلغاء', onPress: () => { setAlertModal(null); router.back(); } },
        { label: '🔄 عاود', onPress: () => { setAlertModal(null); setScanned(false); }, primary: true },
      ]);
    } else {
      showAlert('⛔', 'ما لقاتاش', 'هاد السلعة ما كاينة في الستوك', [
        { label: 'إلغاء', onPress: () => { setAlertModal(null); router.back(); } },
        { label: '🔄 عاود', onPress: () => { setAlertModal(null); setScanned(false); }, primary: true },
      ]);
    }
  }

  function sellOne() {
    if (!found) return;
    const { bc, item } = found;
    if (item.qty <= 0) {
      showAlert('🛑', 'STOP', 'المخزون فارغ! ما يمكنكش تبيع كتر ملي في الستوك', [
        { label: 'حسناً', onPress: () => setAlertModal(null), primary: true },
      ]);
      return;
    }
    const ARCHIVE_CATS = ['جديد', 'مستعمل'];
    updateApp((prev) => {
      const newQty = item.qty - 1;
      const newStock = { ...prev.stock, [bc]: { ...item, qty: newQty } };
      if (newQty <= 0) {
        if (ARCHIVE_CATS.includes(item.cat)) {
          newStock[bc] = { ...item, qty: 0, soldAt: nowDate().date, soldBy: auth?.name ?? '' };
        } else {
          sendNow('📭 نفد الستوك', `${item.name}`).catch(() => {});
        }
      } else if (newQty <= 2) {
        sendNow('⚠️ ستوك قليل', `${item.name} — باقي ${newQty} قطع`).catch(() => {});
      }
      const record = makeSaleRecord({ name: item.name, sell: item.sell, buy: item.buy, cat: item.cat, seller: auth?.name ?? '' });
      const archiveEntry: ArchiveSale | null = ARCHIVE_CATS.includes(item.cat) ? {
        id: generateId(),
        bc,
        name: item.name,
        sell: item.sell,
        buy: item.buy,
        soldAt: nowDate().date,
        soldBy: auth?.name ?? '',
        cat: item.cat,
        qtyBefore: item.qty,
      } : null;
      return {
        ...prev,
        stock: newStock,
        todaySales: [...prev.todaySales, record],
        ...(archiveEntry ? { archiveSales: [archiveEntry, ...(prev.archiveSales ?? [])] } : {}),
      };
    });
    logActivity('sell', `🛒 باع: ${item.name} — ${formatMAD(item.sell)}`, auth?.name ?? '', item.sell);
    setSellModal(false);
    setSellSuccess({ name: item.name, sell: item.sell, profit: item.sell - item.buy, seller: auth?.name ?? '' });
    setTimeout(() => { setSellSuccess(null); router.back(); }, 2200);
  }

  const f = (key: keyof typeof form, val: string) => setForm(p => ({ ...p, [key]: val }));

  function onBarcodeForForm({ data }: { data: string }) {
    f('barcode', data.trim());
    setScanBarcode(false);
  }

  async function compressUri(uri: string): Promise<string> {
    const r = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 900 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    return r.uri;
  }

  async function pickImage(source: 'camera' | 'library') {
    if (source === 'camera') {
      if (!camPerm?.granted) {
        const { granted } = await requestCamPerm();
        if (!granted) { Alert.alert('', 'خاصنا إذن الكاميرا'); return; }
      }
      setShowPhotoCamera(true);
    } else {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true });
      if (!result.canceled && result.assets[0]) setNewImg(await compressUri(result.assets[0].uri));
    }
  }

  async function takePhoto() {
    if (!photoCameraRef.current || isCapturing.current) return;
    isCapturing.current = true;
    try {
      const photo = await photoCameraRef.current.takePictureAsync({ quality: 0.5, shutterSound: false } as any);
      if (photo?.uri) setPhotoPreview(await compressUri(photo.uri));
    } finally {
      isCapturing.current = false;
    }
  }

  async function applyCrop(uri: string, ratio: '1:1' | '3:4' | '4:3'): Promise<string> {
    return new Promise((resolve, reject) => {
      Image.getSize(uri, async (w, h) => {
        let cropW = w, cropH = h, originX = 0, originY = 0;
        if (ratio === '1:1') {
          const s = Math.min(w, h); cropW = s; cropH = s;
          originX = Math.floor((w - s) / 2); originY = Math.floor((h - s) / 2);
        } else if (ratio === '3:4') {
          if (w / h > 3 / 4) { cropW = Math.floor(h * 3 / 4); originX = Math.floor((w - cropW) / 2); }
          else { cropH = Math.floor(w * 4 / 3); originY = Math.floor((h - cropH) / 2); }
        } else {
          if (w / h < 4 / 3) { cropH = Math.floor(w * 3 / 4); originY = Math.floor((h - cropH) / 2); }
          else { cropW = Math.floor(h * 4 / 3); originX = Math.floor((w - cropW) / 2); }
        }
        try {
          const r = await ImageManipulator.manipulateAsync(uri, [{ crop: { originX, originY, width: cropW, height: cropH } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
          resolve(r.uri);
        } catch (e) { reject(e); }
      }, reject);
    });
  }

  function applyFreeCrop() {
    if (!photoPreview) return;
    Image.getSize(photoPreview, async (imgW, imgH) => {
      const { w: cW, h: cH } = fcContRef.current;
      const scale = Math.min(cW / imgW, cH / imgH);
      const offX = (cW - imgW * scale) / 2;
      const offY = (cH - imgH * scale) / 2;
      const b = cropBoxRef.current;
      const cx = I18nManager.isRTL
        ? Math.max(0, Math.floor((cW - b.x - b.w - offX) / scale))
        : Math.max(0, Math.floor((b.x - offX) / scale));
      const cy = Math.max(0, Math.floor((b.y - offY) / scale));
      const cw2 = Math.min(imgW - cx, Math.max(1, Math.floor(b.w / scale)));
      const ch2 = Math.min(imgH - cy, Math.max(1, Math.floor(b.h / scale)));
      try {
        const r = await ImageManipulator.manipulateAsync(
          photoPreview,
          [{ crop: { originX: cx, originY: cy, width: cw2, height: ch2 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        setPhotoPreview(r.uri);
      } catch {}
      setFreeCropMode(false);
      fcInitRef.current = false;
    });
  }

  function addSupplierScan() {
    setNewSupplierName('');
    setAddSupplierModal(true);
  }

  function confirmAddSupplier() {
    const n = newSupplierName.trim();
    if (!n) return;
    updateApp((prev) => ({
      ...prev,
      suppliers: prev.suppliers.includes(n) ? prev.suppliers : [...prev.suppliers, n],
    }));
    f('supplier', n);
    setAddSupplierModal(false);
  }

  async function saveNewItem() {
    if (!form.name.trim() || !form.sell || !form.buy) {
      Alert.alert('', 'أدخل الاسم والأسعار');
      return;
    }
    const bc = manualCode || form.barcode.trim() || generateId();
    const catName = form.cat || app.folders?.find((fl) => fl.active)?.name || 'جديد';

    let imgUrl: string | undefined;
    if (newImg && newImg.startsWith('file://')) {
      setUploading(true);
      try { imgUrl = await uploadItemImage(newImg); }
      catch { Alert.alert('', 'فشل تحميل الصورة، المنتج سيُحفظ بدون صورة'); }
      finally { setUploading(false); }
    } else if (newImg) {
      imgUrl = newImg;
    }

    const item: StockItem = {
      name: form.name.trim(),
      cat: catName,
      sell: parseFloat(form.sell) || 0,
      buy: parseFloat(form.buy) || 0,
      qty: parseInt(form.qty) || 0,
      supplier: form.supplier.trim() || undefined,
      addedBy: auth?.name,
      img: imgUrl,
    };
    updateApp((prev) => ({ ...prev, stock: { ...prev.stock, [bc]: item } }));
    logActivity('add_stock', `📦 أضاف: ${item.name} (${item.qty} قطعة)`, auth?.name ?? '');
    setAddModal(false);
    setScanned(false);
    setManualCode('');
    setNewImg(null);
    setForm({ name: '', sell: '', buy: '', qty: '', supplier: '', barcode: '', cat: '' });
    showAlert('✅', 'تمت الإضافة', item.name, [{ label: 'OK', onPress: () => { setAlertModal(null); router.back(); }, primary: true }]);
  }

  function addCreditEntry() {
    if (!found || !selectedCustomerId) {
      Alert.alert('', 'اختار الزبون أولاً');
      return;
    }
    const item = found.item;
    const { dateTime } = nowDate();
    updateApp((prev) => {
      const c = prev.credit[selectedCustomerId];
      if (!c) return prev;
      return {
        ...prev,
        credit: {
          ...prev.credit,
          [selectedCustomerId]: {
            ...c,
            total: (c.total || 0) + item.sell,
            logs: [...c.logs, { t: `🛒 زاد بسكان (${item.name})`, v: item.sell, d: dateTime, seller: auth?.name }],
          },
        },
      };
    });
    logActivity('credit_add', `💳 كريدي سكان: ${item.name} → ${app.credit[selectedCustomerId]?.name}`, auth?.name ?? '', item.sell);
    setCreditModal(false);
    setFound(null);
    setScanned(false);
    Alert.alert('✅ تم تسجيل الكريدي', `${item.name} — ${item.sell} د`);
  }

  function confirmReturn(reason: string) {
    if (!returnConfirm) return;
    const { bc, item } = returnConfirm;
    updateApp((prev) => {
      const newQty = item.qty + 1;
      const newStock = { ...prev.stock, [bc]: { ...item, qty: newQty } };
      const record = makeSaleRecord({ name: item.name, sell: -(item.sell), buy: -(item.buy), cat: item.cat, seller: auth?.name ?? '', returnReason: reason });
      const archiveEntries = prev.archiveSales ?? [];
      const entryToRemove = archiveEntries.find(e => e.bc === bc);
      const updatedArchive = entryToRemove
        ? archiveEntries.filter(e => e.id !== entryToRemove.id)
        : archiveEntries;
      return { ...prev, stock: newStock, todaySales: [...prev.todaySales, record], archiveSales: updatedArchive };
    });
    logActivity('return', `↩️ رجع: ${item.name} — ${reason}`, auth?.name ?? '', item.sell);
    setReturnReasonModal(false);
    setReturnConfirm(null);
    router.back();
  }

  return (
    <SafeAreaView style={styles.root}>

      {/* Camera */}
      <View style={scanned ? styles.cameraHidden : styles.cameraVisible}>
        <ExpoCameraView scanned={scanned} onBarcode={handleBarcode} onClose={() => router.back()} />
      </View>


      {/* Found product card — add_stock mode */}
      {found && scanMode === 'add_stock' && (
        <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 12, gap: 12 }}>
          <View style={styles.foundCard}>
            {found.item.img ? (
              <Image source={{ uri: found.item.img }} style={{ width: 80, height: 80, borderRadius: 12 }} resizeMode="contain" />
            ) : (
              <View style={{ width: 80, height: 80, borderRadius: 12, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border }}>
                <Text style={{ fontSize: 32 }}>📦</Text>
              </View>
            )}
            <View style={styles.foundInfo}>
              <Text style={styles.foundName}>{found.item.name}</Text>
              <Text style={styles.foundCat}>📁 {found.item.cat}</Text>
              {found.item.supplier ? <Text style={styles.foundSup}>🏭 {found.item.supplier}</Text> : null}
              <Text style={styles.foundCode}>🔖 {found.bc}</Text>
              {found.item.addedBy ? <Text style={[styles.foundCode, { color: '#7c3aed' }]}>👤 {found.item.addedBy}</Text> : null}
            </View>
            <View style={styles.foundPrices}>
              <View style={[styles.qtyBadge, { backgroundColor: found.item.qty > 2 ? Colors.successLight : Colors.dangerLight }]}>
                <Text style={[styles.qtyTxt, { color: found.item.qty > 2 ? Colors.success : Colors.danger }]}>{found.item.qty}</Text>
              </View>
              <Text style={styles.foundSell}>{found.item.sell} د</Text>
              {!perm.isStaff && <Text style={styles.foundBuy}>ش: {found.item.buy} د</Text>}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#16a34a', borderColor: '#15803d', flex: undefined }]}
            onPress={() => {
              const folder = app.folders?.find(f => f.name === found.item.cat);
              if (folder) { router.push(`/folder/${folder.id}?editBarcode=${found.bc}` as any); }
              else { Alert.alert('', 'ما لقاتش المجلد'); }
            }}
          >
            <Text style={[styles.actionTxt, { color: '#fff' }]}>✏️ تعديل السلعة</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: Colors.primaryLight, borderColor: Colors.primary + '40', flex: undefined }]}
            onPress={() => { setFound(null); setScanned(false); }}
          >
            <Text style={[styles.actionTxt, { color: Colors.primary }]}>🔄 عاود سكان</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Found product card — info mode: full details, no actions */}
      {found && scanMode === 'info' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
          {found.item.img ? (
            <Image source={{ uri: found.item.img }} style={{ width: '100%', height: 220, borderRadius: 16, marginBottom: 4, backgroundColor: '#000' }} resizeMode="contain" />
          ) : (
            <View style={{ width: '100%', height: 140, borderRadius: 16, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.border, marginBottom: 4 }}>
              <Text style={{ fontSize: 56 }}>📦</Text>
            </View>
          )}
          <View style={[styles.foundCard, { flexDirection: 'column', alignItems: 'stretch', gap: 0 }]}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: Colors.text, textAlign: 'right', marginBottom: 12 }}>{found.item.name}</Text>
            <View style={{ gap: 8 }}>
              <View style={infoRow}>
                <Text style={infoVal}>{found.item.cat}</Text>
                <Text style={infoLbl}>📁 المجلد</Text>
              </View>
              {found.item.supplier ? (
                <View style={infoRow}>
                  <Text style={[infoVal, { color: '#0369a1' }]}>{found.item.supplier}</Text>
                  <Text style={infoLbl}>🏭 المورد</Text>
                </View>
              ) : null}
              <View style={infoRow}>
                <Text style={[infoVal, { color: '#10b981', fontWeight: '900', fontSize: 18 }]}>{found.item.sell} د</Text>
                <Text style={infoLbl}>💰 ثمن البيع</Text>
              </View>
              {!perm.isStaff && (
                <View style={infoRow}>
                  <Text style={[infoVal, { color: '#dc2626', fontWeight: '900', fontSize: 18 }]}>{found.item.buy} د</Text>
                  <Text style={infoLbl}>🛒 ثمن الشراء</Text>
                </View>
              )}
              {!perm.isStaff && (
                <View style={infoRow}>
                  <Text style={[infoVal, { color: '#7c3aed', fontWeight: '900', fontSize: 18 }]}>{found.item.sell - found.item.buy} د</Text>
                  <Text style={infoLbl}>📈 الربح</Text>
                </View>
              )}
              <View style={infoRow}>
                <View style={[styles.qtyBadge, { backgroundColor: found.item.qty > 2 ? Colors.successLight : Colors.dangerLight, alignSelf: 'flex-end' }]}>
                  <Text style={[styles.qtyTxt, { color: found.item.qty > 2 ? Colors.success : Colors.danger }]}>{found.item.qty}</Text>
                </View>
                <Text style={infoLbl}>📦 الكمية</Text>
              </View>
              {found.item.addedBy ? (
                <View style={infoRow}>
                  <Text style={[infoVal, { color: '#7c3aed' }]}>{found.item.addedBy}</Text>
                  <Text style={infoLbl}>👤 أضافه</Text>
                </View>
              ) : null}
              {found.item.editedBy ? (
                <View style={infoRow}>
                  <Text style={[infoVal, { color: '#6b7280' }]}>{found.item.editedBy}</Text>
                  <Text style={infoLbl}>✏️ عدله</Text>
                </View>
              ) : null}
              <View style={infoRow}>
                <Text style={[infoVal, { color: Colors.textMuted, fontSize: 12 }]}>{found.bc}</Text>
                <Text style={infoLbl}>🔖 الباركود</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#16a34a', borderColor: '#15803d', flex: undefined }]}
            onPress={() => {
              const folder = app.folders?.find(f => f.name === found.item.cat);
              if (folder) { router.push(`/folder/${folder.id}?editBarcode=${found.bc}` as any); }
              else { Alert.alert('', 'ما لقاتش المجلد'); }
            }}
          >
            <Text style={[styles.actionTxt, { color: '#fff' }]}>✏️ تعديل السلعة</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: Colors.primaryLight, borderColor: Colors.primary + '40', flex: undefined }]}
            onPress={() => { setFound(null); setScanned(false); }}
          >
            <Text style={[styles.actionTxt, { color: Colors.primary }]}>🔄 عاود سكان</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Found product card — only shown for credit mode; sell/return use direct modals */}
      {found && scanMode === 'credit' && (
        <View style={styles.foundCard}>
          <View style={styles.foundInfo}>
            <Text style={styles.foundName}>{found.item.name}</Text>
            <Text style={styles.foundCat}>📁 {found.item.cat}</Text>
            {found.item.supplier ? <Text style={styles.foundSup}>📦 {found.item.supplier}</Text> : null}
            <Text style={styles.foundCode}>🔖 {found.bc}</Text>
          </View>
          <View style={styles.foundPrices}>
            <View style={[styles.qtyBadge, { backgroundColor: found.item.qty > 2 ? Colors.successLight : Colors.dangerLight }]}>
              <Text style={[styles.qtyTxt, { color: found.item.qty > 2 ? Colors.success : Colors.danger }]}>
                {found.item.qty}
              </Text>
            </View>
            <Text style={styles.foundSell}>{found.item.sell} د</Text>
            <Text style={styles.foundBuy}>ش: {found.item.buy} د</Text>
          </View>
        </View>
      )}

      {/* Sell action buttons removed — modal opens automatically in sell mode */}
      {found && scanMode === 'credit' && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]} onPress={() => setCreditModal(true)}>
            <Text style={[styles.actionTxt, { color: '#d97706' }]}>💳 اختار الزبون</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.primaryLight, borderColor: Colors.primary + '40' }]} onPress={() => { setFound(null); setScanned(false); }}>
            <Text style={[styles.actionTxt, { color: Colors.primary }]}>🔄 عاود</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Return action buttons removed — return confirm modal opens automatically */}

      {/* Sell confirm dialog */}
      <Modal visible={sellModal} transparent animationType="fade" onRequestClose={() => setSellModal(false)}>
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <View style={styles.dialogIconWrap}>
              <Text style={{ fontSize: 44 }}>🛒</Text>
            </View>
            <Text style={styles.dialogTitle}>تأكيد البيع</Text>
            {found && (
              <Text style={styles.dialogMsg}>
                {'واش متأكد تبيع '}
                <Text style={{ fontWeight: '900', color: '#1e293b' }}>{found.item.name}</Text>
                {' بـ '}
                <Text style={{ fontWeight: '900', color: '#10b981' }}>{formatMAD(found.item.sell)}</Text>
                {'؟'}
              </Text>
            )}
            <View style={styles.dialogBtns}>
              <TouchableOpacity style={styles.dialogCancel} onPress={() => router.back()}>
                <Text style={styles.dialogCancelTxt}>❌ إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogConfirm} onPress={sellOne}>
                <Text style={styles.dialogConfirmTxt}>✅ نعم، تأكيد</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Credit by scan modal */}
      <Modal visible={creditModal} transparent animationType="slide" onRequestClose={() => { setCreditModal(false); setScanned(false); setFound(null); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { maxHeight: '80%' }]}>
            <Text style={styles.sheetTitle}>💳 كريدي عبر السكان</Text>
            {found && (
              <View style={{ backgroundColor: '#fef3c7', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#92400e', textAlign: 'right' }}>{found.item.name}</Text>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#d97706', textAlign: 'right', marginTop: 4 }}>{found.item.sell} د</Text>
              </View>
            )}
            <Text style={{ fontSize: 13, color: Colors.textMuted, fontWeight: '700', textAlign: 'right', marginBottom: 8 }}>اختر الزبون:</Text>
            <FlatList
              data={Object.entries(app.credit ?? {})}
              keyExtractor={([id]) => id}
              style={{ maxHeight: 260 }}
              renderItem={({ item: [id, cust] }) => (
                <TouchableOpacity
                  style={{ padding: 13, borderRadius: 12, marginBottom: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: selectedCustomerId === id ? '#fef3c7' : Colors.background, borderWidth: 1.5, borderColor: selectedCustomerId === id ? '#f59e0b' : Colors.border }}
                  onPress={() => setSelectedCustomerId(id)}
                >
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    {selectedCustomerId === id && <Text style={{ fontSize: 16 }}>✓</Text>}
                    <Text style={{ fontSize: 12, color: Colors.textMuted }}>{cust.total > 0 ? `${cust.total} د` : '✅'}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}>{cust.name}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={{ textAlign: 'center', color: Colors.textMuted, paddingVertical: 20 }}>لا يوجد زبائن</Text>}
            />
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setCreditModal(false); setFound(null); setScanned(false); }}>
                <Text style={styles.cancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#d97706' }]} onPress={addCreditEntry}>
                <Text style={styles.confirmTxt}>✓ تسجيل الكريدي</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Return confirm dialog */}
      <Modal visible={!!returnConfirm} transparent animationType="fade" onRequestClose={() => router.back()}>
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <View style={[styles.dialogIconWrap, { backgroundColor: '#fef2f2', borderColor: Colors.danger }]}>
              <Text style={{ fontSize: 44 }}>↩️</Text>
            </View>
            <Text style={styles.dialogTitle}>تأكيد الروتور</Text>
            {returnConfirm && (
              <Text style={styles.dialogMsg}>
                {'واش متأكد ترجع '}
                <Text style={{ fontWeight: '900', color: '#1e293b' }}>{returnConfirm.item.name}</Text>
                {' بـ '}
                <Text style={{ fontWeight: '900', color: Colors.danger }}>{formatMAD(returnConfirm.item.sell)}</Text>
                {'؟'}
              </Text>
            )}
            <View style={styles.dialogBtns}>
              <TouchableOpacity style={styles.dialogCancel} onPress={() => router.back()}>
                <Text style={styles.dialogCancelTxt}>❌ إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dialogConfirm, { backgroundColor: Colors.danger }]} onPress={() => setReturnReasonModal(true)}>
                <Text style={styles.dialogConfirmTxt}>↩️ نعم، روتور</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Return reason modal */}
      <Modal visible={returnReasonModal} transparent animationType="fade" onRequestClose={() => setReturnReasonModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 28, padding: 24, width: '100%', gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#1e293b', textAlign: 'center', marginBottom: 4 }}>↩️ سبب الرجوع</Text>
            {['معيب', 'ما عجبوش', 'غلط', 'رجوع'].map(reason => (
              <TouchableOpacity
                key={reason}
                style={{ backgroundColor: '#fef2f2', borderWidth: 1.5, borderColor: '#fca5a5', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                onPress={() => confirmReturn(reason)}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#ef4444' }}>{reason}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setReturnReasonModal(false)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#94a3b8', fontWeight: '700' }}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══ SELL SUCCESS ═══ */}
      <Modal visible={!!sellSuccess} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {sellSuccess && (
            <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', gap: 10 }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 40 }}>✅</Text>
              </View>
              <Text style={{ fontSize: 22, fontWeight: '900', color: '#15803d' }}>تم البيع!</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e293b', textAlign: 'center' }}>{sellSuccess.name}</Text>
              <View style={{ backgroundColor: '#f0fdf4', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4, width: '100%' }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#16a34a' }}>{sellSuccess.sell} د</Text>
                <Text style={{ fontSize: 12, color: '#86efac', fontWeight: '700', marginTop: 4 }}>ثمن البيع</Text>
              </View>
              {sellSuccess.seller ? (
                <Text style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>🧑‍💼 {sellSuccess.seller}</Text>
              ) : null}
            </View>
          )}
        </View>
      </Modal>

      {/* Generic styled alert modal */}
      <AppAlert
        visible={!!alertModal}
        icon={alertModal?.icon}
        title={alertModal?.title ?? ''}
        message={alertModal?.message}
        buttons={(alertModal?.btns ?? []).map(b => ({ label: b.label, onPress: b.onPress, primary: b.primary }))}
        onDismiss={() => setAlertModal(null)}
      />

      {/* Add new item modal — same form as folder page */}
      <Modal visible={addModal} animationType="slide" transparent onRequestClose={() => { setAddModal(false); setScanned(false); }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { maxHeight: '92%' }]}>
            <Text style={styles.sheetTitle}>📦 إضافة سلعة</Text>
            <ScrollView ref={formScrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* صورة */}
              <View style={fStyles.imgBtnsRow}>
                <TouchableOpacity style={fStyles.imgBtn} onPress={() => pickImage('camera')}>
                  <Text style={fStyles.imgBtnTxt}>📷 تصوير</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[fStyles.imgBtn, fStyles.imgBtnGold]} onPress={() => pickImage('library')}>
                  <Text style={fStyles.imgBtnTxt}>🖼 معرض</Text>
                </TouchableOpacity>
              </View>
              {newImg ? (
                <View style={{ marginBottom: 12 }}>
                  <Image source={{ uri: newImg }} style={fStyles.formImg} resizeMode="contain" />
                  <View style={fStyles.imgBtnsRow}>
                    <TouchableOpacity style={fStyles.imgBtn} onPress={() => pickImage('camera')}>
                      <Text style={fStyles.imgBtnTxt}>📷 تصوير</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[fStyles.imgBtn, fStyles.imgBtnGold]} onPress={() => pickImage('library')}>
                      <Text style={fStyles.imgBtnTxt}>🖼 معرض</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {/* باركود */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <TextInput
                  style={[fStyles.formInput, { flex: 1, marginBottom: 0 }]}
                  value={form.barcode}
                  onChangeText={(v) => f('barcode', v)}
                  placeholder="الباركود (اختياري)"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  returnKeyType="next"
                  onSubmitEditing={() => sNameRef.current?.focus()}
                />
                <TouchableOpacity
                  style={{ width: 48, height: 48, borderRadius: Radii.lg, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => setScanBarcode(true)}
                >
                  <Text style={{ fontSize: 22 }}>📷</Text>
                </TouchableOpacity>
              </View>

              {/* الاسم */}
              <TextInput
                ref={sNameRef}
                style={fStyles.formInput}
                value={form.name}
                onChangeText={(v) => f('name', v)}
                placeholder="الاسم *"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                onSubmitEditing={() => sBuyRef.current?.focus()}
              />

              {/* المجلد */}
              <TouchableOpacity style={fStyles.supplierDropdown} onPress={() => { setShowCats(v => !v); setShowSuppliers(false); }}>
                <Text style={{ color: Colors.textMuted }}>{showCats ? '▲' : '▼'}</Text>
                <Text style={fStyles.supplierDropdownTxt}>
                  {(() => { const fl = app.folders?.find(fl2 => fl2.name === form.cat); return fl ? `${fl.icon} ${fl.name}` : (form.cat || 'اختر المجلد'); })()}
                </Text>
              </TouchableOpacity>
              {showCats && (
                <View style={fStyles.inlineList}>
                  {(app.folders ?? []).filter(fl => fl.active).map((fl) => (
                    <TouchableOpacity key={fl.id} style={fStyles.inlineItem} onPress={() => { f('cat', fl.name); setShowCats(false); }}>
                      <Text style={[fStyles.inlineItemTxt, form.cat === fl.name && { color: '#f59e0b', fontWeight: '900' }]}>{fl.icon} {fl.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* الأسعار */}
              <View style={fStyles.priceRow}>
                <TextInput
                  ref={sBuyRef}
                  style={[fStyles.formInput, { flex: 1 }]}
                  value={form.buy}
                  onChangeText={(v) => f('buy', v)}
                  placeholder="ثمن الشراء"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  returnKeyType="next"
                  onSubmitEditing={() => sSellRef.current?.focus()}
                />
                <TextInput
                  ref={sSellRef}
                  style={[fStyles.formInput, { flex: 1 }]}
                  value={form.sell}
                  onChangeText={(v) => f('sell', v)}
                  placeholder="ثمن البيع"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  returnKeyType="next"
                  onSubmitEditing={() => sQtyRef.current?.focus()}
                />
              </View>

              {/* الربح */}
              <View style={fStyles.profitBox}>
                <Text style={fStyles.profitTxt}>
                  الربح (تلقائي): {formatMAD((parseFloat(form.sell) || 0) - (parseFloat(form.buy) || 0))}
                </Text>
              </View>

              {/* الكمية */}
              <TextInput
                ref={sQtyRef}
                style={fStyles.formInput}
                value={form.qty}
                onChangeText={(v) => f('qty', v)}
                placeholder="الكمية"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                returnKeyType="done"
              />

              {/* المورد - dropup */}
              <View style={{ flexDirection: 'column-reverse' }}>
                <View style={fStyles.supplierRow}>
                  <TouchableOpacity style={fStyles.supplierAddBtn} onPress={addSupplierScan}>
                    <Text style={fStyles.supplierAddTxt}>+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={fStyles.supplierDropdown} onPress={() => { setShowSuppliers(v => { if (!v) setTimeout(() => formScrollRef.current?.scrollToEnd({ animated: true }), 50); return !v; }); setShowCats(false); }}>
                    <Text style={{ color: Colors.textMuted }}>{showSuppliers ? '▼' : '▲'}</Text>
                    <Text style={fStyles.supplierDropdownTxt}>{form.supplier || '-- بدون مورد --'}</Text>
                  </TouchableOpacity>
                </View>
                {showSuppliers && (
                  <View style={fStyles.inlineList}>
                    <TouchableOpacity style={fStyles.inlineItem} onPress={() => { f('supplier', ''); setShowSuppliers(false); }}>
                      <Text style={[fStyles.inlineItemTxt, !form.supplier && { color: '#f59e0b', fontWeight: '900' }]}>-- بدون مورد --</Text>
                    </TouchableOpacity>
                    {[...(app.suppliers ?? [])].reverse().map((s) => (
                      <TouchableOpacity key={s} style={fStyles.inlineItem} onPress={() => { f('supplier', s); setShowSuppliers(false); }}>
                        <Text style={[fStyles.inlineItemTxt, form.supplier === s && { color: '#f59e0b', fontWeight: '900' }]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

            </ScrollView>
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.confirmBtn} onPress={saveNewItem} disabled={uploading}>
                {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmTxt}>✅ حفظ</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setAddModal(false); setScanned(false); setNewImg(null); }}>
                <Text style={styles.cancelTxt}>❌ إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add supplier modal */}
      <Modal visible={addSupplierModal} transparent animationType="fade" onRequestClose={() => setAddSupplierModal(false)}>
        <View style={styles.dialogOverlay}>
          <View style={[styles.dialogCard, { alignItems: 'stretch' }]}>
            <Text style={[styles.dialogTitle, { marginBottom: 16 }]}>مورد جديد</Text>
            <TextInput
              style={[ffStyles.input, { marginBottom: 16 }]}
              value={newSupplierName}
              onChangeText={setNewSupplierName}
              placeholder="اسم المورد"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            <View style={styles.dialogBtns}>
              <TouchableOpacity style={styles.dialogCancel} onPress={() => setAddSupplierModal(false)}>
                <Text style={styles.dialogCancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogConfirm} onPress={confirmAddSupplier}>
                <Text style={styles.dialogConfirmTxt}>✅ إضافة</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Barcode scanner for form field */}
      <Modal visible={scanBarcode} animationType="slide" onRequestClose={() => setScanBarcode(false)}>
        <View style={{ flex: 1 }}>
          <ExpoCameraView scanned={false} onBarcode={onBarcodeForForm} onClose={() => setScanBarcode(false)} />
        </View>
      </Modal>

      {/* Photo camera modal */}
      <Modal visible={showPhotoCamera} animationType="slide" onRequestClose={() => { setShowPhotoCamera(false); setPhotoPreview(null); setCropMode(false); setFreeCropMode(false); fcInitRef.current = false; }}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {photoPreview && freeCropMode ? (
            <View style={{ flex: 1, backgroundColor: 'rgba(15,15,35,0.97)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 24 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 22, width: '100%', overflow: 'hidden' }}>
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#f59e0b' }}>✂️ تعديل الصورة</Text>
                </View>
                <View style={{ height: 390, backgroundColor: '#111' }}
                  onLayout={e => {
                    const { width, height } = e.nativeEvent.layout;
                    fcContRef.current = { w: width, h: height };
                    if (!fcInitRef.current) {
                      fcInitRef.current = true;
                      const pad = 16;
                      syncCB({ x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 });
                    }
                  }}
                >
                  <Image source={{ uri: photoPreview }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                  <View style={StyleSheet.absoluteFill} {...freeCropPR.panHandlers}>
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                      <View style={{ height: cropBox.y, backgroundColor: 'rgba(0,0,0,0.6)' }} />
                      <View style={{ flexDirection: 'row', height: cropBox.h }}>
                        <View style={{ width: cropBox.x, backgroundColor: 'rgba(0,0,0,0.6)' }} />
                        <View style={{ width: cropBox.w, borderWidth: 2, borderColor: '#2563eb' }} />
                        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} />
                      </View>
                      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} />
                    </View>
                    {/* Grid lines — rule of thirds */}
                    <View pointerEvents="none" style={{ position: 'absolute', top: cropBox.y + cropBox.h / 3, left: cropBox.x + 2, width: cropBox.w - 4, height: 1, backgroundColor: 'rgba(255,255,255,0.4)' }} />
                    <View pointerEvents="none" style={{ position: 'absolute', top: cropBox.y + cropBox.h * 2 / 3, left: cropBox.x + 2, width: cropBox.w - 4, height: 1, backgroundColor: 'rgba(255,255,255,0.4)' }} />
                    <View pointerEvents="none" style={{ position: 'absolute', left: cropBox.x + cropBox.w / 3, top: cropBox.y + 2, width: 1, height: cropBox.h - 4, backgroundColor: 'rgba(255,255,255,0.4)' }} />
                    <View pointerEvents="none" style={{ position: 'absolute', left: cropBox.x + cropBox.w * 2 / 3, top: cropBox.y + 2, width: 1, height: cropBox.h - 4, backgroundColor: 'rgba(255,255,255,0.4)' }} />
                    {/* Corner handles */}
                    {([
                      [cropBox.x - 10, cropBox.y - 10],
                      [cropBox.x + cropBox.w - 10, cropBox.y - 10],
                      [cropBox.x - 10, cropBox.y + cropBox.h - 10],
                      [cropBox.x + cropBox.w - 10, cropBox.y + cropBox.h - 10],
                    ] as [number, number][]).map(([left, top], i) => (
                      <View key={i} pointerEvents="none" style={{ position: 'absolute', left, top, width: 20, height: 20, backgroundColor: '#2563eb', borderRadius: 3 }} />
                    ))}
                    {/* Edge midpoint handles */}
                    {([
                      [cropBox.x + cropBox.w / 2 - 6, cropBox.y - 6],
                      [cropBox.x + cropBox.w / 2 - 6, cropBox.y + cropBox.h - 6],
                      [cropBox.x - 6, cropBox.y + cropBox.h / 2 - 6],
                      [cropBox.x + cropBox.w - 6, cropBox.y + cropBox.h / 2 - 6],
                    ] as [number, number][]).map(([left, top], i) => (
                      <View key={`m${i}`} pointerEvents="none" style={{ position: 'absolute', left, top, width: 12, height: 12, backgroundColor: '#2563eb', borderRadius: 2 }} />
                    ))}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', padding: 16, gap: 12 }}>
                  <TouchableOpacity style={{ flex: 2, backgroundColor: '#16a34a', paddingVertical: 16, borderRadius: 14, alignItems: 'center' }}
                    onPress={applyFreeCrop}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>✅ حفظ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#ef4444', paddingVertical: 16, borderRadius: 14, alignItems: 'center' }}
                    onPress={() => { setFreeCropMode(false); fcInitRef.current = false; setCropMode(true); }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>✗ إلغاء</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : photoPreview && cropMode ? (
            <>
              <Image source={{ uri: photoPreview }} style={{ flex: 1 }} resizeMode="contain" />
              <View style={{ backgroundColor: '#111', paddingHorizontal: 16, paddingVertical: 20, gap: 10 }}>
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '900', fontSize: 15 }}>✂️ اختر النسبة</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['1:1', '3:4', '4:3'] as const).map(ratio => (
                    <TouchableOpacity key={ratio} style={{ flex: 1, backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 14, alignItems: 'center' }}
                      onPress={async () => { try { setPhotoPreview(await applyCrop(photoPreview, ratio)); } catch {} setCropMode(false); }}>
                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{ratio}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#7c3aed', paddingVertical: 14, borderRadius: 14, alignItems: 'center' }}
                    onPress={() => { setCropMode(false); fcInitRef.current = false; setFreeCropMode(true); }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>✏️ حر</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#374151', paddingVertical: 14, borderRadius: 14, alignItems: 'center' }} onPress={() => setCropMode(false)}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>رجوع</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : photoPreview ? (
            <>
              <Image source={{ uri: photoPreview }} style={{ flex: 1 }} resizeMode="contain" />
              <View style={{ position: 'absolute', bottom: 50, width: '100%', flexDirection: 'row', paddingHorizontal: 16, gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#16a34a', paddingVertical: 14, borderRadius: 16, alignItems: 'center' }} onPress={() => { setNewImg(photoPreview); setPhotoPreview(null); setShowPhotoCamera(false); }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>✅ حفظ</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#1d4ed8', paddingVertical: 14, borderRadius: 16, alignItems: 'center' }} onPress={() => setCropMode(true)}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>✂️ قص</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#374151', paddingVertical: 14, borderRadius: 16, alignItems: 'center' }} onPress={() => setPhotoPreview(null)}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>🔄 إعادة</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <CameraView ref={photoCameraRef} style={{ flex: 1 }} facing="back" mute enableTorch={photoFlash === 'on'} />
              <View style={{ position: 'absolute', top: 50, left: 20 }}>
                <TouchableOpacity style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: photoFlash === 'on' ? '#fbbf24' : 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: photoFlash === 'on' ? '#f59e0b' : 'rgba(255,255,255,0.3)' }}
                  onPress={() => setPhotoFlash(f => f === 'off' ? 'on' : 'off')}>
                  <Text style={{ fontSize: 24 }}>{photoFlash === 'on' ? '⚡' : '🔦'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ position: 'absolute', bottom: 50, width: '100%', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', borderWidth: 4, borderColor: '#ccc' }} onPress={takePhoto} />
                <TouchableOpacity onPress={() => setShowPhotoCamera(false)}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>إلغاء</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>

    </SafeAreaView>
  );
}

function FormField({ label, value, onChange, placeholder, kb }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; kb?: 'numeric';
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={ffStyles.label}>{label}</Text>
      <TextInput style={ffStyles.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.textMuted} keyboardType={kb ?? 'default'} />
    </View>
  );
}

const ffStyles = StyleSheet.create({
  label: { fontSize: 13, color: Colors.textMuted, fontWeight: '700', textAlign: 'right', marginBottom: 4 },
  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg, padding: 13, fontSize: 15, color: Colors.text, backgroundColor: Colors.background, fontWeight: '600', textAlign: 'right' },
});

const fStyles = StyleSheet.create({
  imgBtnsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  imgBtn: { flex: 1, padding: 12, borderRadius: Radii.lg, backgroundColor: '#10b981', alignItems: 'center' },
  imgBtnGold: { backgroundColor: '#f59e0b' },
  imgBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  formImg: { width: '100%', height: 200, borderRadius: Radii.lg, marginBottom: 6, backgroundColor: '#000' },
  formInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg, padding: 12, fontSize: 14, color: Colors.text, backgroundColor: Colors.background, fontWeight: '600', marginBottom: 10, textAlign: 'right' },
  priceRow: { flexDirection: 'row', gap: 10, marginBottom: 0 },
  profitBox: { backgroundColor: '#f0fdf4', borderRadius: Radii.lg, padding: 12, marginBottom: 10, borderWidth: 1.5, borderColor: '#86efac' },
  profitTxt: { fontSize: 14, fontWeight: '700', color: '#15803d', textAlign: 'right' },
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  supplierAddBtn: { width: 42, height: 42, borderRadius: Radii.lg, backgroundColor: '#f59e0b', alignItems: 'center', justifyContent: 'center' },
  supplierAddTxt: { fontSize: 22, fontWeight: '900', color: '#fff' },
  supplierDropdown: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg, padding: 12, backgroundColor: Colors.background, marginBottom: 10 },
  supplierDropdownTxt: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'right', flex: 1 },
  inlineList: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg, backgroundColor: Colors.background, marginBottom: 10, overflow: 'hidden' },
  inlineItem: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  inlineItemTxt: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'right' },
});

const infoRow: import('react-native').ViewStyle = {
  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
};
const infoLbl: import('react-native').TextStyle = { fontSize: 13, fontWeight: '700', color: '#64748b' };
const infoVal: import('react-native').TextStyle = { fontSize: 15, fontWeight: '800', color: '#1e293b', textAlign: 'right', flex: 1, marginRight: 12 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },

  permBtn: { backgroundColor: Colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: Radii.xl, marginTop: 8 },
  permBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

  cameraWrap: { flex: 1, overflow: 'hidden' },
  cameraVisible: { flex: 1 },
  cameraHidden: { height: 0, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
  topBar: { width: '100%', paddingTop: 16, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.55)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  frame: { width: 260, height: 260, marginTop: 100, alignItems: 'center', justifyContent: 'center' },
  frameHint: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', marginTop: 8 },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: '#fff', borderWidth: 3 },
  tl: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
  tr: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
  bl: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
  br: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },

  scanAgainWrap: { padding: 16, alignItems: 'center' },
  scanAgainBtn: { backgroundColor: Colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: Radii.xl },
  scanAgainTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

  foundCard: { backgroundColor: Colors.card, margin: 12, borderRadius: Radii.xl, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, ...Shadow.card, borderWidth: 2, borderColor: Colors.primary + '30' },
  foundInfo: { flex: 1 },
  foundName: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  foundCat: { fontSize: 12, color: Colors.textMuted, marginTop: 3, textAlign: 'right' },
  foundSup: { fontSize: 12, color: '#0369a1', marginTop: 2, textAlign: 'right' },
  foundCode: { fontSize: 11, color: Colors.textMuted, marginTop: 3, textAlign: 'right' },
  foundPrices: { alignItems: 'center', gap: 6 },
  qtyBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  qtyTxt: { fontSize: 18, fontWeight: '900' },
  foundSell: { fontSize: 15, fontWeight: '900', color: Colors.text },
  foundBuy: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingBottom: 12 },
  actionBtn: { flex: 1, padding: 16, borderRadius: Radii.xl, alignItems: 'center', borderWidth: 1.5 },
  actionTxt: { fontSize: 16, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 16 },
  codeLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: '700', textAlign: 'right', marginBottom: 16, backgroundColor: Colors.background, padding: 10, borderRadius: 10 },
  sheetFooter: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: Radii.lg, backgroundColor: '#ef4444', alignItems: 'center' },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: Radii.lg, backgroundColor: '#10b981', alignItems: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  dialogOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  dialogCard: { backgroundColor: '#fff', borderRadius: 28, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 16 },
  dialogIconWrap: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#fce7f3', borderWidth: 3, borderColor: '#10b981', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  dialogTitle: { fontSize: 22, fontWeight: '900', color: '#1e293b', marginBottom: 12, textAlign: 'center' },
  dialogMsg: { fontSize: 15, color: '#64748b', fontWeight: '600', textAlign: 'center', lineHeight: 26, marginBottom: 24 },
  dialogBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  dialogCancel: { flex: 1, paddingVertical: 16, borderRadius: 18, backgroundColor: '#f1f5f9', alignItems: 'center' },
  dialogCancelTxt: { fontSize: 15, fontWeight: '800', color: '#ef4444' },
  dialogConfirm: { flex: 2, paddingVertical: 16, borderRadius: 18, backgroundColor: '#10b981', alignItems: 'center' },
  dialogConfirmTxt: { fontSize: 15, fontWeight: '900', color: '#fff' },
});
