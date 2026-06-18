import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  Alert, Modal, TextInput, Pressable, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { Colors } from '../../src/theme/colors';
import { useThemeColor } from '../../src/hooks/useThemeColor';
import {
  getFolderColor, countFolderItems, folderTotalQty, formatMAD, contrastText,
} from '../../src/utils/helpers';
import { markAllRead, markOneRead, getActivityColor, getActivityIcon, logActivity } from '../../src/utils/activityLogger';
import AppHeader from '../../src/components/AppHeader';
import type { Folder } from '../../src/types';

function getBellCard(type: string) {
  switch (type) {
    case 'sell':       return { bg: '#f0fdf4', border: '#86efac', badge: '#10b981', label: 'بيع',    icon: '💰' };
    case 'return':     return { bg: '#fef2f2', border: '#fca5a5', badge: '#ef4444', label: 'روتور',  icon: '↩️' };
    case 'repair':     return { bg: '#fff7ed', border: '#fdba74', badge: '#ea580c', label: 'إصلاح',  icon: '🔧' };
    case 'credit_add': return { bg: '#fffbeb', border: '#fde68a', badge: '#f59e0b', label: 'كريدي', icon: '💳' };
    case 'credit_pay': return { bg: '#f0fdf4', border: '#86efac', badge: '#10b981', label: 'تسديد', icon: '✅' };
    case 'add_stock':  return { bg: '#eff6ff', border: '#93c5fd', badge: '#3b82f6', label: 'ستوك',  icon: '📦' };
    case 'delete':     return { bg: '#fef2f2', border: '#fca5a5', badge: '#ef4444', label: 'حذف',   icon: '🗑️' };
    default:           return { bg: '#eef2ff', border: '#c7d2fe', badge: '#5c67f2', label: type,    icon: '📋' };
  }
}

const ROLE_ICON: Record<string, string> = {
  super_admin: '👑',
  admin: '🤵',
  staff: '👮',
};

const ICON_PICKS = [
  // هواتف
  '📱','📲','☎️','📞','🤳','📵',
  // كمبيوتر وإلكترونيات
  '💻','🖥️','🖨️','🖱️','⌨️','📺','🎮','📷','📸',
  // اكسسوار وصوتيات
  '🎧','🔌','🔋','🪫','🪢','📡','🔊','🎙️','📻','🎶','⌚','💾',
  // أدوات وإصلاح
  '🛠️','🔧','🪛','🔩','⚙️','🔦','💡',
  // متنوع
  '♻️','📦','🏷️','💳','📊',
];

export default function StockScreen() {
  const { app, auth, clearAuth, updateApp } = useAppStore();
  const themeColor = useThemeColor();
  const [search, setSearch] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📦');
  const [editFolderModal, setEditFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [editFolderIcon, setEditFolderIcon] = useState('📦');
  const [bellModal, setBellModal] = useState(false);
  const [logoutModal, setLogoutModal] = useState(false);
  const [bellTab, setBellTab] = useState<'alerts' | 'log'>('alerts');
  const [expandedBellId, setExpandedBellId] = useState<string | null>(null);
  const [returnModal, setReturnModal] = useState(false);
  const [returnSearch, setReturnSearch] = useState('');
  const [returnConfirm, setReturnConfirm] = useState<{ bc: string; item: any } | null>(null);

  const activityLog = app.activityLog ?? [];
  const opLog = activityLog.filter(e => ['sell', 'add_stock', 'credit_add', 'credit_pay', 'return', 'supplier_add'].includes(e.type));
  const mosaedLog = activityLog.filter(e => ['sell', 'return', 'credit_add', 'credit_pay'].includes(e.type));
  const unreadCount = opLog.filter((l) => !l.read).length;
  const mosaedUnread = mosaedLog.filter((l) => !l.read).length;
  const pransibalUnread = activityLog.filter((l) => !l.read).length;
  const totalBadge = unreadCount;

  const isAdmin = auth?.role === 'admin' || auth?.role === 'super_admin';
  const isMosaed = auth?.role === 'staff';
  const isPransibal = auth?.role === 'super_admin';
  const displayLog = isMosaed ? mosaedLog : activityLog;
  const displayBadge = isMosaed ? mosaedUnread : pransibalUnread;
  const folders = (app.folders ?? []).filter((f) => f.active);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return Object.entries(app.stock ?? {})
      .filter(([bc, item]) =>
        !item.pendingDeletion &&
        (item.name.toLowerCase().includes(q) || bc.includes(q) || (item.supplier ?? '').toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [app.stock, search]);

  function openFolder(folder: Folder) {
    router.push(`/folder/${encodeURIComponent(folder.id)}`);
  }

  function handleLogout() { setLogoutModal(true); }

  function approveDelete(bc: string) {
    const img = app.stock[bc]?.img;
    import('../../src/firebase/storage').then(({ deleteItemImage }) => deleteItemImage(img));
    updateApp((prev) => {
      const s = { ...prev.stock };
      delete s[bc];
      return { ...prev, stock: s };
    });
  }

  function rejectDelete(bc: string) {
    updateApp((prev) => ({
      ...prev,
      stock: {
        ...prev.stock,
        [bc]: { ...prev.stock[bc], pendingDeletion: false, deletionRequestedBy: undefined },
      },
    }));
  }

  function openFolderEdit(folder: Folder) {
    setEditingFolder(folder);
    setEditFolderName(folder.name);
    setEditFolderIcon(folder.icon);
    setEditFolderModal(true);
  }

  function saveFolderEdit() {
    if (!editingFolder || !editFolderName.trim()) return;
    updateApp((prev) => ({
      ...prev,
      folders: (prev.folders ?? []).map((f) =>
        f.id === editingFolder.id ? { ...f, name: editFolderName.trim(), icon: editFolderIcon } : f
      ),
      stock: Object.fromEntries(
        Object.entries(prev.stock ?? {}).map(([bc, item]) => [
          bc,
          item.cat === editingFolder.name ? { ...item, cat: editFolderName.trim() } : item,
        ])
      ),
    }));
    setEditFolderModal(false);
  }

  function deleteFolder(folder: Folder) {
    Alert.alert('حذف المجلد', `حذف "${folder.name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: () => {
          updateApp((prev) => ({
            ...prev,
            folders: (prev.folders ?? []).map((f) => f.id === folder.id ? { ...f, active: false } : f),
          }));
          setEditFolderModal(false);
        },
      },
    ]);
  }

  function addFolder() {
    if (!newName.trim()) { Alert.alert('', 'أدخل اسم المجلد'); return; }
    const newFolder: Folder = {
      id: `cat_${Date.now()}`,
      name: newName.trim(),
      icon: newIcon,
      active: true,
      colorClass: 'folder-acc',
    };
    updateApp((prev) => ({ ...prev, folders: [...(prev.folders ?? []), newFolder] }));
    setAddModal(false);
    setNewName('');
    setNewIcon('📦');
  }

  const isSearching = search.trim().length > 0;

  // Return items list — all stock with qty > 0, filtered by search
  const returnItems = useMemo(() => {
    const q = returnSearch.trim().toLowerCase();
    return Object.entries(app.stock ?? {})
      .filter(([, item]: any) => !item.pendingDeletion && item.qty > 0 && (
        !q || item.name.toLowerCase().includes(q)
      ))
      .slice(0, 40);
  }, [app.stock, returnSearch]);

  function confirmReturn() {
    if (!returnConfirm) return;
    const { bc, item } = returnConfirm;
    const soldCount = (app.todaySales ?? []).filter(
      (s: any) => s.name === item.name && !s.name.startsWith('📦') && !s.name.startsWith('🗑️')
    ).length;
    const returnCount = (app.todaySales ?? []).filter(
      (s: any) => s.name === item.name && (s.sell < 0)
    ).length;
    if (soldCount === 0 || returnCount >= soldCount) {
      Alert.alert('⛔ ممنوع', 'ما يمكنكش ترجع أكثر من اللي بعتي');
      setReturnConfirm(null);
      return;
    }
    const now = new Date();
    const mk = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
    updateApp((prev) => ({
      ...prev,
      stock: { ...prev.stock, [bc]: { ...item, qty: item.qty + 1 } },
      todaySales: [...prev.todaySales, {
        nid: `ret_${Date.now()}`,
        name: item.name,
        sell: -(item.sell),
        buy: -(item.buy),
        cat: item.cat,
        seller: auth?.name ?? '',
        time: now.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' }),
        dateString: now.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/'),
        monthKey: mk,
        yearKey: String(now.getFullYear()),
      }],
    }));
    logActivity('return', `↩️ رجع: ${item.name} — ${formatMAD(item.sell)}`, auth?.name ?? '', item.sell);
    setReturnConfirm(null);
    setReturnModal(false);
    setReturnSearch('');
  }

  return (
    <SafeAreaView style={styles.root}>

      <AppHeader
        title="فضاء الأخوين"
        sub={`${ROLE_ICON[auth?.role ?? 'staff']} ${auth?.name ?? ''}`}
        onBell={(isAdmin || isMosaed) ? () => setBellModal(true) : undefined}
        bellBadge={(isAdmin || isMosaed) ? displayBadge : undefined}
        leftAction={{ label: '🔒 خروج', onPress: handleLogout }}
      />

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionBtn, styles.actionGold, { backgroundColor: '#10b981', shadowColor: '#10b981' }]} onPress={() => router.push('/scan')} activeOpacity={0.85}>
          <View style={styles.actionInner}>
            <Text style={styles.actionIcon}>📷💥</Text>
            <Text style={styles.actionTxt}>بيع سريع</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionRed]} onPress={() => router.push('/scan?mode=return')} activeOpacity={0.85}>
          <View style={styles.actionInner}>
            <Text style={styles.actionIcon}>🔄</Text>
            <Text style={styles.actionTxt}>روتور سعلة</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="بحث سريع عن سلعة..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
        {isSearching ? (
          <TouchableOpacity style={styles.clearBtn} onPress={() => setSearch('')}>
            <Text style={styles.clearTxt}>✕</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.searchIcon}>🔍</Text>
        )}
      </View>

      {isSearching ? (
        /* Search results */
        <FlatList
          data={searchResults}
          keyExtractor={([bc]) => bc}
          contentContainerStyle={styles.searchList}
          renderItem={({ item: [bc, item] }) => {
            const folder = folders.find((f) => f.name === item.cat);
            const qtyOk = item.qty > 2;
            return (
              <TouchableOpacity
                style={styles.searchCard}
                onPress={() => folder && openFolder(folder)}
                activeOpacity={0.75}
              >
                <View style={styles.searchCardRight}>
                  <Text style={styles.searchItemName}>{item.name}</Text>
                  {item.supplier ? (
                    <View style={styles.supBadge}>
                      <Text style={styles.supBadgeTxt}>📦 {item.supplier}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.searchItemCat}>{folder?.icon} {item.cat}</Text>
                </View>
                <View style={styles.searchCardLeft}>
                  <View style={[styles.qtyBadge, { backgroundColor: qtyOk ? '#dcfce7' : '#fee2e2' }]}>
                    <Text style={[styles.qtyTxt, { color: qtyOk ? '#16a34a' : '#dc2626' }]}>{item.qty}</Text>
                  </View>
                  <Text style={styles.searchItemSell}>{item.sell} د</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>🔍</Text>
              <Text style={styles.emptyTxt}>ما كاينش</Text>
            </View>
          }
        />
      ) : (
        /* Folder grid */
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            {folders.map((folder) => {
              const col = getFolderColor(folder);
              const count = countFolderItems(app.stock, folder.name);
              const qty = folderTotalQty(app.stock, folder.name);
              const isCoreFolder = !!folder.special || ['جديد','مستعمل','LCD','إصلاح مانيال'].includes(folder.name);
              return (
                <TouchableOpacity
                  key={folder.id}
                  style={[styles.folderCard, { backgroundColor: col.bg, borderColor: col.fg }]}
                  onPress={() => folder.special === 'repair' ? router.push('/repair') : openFolder(folder)}
                  activeOpacity={0.75}
                >
                  {isAdmin && (
                    <TouchableOpacity style={[styles.gearBtn, { backgroundColor: col.fg + '22' }]} onPress={() => openFolderEdit(folder)}>
                      <Text style={styles.gearIcon}>✏️</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.folderEmoji}>{folder.icon}</Text>
                  <Text style={[styles.folderName, { color: col.fg }]}>{folder.name}</Text>
                  <View style={[styles.statRow, { backgroundColor: col.fg + '22' }]}>
                    <Text style={[styles.statNum, { color: col.fg }]}>{count}<Text style={styles.statUnit}> منتج</Text></Text>
                    <View style={{ width: 1, height: 14, backgroundColor: col.fg + '44' }} />
                    <Text style={[styles.statNum, { color: col.fg }]}>{qty}<Text style={styles.statUnit}> قطعة</Text></Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {isAdmin && (
            <TouchableOpacity style={[styles.addFolderBtn, { alignSelf: 'center', marginTop: 10 }]} onPress={() => setAddModal(true)}>
              <Text style={styles.addFolderTxt}>+ مجلد</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* Edit folder modal */}
      <Modal visible={editFolderModal} animationType="slide" transparent onRequestClose={() => setEditFolderModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>⚙️ تعديل المجلد</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="اسم المجلد"
              placeholderTextColor="#9ca3af"
              value={editFolderName}
              onChangeText={setEditFolderName}
              autoFocus
            />
            <View style={styles.iconGrid}>
              {ICON_PICKS.map((ic) => (
                <TouchableOpacity
                  key={ic}
                  style={[styles.iconBtn, editFolderIcon === ic && styles.iconBtnActive]}
                  onPress={() => setEditFolderIcon(ic)}
                >
                  <Text style={{ fontSize: 22 }}>{ic}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditFolderModal(false)}>
                <Text style={styles.cancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: themeColor }]} onPress={saveFolderEdit}>
                <Text style={styles.confirmTxt}>حفظ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add folder modal */}
      <Modal visible={addModal} animationType="slide" transparent onRequestClose={() => setAddModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>📁 مجلد جديد</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="اسم المجلد..."
              placeholderTextColor="#9ca3af"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <View style={styles.iconGrid}>
              {ICON_PICKS.map((ic) => (
                <TouchableOpacity
                  key={ic}
                  style={[styles.iconBtn, newIcon === ic && styles.iconBtnActive]}
                  onPress={() => setNewIcon(ic)}
                >
                  <Text style={{ fontSize: 22 }}>{ic}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setAddModal(false)}>
                <Text style={styles.cancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={addFolder}>
                <Text style={styles.confirmTxt}>إضافة</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bell dropdown */}
      <Modal visible={bellModal} animationType="none" transparent onRequestClose={() => setBellModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' }}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setBellModal(false)} />
          <View style={styles.bellDropdown}>
            {/* Header */}
            <View style={styles.bellDropHead}>
              <TouchableOpacity onPress={() => setBellModal(false)}>
                <Text style={{ fontSize: 18, color: '#94a3b8', fontWeight: '700', paddingHorizontal: 4 }}>✕</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {displayBadge > 0 && (
                  <View style={{ backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{displayBadge}</Text>
                  </View>
                )}
                <Text style={styles.bellDropTitle}>الإشعارات</Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }} contentContainerStyle={{ padding: 10, paddingTop: 6 }}>

              {displayLog.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>📋</Text>
                  <Text style={{ fontSize: 14, color: '#374151', fontWeight: '800' }}>لا يوجد نشاط بعد</Text>
                </View>
              ) : (
                [...displayLog].sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1)).map((entry) => {
                  const card = getBellCard(entry.type);
                  const timeStr = new Date(entry.ts).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });
                  const dateStr = new Date(entry.ts).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  const userColor = (Object.values(app.users ?? {}) as any[]).find((u) => u.name === entry.by)?.color ?? '#5c67f2';
                  return (
                    <Pressable
                      key={entry.id}
                      onPress={() => {
                        const next = expandedBellId === entry.id ? null : entry.id;
                        setExpandedBellId(next);
                        if (!entry.read) markOneRead(entry.id);
                      }}
                      android_ripple={{ color: card.badge + '22' }}
                      style={[styles.bellCard, {
                        backgroundColor: entry.read ? '#ffffff' : card.bg,
                        borderColor: entry.read ? '#e2e8f0' : card.badge,
                        borderWidth: entry.read ? 1 : 2,
                      }]}
                    >
                      <View style={styles.bellCardTop}>
                        <View style={[styles.bellBadgePill, { backgroundColor: card.badge, flexShrink: 0 }]}>
                          <Text style={styles.bellBadgeTxt}>{card.label} {card.icon}</Text>
                        </View>
                        <Text style={styles.bellCardMsg} numberOfLines={expandedBellId === entry.id ? undefined : 1}>{entry.msg}</Text>
                        {!entry.read && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: card.badge }} />}
                      </View>
                      <View style={styles.bellCardFoot}>
                        <Text style={styles.bellCardDate}>{timeStr} · {dateStr}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {entry.amount !== undefined && (
                            <Text style={[styles.bellCardAmount, { color: card.badge }]}>{entry.amount} د</Text>
                          )}
                          {!!entry.by?.trim() && (
                            <View style={[styles.bellUserBadge, { backgroundColor: userColor, flexShrink: 0 }]}>
                              <Text style={[styles.bellUserTxt, { color: '#fff' }]}>👤 {entry.by}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              )}

            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ RETURN MODAL — اختيار السلعة ═══ */}
      <Modal visible={returnModal} animationType="slide" transparent onRequestClose={() => { setReturnModal(false); setReturnSearch(''); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '80%' }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#1e293b', textAlign: 'right', marginBottom: 14 }}>↩️ روتور سعلة</Text>
            <TextInput
              style={{ backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, padding: 12, fontSize: 14, color: '#1e293b', textAlign: 'right', marginBottom: 10 }}
              placeholder="🔍 ابحث عن سلعة..."
              placeholderTextColor="#94a3b8"
              value={returnSearch}
              onChangeText={setReturnSearch}
            />
            <TouchableOpacity
              style={{ backgroundColor: '#7c3aed', borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 12 }}
              onPress={() => { setReturnModal(false); setReturnSearch(''); router.push({ pathname: '/scan', params: { mode: 'return' } }); }}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>📷 مسح بالباركود</Text>
            </TouchableOpacity>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
              {returnItems.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>📭</Text>
                  <Text style={{ color: '#94a3b8', fontWeight: '700' }}>ما كاين حتى سلعة</Text>
                </View>
              ) : returnItems.map(([bc, item]: any) => {
                const soldCount = (app.todaySales ?? []).filter((s: any) => s.name === item.name && s.sell > 0).length;
                const returnCount = (app.todaySales ?? []).filter((s: any) => s.name === item.name && s.sell < 0).length;
                const canReturn = soldCount > 0 && returnCount < soldCount;
                return (
                  <TouchableOpacity
                    key={bc}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: canReturn ? '#fff' : '#fef2f2', borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: canReturn ? '#e2e8f0' : '#fecaca' }}
                    onPress={() => canReturn ? setReturnConfirm({ bc, item }) : Alert.alert('⛔', 'ما يمكنكش ترجع هاد السلعة — ما تبيعتش اليوم أو رجعت كلها')}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {!canReturn && <Text style={{ fontSize: 20 }}>⛔</Text>}
                      <View style={{ backgroundColor: canReturn ? '#dcfce7' : '#fee2e2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                        <Text style={{ fontSize: 13, fontWeight: '900', color: canReturn ? '#10b981' : '#ef4444' }}>{item.qty}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end', marginRight: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#1e293b' }}>{item.name}</Text>
                      <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>{formatMAD(item.sell)} · بيع اليوم: {soldCount}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={{ marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center' }} onPress={() => { setReturnModal(false); setReturnSearch(''); }}>
              <Text style={{ fontWeight: '800', color: '#64748b', fontSize: 15 }}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══ LOGOUT MODAL ═══ */}
      <Modal visible={logoutModal} animationType="fade" transparent onRequestClose={() => setLogoutModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 28, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 16 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🔒</Text>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#1e293b', marginBottom: 8 }}>تخرج؟</Text>
            <Text style={{ fontSize: 14, color: '#64748b', fontWeight: '600', marginBottom: 28 }}>غادي تخرج من الحساب</Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#ef4444', alignItems: 'center' }} onPress={() => {
  if (auth?.phone) {
    updateApp(prev => ({
      ...prev,
      users: { ...prev.users, [auth.phone]: { ...prev.users[auth.phone], online: false, lastSeen: new Date().toISOString() } },
    }));
  }
  setLogoutModal(false);
  clearAuth();
  router.replace('/(auth)/login');
}}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>نعم، خرج</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0' }} onPress={() => setLogoutModal(false)}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#64748b' }}>لا</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ RETURN CONFIRMATION DIALOG ═══ */}
      <Modal visible={!!returnConfirm} animationType="fade" transparent onRequestClose={() => setReturnConfirm(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 28, padding: 28, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 16 }}>
            <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: '#fee2e2', borderWidth: 3, borderColor: '#ef4444', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <Text style={{ fontSize: 44 }}>↩️</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#1e293b', marginBottom: 12 }}>تأكيد الروتور</Text>
            <Text style={{ fontSize: 15, color: '#64748b', fontWeight: '600', textAlign: 'center', lineHeight: 26, marginBottom: 24 }}>
              واش متأكد ترجع{'\n'}
              <Text style={{ fontWeight: '900', color: '#1e293b' }}>{returnConfirm?.item.name}</Text>
              {'\n'}بـ{' '}
              <Text style={{ fontWeight: '900', color: '#ef4444' }}>{formatMAD(returnConfirm?.item.sell ?? 0)}</Text>
              ؟
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 16, borderRadius: 18, backgroundColor: '#f1f5f9', alignItems: 'center' }} onPress={() => setReturnConfirm(null)}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#64748b' }}>✗ إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 2, paddingVertical: 16, borderRadius: 18, backgroundColor: '#ef4444', alignItems: 'center' }} onPress={confirmReturn}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff' }}>↩️ نعم، روتور</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },

  headerCard: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginHorizontal: 10,
    marginTop: 6,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
    marginBottom: 10,
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 6,
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#1e293b' },
  greenDot: { color: '#10b981' },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  logoutTxt: { fontSize: 13, color: '#fff', fontWeight: '800' },
  bellWrap: { position: 'relative', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 20 },
  bellBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: '#ef4444', borderRadius: 10,
    minWidth: 17, height: 17,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2, borderColor: '#fff',
  },
  bellBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  welcomeTxt: { fontSize: 12, fontWeight: '700', color: '#64748b', textAlign: 'center' },

  actionRow: { flexDirection: 'row', gap: 14, paddingHorizontal: 14, paddingBottom: 4, marginTop: 12 },
  actionBtn: {
    flex: 1, height: 88, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 6,
  },
  actionRed:  { backgroundColor: '#ef4444', shadowColor: '#ef4444' },
  actionGold: { backgroundColor: '#f59e0b', shadowColor: '#d97706' },
  actionInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 8 },
  actionTxt:  { color: '#fff', fontSize: 15, fontWeight: '900', textAlign: 'center', flexShrink: 1 },
  actionIcon: { fontSize: 26 },

  /* Search — border like web */
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 14, marginTop: 12, marginBottom: 4,
    backgroundColor: '#ffffff',
    borderRadius: 14, borderWidth: 2, borderColor: '#e2e8f0',
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 4, paddingVertical: 10,
    fontSize: 15, color: '#1e293b', fontWeight: '600',
  },
  searchIcon: { fontSize: 18, paddingLeft: 4 },
  clearBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#e2e8f0',
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  clearTxt: { fontSize: 14, color: '#64748b', fontWeight: '800' },

  /* Search results */
  searchList: { padding: 14, paddingBottom: 120 },
  searchCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3,
  },
  searchCardRight: { flex: 1 },
  searchItemName: { fontSize: 15, fontWeight: '700', color: '#1e293b', textAlign: 'right' },
  supBadge: {
    backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
    marginTop: 4, borderWidth: 1, borderColor: '#bae6fd', alignSelf: 'flex-end',
  },
  supBadgeTxt: { fontSize: 12, color: '#0369a1', fontWeight: '700' },
  searchItemCat: { fontSize: 11, color: '#64748b', marginTop: 3, textAlign: 'right' },
  searchCardLeft: { alignItems: 'center', gap: 6, marginLeft: 12 },
  qtyBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  qtyTxt: { fontSize: 16, fontWeight: '900' },
  searchItemSell: { fontSize: 14, fontWeight: '800', color: '#1e293b' },

  /* Folder grid */
  scroll: { padding: 14 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  addFolderBtn: { backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
    borderWidth: 1, borderColor: '#c7d2fe' },
  addFolderTxt: { fontSize: 13, color: '#5c67f2', fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  folderCard: {
    width: '47%', borderRadius: 16, padding: 10,
    alignItems: 'center', justifyContent: 'center',
    height: 120, position: 'relative',
    overflow: 'hidden',
    borderWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    gap: 4,
  },
  gearBtn: { position: 'absolute', top: 6, left: 6, padding: 4, borderRadius: 8 },
  gearIcon: { fontSize: 13 },
  folderEmoji: { fontSize: 28 },
  folderName: { fontSize: 14, fontWeight: '900', textAlign: 'center' },
  folderStat: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 2 },
  statNum: { fontSize: 13, fontWeight: '900' },
  statUnit: { fontSize: 10, fontWeight: '600' },
  statCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 3, elevation: 3,
  },
  statCircleNum: { fontSize: 14, fontWeight: '900', color: '#fff' },
  statCircleSub: { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  statSquare: {
    width: 50, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 3, elevation: 3,
  },
  statSquareEmoji: { fontSize: 20 },
  statSquareNum: { fontSize: 10, fontWeight: '900', color: '#fff', marginTop: 3 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTxt: { fontSize: 16, color: '#64748b', fontWeight: '700' },

  /* Modals */
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b', textAlign: 'right', marginBottom: 16 },
  sheetInput: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14,
    padding: 14, fontSize: 16, color: '#1e293b', backgroundColor: '#f8fafc',
    fontWeight: '600', marginBottom: 14, textAlign: 'right',
  },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  iconBtn: {
    width: 46, height: 46, borderRadius: 12, backgroundColor: '#f8fafc',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  iconBtnActive: { borderColor: Colors.primary, backgroundColor: '#eef2ff' },
  sheetFooter: { flexDirection: 'row', gap: 10 },
  delBtn: {
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#fee2e2', borderWidth: 1.5, borderColor: '#fca5a5', alignItems: 'center',
  },
  delBtnTxt: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: 14,
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', alignItems: 'center',
  },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: '#64748b' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center' },
  confirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },

  /* Bell dropdown */
  bellDropdown: {
    marginTop: 90,
    marginHorizontal: 18,
    backgroundColor: '#fff',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  bellDropHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  bellDropTitle: { fontSize: 15, fontWeight: '900', color: '#1e293b' },
  bellTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  bellTabBtn: { flex: 1, paddingVertical: 8, borderRadius: 14, alignItems: 'center', backgroundColor: '#f1f5f9' },
  bellTabActive: { backgroundColor: '#1e293b' },
  bellTabTxt: { fontSize: 13, fontWeight: '800', color: '#64748b' },
  bellTabTxtActive: { color: '#fff' },

  bellCard: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 9,
    marginBottom: 6,
  },
  bellCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 4,
  },
  bellCardMsg: { flex: 1, fontSize: 12, fontWeight: '800', color: '#1e293b', textAlign: 'right' },
  bellCardSub: { fontSize: 10, color: '#64748b', fontWeight: '600', textAlign: 'right' },
  bellCardMid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  bellCardIconCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  bellCardAmount: { fontSize: 14, fontWeight: '900', color: '#10b981' },
  bellUserBadge: {
    backgroundColor: '#f59e0b',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  bellUserTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  bellCardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  bellCardDate: { fontSize: 10, color: '#94a3b8', fontWeight: '700' },
  bellBadgePill: { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  bellApprove: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5' },
  bellReject: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
});
