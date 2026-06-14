import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { formatMAD, nowDate, getFolderColor } from '../../src/utils/helpers';
import { usePermissions } from '../../src/hooks/usePermissions';

type Filter = 'today' | 'week' | 'month' | 'year' | 'archive';

const MAIN_TABS: { key: Filter; label: string }[] = [
  { key: 'today',   label: 'اليوم' },
  { key: 'week',    label: 'الأسبوع' },
  { key: 'month',   label: '🌙 الشهر' },
  { key: 'year',    label: '👑 السنة' },
];

function parseDate(dateStr: string): Date {
  const [d, m, y] = dateStr.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

const INTERNAL = ['📦', '🗑️', '📌', '📒', '💰'];
function isInternal(name: string) {
  return INTERNAL.some(p => name?.startsWith(p));
}

export default function ReportScreen() {
  const { app, updateApp } = useAppStore();
  const perm = usePermissions();
  const { date: today, monthKey } = nowDate();
  const yr = today.split('/')[2];

  const [filter, setFilter] = useState<Filter>('today');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [selectedArchiveMonth, setSelectedArchiveMonth] = useState<string | null>(null);
  const [resetModal, setResetModal] = useState(false);
  const [resetPin, setResetPin] = useState('');
  const [resetErr, setResetErr] = useState(false);

  const allSales = app.todaySales ?? [];

  const filtered = useMemo(() => {
    if (filter === 'archive') return [];
    const todayDate = parseDate(today);
    const weekStart = getWeekStart(todayDate);
    return allSales.filter(s => {
      if (!s.dateString) return false;
      const sDate = parseDate(s.dateString);
      switch (filter) {
        case 'today': return s.dateString === today;
        case 'week':  return sDate >= weekStart && sDate <= todayDate;
        case 'month': return s.monthKey === monthKey;
        case 'year':  return s.yearKey === yr || s.dateString?.endsWith(`/${yr}`);
        default: return true;
      }
    });
  }, [allSales, filter, today, monthKey, yr]);

  const realSales = filtered.filter(s => !isInternal(s.name ?? ''));

  const revenue = realSales.reduce((sum, r) => sum + (r.sell || 0), 0);
  const cost    = realSales.reduce((sum, r) => sum + (r.buy  || 0), 0);
  const profit  = revenue - cost;

  const capital = Object.values(app.stock ?? {}).reduce(
    (sum, item: any) => sum + ((item.buy || 0) * (item.qty || 0)), 0,
  );

  const creditTotal = Object.values(app.credit ?? {}).reduce(
    (sum, c: any) => sum + (c.total || 0), 0,
  );

  const supplierEntries = Object.entries(app.supplierCredit ?? {});
  const totalDebt        = supplierEntries.reduce((sum, [, v]) => sum + (v.total || 0), 0);
  const activeSuppliers  = supplierEntries.filter(([, v]) => (v.total || 0) > 0).length;
  const topSupplier      = [...supplierEntries].sort((a, b) => (b[1].total || 0) - (a[1].total || 0))[0];

  const allChecks        = supplierEntries.flatMap(([, v]) => v.checks ?? []);
  const pendingChecks    = allChecks.filter((c: any) => !c.cashed);
  const pendingChecksAmt = pendingChecks.reduce((sum, c: any) => sum + (c.amount || 0), 0);

  const allPayments    = supplierEntries.flatMap(([, v]) => (v.history ?? []).filter((t: any) => t.type === 'sub'));
  const totalPayments  = allPayments.reduce((sum, t: any) => sum + (t.amount || 0), 0);

  const allAdds        = supplierEntries.flatMap(([, v]) => (v.history ?? []).filter((t: any) => t.type === 'add'));
  const totalAddsAmt   = allAdds.reduce((sum, t: any) => sum + (t.amount || 0), 0);

  const pendingChiks   = pendingChecks.filter((c: any) => c.type === 'chik');
  const cashedChiks    = allChecks.filter((c: any) => c.type === 'chik' && c.cashed);
  const pendingKombs   = pendingChecks.filter((c: any) => c.type === 'kombiala');
  const cashedKombs    = allChecks.filter((c: any) => c.type === 'kombiala' && c.cashed);

  // Archive: group all sales by monthKey
  const archive = useMemo(() => {
    const groups: Record<string, { count: number; revenue: number; profit: number }> = {};
    for (const s of allSales) {
      if (!s.monthKey || isInternal(s.name ?? '')) continue;
      if (!groups[s.monthKey]) groups[s.monthKey] = { count: 0, revenue: 0, profit: 0 };
      groups[s.monthKey].count++;
      groups[s.monthKey].revenue += s.sell || 0;
      groups[s.monthKey].profit  += (s.sell || 0) - (s.buy || 0);
    }
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mk, v]) => ({ monthKey: mk, ...v }));
  }, [allSales]);

  // Archive month detail
  const archiveMonthSales = useMemo(() => {
    if (!selectedArchiveMonth) return [];
    return allSales.filter(s => s.monthKey === selectedArchiveMonth && !isInternal(s.name ?? ''));
  }, [allSales, selectedArchiveMonth]);

  const folders = app.folders ?? [];

  function folderStats(folderName: string) {
    const sales = realSales.filter(s => s.cat === folderName);
    const rev = sales.reduce((sum, r) => sum + (r.sell || 0), 0);
    const cst = sales.reduce((sum, r) => sum + (r.buy  || 0), 0);
    return { count: sales.length, revenue: rev, profit: rev - cst };
  }

  function catSales(name: string) {
    return [...realSales].filter(s => s.cat === name).reverse();
  }

  function deleteSale(nid: string, name: string) {
    Alert.alert('حذف العملية', `حذف "${name}" من السجل؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: () => updateApp(prev => ({
          ...prev,
          todaySales: prev.todaySales.filter(s => s.nid !== nid),
        })),
      },
    ]);
  }

  function tryReset() {
    const correct = app.resetPin || '0000';
    if (resetPin === correct) {
      updateApp(prev => ({ ...prev, todaySales: [] }));
      setResetModal(false);
      setResetPin('');
      setResetErr(false);
    } else {
      setResetErr(true);
      setResetPin('');
    }
  }

  function renderSaleRow(sale: (typeof realSales)[0]) {
    const p = (sale.sell || 0) - (sale.buy || 0);
    const expanded = expandedSaleId === sale.nid;
    return (
      <TouchableOpacity
        key={sale.nid}
        style={[s.opRow, expanded && s.opRowExpanded]}
        onPress={() => setExpandedSaleId(expanded ? null : sale.nid)}
        activeOpacity={0.78}
      >
        <View style={s.opMain}>
          <View style={{ flex: 1 }}>
            <Text style={s.opName} numberOfLines={1}>{sale.name}</Text>
            <Text style={s.opMeta}>{sale.time} · {sale.dateString}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
            <Text style={s.opSell}>{formatMAD(sale.sell)}</Text>
            <Text style={[s.opProfit, { color: p >= 0 ? '#10b981' : '#ef4444' }]}>
              {p >= 0 ? '+' : ''}{formatMAD(p)}
            </Text>
          </View>
        </View>
        {expanded && (
          <View style={s.opDetail}>
            <View style={s.opDetailRow}>
              <Text style={s.opDetailVal}>{formatMAD(sale.buy)}</Text>
              <Text style={s.opDetailLabel}>سعر الشراء</Text>
            </View>
            <View style={s.opDetailRow}>
              <Text style={s.opDetailVal}>{sale.seller || '—'}</Text>
              <Text style={s.opDetailLabel}>البائع</Text>
            </View>
            {perm.isAdmin && (
              <TouchableOpacity
                style={s.opDeleteBtn}
                onPress={() => deleteSale(sale.nid, sale.name)}
              >
                <Text style={s.opDeleteTxt}>🗑️ حذف هذه العملية</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}><Text style={s.dot}>● </Text>الحصيلة المالية 📊</Text>
      </View>

      {/* Action buttons — 2 red buttons like web */}
      <View style={s.actionRow}>
        <TouchableOpacity style={s.actionBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={s.actionBtnTxt}>← للإدارة</Text>
        </TouchableOpacity>
        {perm.isAdmin && (
          <TouchableOpacity style={s.actionBtn} onPress={() => setResetModal(true)} activeOpacity={0.85}>
            <Text style={s.actionBtnTxt}>🗑️ تصفير الحصيلة</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter tabs — pill style, gold active */}
      <View style={s.tabWrap}>
        <View style={s.tabBar}>
          {MAIN_TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[s.tab, filter === t.key && s.tabActive]}
              onPress={() => {
                setFilter(t.key);
                setSelectedCat(null);
                setSelectedArchiveMonth(null);
                setExpandedSaleId(null);
              }}
            >
              <Text style={[s.tabTxt, filter === t.key && s.tabTxtActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[s.tabArchive, filter === 'archive' && s.tabActive]}
          onPress={() => {
            setFilter('archive');
            setSelectedCat(null);
            setSelectedArchiveMonth(null);
            setExpandedSaleId(null);
          }}
        >
          <Text style={[s.tabTxt, filter === 'archive' && s.tabTxtActive]}>📦 الأرشيف</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── ARCHIVE TAB ── */}
        {filter === 'archive' && (
          <>
            {selectedArchiveMonth ? (
              <View style={s.card}>
                <TouchableOpacity
                  style={s.archiveBackBtn}
                  onPress={() => { setSelectedArchiveMonth(null); setExpandedSaleId(null); }}
                >
                  <Text style={s.archiveBackTxt}>← العودة للأرشيف</Text>
                </TouchableOpacity>
                <Text style={s.cardTitle}>📅 {selectedArchiveMonth}</Text>
                {archiveMonthSales.length === 0
                  ? <Text style={s.emptyTxt}>لا توجد عمليات</Text>
                  : archiveMonthSales.map(sale => renderSaleRow(sale))
                }
              </View>
            ) : (
              <View style={s.card}>
                <Text style={s.cardTitle}>📁 الأرشيف الشهري</Text>
                {archive.length === 0 ? (
                  <Text style={s.emptyTxt}>لا يوجد أرشيف بعد</Text>
                ) : archive.map(m => (
                  <TouchableOpacity
                    key={m.monthKey}
                    style={s.archiveRow}
                    onPress={() => setSelectedArchiveMonth(m.monthKey)}
                    activeOpacity={0.75}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.archiveMonth}>{m.monthKey}</Text>
                      <Text style={s.archiveCount}>{m.count} عملية</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.archiveRevenue}>{formatMAD(m.revenue)}</Text>
                      <Text style={[s.archiveProfit, { color: m.profit >= 0 ? '#10b981' : '#ef4444' }]}>
                        {m.profit >= 0 ? '+' : ''}{formatMAD(m.profit)}
                      </Text>
                    </View>
                    <Text style={s.archiveChev}>←</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {/* ── LIVE STATS (today / week / month / year) ── */}
        {filter !== 'archive' && (
          <>
            {/* Top 3 stat cards — all gold like web */}
            <View style={s.statBox}>
              <View style={[s.statCard, { borderBottomColor: '#d97706' }]}>
                <Text style={s.statLabel}>رأس المال{'\n'}المتداول</Text>
                <Text style={[s.statVal, { color: '#d97706' }]}>{formatMAD(capital)}</Text>
              </View>
              <View style={[s.statCard, { borderBottomColor: '#d97706' }]}>
                <Text style={s.statLabel}>المبيعات{'\n'}الإجمالية</Text>
                <Text style={[s.statVal, { color: '#d97706' }]}>{formatMAD(revenue)}</Text>
              </View>
              <View style={[s.statCard, { borderBottomColor: '#d97706', backgroundColor: '#fffbeb' }]}>
                <Text style={[s.statLabel, { color: '#92400e' }]}>الربح{'\n'}الصافي 💸</Text>
                <Text style={[s.statVal, { color: profit >= 0 ? '#d97706' : '#ef4444' }]}>
                  {formatMAD(profit)}
                </Text>
              </View>
            </View>

            {/* Category mini cards — 3 columns like web */}
            <View style={s.subGrid}>
              {/* Credit card */}
              <TouchableOpacity
                style={[s.subCard, { borderTopColor: '#d97706' },
                  selectedCat === '__credit__' && s.subCardActive]}
                onPress={() => {
                  setSelectedCat(selectedCat === '__credit__' ? null : '__credit__');
                  setExpandedSaleId(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={[s.subCatName, { color: '#d97706' }]}>📒 الكريدي{'\n'}العام</Text>
                <Text style={s.subStatLine}><Text style={[s.subStatVal, { color: '#d97706' }]}>{formatMAD(creditTotal)}</Text></Text>
                <Text style={s.subStatLine}>الديون: <Text style={s.subStatNum}>{Object.values(app.credit ?? {}).length}</Text></Text>
              </TouchableOpacity>

              {folders.filter(f => f.colorClass !== 'folder-acc').map(f => {
                const st  = folderStats(f.name);
                const col = getFolderColor(f).fg;
                const isRepair = f.name === 'إصلاح' || f.special === 'repair';
                return (
                  <TouchableOpacity
                    key={f.id ?? f.name}
                    style={[s.subCard, { borderTopColor: col },
                      selectedCat === f.name && s.subCardActive]}
                    onPress={() => {
                      setSelectedCat(selectedCat === f.name ? null : f.name);
                      setExpandedSaleId(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.subCatName, { color: col }]}>{f.icon ?? '📁'} {f.name}</Text>
                    <Text style={s.subStatLine}>
                      {isRepair ? 'المدخول:' : `المبيعات: ${st.count}`}
                      {isRepair && <Text style={s.subStatNum}> {formatMAD(st.revenue)}</Text>}
                    </Text>
                    <Text style={s.subStatLine}>
                      الربح: <Text style={[s.subStatNum, { color: st.profit >= 0 ? '#10b981' : '#ef4444' }]}>
                        {formatMAD(st.profit)}
                      </Text>
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Sales list — appears when a category is selected */}
            {selectedCat && selectedCat !== '__credit__' && (
              <View style={s.card}>
                <Text style={s.cardTitle}>
                  📋 {selectedCat} ({catSales(selectedCat).length} عملية)
                </Text>
                {catSales(selectedCat).length === 0 ? (
                  <Text style={s.emptyTxt}>لا توجد عمليات في هذه الفترة</Text>
                ) : (
                  catSales(selectedCat).map(sale => renderSaleRow(sale))
                )}
              </View>
            )}

            {selectedCat === '__credit__' && (
              <View style={[s.card, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                <Text style={[s.cardTitle, { color: '#d97706' }]}>📒 الكريدي</Text>
                <View style={s.subRow}>
                  <Text style={[s.subRowVal, { color: '#d97706', fontSize: 22 }]}>{formatMAD(creditTotal)}</Text>
                  <Text style={s.subRowLabel}>إجمالي الديون القائمة</Text>
                </View>
              </View>
            )}

            {/* Hint when nothing selected */}
            {!selectedCat && (
              <View style={[s.card, { alignItems: 'center', paddingVertical: 16 }]}>
                <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 13, textAlign: 'center' }}>
                  اضغط على أي خانة أعلاه باش تشوف التفاصيل ديالها هنا
                </Text>
              </View>
            )}

            {/* Supplier stats — matches web exactly */}
            <View style={[s.card, { borderWidth: 2, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }]}>
              <Text style={[s.cardTitle, { color: '#1e3a8a' }]}>📦 إحصائيات الموردين</Text>

              {/* Row 1: نشطون + ديون */}
              <View style={s.supGrid}>
                <View style={[s.supCard, { borderTopColor: '#5c67f2' }]}>
                  <Text style={s.supLabel}>الموردين النشطين</Text>
                  <Text style={[s.supVal, { color: '#5c67f2' }]}>{activeSuppliers} / {supplierEntries.length}</Text>
                </View>
                <View style={[s.supCard, { borderTopColor: '#ef4444' }]}>
                  <Text style={s.supLabel}>إجمالي الديون</Text>
                  <Text style={[s.supVal, { color: '#ef4444' }]}>{formatMAD(totalDebt)}</Text>
                </View>
              </View>

              {/* Top supplier */}
              {topSupplier && (topSupplier[1].total ?? 0) > 0 && (
                <View style={s.topSupCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[s.topSupDebt, { color: '#ef4444' }]}>{formatMAD(topSupplier[1].total ?? 0)}</Text>
                    <Text style={s.topSupName}>● أكثر مورد — {topSupplier[1].name ?? topSupplier[0]}</Text>
                  </View>
                  <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '600', textAlign: 'right', marginTop: 4 }}>دين</Text>
                </View>
              )}

              {/* Row 2: كمبيالات + شيكات */}
              <View style={s.supGrid}>
                <View style={[s.supCard, { borderTopColor: '#7c3aed' }]}>
                  <Text style={[s.supLabel, { color: '#7c3aed', fontWeight: '800' }]}>📋 كمبيالات</Text>
                  <Text style={s.supSub}>غير مخلصة: {pendingKombs.length} — {formatMAD(pendingKombs.reduce((s, c: any) => s + (c.amount||0), 0))}</Text>
                  <Text style={s.supSub}>مخلصة: {cashedKombs.length} — {formatMAD(cashedKombs.reduce((s, c: any) => s + (c.amount||0), 0))}</Text>
                </View>
                <View style={[s.supCard, { borderTopColor: '#0284c7' }]}>
                  <Text style={[s.supLabel, { color: '#0284c7', fontWeight: '800' }]}>🧾 شيكات</Text>
                  <Text style={s.supSub}>غير مخلصة: {pendingChiks.length} — {formatMAD(pendingChiks.reduce((s, c: any) => s + (c.amount||0), 0))}</Text>
                  <Text style={s.supSub}>مخلصة: {cashedChiks.length} — {formatMAD(cashedChiks.reduce((s, c: any) => s + (c.amount||0), 0))}</Text>
                </View>
              </View>

              {/* Row 3: تسديدات + إسبيتات */}
              <View style={s.supGrid}>
                <View style={[s.supCard, { borderTopColor: '#10b981' }]}>
                  <Text style={s.supLabel}>💰 إجمالي التسديدات</Text>
                  <Text style={[s.supVal, { color: '#10b981' }]}>{formatMAD(totalPayments)}</Text>
                </View>
                <View style={[s.supCard, { borderTopColor: '#d97706' }]}>
                  <Text style={s.supLabel}>📦 إسبيتات مو مدفوعة</Text>
                  <Text style={s.supSub}>{allAdds.length} عملية — {formatMAD(totalAddsAmt)}</Text>
                </View>
              </View>
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Reset PIN modal */}
      <Modal visible={resetModal} transparent animationType="fade" onRequestClose={() => setResetModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>🗑️ تصفير الحصيلة</Text>
            <Text style={s.modalSub}>أدخل رمز الإدارة لتأكيد التصفير الكامل</Text>
            <TextInput
              style={[s.modalPin, resetErr && { borderColor: '#ef4444', backgroundColor: '#fef2f2' }]}
              value={resetPin}
              onChangeText={v => { setResetPin(v); setResetErr(false); }}
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
              textAlign="center"
              placeholder="••••"
              placeholderTextColor="#94a3b8"
              autoFocus
              onSubmitEditing={tryReset}
            />
            {resetErr && <Text style={s.resetErrTxt}>رمز خاطئ، حاول مجدداً</Text>}
            <View style={s.modalBtns}>
              <TouchableOpacity
                style={s.modalCancel}
                onPress={() => { setResetModal(false); setResetPin(''); setResetErr(false); }}
              >
                <Text style={s.modalCancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={tryReset}>
                <Text style={s.modalConfirmTxt}>تصفير</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },

  header: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#1e293b' },
  dot: { color: '#10b981', fontSize: 16 },

  // Two big red action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  actionBtnTxt: { color: '#ffffff', fontWeight: '900', fontSize: 15 },

  tabWrap: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabBar: { flexDirection: 'row', gap: 5, marginBottom: 6 },
  tabArchive: {
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: '#d97706',
    shadowColor: '#d97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  tabTxt:       { fontSize: 11, fontWeight: '700', color: '#64748b' },
  tabTxtActive: { color: '#ffffff', fontWeight: '900' },

  scroll: { padding: 12, gap: 10 },

  // Stat cards — border-bottom gold like web
  statBox: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  statLabel: { fontSize: 10, color: '#64748b', fontWeight: '700', textAlign: 'center', marginBottom: 6, lineHeight: 14 },
  statVal:   { fontSize: 13, fontWeight: '900', textAlign: 'center' },

  // Category mini cards — 3 columns
  subGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subCard: {
    width: '31.5%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 10,
    borderTopWidth: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  subCardActive: {
    backgroundColor: '#fffbeb',
    borderColor: '#d97706',
  },
  subCatName: { fontSize: 11, fontWeight: '800', marginBottom: 6, textAlign: 'right', lineHeight: 16 },
  subStatLine: { fontSize: 11, color: '#64748b', fontWeight: '600', textAlign: 'right', marginBottom: 2 },
  subStatVal:  { fontSize: 12, fontWeight: '900' },
  subStatNum:  { fontWeight: '800', color: '#1e293b' },
  subRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  subRowLabel: { fontSize: 11, color: '#64748b', fontWeight: '700' },
  subRowVal:   { fontSize: 13, fontWeight: '800', color: '#1e293b' },

  // Card container
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: { fontSize: 15, fontWeight: '900', color: '#1e293b', textAlign: 'right', marginBottom: 14 },
  emptyTxt:  { color: '#64748b', fontWeight: '700', fontSize: 14, textAlign: 'center', paddingVertical: 20 },

  // Operation rows
  opRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 8,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
  },
  opRowExpanded: { borderColor: '#c7d2fe', backgroundColor: '#f5f3ff' },
  opMain: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  opName:   { fontSize: 14, fontWeight: '700', color: '#1e293b', textAlign: 'right' },
  opMeta:   { fontSize: 11, color: '#94a3b8', fontWeight: '600', textAlign: 'right', marginTop: 2 },
  opSell:   { fontSize: 14, fontWeight: '900', color: '#1e293b' },
  opProfit: { fontSize: 12, fontWeight: '800', marginTop: 2 },

  opDetail: {
    borderTopWidth: 1,
    borderTopColor: '#e0e7ff',
    padding: 12,
    gap: 8,
  },
  opDetailRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  opDetailLabel: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  opDetailVal:   { fontSize: 13, color: '#1e293b', fontWeight: '800' },
  opDeleteBtn: {
    marginTop: 4,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  opDeleteTxt: { color: '#ef4444', fontWeight: '800', fontSize: 13 },

  // Archive
  archiveBackBtn: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    alignSelf: 'flex-end',
  },
  archiveBackTxt: { color: '#ef4444', fontWeight: '800', fontSize: 13 },
  archiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  archiveMonth:   { fontSize: 15, fontWeight: '800', color: '#1e293b', textAlign: 'right' },
  archiveCount:   { fontSize: 12, color: '#64748b', fontWeight: '600', textAlign: 'right', marginTop: 2 },
  archiveRevenue: { fontSize: 14, fontWeight: '800', color: '#374151' },
  archiveProfit:  { fontSize: 13, fontWeight: '800', marginTop: 2 },
  archiveChev:    { fontSize: 16, color: '#94a3b8' },

  // Supplier
  supGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  supCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderTopWidth: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  supLabel: { fontSize: 11, color: '#64748b', fontWeight: '700', textAlign: 'right', marginBottom: 6 },
  supVal:   { fontSize: 15, fontWeight: '900', textAlign: 'right' },
  supSub:   { fontSize: 10, color: '#64748b', fontWeight: '600', marginTop: 2, textAlign: 'right' },

  topSupCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    marginBottom: 8,
  },
  topSupBadge: { fontSize: 11, color: '#ef4444', fontWeight: '800', textAlign: 'right' },
  topSupName:  { fontSize: 13, fontWeight: '800', color: '#1e293b', textAlign: 'right' },
  topSupDebt:  { fontSize: 16, fontWeight: '900' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 32,
    padding: 28,
    width: '88%',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  modalTitle:   { fontSize: 20, fontWeight: '900', color: '#1e293b' },
  modalSub:     { fontSize: 13, color: '#64748b', fontWeight: '600', textAlign: 'center' },
  modalPin: {
    width: '100%',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 16,
    fontSize: 24,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
    letterSpacing: 8,
    textAlign: 'center',
  },
  resetErrTxt:    { color: '#ef4444', fontWeight: '700', fontSize: 13 },
  modalBtns:      { flexDirection: 'row', gap: 12, width: '100%' },
  modalCancel: {
    flex: 1, padding: 14, borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
  },
  modalCancelTxt:  { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  modalConfirm:    { flex: 2, padding: 14, borderRadius: 14, backgroundColor: '#ef4444', alignItems: 'center' },
  modalConfirmTxt: { fontSize: 15, fontWeight: '900', color: '#ffffff' },
});
