import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  Alert, Modal, TextInput, Pressable, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { Colors } from '../../src/theme/colors';
import {
  getFolderColor, countFolderItems, folderTotalQty, formatMAD,
} from '../../src/utils/helpers';
import { markAllRead, markOneRead, getActivityColor, getActivityIcon } from '../../src/utils/activityLogger';
import type { Folder } from '../../src/types';

function getBellCard(type: string) {
  switch (type) {
    case 'sell':       return { bg: '#f0fdf4', border: '#86efac', badge: '#10b981', label: 'بيع',    icon: '💰' };
    case 'return':     return { bg: '#fef2f2', border: '#fca5a5', badge: '#ef4444', label: 'روتور',  icon: '↩️' };
    case 'repair':     return { bg: '#fff7ed', border: '#fdba74', badge: '#ea580c', label: 'إصلاح',  icon: '🔧' };
    case 'credit_add': return { bg: '#fffbeb', border: '#fde68a', badge: '#f59e0b', label: 'كريدي', icon: '💳' };
    case 'credit_pay': return { bg: '#f0fdf4', border: '#86efac', badge: '#10b981', label: 'تسديد', icon: '✅' };
    case 'stock':      return { bg: '#f8fafc', border: '#e2e8f0', badge: '#64748b', label: 'ستوك',  icon: '📦' };
    case 'delete':     return { bg: '#fef2f2', border: '#fca5a5', badge: '#ef4444', label: 'حذف',   icon: '🗑️' };
    default:           return { bg: '#eef2ff', border: '#c7d2fe', badge: '#5c67f2', label: type,    icon: '📋' };
  }
}

const ROLE_ICON: Record<string, string> = {
  super_admin: '👑',
  admin: '🤵',
  staff: '👮',
};

const ICON_PICKS = ['📱','♻️','📺','🛠️','🎧','🔌','🪢','💻','⌚','📷','🎮','🖨️','🔋','💡','📦'];

export default function StockScreen() {
  const { app, auth, clearAuth, updateApp } = useAppStore();
  const [search, setSearch] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📦');
  const [editFolderModal, setEditFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [editFolderIcon, setEditFolderIcon] = useState('📦');
  const [bellModal, setBellModal] = useState(false);
  const [bellTab, setBellTab] = useState<'alerts' | 'log'>('alerts');
  const [returnModal, setReturnModal] = useState(false);
  const [returnSearch, setReturnSearch] = useState('');
  const [returnConfirm, setReturnConfirm] = useState<{ bc: string; item: any } | null>(null);

  const notifications = useMemo(() => {
    const result: Array<{
      id: string; type: string; icon: string;
      title: string; sub: string; color: string; bc?: string;
    }> = [];

    const role = auth?.role;
    const isSuper = role === 'super_admin';

    // طلبات الحذف — super_admin فقط
    if (isSuper) {
      Object.entries(app.stock ?? {}).forEach(([bc, item]) => {
        if (item.pendingDeletion)
          result.push({ id: `del_${bc}`, type: 'del', icon: '🗑️', title: `طلب حذف: ${item.name}`, sub: `من: ${item.deletionRequestedBy ?? 'موظف'}`, color: '#dc2626', bc });
      });
    }

    // ستوك فارغ وقليل — الكل
    Object.entries(app.stock ?? {}).forEach(([bc, item]) => {
      if (!item.pendingDeletion && item.qty === 0) {
        result.push({ id: `empty_${bc}`, type: 'empty', icon: '📭', title: `نفد الستوك: ${item.name}`, sub: `${item.cat} — الكمية: 0`, color: '#ea580c' });
      } else if (!item.pendingDeletion && item.qty > 0 && item.qty <= 2) {
        result.push({ id: `low_${bc}`, type: 'low', icon: '⚠️', title: `ستوك قليل: ${item.name}`, sub: `${item.cat} — باقي ${item.qty} قطع`, color: '#d97706' });
      }
    });

    // شيكات + رواتب + ديون — super_admin فقط
    if (isSuper) {
      const today = new Date();
      const dayOfMonth = today.getDate();

      Object.entries(app.supplierCredit ?? {}).forEach(([, supp]) => {
        (supp.checks ?? []).forEach((chk, i) => {
          if (!chk.cashed && chk.due) {
            const diff = Math.ceil((new Date(chk.due).getTime() - today.getTime()) / 86400000);
            if (diff <= 7) {
              const late = diff < 0;
              result.push({ id: `chk_${i}_${chk.due}`, type: 'check', icon: late ? '🔴' : '📋',
                title: late ? `شيك متأخر: ${supp.name ?? '—'}` : `شيك قريب: ${supp.name ?? '—'}`,
                sub: `${chk.amount} DH — ${late ? `تأخر ${Math.abs(diff)} يوم` : `بعد ${diff} يوم`}`,
                color: late ? '#dc2626' : '#7c3aed' });
            }
          }
        });
      });

      Object.entries(app.employees ?? {}).forEach(([, emp]) => {
        if (emp.payday && Math.abs(dayOfMonth - emp.payday) <= 1)
          result.push({ id: `sal_${emp.name}`, type: 'salary', icon: '👷', title: `يوم التخليص: ${emp.name}`, sub: `الراتب: ${emp.salary} DH`, color: '#7c3aed' });
      });

      Object.entries(app.supplierCredit ?? {}).forEach(([id, supp]) => {
        if ((supp.total ?? 0) > 2000)
          result.push({ id: `debt_${id}`, type: 'debt', icon: '💸', title: `دين كبير: ${supp.name ?? id}`, sub: `${(supp.total ?? 0).toLocaleString('fr-MA')} DH`, color: '#ea580c' });
      });
    }

    return result;
  }, [app.stock, app.supplierCredit, app.employees, auth?.role]);

  const pendingCount = notifications.length;
  const activityLog = app.activityLog ?? [];
  const unreadCount = activityLog.filter((l) => !l.read).length;
  const totalBadge = unreadCount; // التنبيهات التلقائية تبان في الدروبداون بلا ما تزيد في العدد

  const isAdmin = auth?.role === 'admin' || auth?.role === 'super_admin';
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

  function handleLogout() {
    Alert.alert('خروج', 'تريد تسجيل الخروج؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'نعم', style: 'destructive', onPress: () => { clearAuth(); router.replace('/(auth)/login'); } },
    ]);
  }

  function approveDelete(bc: string) {
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
    // Validate: must have at least one sale for this item
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
        time: new Date().toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' }),
        dateString: new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/'),
        monthKey: `${new Date().getFullYear()}-${new Date().getMonth() + 1}`,
        yearKey: String(new Date().getFullYear()),
      }],
    }));
    setReturnConfirm(null);
    setReturnModal(false);
    setReturnSearch('');
  }

  return (
    <SafeAreaView style={styles.root}>

      {/* Header card (white) */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutTxt}>🔒 خروج</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            <Text style={styles.greenDot}>●</Text>فضاء الأخوين
          </Text>
          <TouchableOpacity style={styles.bellWrap} onPress={() => setBellModal(true)}>
            <Text style={styles.bellIcon}>🔔</Text>
            {totalBadge > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeTxt}>{totalBadge}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.welcomeTxt}>
          {ROLE_ICON[auth?.role ?? 'staff']} مرحباً، {auth?.name}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionBtn, styles.actionRed]} onPress={() => setReturnModal(true)} activeOpacity={0.85}>
          <View style={styles.actionInner}>
            <Text style={styles.actionTxt}>{'روتور\nسعلة'}</Text>
            <Text style={styles.actionIcon}>↩️</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionGold]} onPress={() => router.push('/scan')} activeOpacity={0.85}>
          <View style={styles.actionInner}>
            <Text style={styles.actionTxt}>بيع سريع</Text>
            <Text style={styles.actionIcon}>📷💥</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 بحث سريع عن سلعة..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
        {isSearching && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => setSearch('')}>
            <Text style={styles.clearTxt}>✕</Text>
          </TouchableOpacity>
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
                  <Text style={styles.searchItemSell}>{item.sell} DH</Text>
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
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>لوحة التحكم (المجلدات)</Text>
            {isAdmin && (
              <TouchableOpacity style={styles.addFolderBtn} onPress={() => setAddModal(true)}>
                <Text style={styles.addFolderTxt}>+ مجلد</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.grid}>
            {folders.map((folder) => {
              const col = getFolderColor(folder);
              const count = countFolderItems(app.stock, folder.name);
              const qty = folderTotalQty(app.stock, folder.name);
              return (
                <TouchableOpacity
                  key={folder.id}
                  style={[styles.folderCard, { backgroundColor: col.bg }]}
                  onPress={() => folder.special === 'repair' ? router.push('/repair') : openFolder(folder)}
                  activeOpacity={0.75}
                >
                  {isAdmin && (
                    <TouchableOpacity style={styles.gearBtn} onPress={() => openFolderEdit(folder)}>
                      <Text style={styles.gearIcon}>⚙️</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.folderEmoji}>{folder.icon}</Text>
                  <Text style={[styles.folderName, { color: col.fg }]}>{folder.name}</Text>
                  <Text style={[styles.folderStat, { color: col.fg + 'aa' }]}>{count} · {qty} قطعة</Text>
                </TouchableOpacity>
              );
            })}
          </View>

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
              textAlign="right"
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
              <TouchableOpacity
                style={[styles.delBtn]}
                onPress={() => editingFolder && deleteFolder(editingFolder)}
              >
                <Text style={styles.delBtnTxt}>🗑️ حذف</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditFolderModal(false)}>
                <Text style={styles.cancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={saveFolderEdit}>
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
              textAlign="right"
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
          {/* backdrop */}
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setBellModal(false)} />
          {/* dropdown — sibling of backdrop, NOT inside it */}
          <View style={styles.bellDropdown}>
            {/* Header */}
            <View style={styles.bellDropHead}>
              <TouchableOpacity onPress={() => setBellModal(false)}>
                <Text style={{ fontSize: 18, color: '#94a3b8', fontWeight: '700', paddingHorizontal: 4 }}>✕</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {totalBadge > 0 && (
                  <View style={{ backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{totalBadge}</Text>
                  </View>
                )}
                <Text style={styles.bellDropTitle}>سجل الإشعارات</Text>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 460 }}
              contentContainerStyle={{ padding: 10, paddingTop: 6 }}
            >
              {/* System alerts */}
              {notifications.map((notif) => (
                <View key={notif.id} style={[styles.bellCard, { backgroundColor: notif.color + '12', borderColor: notif.color + '55' }]}>
                  <View style={styles.bellCardTop}>
                    <View style={[styles.bellBadgePill, { backgroundColor: notif.color }]}>
                      <Text style={styles.bellBadgeTxt}>
                        {notif.icon} {notif.type === 'del' ? 'حذف' : notif.type === 'empty' ? 'نفد' : notif.type === 'low' ? 'قليل' : notif.type === 'check' ? 'شيك' : notif.type === 'salary' ? 'راتب' : 'دين'}
                      </Text>
                    </View>
                    <Text style={styles.bellCardMsg} numberOfLines={2}>{notif.title}</Text>
                  </View>
                  <Text style={styles.bellCardSub}>{notif.sub}</Text>
                  {notif.type === 'del' && auth?.role === 'super_admin' && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity style={styles.bellApprove} onPress={() => notif.bc && approveDelete(notif.bc)}>
                        <Text style={{ color: '#dc2626', fontWeight: '900', fontSize: 12 }}>✓ موافق</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.bellReject} onPress={() => notif.bc && rejectDelete(notif.bc)}>
                        <Text style={{ color: '#16a34a', fontWeight: '900', fontSize: 12 }}>✗ رفض</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}

              {/* Activity log */}
              {activityLog.length === 0 && notifications.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>✅</Text>
                  <Text style={{ fontSize: 14, color: '#374151', fontWeight: '800' }}>كل شيء على ما يرام</Text>
                </View>
              ) : (
                activityLog.map((entry) => {
                  const card = getBellCard(entry.type);
                  const timeStr = new Date(entry.ts).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });
                  const dateStr = new Date(entry.ts).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  const userColor = (Object.values(app.users ?? {}) as any[]).find((u) => u.name === entry.by)?.color ?? '#f59e0b';
                  return (
                    <Pressable
                      key={entry.id}
                      onPress={() => !entry.read && markOneRead(entry.id)}
                      android_ripple={{ color: card.badge + '22' }}
                      style={[styles.bellCard, { backgroundColor: card.bg, borderColor: entry.read ? card.border : card.badge, opacity: entry.read ? 0.65 : 1 }]}
                    >
                      {/* Row 1: type badge + message */}
                      <View style={styles.bellCardTop}>
                        <View style={[styles.bellBadgePill, { backgroundColor: card.badge }]}>
                          <Text style={styles.bellBadgeTxt}>{card.icon} {card.label}</Text>
                        </View>
                        <Text style={styles.bellCardMsg} numberOfLines={1}>{entry.msg}</Text>
                        {!entry.read && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: card.badge }} />}
                      </View>
                      {/* Row 2: amount + user badge + date */}
                      <View style={styles.bellCardFoot}>
                        <Text style={styles.bellCardDate}>{timeStr} · {dateStr}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {entry.amount !== undefined && (
                            <Text style={[styles.bellCardAmount, { color: card.badge }]}>DH {entry.amount}</Text>
                          )}
                          <View style={[styles.bellUserBadge, { backgroundColor: userColor }]}>
                            <Text style={styles.bellUserTxt}>👤 {entry.by}</Text>
                          </View>
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
  root: { flex: 1, backgroundColor: '#f8fafc' },

  /* Header — rounded bottom like web (0 0 32px 32px) */
  headerCard: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#1e293b' },
  greenDot: { color: '#10b981' },
  logoutBtn: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  logoutTxt: { fontSize: 13, color: '#ef4444', fontWeight: '700' },
  bellWrap: { position: 'relative', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 26 },
  bellBadge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: '#ef4444', borderRadius: 10,
    minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2, borderColor: '#fff',
  },
  bellBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  welcomeTxt: { fontSize: 18, fontWeight: '800', color: '#5c67f2', textAlign: 'center' },

  /* Action buttons — 95px tall like web */
  actionRow: { flexDirection: 'row', gap: 14, paddingHorizontal: 14, paddingBottom: 4 },
  actionBtn: {
    flex: 1, height: 95, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 6,
  },
  actionRed:  { backgroundColor: '#ef4444', shadowColor: '#ef4444' },
  actionGold: { backgroundColor: '#10b981', shadowColor: '#10b981' },
  actionInner: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionTxt:  { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  actionIcon: { fontSize: 32 },

  /* Search — border like web */
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 14, marginTop: 4, marginBottom: 4,
  },
  searchInput: {
    flex: 1, backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 2, borderColor: '#e2e8f0',
    paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 15, color: '#1e293b', fontWeight: '600',
  },
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
  searchCardRight: { flex: 1, alignItems: 'flex-end' },
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
    width: '47%', borderRadius: 20, padding: 12,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 100, position: 'relative',
    borderWidth: 1, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 3,
  },
  gearBtn: { position: 'absolute', top: 6, left: 6, padding: 4 },
  gearIcon: { fontSize: 12, opacity: 0.55 },
  folderEmoji: { fontSize: 26, marginBottom: 6 },
  folderName: { fontSize: 13, fontWeight: '800', textAlign: 'center', marginBottom: 2 },
  folderStat: { fontSize: 10, fontWeight: '600', textAlign: 'center' },

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
    fontWeight: '600', marginBottom: 14,
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
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bellUserTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  bellCardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  bellCardDate: { fontSize: 10, color: '#94a3b8', fontWeight: '700' },
  bellBadgePill: { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  bellBadgeTxt: { color: '#fff', fontWeight: '900', fontSize: 10 },
  bellApprove: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5' },
  bellReject: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
});
