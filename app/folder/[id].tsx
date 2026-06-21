import { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, Alert, KeyboardAvoidingView, Platform, ScrollView, Image, ActivityIndicator,
  PanResponder, I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAppStore } from '../../src/store/appStore';
import { Colors, Radii, Shadow } from '../../src/theme/colors';
import { getFolderColor, getItemsForFolder, makeSaleRecord, generateId, formatMAD, nowDate, getTotalQty } from '../../src/utils/helpers';
import { sendNow } from '../../src/utils/notificationService';
import { logActivity } from '../../src/utils/activityLogger';
import AppHeader from '../../src/components/AppHeader';
import AppAlert, { AppAlertButton } from '../../src/components/AppAlert';
import { usePermissions } from '../../src/hooks/usePermissions';

import { uploadItemImage, deleteItemImage } from '../../src/firebase/storage';
import type { StockItem, ArchiveSale } from '../../src/types';

const EMPTY_FORM = { name: '', sell: '', buy: '', qty: '', supplier: '', barcode: '', cat: '' };

export default function FolderDetailScreen() {
  const { id, editBarcode: editBarcodeParam, openAdd: autoAddParam } = useLocalSearchParams<{ id: string; editBarcode?: string; openAdd?: string }>();
  const folderId = decodeURIComponent(id ?? '');
  const { app, auth, updateApp } = useAppStore();

  const folder = app.folders?.find((f) => f.id === folderId);
  const col = folder ? getFolderColor(folder) : { bg: '#f1f5f9', fg: '#64748b' };

  const [search, setSearch] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [clickActionItem, setClickActionItem] = useState<{ bc: string; item: StockItem } | null>(null);
  const [editBarcode, setEditBarcode] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sellConfirm, setSellConfirm] = useState<{ bc: string; item: StockItem } | null>(null);
  const [imgZoom, setImgZoom] = useState(false);
  const [soldDetail, setSoldDetail] = useState<{ bc: string; item: StockItem } | null>(null);
  const [itemDetail, setItemDetail] = useState<{ bc: string; item: StockItem } | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const cameFromParamRef = useRef(false);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [newImg, setNewImg] = useState<string | null>(null);
  const [imgRatio, setImgRatio] = useState(4 / 3);
  useEffect(() => {
    if (newImg) Image.getSize(newImg, (w, h) => setImgRatio(w / h), () => setImgRatio(4 / 3));
    else setImgRatio(4 / 3);
  }, [newImg]);
  const [removeImg, setRemoveImg] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [showBcScanner, setShowBcScanner] = useState(false);
  const bcScannedRef = useRef(false);
  const [editMode, setEditMode] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const isCapturing = useRef(false);
  const nameRef = useRef<any>(null);
  const buyRef = useRef<any>(null);
  const sellRef = useRef<any>(null);
  const qtyRef = useRef<any>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [addSupplierModal, setAddSupplierModal] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [appAlert, setAppAlert] = useState<{ icon?: string; title: string; message?: string; buttons: AppAlertButton[] } | null>(null);
  const [returnReasonEntry, setReturnReasonEntry] = useState<{ entry: any } | null>(null);
  const [pendingLinked, setPendingLinked] = useState<{ bc: string; qty: number }[]>([]);
  const [manualBcInput, setManualBcInput] = useState('');
  const formScrollRef = useRef<ScrollView>(null);
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

  const perm = usePermissions();

  const allItems = useMemo(
    () => getItemsForFolder(app.stock, folder?.name ?? ''),
    [app.stock, folder?.name],
  );

  const ARCHIVE_CATS = ['جديد', 'مستعمل'];
  const isArchiveCat = ARCHIVE_CATS.includes(folder?.name ?? '');
  const isClickFolder = folder?.special === 'click' || folder?.name === 'CLICK';

  const filtered = useMemo(() => {
    const active = isArchiveCat
      ? allItems.filter(([, item]) => !item.soldAt)
      : allItems;
    if (!search.trim()) return active;
    const q = search.toLowerCase();
    return active.filter(([bc, item]) =>
      item.name.toLowerCase().includes(q) || bc.includes(q),
    );
  }, [allItems, search, isArchiveCat]);

  const archivedItems = useMemo(() => {
    if (!isArchiveCat) return [];
    const folderName = folder?.name ?? '';
    const all = (app.archiveSales ?? []).filter(e => e.cat === folderName);
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(e => e.name.toLowerCase().includes(q) || e.bc.includes(q));
  }, [app.archiveSales, folder?.name, search, isArchiveCat]);

  // يجب أن يكون هذا useEffect قبل أي early return — قاعدة React
  useEffect(() => {
    if (!editBarcodeParam || !app.stock || !folder) return;
    const item = app.stock[editBarcodeParam];
    if (item) {
      cameFromParamRef.current = true;
      setEditBarcode(editBarcodeParam);
      setForm({
        name: item.name,
        sell: String(item.sell),
        buy: String(item.buy),
        qty: '',
        supplier: item.supplier ?? '',
        barcode: editBarcodeParam,
        cat: item.cat,
      });
      setNewImg(item.img ?? null);
      setRemoveImg(false);
      setAddModal(true);
    }
  }, [editBarcodeParam, folder?.id]);

  // فتح modal الإضافة تلقائياً إلا جاء param openAdd=1
  useEffect(() => {
    if (autoAddParam === '1' && folder) {
      setEditBarcode(null);
      setForm({ ...EMPTY_FORM, cat: folder.name });
      setNewImg(null);
      setRemoveImg(false);
      setAddModal(true);
    }
  }, [autoAddParam, folder?.id]);

  if (!folder) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFound}>المجلد غير موجود</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: Colors.primary, marginTop: 12 }}>رجوع</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function openAdd() {
    setEditBarcode(null);
    setForm({ ...EMPTY_FORM, cat: folder!.name });
    setNewImg(null);
    setRemoveImg(false);
    setPendingLinked([]);
    setAddModal(true);
  }

  function openEdit(bc: string, item: StockItem) {
    setEditBarcode(bc);
    setForm({
      name: item.name,
      sell: String(item.sell),
      buy: String(item.buy),
      qty: '',
      supplier: item.supplier ?? '',
      barcode: bc,
      cat: item.cat,
    });
    setNewImg(item.img ?? null);
    setRemoveImg(false);
    setAddModal(true);
  }

  function closeModal() {
    setAddModal(false);
    if (cameFromParamRef.current) { cameFromParamRef.current = false; router.back(); }
  }

  async function compressUri(uri: string): Promise<string> {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 900 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  }

  async function pickImage(source: 'camera' | 'library') {
    if (source === 'camera') {
      if (!camPerm?.granted) {
        const { granted } = await requestCamPerm();
        if (!granted) { setAppAlert({ icon: '📷', title: 'إذن الكاميرا', message: 'خاصنا إذن الكاميرا باش نصورو', buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] }); return; }
      }
      setShowCamera(true);
    } else {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true });
      if (!result.canceled && result.assets[0]) {
        setNewImg(await compressUri(result.assets[0].uri));
      }
    }
  }

  async function takePhoto() {
    if (!cameraRef.current || isCapturing.current) return;
    isCapturing.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, shutterSound: false } as any);
      if (photo?.uri) setPhotoPreview(await compressUri(photo.uri));
    } finally {
      isCapturing.current = false;
    }
  }

  function handleFormBarcodeScan({ data }: { data: string }) {
    if (bcScannedRef.current) return;
    bcScannedRef.current = true;
    setShowBcScanner(false);

    // نفس الكود موجود → +1 أوتوماتيك
    const existingInList = pendingLinked.find(l => l.bc === data);
    if (existingInList) {
      setPendingLinked(p => p.map(l => l.bc === data ? { ...l, qty: l.qty + 1 } : l));
      setAppAlert({ icon: '✅', title: `+1 — ${data}`, message: `الكمية: ${existingInList.qty + 1}`, buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] });
      return;
    }

    // كود جديد → يضاف للقائمة
    setPendingLinked(p => [...p, { bc: data, qty: 1 }]);
    setAppAlert({ icon: '✅', title: 'أضيف', message: `${data} — 1 قطعة`, buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] });

    // مزال نحتاج barcode الرئيسي للفورم
    if (!form.barcode) f('barcode', data);
    const existing = app.stock[data];
    if (existing) {
      setAppAlert({ icon: '⚠️', title: 'منتوج موجود', message: `"${existing.name}" موجود في المخزون. بغيتي تعدّل عليه؟`, buttons: [
        { label: 'لا، متابعة', onPress: () => setAppAlert(null) },
        { label: '✏️ تعديل', onPress: () => { setAppAlert(null); setAddModal(false); setTimeout(() => openEdit(data, existing), 300); }, primary: true },
      ] });
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

  async function saveItem() {
    if (!form.name.trim() || !form.sell || !form.buy) {
      setAppAlert({ icon: '✏️', title: 'معلومات ناقصة', message: 'أدخل الاسم والأسعار', buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] });
      return;
    }
    const isEdit = !!editBarcode;
    // في الإضافة: أول كود من pendingLinked هو الرئيسي
    const firstBc = !isEdit && pendingLinked.length > 0 ? pendingLinked[0].bc : form.barcode.trim();
    const firstQty = !isEdit && pendingLinked.length > 0 ? pendingLinked[0].qty : undefined;
    const newBc = firstBc || (isEdit ? editBarcode! : generateId());
    const bc = newBc;
    const barcodeChanged = isEdit && bc !== editBarcode;
    const originalItem = isEdit ? app.stock[editBarcode!] : null;

    let imgUrl: string | undefined = isEdit && !removeImg ? originalItem?.img : undefined;
    if (!removeImg && newImg && newImg.startsWith('file://')) {
      setUploading(true);
      try {
        // مسح الصورة القديمة من Firebase قبل رفع الجديدة
        if (isEdit && originalItem?.img) deleteItemImage(originalItem.img);
        imgUrl = await uploadItemImage(newImg);
      } catch {
        setAppAlert({ icon: '🖼️', title: 'خطأ', message: 'فشل تحميل الصورة، المنتج سيُحفظ بدون صورة', buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] });
      } finally {
        setUploading(false);
      }
    } else if (!removeImg && newImg) {
      imgUrl = newImg;
    }

    const item: StockItem = {
      name: form.name.trim(),
      cat: form.cat || folder!.name,
      sell: parseFloat(form.sell) || 0,
      buy: parseFloat(form.buy) || 0,
      qty: isEdit ? Math.max(0, (originalItem?.qty ?? 0) + (parseInt(form.qty) || 0)) : Math.max(1, firstQty ?? parseInt(form.qty) || 1),
      supplier: form.supplier.trim() || undefined,
      addedBy: isEdit ? (originalItem?.addedBy ?? auth?.name) : auth?.name,
      linkedBarcodes: !isEdit && pendingLinked.length > 1 ? pendingLinked.slice(1) : (isEdit ? originalItem?.linkedBarcodes : undefined),
      editedBy: isEdit ? auth?.name : undefined,
      img: imgUrl,
    };

    updateApp((prev) => {
      const newStock = { ...prev.stock };
      if (barcodeChanged) delete newStock[editBarcode!];
      newStock[bc] = item;
      const updatedArchive = barcodeChanged
        ? (prev.archiveSales ?? []).map(e => e.bc === editBarcode ? { ...e, bc } : e)
        : prev.archiveSales;
      if (!isEdit) {
        const record = makeSaleRecord({
          name: `📦 أضاف: ${item.name}`,
          sell: item.sell * item.qty,
          buy: item.buy * item.qty,
          cat: folder!.name,
          seller: auth?.name ?? '',
        });
        return { ...prev, stock: newStock, archiveSales: updatedArchive, todaySales: [...prev.todaySales, record] };
      }
      return { ...prev, stock: newStock, archiveSales: updatedArchive };
    });
    if (!editBarcode) {
      logActivity('add_stock', `📦 أضاف: ${item.name} (${item.qty} قطعة)`, auth?.name ?? '');
    } else {
      const qtyChange = parseInt(form.qty) || 0;
      if (qtyChange < 0) {
        logActivity('add_stock', `📉 تصحيح: ${item.name} (${qtyChange} قطعة — باقي: ${item.qty})`, auth?.name ?? '');
      } else if (qtyChange > 0) {
        logActivity('add_stock', `📦 زاد: ${item.name} (+${qtyChange} قطعة — باقي: ${item.qty})`, auth?.name ?? '');
      } else {
        logActivity('add_stock', `✏️ عدّل: ${item.name}`, auth?.name ?? '');
      }
    }
    closeModal();
  }

  function addSupplier() {
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

  function sellItem(bc: string, item: StockItem) {
    if (item.qty <= 0) { setAppAlert({ icon: '🛑', title: 'المخزون فارغ', buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] }); return; }
    setSellConfirm({ bc, item });
  }

  function confirmSell() {
    if (!sellConfirm) return;
    const { bc, item } = sellConfirm;
    updateApp((prev) => {
      const newQty = item.qty - 1;
      const newStock = { ...prev.stock, [bc]: { ...item, qty: newQty } };
      if (newQty <= 0) {
        if (ARCHIVE_CATS.includes(item.cat)) {
          newStock[bc] = { ...item, qty: 0, soldAt: nowDate().date, soldBy: auth?.name ?? '' };
        } else {
          delete newStock[bc];
          sendNow('📭 نفد الستوك', `${item.name} — ${folder!.name}`).catch(() => {});
        }
      } else if (newQty <= 2) {
        sendNow('⚠️ ستوك قليل', `${item.name} — باقي ${newQty} قطع`).catch(() => {});
      }
      const record = makeSaleRecord({
        name: item.name, sell: item.sell, buy: item.buy,
        cat: folder!.name, seller: auth?.name ?? '',
        addedBy: item.addedBy, editedBy: item.editedBy,
      });
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
    setSellConfirm(null);
  }

  function deleteItem(bc: string, item: StockItem) {
    if (!perm.canRequestDelete) {
      setAppAlert({ icon: '🚫', title: 'غير مصرح', message: 'ما عندكش الإذن بالحذف', buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] }); return;
    }
    setAppAlert({ icon: '🗑️', title: 'طلب حذف', message: `إرسال طلب حذف "${item.name}" للمدير؟`, buttons: [
      { label: 'إلغاء', onPress: () => setAppAlert(null) },
      { label: '📨 إرسال', danger: true, onPress: () => {
        setAppAlert(null);
        updateApp((prev) => ({
          ...prev,
          stock: { ...prev.stock, [bc]: { ...item, pendingDeletion: true, deletionRequestedBy: auth?.name } },
        }));
        logActivity('delete_req', `🗑️ طلب حذف: ${item.name}`, auth?.name ?? '');
        setAppAlert({ icon: '📨', title: 'تم الإرسال', message: 'تم إرسال طلب الحذف للمراجعة', buttons: [{ label: 'حسناً', onPress: () => setAppAlert(null), primary: true }] });
      }},
    ]});

  }

  function f(k: keyof typeof EMPTY_FORM, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  return (
    <SafeAreaView style={styles.root}>
      <AppHeader
        title={`${folder.icon} ${folder.name}`}
        sub={`${allItems.length} صنف`}
        onBack={() => router.back()}
        rightAction={(perm.canEditProduct) ? { label: editMode ? '✅' : '✏️', onPress: () => setEditMode(v => !v) } : undefined}
      />

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 ابحث..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Items list */}
      <FlatList
        data={filtered}
        keyExtractor={([bc]) => bc}
        contentContainerStyle={styles.list}
        renderItem={({ item: [bc, item] }) => {
          const getUserColor = (name?: string) =>
            name ? (Object.values(app.users ?? {}).find(u => u.name === name)?.color ?? '#64748b') : '#64748b';
          const addedColor  = getUserColor(item.addedBy);
          const editedColor = getUserColor(item.editedBy);
          return (
          <TouchableOpacity
            style={[styles.itemCard, item.pendingDeletion && styles.itemPending]}
            onPress={() => {
              if (!item.pendingDeletion && isClickFolder) {
                setClickActionItem({ bc, item });
              } else if (!item.pendingDeletion && perm.isPransibal) {
                setClickActionItem({ bc, item });
              } else {
                item.soldAt ? setSoldDetail({ bc, item }) : setItemDetail({ bc, item });
              }
            }}
            activeOpacity={0.75}
          >

            {/* RIGHT GROUP: image + [qty+name] on its left */}
            <View style={styles.imgGroup}>
              {item.img ? (
                <TouchableOpacity onPress={() => setImgPreview(item.img!)} activeOpacity={0.85}>
                  <View style={{ borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
                    <Image source={{ uri: item.img }} style={styles.itemImg} resizeMode="contain" />
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={styles.itemImgBox}><Text style={{ fontSize: 22 }}>📦</Text></View>
              )}
              <View style={styles.imgSideInfo}>
                {item.soldAt ? (
                  <View style={[styles.qtyBadge, { backgroundColor: '#fef2f2' }]}>
                    <Text style={[styles.qtyTxt, { color: '#ef4444' }]}>مباع</Text>
                  </View>
                ) : getTotalQty(item) > 0 ? (
                  <View style={[styles.qtyBadge, { backgroundColor: getTotalQty(item) <= 2 ? Colors.dangerLight : '#dcfce7' }]}>
                    <Text style={[styles.qtyTxt, { color: getTotalQty(item) <= 2 ? Colors.danger : '#16a34a' }]}>{getTotalQty(item)}</Text>
                  </View>
                ) : null}
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
              </View>
            </View>

            {/* MIDDLE: price + details */}
            <View style={styles.itemContent}>
              <Text style={styles.itemSell}>{formatMAD(item.sell)}</Text>
              {!perm.isStaff && <Text style={styles.itemBuy}>ش: {formatMAD(item.buy)}</Text>}
              <View style={styles.metaRow}>
                {item.supplier ? <Text style={styles.supplierMeta} numberOfLines={1}>🏭 {item.supplier}</Text> : null}
                {item.addedBy ? <Text style={[styles.userMeta, { color: addedColor }]} numberOfLines={1}>👤 {item.addedBy}</Text> : null}
                {item.editedBy ? <Text style={[styles.userMeta, { color: editedColor }]} numberOfLines={1}>✏️ {item.editedBy}</Text> : null}
              </View>
              {item.pendingDeletion && <Text style={styles.pendingTag}>⏳ طلب حذف معلق</Text>}
            </View>


            {/* LEFT: edit/delete buttons — only in editMode */}
            {editMode && (
              <View style={styles.itemBtnsRow}>
                {perm.canEditProduct && !item.pendingDeletion && (
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(bc, item)}>
                    <Text style={styles.editBtnTxt}>✏️</Text>
                  </TouchableOpacity>
                )}
                {(perm.canDeleteDirect || perm.canRequestDelete) && (
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(bc, item)}>
                    <Text style={styles.deleteBtnTxt}>🗑️</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTxt}>لا توجد سلع</Text>
          </View>
        }
        ListHeaderComponent={archivedItems.length > 0 ? (
          <View style={{ marginBottom: 8, paddingHorizontal: 4 }}>
            <TouchableOpacity
              onPress={() => setArchiveOpen(o => !o)}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}
            >
              <Text style={{ fontSize: 13, color: '#64748b' }}>{archiveOpen ? '▲' : '▼'}</Text>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: '#64748b', textAlign: 'right' }}>🗄️ أرشيف — {archivedItems.length} سلعة</Text>
            </TouchableOpacity>
            {archiveOpen && (
              <View style={{ marginTop: 8, gap: 8 }}>
                {archivedItems.map((entry) => (
                  <View key={entry.id} style={[styles.itemCard, { opacity: 0.75, borderStyle: 'dashed', borderColor: '#94a3b8' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemName, { color: '#64748b' }]}>{entry.name}</Text>
                      <Text style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>📅 {entry.soldAt}{entry.soldBy ? ` · ${entry.soldBy}` : ''}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text style={[styles.itemSell, { color: '#94a3b8' }]}>{entry.sell} د</Text>
                      <TouchableOpacity
                        style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}
                        onPress={() => setReturnReasonEntry({ entry })}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#16a34a' }}>↩️ رجوع</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
      />


      {/* زر إضافة منتج — Admin فقط */}
      {(perm.canAddProduct || isClickFolder) && (
        <TouchableOpacity
          style={{ position: 'absolute', bottom: 90, left: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: isClickFolder ? '#10b981' : '#5c67f2', alignItems: 'center', justifyContent: 'center', elevation: 20, zIndex: 999, shadowColor: '#5c67f2', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
          onPress={openAdd}
          activeOpacity={0.85}
        >
          <Text style={{ fontSize: 28, color: '#fff', lineHeight: 32 }}>+</Text>
        </TouchableOpacity>
      )}

      {/* CLICK — modal 3 خيارات */}
      {clickActionItem && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setClickActionItem(null)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }} activeOpacity={1} onPress={() => setClickActionItem(null)}>
            <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '85%', gap: 14 }} onStartShouldSetResponder={() => true}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#1e293b', textAlign: 'center', marginBottom: 4 }} numberOfLines={1}>{clickActionItem.item.name}</Text>

              {/* بيع */}
              {clickActionItem.item.qty > 0 && (
                <TouchableOpacity
                  style={{ backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 14, alignItems: 'center' }}
                  onPress={() => { setClickActionItem(null); sellItem(clickActionItem.bc, clickActionItem.item); }}
                >
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>💰 بيع — {clickActionItem.item.sell} د</Text>
                </TouchableOpacity>
              )}

              {/* روتور */}
              <TouchableOpacity
                style={{ backgroundColor: '#f97316', paddingVertical: 14, borderRadius: 14, alignItems: 'center' }}
                onPress={() => {
                  const { bc, item } = clickActionItem;
                  setClickActionItem(null);
                  setAppAlert({ icon: '↩️', title: 'تأكيد الروتور', message: `رجع "${item.name}" للستوك؟`, buttons: [
                    { label: 'إلغاء', onPress: () => setAppAlert(null) },
                    { label: '✅ تأكيد', primary: true, onPress: () => {
                      setAppAlert(null);
                      updateApp(prev => ({
                        ...prev,
                        stock: { ...prev.stock, [bc]: { ...item, qty: item.qty + 1 } },
                        todaySales: [...prev.todaySales, { nid: `ret_${Date.now()}`, name: item.name, sell: -(item.sell), buy: -(item.buy), cat: item.cat, seller: auth?.name ?? '', time: new Date().toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' }), dateString: new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/'), monthKey: `${new Date().getFullYear()}_${String(new Date().getMonth() + 1).padStart(2, '0')}`, yearKey: String(new Date().getFullYear()) }],
                      }));
                      logActivity('return', `↩️ رجع: ${item.name}`, auth?.name ?? '', item.sell);
                    }},
                  ]});
                }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>↩️ روتور — رجع للستوك</Text>
              </TouchableOpacity>

              {/* خسرة */}
              {clickActionItem.item.qty > 0 && (
                <TouchableOpacity
                  style={{ backgroundColor: '#dc2626', paddingVertical: 14, borderRadius: 14, alignItems: 'center' }}
                  onPress={() => {
                    const { bc, item } = clickActionItem;
                    setClickActionItem(null);
                    setAppAlert({ icon: '💸', title: 'تأكيد الخسرة', message: `تسجيل خسرة "${item.name}" — ${item.buy} د؟`, buttons: [
                      { label: 'إلغاء', onPress: () => setAppAlert(null) },
                      { label: '✅ تأكيد', primary: true, onPress: () => {
                        setAppAlert(null);
                        const newQty = item.qty - 1;
                        updateApp(prev => ({
                          ...prev,
                          stock: { ...prev.stock, [bc]: { ...item, qty: newQty } },
                          todaySales: [...prev.todaySales, { nid: `loss_${Date.now()}`, name: `🗑️ خسرة: ${item.name}`, sell: 0, buy: item.buy, cat: item.cat, seller: auth?.name ?? '', time: new Date().toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' }), dateString: new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/'), monthKey: `${new Date().getFullYear()}_${String(new Date().getMonth() + 1).padStart(2, '0')}`, yearKey: String(new Date().getFullYear()) }],
                        }));
                        logActivity('expense', `💸 خسرة: ${item.name} — ${item.buy} د`, auth?.name ?? '', item.buy);
                      }},
                    ]});
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>💸 خسرة — {clickActionItem.item.buy} د</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={() => setClickActionItem(null)}>
                <Text style={{ textAlign: 'center', color: '#94a3b8', fontWeight: '700', marginTop: 4 }}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* ═══ CAMERA ═══ */}
      <Modal visible={showCamera} animationType="slide" onRequestClose={() => { setShowCamera(false); setPhotoPreview(null); setCropMode(false); setFreeCropMode(false); fcInitRef.current = false; }}>
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
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#16a34a', paddingVertical: 14, borderRadius: 16, alignItems: 'center' }} onPress={() => { setNewImg(photoPreview); setPhotoPreview(null); setShowCamera(false); }}>
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
              <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" mute enableTorch={flash === 'on'} />
              <View style={{ position: 'absolute', top: 50, left: 20 }}>
                <TouchableOpacity style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: flash === 'on' ? '#fbbf24' : 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: flash === 'on' ? '#f59e0b' : 'rgba(255,255,255,0.3)' }}
                  onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}>
                  <Text style={{ fontSize: 24 }}>{flash === 'on' ? '⚡' : '🔦'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ position: 'absolute', bottom: 50, width: '100%', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', borderWidth: 4, borderColor: '#ccc' }} onPress={takePhoto} />
                <TouchableOpacity onPress={() => setShowCamera(false)}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>إلغاء</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* ═══ INLINE BARCODE SCANNER ═══ */}
      <Modal visible={showBcScanner} animationType="slide" onRequestClose={() => setShowBcScanner(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {camPerm?.granted ? (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
              onBarcodeScanned={handleFormBarcodeScan}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', marginBottom: 16 }}>الكاميرا محتاجة إذن</Text>
              <TouchableOpacity onPress={requestCamPerm} style={{ backgroundColor: '#f59e0b', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>منح الإذن</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <View style={{ width: 260, height: 160, borderWidth: 2, borderColor: '#f59e0b', borderRadius: 12 }} />
          </View>
          <TouchableOpacity
            style={{ position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24 }}
            onPress={() => setShowBcScanner(false)}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>❌ إلغاء</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ═══ IMAGE PREVIEW ═══ */}
      <Modal visible={!!imgPreview} transparent animationType="fade" onRequestClose={() => setImgPreview(null)}>
        <TouchableOpacity style={styles.imgPreviewOverlay} activeOpacity={1} onPress={() => setImgPreview(null)}>
          {imgPreview && (
            <Image source={{ uri: imgPreview }} style={styles.imgPreviewFull} resizeMode="contain" />
          )}
          <Text style={styles.imgPreviewClose}>✕</Text>
        </TouchableOpacity>
      </Modal>

      {/* ═══ ITEM DETAIL MODAL ═══ */}
      <Modal visible={!!itemDetail} transparent animationType="slide" onRequestClose={() => setItemDetail(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setItemDetail(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => setItemDetail(null)}>
                  <Text style={{ fontSize: 18, color: '#94a3b8' }}>✕</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e293b' }}>تفاصيل المنتوج</Text>
                <View style={{ width: 24 }} />
              </View>
              {itemDetail && <>
                {itemDetail.item.img && (
                  <Image source={{ uri: itemDetail.item.img }} style={{ width: '100%', height: 160, borderRadius: 12 }} resizeMode="contain" />
                )}
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#1e293b', textAlign: 'right' }}>{itemDetail.item.name}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1, backgroundColor: '#f0fdf4', padding: 10, borderRadius: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#16a34a' }}>{itemDetail.item.sell} د</Text>
                    <Text style={{ fontSize: 11, color: '#86efac' }}>ثمن البيع</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#fff7ed', padding: 10, borderRadius: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#ea580c' }}>{itemDetail.item.buy} د</Text>
                    <Text style={{ fontSize: 11, color: '#fdba74' }}>ثمن الشراء</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#f8fafc', padding: 10, borderRadius: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#475569' }}>{itemDetail.item.qty}</Text>
                    <Text style={{ fontSize: 11, color: '#94a3b8' }}>الكمية</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: '#f8fafc', padding: 10, borderRadius: 10 }}>
                  <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'right' }}>🔖 {itemDetail.bc}</Text>
                </View>
                {itemDetail.item.supplier ? <Text style={{ fontSize: 13, color: '#1e293b', textAlign: 'right' }}>🏭 {itemDetail.item.supplier}</Text> : null}
                {itemDetail.item.addedBy ? <Text style={{ fontSize: 13, color: '#7c3aed', textAlign: 'right' }}>👤 {itemDetail.item.addedBy}</Text> : null}
              </>}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ═══ SOLD DETAIL MODAL ═══ */}
      <Modal visible={!!soldDetail} transparent animationType="slide" onRequestClose={() => setSoldDetail(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setSoldDetail(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => setSoldDetail(null)}>
                  <Text style={{ fontSize: 18, color: '#94a3b8' }}>✕</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e293b' }}>تفاصيل المنتوج</Text>
                <View style={{ width: 24 }} />
              </View>
              {soldDetail && <>
                {/* Image */}
                {soldDetail.item.img && (
                  <Image source={{ uri: soldDetail.item.img }} style={{ width: '100%', height: 160, borderRadius: 12 }} resizeMode="contain" />
                )}
                {/* Name */}
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#1e293b', textAlign: 'right' }}>{soldDetail.item.name}</Text>
                {/* Barcode / IMEI */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: 10, borderRadius: 10 }}>
                  <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '700' }}>{soldDetail.bc}</Text>
                  <Text style={{ fontSize: 13, color: '#64748b' }}>باركود / IMEI</Text>
                </View>
                {/* Prices */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1, backgroundColor: '#f0fdf4', padding: 10, borderRadius: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#16a34a' }}>{soldDetail.item.sell} د</Text>
                    <Text style={{ fontSize: 11, color: '#86efac' }}>ثمن البيع</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#fff7ed', padding: 10, borderRadius: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#ea580c' }}>{soldDetail.item.buy} د</Text>
                    <Text style={{ fontSize: 11, color: '#fdba74' }}>ثمن الشراء</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#eff6ff', padding: 10, borderRadius: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#2563eb' }}>{soldDetail.item.sell - soldDetail.item.buy} د</Text>
                    <Text style={{ fontSize: 11, color: '#93c5fd' }}>الربح</Text>
                  </View>
                </View>
                {/* Meta */}
                {soldDetail.item.supplier ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: '#1e293b', fontWeight: '700' }}>🏭 {soldDetail.item.supplier}</Text>
                    <Text style={{ fontSize: 13, color: '#94a3b8' }}>المورد</Text>
                  </View>
                ) : null}
                {soldDetail.item.addedBy ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: '#1e293b', fontWeight: '700' }}>👤 {soldDetail.item.addedBy}</Text>
                    <Text style={{ fontSize: 13, color: '#94a3b8' }}>أضافه</Text>
                  </View>
                ) : null}
                {soldDetail.item.soldBy ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: '#1e293b', fontWeight: '700' }}>🧑‍💼 {soldDetail.item.soldBy}</Text>
                    <Text style={{ fontSize: 13, color: '#94a3b8' }}>باعه</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fef2f2', padding: 10, borderRadius: 10 }}>
                  <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '800' }}>{soldDetail.item.soldAt}</Text>
                  <Text style={{ fontSize: 13, color: '#ef4444' }}>تاريخ البيع</Text>
                </View>
              </>}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ═══ SELL CONFIRMATION DIALOG ═══ */}
      <Modal visible={!!sellConfirm} animationType="fade" transparent onRequestClose={() => setSellConfirm(null)}>
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            {/* Cart icon */}
            <View style={styles.dialogIconWrap}>
              <Text style={{ fontSize: 44 }}>🛒</Text>
            </View>
            <Text style={styles.dialogTitle}>تأكيد البيع</Text>
            <Text style={styles.dialogMsg}>
              {'واش متأكد تبيع '}
              <Text style={{ fontWeight: '900', color: '#1e293b' }}>{sellConfirm?.item.name}</Text>
              {' بـ '}
              <Text style={{ fontWeight: '900', color: '#10b981' }}>{formatMAD(sellConfirm?.item.sell ?? 0)}</Text>
              {'؟'}
            </Text>
            <View style={styles.dialogBtns}>
              <TouchableOpacity style={styles.dialogCancel} onPress={() => setSellConfirm(null)}>
                <Text style={styles.dialogCancelTxt}>❌ إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogConfirm} onPress={confirmSell}>
                <Text style={styles.dialogConfirmTxt}>✅ نعم، تأكيد</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add/Edit modal */}
      <Modal visible={addModal} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheetLarge}>
            <Text style={styles.sheetTitle}>{editBarcode ? '✏️ تعديل سلعة' : '📦 إضافة سلعة'}</Text>
            <ScrollView ref={formScrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* صورة — أزرار فوق دائماً */}
              <View style={styles.imgBtnsRow}>
                {newImg ? (
                  <TouchableOpacity style={[styles.imgBtn, { backgroundColor: '#fee2e2' }]} onPress={() => { setNewImg(null); setRemoveImg(true); }}>
                    <Text style={[styles.imgBtnTxt, { color: '#dc2626' }]}>🗑 حذف</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={[styles.imgBtn, styles.imgBtnGold]} onPress={() => pickImage('library')}>
                  <Text style={styles.imgBtnTxt}>🖼 معرض</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.imgBtn} onPress={() => pickImage('camera')}>
                  <Text style={styles.imgBtnTxt}>📷 تصوير</Text>
                </TouchableOpacity>
              </View>
              {newImg ? (
                <View style={{ marginBottom: 12, borderRadius: Radii.lg, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4, backgroundColor: '#fff', alignSelf: 'center', width: '60%' }}>
                  <View style={{ borderRadius: Radii.lg, overflow: 'hidden' }}>
                    <TouchableOpacity activeOpacity={0.9} onPress={() => setImgZoom(true)}>
                      <Image
                        source={{ uri: newImg }}
                        style={[styles.formImg, { aspectRatio: imgRatio }]}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(37,99,235,0.88)', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      onPress={() => setFreeCropMode(true)}
                    >
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>✂️ قص</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <Modal visible={imgZoom} transparent animationType="fade" onRequestClose={() => setImgZoom(false)}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }} activeOpacity={1} onPress={() => setImgZoom(false)}>
                  <Image source={{ uri: newImg ?? '' }} style={{ width: '70%', height: '50%' }} resizeMode="contain" />
                </TouchableOpacity>
              </Modal>

              {/* باركود رئيسي */}
              <Text style={[styles.fieldLabel, { fontSize: 11, marginBottom: 4 }]}>📷 الباركود الرئيسي</Text>
              <View style={styles.barcodeRow}>
                <TextInput
                  style={[styles.formInput, { flex: 1 }]}
                  value={form.barcode}
                  onChangeText={(v) => f('barcode', v)}
                  placeholder="الباركود الرئيسي (اختياري)"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  returnKeyType="next"
                  onSubmitEditing={() => nameRef.current?.focus()}
                />
                <TouchableOpacity
                  style={[styles.imgBtn, styles.imgBtnGold, { flex: 0, paddingHorizontal: 16 }]}
                  onPress={() => { bcScannedRef.current = false; setShowBcScanner(true); }}
                >
                  <Text style={styles.imgBtnTxt}>📷</Text>
                </TouchableOpacity>
              </View>

              {/* الاسم */}
              <TextInput
                ref={nameRef}
                style={styles.formInput}
                value={form.name}
                onChangeText={(v) => f('name', v)}
                placeholder="الاسم *"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                onSubmitEditing={() => buyRef.current?.focus()}
              />

              {/* المجلد */}
              <TouchableOpacity style={styles.supplierDropdown} onPress={() => { setShowCats(v => !v); setShowSuppliers(false); }}>
                <Text style={[styles.supplierDropdownTxt, { flex: 1, textAlign: 'right' }]}>
                  {(() => { const f2 = app.folders?.find(f3 => f3.name === form.cat); return f2 ? `${f2.name} ${f2.icon}` : (form.cat || 'اختر المجلد'); })()}
                </Text>
                <Text style={{ color: Colors.textMuted, marginLeft: 8 }}>{showCats ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {showCats && (
                <View style={styles.inlineList}>
                  {(app.folders ?? []).filter(f2 => f2.active).map((f2) => (
                    <TouchableOpacity key={f2.id} style={styles.inlineItem} onPress={() => { f('cat', f2.name); setShowCats(false); }}>
                      <Text style={[styles.inlineItemTxt, form.cat === f2.name && { color: '#f59e0b', fontWeight: '900' }]}>{f2.icon} {f2.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* الأسعار */}
              <View style={styles.priceRow}>
                <TextInput
                  ref={buyRef}
                  style={[styles.formInput, { flex: 1 }]}
                  value={form.buy}
                  onChangeText={(v) => f('buy', v)}
                  placeholder="ثمن الشراء"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  returnKeyType="next"
                  onSubmitEditing={() => sellRef.current?.focus()}
                />
                <TextInput
                  ref={sellRef}
                  style={[styles.formInput, { flex: 1 }]}
                  value={form.sell}
                  onChangeText={(v) => f('sell', v)}
                  placeholder="ثمن البيع"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  returnKeyType="next"
                  onSubmitEditing={() => qtyRef.current?.focus()}
                />
              </View>

              {/* الربح */}
              <View style={styles.profitBox}>
                <Text style={styles.profitTxt}>
                  الربح (تلقائي): {formatMAD((parseFloat(form.sell) || 0) - (parseFloat(form.buy) || 0))}
                </Text>
              </View>

              {/* قائمة الباركودات مع الكمية */}
              {!editBarcode && (
                <View style={{ marginTop: 4 }}>
                  <Text style={[styles.fieldLabel, { fontSize: 11, marginBottom: 6 }]}>📋 الباركودات والكميات</Text>

                  {pendingLinked.map((lb, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, backgroundColor: '#f8fafc', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: i === 0 ? '#5c67f2' : '#e2e8f0' }}>
                      {i === 0 && <Text style={{ fontSize: 9, color: '#5c67f2', fontWeight: '900', position: 'absolute', top: 2, right: 8 }}>رئيسي</Text>}
                      <TouchableOpacity
                        style={{ backgroundColor: '#fee2e2', padding: 5, borderRadius: 6 }}
                        onPress={() => setPendingLinked(p => p.filter((_, j) => j !== i))}
                      >
                        <Text style={{ color: '#dc2626', fontWeight: '900', fontSize: 12 }}>✕</Text>
                      </TouchableOpacity>
                      <Text style={{ flex: 1, fontSize: 12, color: '#1e293b', fontWeight: '700' }}>{lb.bc}</Text>
                      <TouchableOpacity
                        style={{ backgroundColor: '#fee2e2', width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => setPendingLinked(p => p.map((l, j) => j === i ? { ...l, qty: Math.max(1, l.qty - 1) } : l))}
                      >
                        <Text style={{ color: '#dc2626', fontWeight: '900' }}>−</Text>
                      </TouchableOpacity>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#1e293b', minWidth: 20, textAlign: 'center' }}>{lb.qty}</Text>
                      <TouchableOpacity
                        style={{ backgroundColor: '#dcfce7', width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => setPendingLinked(p => p.map((l, j) => j === i ? { ...l, qty: l.qty + 1 } : l))}
                      >
                        <Text style={{ color: '#16a34a', fontWeight: '900' }}>+</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  {/* سكان + يدوي */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: '#eff6ff', borderRadius: 10, borderWidth: 1, borderColor: '#93c5fd' }}
                      onPress={() => { bcScannedRef.current = false; setShowBcScanner(true); }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#3b82f6' }}>📷 سكان</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
                      <TextInput
                        style={[styles.formInput, { flex: 1, fontSize: 12, padding: 8 }]}
                        value={manualBcInput}
                        onChangeText={setManualBcInput}
                        placeholder="كود يدوي"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="numeric"
                      />
                      <TouchableOpacity
                        style={{ backgroundColor: '#5c67f2', paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => {
                          if (!manualBcInput.trim()) return;
                          const existing = pendingLinked.find(l => l.bc === manualBcInput.trim());
                          if (existing) {
                            setPendingLinked(p => p.map(l => l.bc === manualBcInput.trim() ? { ...l, qty: l.qty + 1 } : l));
                          } else {
                            setPendingLinked(p => [...p, { bc: manualBcInput.trim(), qty: 1 }]);
                            if (!form.barcode) f('barcode', manualBcInput.trim());
                          }
                          setManualBcInput('');
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {/* الكمية — فقط في وضع التعديل */}
              {editBarcode && (
                <TextInput
                  ref={qtyRef}
                  style={styles.formInput}
                  value={form.qty}
                  onChangeText={(v) => f('qty', v.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, ''))}
                  placeholder={`أضف (+) أو نقص (-) — الحالية: ${app.stock[editBarcode]?.qty ?? 0}`}
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              )}

              {/* المورد */}
              <View style={{ flexDirection: 'column-reverse' }}>
                <View style={styles.supplierRow}>
                  <TouchableOpacity style={styles.supplierAddBtn} onPress={addSupplier}>
                    <Text style={styles.supplierAddTxt}>+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.supplierDropdown} onPress={() => { setShowSuppliers(v => { if (!v) setTimeout(() => formScrollRef.current?.scrollToEnd({ animated: true }), 50); return !v; }); setShowCats(false); }}>
                    <Text style={{ color: Colors.textMuted }}>{showSuppliers ? '▼' : '▲'}</Text>
                    <Text style={styles.supplierDropdownTxt}>{form.supplier || '-- بدون مورد --'}</Text>
                  </TouchableOpacity>
                </View>
                {showSuppliers && (
                  <View style={styles.inlineList}>
                    <TouchableOpacity style={styles.inlineItem} onPress={() => { f('supplier', ''); setShowSuppliers(false); }}>
                      <Text style={[styles.inlineItemTxt, !form.supplier && { color: '#f59e0b', fontWeight: '900' }]}>-- بدون مورد --</Text>
                    </TouchableOpacity>
                    {[...(app.suppliers ?? [])].reverse().map((s) => (
                      <TouchableOpacity key={s} style={styles.inlineItem} onPress={() => { f('supplier', s); setShowSuppliers(false); }}>
                        <Text style={[styles.inlineItemTxt, form.supplier === s && { color: '#f59e0b', fontWeight: '900' }]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelTxt}>❌ إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={saveItem} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.confirmTxt}>✅ حفظ</Text>}
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
              style={styles.formInput}
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

      <AppAlert
        visible={!!appAlert}
        icon={appAlert?.icon}
        title={appAlert?.title ?? ''}
        message={appAlert?.message}
        buttons={appAlert?.buttons ?? []}
        onDismiss={() => setAppAlert(null)}
      />

      {/* ═══ RETURN REASON MODAL ═══ */}
      <Modal visible={!!returnReasonEntry} transparent animationType="fade" onRequestClose={() => setReturnReasonEntry(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 28, padding: 24, width: '100%', gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#1e293b', textAlign: 'center', marginBottom: 4 }}>↩️ سبب الرجوع</Text>
            {['معيب', 'ما عجبوش', 'غلط', 'رجوع'].map(reason => (
              <TouchableOpacity
                key={reason}
                style={{ backgroundColor: '#f0fdf4', borderWidth: 1.5, borderColor: '#86efac', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                onPress={() => {
                  const entry = returnReasonEntry!.entry;
                  setReturnReasonEntry(null);
                  updateApp(prev => {
                    const existing = prev.stock[entry.bc];
                    const currentQty = existing?.qty ?? 0;
                    const canRestore = currentQty < entry.qtyBefore;
                    const restored = canRestore
                      ? (existing
                          ? { ...existing, qty: currentQty + 1, soldAt: undefined, soldBy: undefined }
                          : { name: entry.name, cat: entry.cat, buy: entry.buy, sell: entry.sell, qty: 1 })
                      : existing;
                    const returnRecord = canRestore ? makeSaleRecord({
                      name: entry.name,
                      sell: -(entry.sell),
                      buy: -(entry.buy),
                      cat: entry.cat,
                      seller: auth?.name ?? '',
                      returnReason: reason,
                    }) : null;
                    return {
                      ...prev,
                      stock: restored ? { ...prev.stock, [entry.bc]: restored as StockItem } : prev.stock,
                      archiveSales: (prev.archiveSales ?? []).filter(e => e.id !== entry.id),
                      todaySales: returnRecord ? [...prev.todaySales, returnRecord] : prev.todaySales,
                    };
                  });
                  logActivity('return', `↩️ رجع: ${entry.name} — ${reason}`, auth?.name ?? '', entry.sell);
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#16a34a' }}>{reason}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setReturnReasonEntry(null)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: '#94a3b8', fontWeight: '700' }}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={chipStyles.wrap}>
      <Text style={chipStyles.label}>{label}</Text>
      <Text style={[chipStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

function ActionBtn({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[actionStyles.btn, { backgroundColor: color + '15', borderColor: color + '40' }]}
      onPress={onPress}
    >
      <Text style={[actionStyles.txt, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FormField({
  label, value, onChangeText, placeholder, keyboard,
}: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboard?: 'numeric' | 'default';
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={formStyles.label}>{label}</Text>
      <TextInput
        style={formStyles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboard ?? 'default'}
      />
    </View>
  );
}

const chipStyles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.background, borderRadius: Radii.md, padding: 10, alignItems: 'center' },
  label: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginBottom: 2 },
  value: { fontSize: 15, fontWeight: '800' },
});

const actionStyles = StyleSheet.create({
  btn: { flex: 1, padding: 12, borderRadius: Radii.lg, alignItems: 'center', borderWidth: 1 },
  txt: { fontSize: 14, fontWeight: '800' },
});

const formStyles = StyleSheet.create({
  label: { fontSize: 13, color: Colors.textMuted, fontWeight: '700', textAlign: 'right', marginBottom: 4 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg,
    padding: 13, fontSize: 15, color: Colors.text, backgroundColor: Colors.background, fontWeight: '600',
    textAlign: 'right',
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 16, color: Colors.textMuted },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, marginHorizontal: 10, marginTop: 6,
    borderWidth: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 6,
  },
  backBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  backTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  iconBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { fontSize: 20 },
  headerTitle: { fontSize: 15, fontWeight: '900' },
  countBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  headerCount: { fontSize: 11, fontWeight: '800', color: '#fff' },
  addBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radii.xl },
  addBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  editModeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  editModeTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  searchInput: {
    backgroundColor: Colors.card,
    borderRadius: 25, paddingHorizontal: 18, paddingVertical: 11, fontSize: 14, color: Colors.text, fontWeight: '600',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  list: { padding: 16, paddingBottom: 110 },
  itemCard: {
    backgroundColor: Colors.card, borderRadius: Radii.xl, padding: 8,
    marginBottom: 10, flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.13, shadowRadius: 14,
    elevation: 7, borderWidth: 1, borderColor: Colors.border,
    gap: 6,
  },
  itemPending: { opacity: 0.6, borderWidth: 1.5, borderColor: Colors.danger },
  itemImg: { width: 60, height: 66, borderRadius: 8, overflow: 'hidden' },
  itemImgBox: {
    width: 60, height: 66, borderRadius: 8,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  imgPreviewOverlay: {
    flex: 1, backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  imgPreviewFull: { width: '90%', height: '70%', backgroundColor: 'transparent' },
  imgPreviewClose: {
    position: 'absolute', top: 52, right: 20,
    fontSize: 26, color: '#fff', fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  itemContent: { flex: 1, flexDirection: 'column', gap: 6 },
  imgGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  imgSideInfo: { flexDirection: 'column', alignItems: 'center', gap: 3, width: 60 },
  itemName: { fontSize: 12, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  itemSell: { fontSize: 14, fontWeight: '900', color: Colors.success, textAlign: 'right' },
  itemBuy: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textAlign: 'right' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  supplierMeta: { fontSize: 11, fontWeight: '700', color: '#c2410c' },
  userMeta: { fontSize: 11, fontWeight: '800' },
  pendingTag: { fontSize: 9, color: Colors.danger, fontWeight: '700', textAlign: 'right' },
  itemBtnsRow: { flexDirection: 'column', gap: 4 },
  qtyBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  qtyTxt: { fontSize: 13, fontWeight: '900' },
  editBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
  },
  editBtnTxt: { fontSize: 18 },
  deleteBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnTxt: { fontSize: 18 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTxt: { fontSize: 15, color: Colors.textMuted, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  sheetLarge: {
    backgroundColor: Colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 36, maxHeight: '88%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 16 },
  itemDetailRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  itemSupDetail: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginBottom: 4 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 12 },
  closeSheetBtn: {
    marginTop: 4, padding: 12, borderRadius: Radii.lg,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  closeSheetTxt: { fontSize: 14, color: Colors.textMuted, fontWeight: '700' },
  sheetFooter: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: Radii.lg, backgroundColor: '#ef4444', alignItems: 'center' },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: Radii.lg, alignItems: 'center', backgroundColor: '#10b981' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  /* Add modal */
  imgBtnsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  imgBtn: { flex: 1, padding: 12, borderRadius: Radii.lg, backgroundColor: '#10b981', alignItems: 'center' },
  imgBtnGold: { backgroundColor: '#f59e0b' },
  imgBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  formImg: { width: '100%', maxHeight: 130 },
  changeImgBtn: { backgroundColor: '#f1f5f9', borderRadius: Radii.lg, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  changeImgTxt: { fontSize: 13, fontWeight: '700', color: Colors.text },
  barcodeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  formInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg,
    padding: 12, fontSize: 14, color: Colors.text, backgroundColor: Colors.background,
    fontWeight: '600', marginBottom: 10, textAlign: 'right',
  },
  folderTag: {
    backgroundColor: Colors.background, borderRadius: Radii.lg, padding: 12,
    marginBottom: 10, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'flex-end',
  },
  folderTagTxt: { fontSize: 14, fontWeight: '700', color: Colors.text },
  priceRow: { flexDirection: 'row', gap: 10, marginBottom: 0 },
  profitBox: {
    backgroundColor: '#f0fdf4', borderRadius: Radii.lg, padding: 12,
    marginBottom: 10, borderWidth: 1.5, borderColor: '#86efac',
  },
  profitTxt: { fontSize: 14, fontWeight: '700', color: '#15803d', textAlign: 'right' },
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  supplierAddBtn: {
    width: 42, height: 42, borderRadius: Radii.lg, backgroundColor: '#f59e0b',
    alignItems: 'center', justifyContent: 'center',
  },
  supplierAddTxt: { fontSize: 22, color: '#fff', fontWeight: '900' },
  supplierDropdown: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg,
    padding: 12, backgroundColor: Colors.background,
  },
  supplierDropdownTxt: { fontSize: 14, fontWeight: '700', color: Colors.text },
  inlineList: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radii.lg,
    backgroundColor: Colors.background, marginBottom: 10, overflow: 'hidden',
  },
  inlineItem: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  inlineItemTxt: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'right' },

  /* Sell confirmation dialog */
  dialogOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 },
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
