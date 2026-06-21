import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { formatMAD, nowDate, getFolderColor, normalizeMonthKey } from '../../src/utils/helpers';
import { usePermissions } from '../../src/hooks/usePermissions';
import AppHeader from '../../src/components/AppHeader';

type Filter = 'today' | 'week' | 'month' | 'year' | 'archive';

const MAIN_TABS: { key: Filter; label: string }[] = [
  { key: 'today',   label: 'اليوم' },
  { key: 'week',    label: 'الأسبوع' },
  { key: 'month',   label: 'الشهر 🌙' },
  { key: 'year',    label: 'السنة 👑' },
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

const INTERNAL = ['🗑️', '📌', '📒', '💰', '📦 أضاف:', '📦 زاد:', '📦 تصحيح:', '📦 ستوك:'];

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليوز','غشت','شتنبر','أكتوبر','نونبر','دجنبر'];
function formatMonthKey(mk: string): string {
  const [y, m] = mk.split('_');
  const idx = parseInt(m, 10) - 1;
  return `${AR_MONTHS[idx] ?? m} ${y}`;
}
function isInternal(name: string) {
  return INTERNAL.some(p => name?.startsWith(p));
}

export default function ReportScreen() {
  const { app, updateApp, ensureMonthsLoaded } = useAppStore();
  const perm = usePermissions();
  const { date: today, monthKey } = nowDate();
  const yr = today.split('/')[2];

  const [filter, setFilter] = useState<Filter>('today');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [selectedArchiveMonth, setSelectedArchiveMonth] = useState<string | null>(null);
  const [drillMonth, setDrillMonth] = useState<string | null>(null);
  const [phoneFilter, setPhoneFilter] = useState<'today'|'week'|'month'|'year'>('today');
  const [phoneDrill, setPhoneDrill] = useState<string|null>(null);
  const [accFilter, setAccFilter] = useState<'today'|'week'|'month'|'year'>('today');
  const [accDrill, setAccDrill] = useState<string|null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  // Load historical months when needed
  useEffect(() => {
    const needYear = filter === 'year' || phoneFilter === 'year' || accFilter === 'year';
    if (needYear) {
      const yearNum = parseInt(yr, 10);
      const curMonth = new Date().getMonth() + 1;
      const months: string[] = [];
      for (let m = 1; m <= curMonth; m++) {
        months.push(`${yearNum}_${String(m).padStart(2, '0')}`);
      }
      ensureMonthsLoaded(months);
    }
    if (filter === 'archive' && (app.salesMonths ?? []).length > 0) {
      setArchiveLoading(true);
      ensureMonthsLoaded(app.salesMonths ?? []).then(() => setArchiveLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, phoneFilter, accFilter, app.salesMonths?.length]);
  const [resetModal, setResetModal] = useState(false);
  const [resetPin, setResetPin] = useState('');
  const [resetErr, setResetErr] = useState(false);
  const [addCustOpen, setAddCustOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

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
        case 'month': return normalizeMonthKey(s.monthKey ?? '') === monthKey;
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

  const CORE_FOLDERS = ['جديد', 'مستعمل', 'LCD', 'إصلاح مانيال'];
  const otherSales = realSales.filter(s => !CORE_FOLDERS.includes(s.cat ?? ''));
  const otherRevenue = otherSales.reduce((sum, r) => sum + (r.sell || 0), 0);
  const otherProfit  = otherSales.reduce((sum, r) => sum + ((r.sell || 0) - (r.buy || 0)), 0);

  const otherStockItems = Object.values(app.stock ?? {}).filter(i => !i.pendingDeletion && !CORE_FOLDERS.includes(i.cat ?? ''));
  const otherCapital    = otherStockItems.reduce((sum, i) => sum + ((i.buy || 0) * (i.qty || 0)), 0);
  const otherSellValue  = otherStockItems.reduce((sum, i) => sum + ((i.sell || 0) * (i.qty || 0)), 0);
  const otherItemCount  = otherStockItems.length;
  const otherTotalQty   = otherStockItems.reduce((sum, i) => sum + (i.qty || 0), 0);

  const folders = app.folders ?? [];

  const selectedColors = useMemo(() => {
    if (!selectedCat) return null;
    if (selectedCat === '__credit__') return { bg: '#fffbeb', fg: '#d97706' };
    if (selectedCat === '__other__') return { bg: '#fdf4ff', fg: '#a21caf' };
    const f = folders.find(fl => fl.name === selectedCat);
    return f ? getFolderColor(f) : { bg: '#f1f5f9', fg: '#5c67f2' };
  }, [selectedCat, folders]);

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

  function addCustomer() {
    const name = newName.trim();
    if (!name) { Alert.alert('', 'اكتب اسم الزبون'); return; }
    const id = Date.now().toString();
    updateApp(prev => ({
      ...prev,
      credit: { ...prev.credit, [id]: { name, phone: newPhone.trim(), total: 0, logs: [] } },
    }));
    setAddCustOpen(false);
    setNewName('');
    setNewPhone('');
    router.push(`/customer/${encodeURIComponent(id)}`);
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

  const PHONE_CATS = ['جديد', 'مستعمل', 'LCD'];

  function renderPhoneRow(sale: (typeof realSales)[0]) {
    const isReturn = (sale.sell || 0) < 0;
    return (
      <View key={sale.nid} style={{ backgroundColor: isReturn ? '#fef2f2' : '#f8fafc', borderRadius: 14, borderWidth: 1.5, borderColor: isReturn ? '#fca5a5' : '#e2e8f0', padding: 12, marginBottom: 8, gap: 5 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '900', color: isReturn ? '#ef4444' : '#1e293b', fontSize: 14 }}>
            {isReturn ? '↩️ رجوع' : '✅ مباع'}
          </Text>
          <Text style={{ fontWeight: '900', color: isReturn ? '#ef4444' : '#16a34a', fontSize: 16 }}>
            {isReturn ? '-' : ''}{formatMAD(Math.abs(sale.sell || 0))}
          </Text>
        </View>
        <Text style={{ fontWeight: '700', color: '#1e293b', fontSize: 13, textAlign: 'right' }}>{sale.name}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
          <Text style={{ fontSize: 11, color: '#64748b', backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>📅 {sale.dateString} {sale.time}</Text>
          {sale.seller ? <Text style={{ fontSize: 11, color: '#64748b', backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>🛒 {sale.seller}</Text> : null}
          {sale.addedBy ? <Text style={{ fontSize: 11, color: '#64748b', backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>📦 {sale.addedBy}</Text> : null}
          {sale.editedBy ? <Text style={{ fontSize: 11, color: '#f59e0b', backgroundColor: '#fffbeb', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>✏️ {sale.editedBy}</Text> : null}
          {isReturn && sale.returnReason ? <Text style={{ fontSize: 11, color: '#ef4444', fontWeight: '800', backgroundColor: '#fef2f2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>⚠️ {sale.returnReason}</Text> : null}
        </View>
        {perm.isAdmin && (
          <TouchableOpacity onPress={() => deleteSale(sale.nid, sale.name)} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: '#ef4444' }}>🗑️ حذف</Text>
          </TouchableOpacity>
        )}
      </View>
    );
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
              <Text style={s.opDetailLabel}>سعر الشراء</Text>
              <Text style={s.opDetailVal}>{formatMAD(sale.buy)}</Text>
            </View>
            <View style={s.opDetailRow}>
              <Text style={s.opDetailLabel}>البائع</Text>
              <Text style={s.opDetailVal}>{sale.seller || '—'}</Text>
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
      <AppHeader
        title="الحصيلة المالية 📊"
        onBack={() => router.back()}
        rightAction={perm.isAdmin ? { label: '🗑️ تصفير', onPress: () => setResetModal(true) } : undefined}
      />

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
                setDrillMonth(null);
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
            setDrillMonth(null);
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
                <Text style={s.cardTitle}>📅 {formatMonthKey(selectedArchiveMonth)}</Text>
                {archiveMonthSales.length === 0
                  ? <Text style={s.emptyTxt}>لا توجد عمليات</Text>
                  : archiveMonthSales.map(sale => renderSaleRow(sale))
                }
              </View>
            ) : (
              <View style={s.card}>
                <Text style={s.cardTitle}>📁 الأرشيف الشهري</Text>
                {archiveLoading ? (
                  <Text style={[s.emptyTxt, { color: '#94a3b8' }]}>⏳ جاري تحميل الأرشيف...</Text>
                ) : archive.length === 0 ? (
                  <Text style={s.emptyTxt}>لا يوجد أرشيف بعد</Text>
                ) : archive.map(m => (
                  <TouchableOpacity
                    key={m.monthKey}
                    style={s.archiveRow}
                    onPress={() => setSelectedArchiveMonth(m.monthKey)}
                    activeOpacity={0.75}
                  >
                    <Text style={s.archiveChev}>←</Text>
                    <View style={{ alignItems: 'flex-start' }}>
                      <Text style={[s.archiveRevenue, { color: '#16a34a' }]}>{formatMAD(m.revenue)}</Text>
                      <Text style={[s.archiveProfit, { color: m.profit >= 0 ? '#10b981' : '#ef4444' }]}>
                        {m.profit >= 0 ? '+' : ''}{formatMAD(m.profit)} ربح
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.archiveMonth}>{formatMonthKey(m.monthKey)}</Text>
                      <Text style={s.archiveCount}>{m.count} عملية</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {/* ── LIVE STATS (today / week / month / year) ── */}
        {filter !== 'archive' && (
          <>
            {/* Top 3 stat cards */}
            <View style={s.statBox}>
              <View style={[s.statCard, { backgroundColor: '#1e3a8a', borderColor: '#1e3a8a' }]}>
                <Text style={[s.statLabel, { color: '#bfdbfe' }]}>رأس المال{'\n'}المتداول</Text>
                <Text style={[s.statVal, { color: '#fff' }]}>{formatMAD(otherCapital)}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: '#d97706', borderColor: '#d97706' }]}>
                <Text style={[s.statLabel, { color: '#fef9c3' }]}>المبيعات{'\n'}الإجمالية</Text>
                <Text style={[s.statVal, { color: '#fff' }]}>{formatMAD(otherRevenue)}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: otherProfit >= 0 ? '#16a34a' : '#dc2626', borderColor: otherProfit >= 0 ? '#16a34a' : '#dc2626' }]}>
                <Text style={[s.statLabel, { color: 'rgba(255,255,255,0.85)' }]}>الربح{'\n'}الصافي 💸</Text>
                <Text style={[s.statVal, { color: '#fff' }]}>{formatMAD(otherProfit)}</Text>
              </View>
            </View>

            {/* Category mini cards — 3 columns: جديد → مستعمل → إصلاح → LCD → كريدي → أخرى */}
            <View style={s.subGrid}>
              {/* 1-4: Core folders in fixed order */}
              {['جديد', 'مستعمل', 'إصلاح مانيال', 'LCD'].map(coreName => {
                const f = folders.find(fl =>
                  fl.name === coreName ||
                  (coreName === 'إصلاح مانيال' && (fl.special === 'repair' || fl.name === 'إصلاح'))
                );
                if (!f) return null;
                const st  = folderStats(f.name);
                const fColor = getFolderColor(f);
                const col = fColor.fg;
                const isRepair = f.name === 'إصلاح' || f.special === 'repair' || f.name === 'إصلاح مانيال';
                return (
                  <TouchableOpacity
                    key={f.id ?? f.name}
                    style={[s.subCard, { borderTopColor: col }, selectedCat === f.name && { backgroundColor: fColor.bg, borderColor: col, borderWidth: 3 }]}
                    onPress={() => { setSelectedCat(selectedCat === f.name ? null : f.name); setExpandedSaleId(null); setDrillMonth(null); setPhoneFilter('today'); setPhoneDrill(null); setAccFilter('today'); setAccDrill(null); }}
                    activeOpacity={0.8}
                  >
                    <View style={s.subCardInner}>
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
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* 5: كريدي */}
              <TouchableOpacity
                style={[s.subCard, { borderTopColor: '#d97706' }, selectedCat === '__credit__' && { backgroundColor: '#fffbeb', borderColor: '#d97706', borderWidth: 3 }]}
                onPress={() => { setSelectedCat(selectedCat === '__credit__' ? null : '__credit__'); setExpandedSaleId(null); setDrillMonth(null); setPhoneFilter('today'); setPhoneDrill(null); setAccFilter('today'); setAccDrill(null); }}
                activeOpacity={0.8}
              >
                <View style={s.subCardInner}>
                  <Text style={[s.subCatName, { color: '#d97706' }]}>📒 الكريدي{'\n'}العام</Text>
                  <Text style={s.subStatLine}><Text style={[s.subStatVal, { color: '#d97706' }]}>{formatMAD(creditTotal)}</Text></Text>
                  <Text style={s.subStatLine}>الديون: <Text style={s.subStatNum}>{Object.values(app.credit ?? {}).length}</Text></Text>
                </View>
              </TouchableOpacity>

              {/* Non-core non-acc folders */}
              {folders.filter(f =>
                f.colorClass !== 'folder-acc' &&
                !['جديد', 'مستعمل', 'LCD', 'إصلاح مانيال'].includes(f.name) &&
                f.special !== 'repair' &&
                f.name !== 'إصلاح'
              ).map(f => {
                const st  = folderStats(f.name);
                const col = getFolderColor(f).fg;
                return (
                  <TouchableOpacity
                    key={f.id ?? f.name}
                    style={[s.subCard, { borderTopColor: col }, selectedCat === f.name && { backgroundColor: getFolderColor(f).bg, borderColor: col, borderWidth: 3 }]}
                    onPress={() => { setSelectedCat(selectedCat === f.name ? null : f.name); setExpandedSaleId(null); setDrillMonth(null); setPhoneFilter('today'); setPhoneDrill(null); setAccFilter('today'); setAccDrill(null); }}
                    activeOpacity={0.8}
                  >
                    <View style={s.subCardInner}>
                      <Text style={[s.subCatName, { color: col }]}>{f.icon ?? '📁'} {f.name}</Text>
                      <Text style={s.subStatLine}>المبيعات: {st.count}</Text>
                      <Text style={s.subStatLine}>
                        الربح: <Text style={[s.subStatNum, { color: st.profit >= 0 ? '#10b981' : '#ef4444' }]}>
                          {formatMAD(st.profit)}
                        </Text>
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* آخر: أخرى */}
              <TouchableOpacity
                style={[s.subCard, { borderTopColor: '#e879f9' }, selectedCat === '__other__' && { backgroundColor: '#fdf4ff', borderColor: '#a21caf', borderWidth: 3 }]}
                onPress={() => { setSelectedCat(selectedCat === '__other__' ? null : '__other__'); setExpandedSaleId(null); setDrillMonth(null); setPhoneFilter('today'); setPhoneDrill(null); setAccFilter('today'); setAccDrill(null); }}
                activeOpacity={0.8}
              >
                <View style={s.subCardInner}>
                  <Text style={[s.subCatName, { color: '#a21caf' }]}>🎧 أخرى</Text>
                  <Text style={s.subStatLine}>المبيعات: {otherSales.length}</Text>
                  <Text style={s.subStatLine}>الربح: <Text style={[s.subStatNum, { color: otherProfit >= 0 ? '#10b981' : '#ef4444' }]}>{formatMAD(otherProfit)}</Text></Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Sales list — appears when a category is selected */}
            {selectedCat && selectedCat !== '__credit__' && selectedCat !== '__other__' && (() => {
              const isPhone = PHONE_CATS.includes(selectedCat);
              const cardStyle = [s.card, selectedColors && { backgroundColor: selectedColors.bg, borderColor: selectedColors.fg, borderWidth: 3 }] as any;
              const titleColor = selectedColors?.fg ?? '#1e293b';

              // ── PHONE CATEGORIES: own filter ──
              if (isPhone) {
                const todayDate = parseDate(today);
                const weekStart = getWeekStart(todayDate);
                const phoneSales = [...(allSales)].filter(s => {
                  if (!s.dateString || isInternal(s.name ?? '') || s.cat !== selectedCat) return false;
                  const sDate = parseDate(s.dateString);
                  switch (phoneFilter) {
                    case 'today': return s.dateString === today;
                    case 'week':  return sDate >= weekStart && sDate <= todayDate;
                    case 'month': return normalizeMonthKey(s.monthKey ?? '') === monthKey;
                    case 'year':  return s.yearKey === yr || s.dateString?.endsWith(`/${yr}`);
                  }
                }).reverse();

                const PHONE_TABS: { key: typeof phoneFilter; label: string }[] = [
                  { key: 'today', label: 'يوم' },
                  { key: 'week',  label: 'أسبوع' },
                  { key: 'month', label: 'شهر' },
                  { key: 'year',  label: 'سنة' },
                ];

                function PhoneSummary({ items }: { items: typeof phoneSales }) {
                  const stockCount    = Object.values(app.stock ?? {}).filter(i => i.cat === selectedCat && !i.pendingDeletion).reduce((sum, i) => sum + (i.qty || 0), 0);
                  const archiveCount  = (app.archiveSales ?? []).filter(a => a.cat === selectedCat).length;
                  const totalCount    = stockCount;
                  const allCatSales   = allSales.filter(s => s.cat === selectedCat && !isInternal(s.name ?? '') && (s.sell || 0) > 0);
                  const soldBuyCost   = allCatSales.reduce((sum, r) => sum + (r.buy || 0), 0);
                  const stockBuyCost  = Object.values(app.stock ?? {}).filter(i => i.cat === selectedCat && !i.pendingDeletion).reduce((sum, i) => sum + (i.buy || 0) * (i.qty || 0), 0);
                  const totalRev      = soldBuyCost + stockBuyCost;
                  const periodSold    = items.filter(r => (r.sell || 0) > 0);
                  const periodRev     = periodSold.reduce((sum, r) => sum + (r.sell || 0), 0);
                  const periodProfit  = items.reduce((sum, r) => sum + ((r.sell || 0) - (r.buy || 0)), 0);
                  const S = { card: { borderRadius: 13, padding: 10, alignItems: 'center' as const, flex: 1 } };
                  return (
                    <View style={{ gap: 8, marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={[S.card, { backgroundColor: '#f0fdf4' }]}>
                          <Text style={{ fontSize: 22, fontWeight: '900', color: '#16a34a' }}>{totalCount}</Text>
                          <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>عدد هواتف</Text>
                        </View>
                        <View style={[S.card, { backgroundColor: '#faf5ff' }]}>
                          <Text style={{ fontSize: 14, fontWeight: '900', color: '#7c3aed' }}>{formatMAD(totalRev)}</Text>
                          <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>إجمالي</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={[S.card, { backgroundColor: '#eff6ff' }]}>
                          <Text style={{ fontSize: 14, fontWeight: '900', color: '#2563eb' }}>{formatMAD(periodRev)}</Text>
                          <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>مبيعات</Text>
                        </View>
                        <View style={[S.card, { backgroundColor: periodProfit >= 0 ? '#f0fdf4' : '#fef2f2' }]}>
                          <Text style={{ fontSize: 14, fontWeight: '900', color: periodProfit >= 0 ? '#16a34a' : '#ef4444' }}>{formatMAD(periodProfit)}</Text>
                          <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>ربح</Text>
                        </View>
                      </View>
                    </View>
                  );
                }

                // Period label shown under tabs
                const weekStartStr = `${String(weekStart.getDate()).padStart(2,'0')}/${String(weekStart.getMonth()+1).padStart(2,'0')}`;
                const weekEndStr   = `${String(todayDate.getDate()).padStart(2,'0')}/${String(todayDate.getMonth()+1).padStart(2,'0')}`;
                const [mkYear, mkMonth] = monthKey.split('-');
                const monthLabel = `${String(mkMonth).padStart(2,'0')}/${mkYear}`;
                const periodLabel = phoneFilter === 'today' ? today
                  : phoneFilter === 'week'  ? `${weekStartStr} ← ${weekEndStr}`
                  : phoneFilter === 'month' ? monthLabel
                  : `01/${yr} ← ${monthLabel}`;

                // Sub-filter tabs row
                const PhoneFilterTabs = (
                  <View style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                      {PHONE_TABS.map(t => (
                        <TouchableOpacity
                          key={t.key}
                          onPress={() => { setPhoneFilter(t.key); setPhoneDrill(null); }}
                          style={{ flex: 1, paddingVertical: 7, borderRadius: 10,
                            backgroundColor: phoneFilter === t.key ? titleColor : '#f1f5f9',
                            alignItems: 'center' }}
                          activeOpacity={0.75}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '800',
                            color: phoneFilter === t.key ? '#fff' : '#64748b' }}>{t.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: '600' }}>
                      📅 {periodLabel}
                    </Text>
                  </View>
                );

                const usePhoneGroups = phoneFilter === 'year' || phoneFilter === 'month';
                const phoneGroupKey = phoneFilter === 'year' ? 'monthKey' : 'dateString';

                // Drill-down
                if (usePhoneGroups && phoneDrill) {
                  const drillSales = phoneSales.filter(s => (s[phoneGroupKey as keyof typeof s] as string) === phoneDrill);
                  return (
                    <View style={cardStyle}>
                      <TouchableOpacity onPress={() => setPhoneDrill(null)} style={s.archiveBackBtn}>
                        <Text style={s.archiveBackTxt}>← العودة</Text>
                      </TouchableOpacity>
                      <Text style={[s.cardTitle, { color: titleColor }]}>📋 {selectedCat} — {phoneDrill}</Text>
                      {PhoneFilterTabs}
                      <PhoneSummary items={drillSales} />
                      {drillSales.length === 0
                        ? <Text style={s.emptyTxt}>لا توجد عمليات</Text>
                        : drillSales.map(sale => renderPhoneRow(sale))
                      }
                    </View>
                  );
                }

                // Grouped view (month→days, year→months)
                if (usePhoneGroups) {
                  const groups: Record<string, typeof phoneSales> = {};
                  for (const sale of phoneSales) {
                    const key = (sale[phoneGroupKey as keyof typeof sale] as string) ?? '';
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(sale);
                  }
                  const sorted = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
                  return (
                    <View style={cardStyle}>
                      <Text style={[s.cardTitle, { color: titleColor }]}>📋 {selectedCat}</Text>
                      {PhoneFilterTabs}
                      <PhoneSummary items={phoneSales} />
                      {sorted.length === 0
                        ? <Text style={s.emptyTxt}>لا توجد عمليات في هذه الفترة</Text>
                        : sorted.map(([key, items]) => {
                            const soldItems = items.filter(r => (r.sell || 0) > 0);
                            const rev  = soldItems.reduce((sum, r) => sum + (r.sell || 0), 0);
                            const prof = items.reduce((sum, r) => sum + ((r.sell || 0) - (r.buy || 0)), 0);
                            return (
                              <TouchableOpacity key={key} style={s.archiveRow} onPress={() => setPhoneDrill(key)} activeOpacity={0.75}>
                                <View style={{ flex: 1 }}>
                                  <Text style={s.archiveMonth}>{key}</Text>
                                  <Text style={s.archiveCount}>{soldItems.length} هاتف</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                  <Text style={s.archiveRevenue}>{formatMAD(rev)}</Text>
                                  <Text style={[s.archiveProfit, { color: prof >= 0 ? '#10b981' : '#ef4444' }]}>
                                    {prof >= 0 ? '+' : ''}{formatMAD(prof)}
                                  </Text>
                                </View>
                                <Text style={s.archiveChev}>←</Text>
                              </TouchableOpacity>
                            );
                          })
                      }
                    </View>
                  );
                }

                // Flat list (today/week)
                return (
                  <View style={cardStyle}>
                    <Text style={[s.cardTitle, { color: titleColor }]}>📋 {selectedCat}</Text>
                    {PhoneFilterTabs}
                    <PhoneSummary items={phoneSales} />
                    {phoneSales.length === 0
                      ? <Text style={s.emptyTxt}>لا توجد عمليات في هذه الفترة</Text>
                      : phoneSales.map(sale => renderPhoneRow(sale))
                    }
                  </View>
                );
              }

              // ── ACCESSORIES: own filter + summary ──
              const isAcc = !!folders.find(f => f.name === selectedCat && f.colorClass === 'folder-acc');
              if (isAcc) {
                const todayDate2 = parseDate(today);
                const weekStart2 = getWeekStart(todayDate2);
                const accSales = [...allSales].filter(s => {
                  if (!s.dateString || isInternal(s.name ?? '') || s.cat !== selectedCat) return false;
                  const sDate = parseDate(s.dateString);
                  switch (accFilter) {
                    case 'today': return s.dateString === today;
                    case 'week':  return sDate >= weekStart2 && sDate <= todayDate2;
                    case 'month': return normalizeMonthKey(s.monthKey ?? '') === monthKey;
                    case 'year':  return s.yearKey === yr || s.dateString?.endsWith(`/${yr}`);
                  }
                }).reverse();

                const ACC_TABS: { key: typeof accFilter; label: string }[] = [
                  { key: 'today', label: 'يوم' },
                  { key: 'week',  label: 'أسبوع' },
                  { key: 'month', label: 'شهر' },
                  { key: 'year',  label: 'سنة' },
                ];

                const weekStartStr2 = `${String(weekStart2.getDate()).padStart(2,'0')}/${String(weekStart2.getMonth()+1).padStart(2,'0')}`;
                const weekEndStr2   = `${String(todayDate2.getDate()).padStart(2,'0')}/${String(todayDate2.getMonth()+1).padStart(2,'0')}`;
                const [mkY2, mkM2]  = monthKey.split('-');
                const monthLabel2   = `${String(mkM2).padStart(2,'0')}/${mkY2}`;
                const accPeriodLabel = accFilter === 'today' ? today
                  : accFilter === 'week'  ? `${weekStartStr2} ← ${weekEndStr2}`
                  : accFilter === 'month' ? monthLabel2
                  : `01/${yr} ← ${monthLabel2}`;

                const AccFilterTabs = (
                  <View style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                      {ACC_TABS.map(t => (
                        <TouchableOpacity key={t.key}
                          onPress={() => { setAccFilter(t.key); setAccDrill(null); }}
                          style={{ flex: 1, paddingVertical: 7, borderRadius: 10,
                            backgroundColor: accFilter === t.key ? titleColor : '#f1f5f9',
                            alignItems: 'center' }}
                          activeOpacity={0.75}>
                          <Text style={{ fontSize: 12, fontWeight: '800',
                            color: accFilter === t.key ? '#fff' : '#64748b' }}>{t.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: '600' }}>📅 {accPeriodLabel}</Text>
                  </View>
                );

                const accRev      = accSales.filter(r => (r.sell||0) > 0).reduce((sum,r) => sum + (r.sell||0), 0);
                const accProf     = accSales.reduce((sum,r) => sum + ((r.sell||0)-(r.buy||0)), 0);
                const allAccSales = allSales.filter(s => s.cat === selectedCat && !isInternal(s.name ?? '') && (s.sell||0) > 0);
                const accSoldBuy  = allAccSales.reduce((sum,r) => sum + (r.buy||0), 0);
                const accStockBuy = Object.values(app.stock ?? {}).filter(i => i.cat === selectedCat && !i.pendingDeletion).reduce((sum,i) => sum + (i.buy||0)*(i.qty||0), 0);
                const accTotalBuy = accSoldBuy + accStockBuy;
                const AccSummary = (
                  <View style={{ gap: 8, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1, backgroundColor: '#faf5ff', borderRadius: 12, padding: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: '#7c3aed' }}>{formatMAD(accTotalBuy)}</Text>
                        <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>إجمالي</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: '#eff6ff', borderRadius: 12, padding: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: '#2563eb' }}>{formatMAD(accRev)}</Text>
                        <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>مبيعات</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: accProf >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 12, padding: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: accProf >= 0 ? '#16a34a' : '#ef4444' }}>{formatMAD(accProf)}</Text>
                        <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>ربح</Text>
                      </View>
                    </View>
                  </View>
                );

                const useAccGroups = accFilter === 'year' || accFilter === 'month';
                const accGroupKey  = accFilter === 'year' ? 'monthKey' : 'dateString';

                if (useAccGroups && accDrill) {
                  const drillSales = accSales.filter(s => (s[accGroupKey as keyof typeof s] as string) === accDrill);
                  return (
                    <View style={cardStyle}>
                      <TouchableOpacity onPress={() => setAccDrill(null)} style={s.archiveBackBtn}>
                        <Text style={s.archiveBackTxt}>← العودة</Text>
                      </TouchableOpacity>
                      <Text style={[s.cardTitle, { color: titleColor }]}>📋 {selectedCat} — {accDrill}</Text>
                      {AccFilterTabs}{AccSummary}
                      {drillSales.length === 0
                        ? <Text style={s.emptyTxt}>لا توجد عمليات</Text>
                        : drillSales.map(sale => renderSaleRow(sale))
                      }
                    </View>
                  );
                }

                if (useAccGroups) {
                  const groups: Record<string, typeof accSales> = {};
                  for (const sale of accSales) {
                    const key = (sale[accGroupKey as keyof typeof sale] as string) ?? '';
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(sale);
                  }
                  const sorted = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
                  return (
                    <View style={cardStyle}>
                      <Text style={[s.cardTitle, { color: titleColor }]}>📋 {selectedCat}</Text>
                      {AccFilterTabs}{AccSummary}
                      {sorted.length === 0
                        ? <Text style={s.emptyTxt}>لا توجد عمليات في هذه الفترة</Text>
                        : sorted.map(([key, items]) => {
                            const rev  = items.reduce((sum, r) => sum + (r.sell || 0), 0);
                            const prof = items.reduce((sum, r) => sum + ((r.sell || 0) - (r.buy || 0)), 0);
                            return (
                              <TouchableOpacity key={key} style={s.archiveRow} onPress={() => setAccDrill(key)} activeOpacity={0.75}>
                                <View style={{ flex: 1 }}>
                                  <Text style={s.archiveMonth}>{key}</Text>
                                  <Text style={s.archiveCount}>{items.length} عملية</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                  <Text style={s.archiveRevenue}>{formatMAD(rev)}</Text>
                                  <Text style={[s.archiveProfit, { color: prof >= 0 ? '#10b981' : '#ef4444' }]}>
                                    {prof >= 0 ? '+' : ''}{formatMAD(prof)}
                                  </Text>
                                </View>
                                <Text style={s.archiveChev}>←</Text>
                              </TouchableOpacity>
                            );
                          })
                      }
                    </View>
                  );
                }

                return (
                  <View style={cardStyle}>
                    <Text style={[s.cardTitle, { color: titleColor }]}>📋 {selectedCat}</Text>
                    {AccFilterTabs}{AccSummary}
                    {accSales.length === 0
                      ? <Text style={s.emptyTxt}>لا توجد عمليات في هذه الفترة</Text>
                      : accSales.map(sale => renderSaleRow(sale))
                    }
                  </View>
                );
              }

              // ── OTHER NON-PHONE NON-ACC CATEGORIES: global filter ──
              const sales = catSales(selectedCat);
              const useGroups = filter === 'year' || filter === 'month';
              const groupKey = filter === 'year' ? 'monthKey' : 'dateString';

              if (useGroups && drillMonth) {
                const drillSales = sales.filter(s => s[groupKey as keyof typeof s] === drillMonth);
                return (
                  <View style={cardStyle}>
                    <TouchableOpacity onPress={() => { setDrillMonth(null); setExpandedSaleId(null); }} style={s.archiveBackBtn}>
                      <Text style={s.archiveBackTxt}>← العودة</Text>
                    </TouchableOpacity>
                    <Text style={[s.cardTitle, { color: titleColor }]}>📋 {selectedCat} — {drillMonth}</Text>
                    {drillSales.length === 0
                      ? <Text style={s.emptyTxt}>لا توجد عمليات</Text>
                      : drillSales.map(sale => renderSaleRow(sale))
                    }
                  </View>
                );
              }

              if (useGroups) {
                const groups: Record<string, typeof sales> = {};
                for (const sale of sales) {
                  const key = (sale[groupKey as keyof typeof sale] as string) ?? '';
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(sale);
                }
                const sorted = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
                return (
                  <View style={cardStyle}>
                    <Text style={[s.cardTitle, { color: titleColor }]}>📋 {selectedCat} ({sales.length} عملية)</Text>
                    {sorted.length === 0
                      ? <Text style={s.emptyTxt}>لا توجد عمليات في هذه الفترة</Text>
                      : sorted.map(([key, items]) => {
                          const rev  = items.reduce((sum, r) => sum + (r.sell || 0), 0);
                          const prof = items.reduce((sum, r) => sum + ((r.sell || 0) - (r.buy || 0)), 0);
                          return (
                            <TouchableOpacity key={key} style={s.archiveRow} onPress={() => { setDrillMonth(key); setExpandedSaleId(null); }} activeOpacity={0.75}>
                              <View style={{ flex: 1 }}>
                                <Text style={s.archiveMonth}>{key}</Text>
                                <Text style={s.archiveCount}>{items.length} عملية</Text>
                              </View>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={s.archiveRevenue}>{formatMAD(rev)}</Text>
                                <Text style={[s.archiveProfit, { color: prof >= 0 ? '#10b981' : '#ef4444' }]}>
                                  {prof >= 0 ? '+' : ''}{formatMAD(prof)}
                                </Text>
                              </View>
                              <Text style={s.archiveChev}>←</Text>
                            </TouchableOpacity>
                          );
                        })
                    }
                  </View>
                );
              }

              return (
                <View style={cardStyle}>
                  <Text style={[s.cardTitle, { color: titleColor }]}>📋 {selectedCat} ({sales.length} عملية)</Text>
                  {sales.length === 0
                    ? <Text style={s.emptyTxt}>لا توجد عمليات في هذه الفترة</Text>
                    : sales.map(sale => renderSaleRow(sale))
                  }
                </View>
              );
            })()}

            {selectedCat === '__credit__' && (
              <View style={[s.card, { backgroundColor: '#fffbeb', borderColor: '#d97706', borderWidth: 3 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                  <Text style={[s.cardTitle, { color: '#d97706', marginBottom: 0, flex: 1 }]}>📒 الكريدي</Text>
                  <TouchableOpacity
                    style={{ backgroundColor: '#d97706', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 }}
                    onPress={() => { setNewName(''); setNewPhone(''); setAddCustOpen(v => !v); }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>{addCustOpen ? '✕' : '+'}</Text>
                  </TouchableOpacity>
                </View>
                {addCustOpen && (
                  <View style={{ backgroundColor: '#fff8e1', borderRadius: 14, padding: 12, marginBottom: 12, gap: 8 }}>
                    <TextInput
                      style={s.addInp}
                      placeholder="اسم الزبون *"
                      placeholderTextColor="#9ca3af"
                      value={newName}
                      onChangeText={setNewName}
                      autoFocus
                    />
                    <TextInput
                      style={s.addInp}
                      placeholder="رقم الهاتف (اختياري)"
                      placeholderTextColor="#9ca3af"
                      value={newPhone}
                      onChangeText={setNewPhone}
                      keyboardType="phone-pad"
                    />
                    <TouchableOpacity
                      style={{ backgroundColor: '#d97706', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                      onPress={addCustomer}
                    >
                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>إضافة ←</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <View style={s.subRow}>
                  <Text style={s.subRowLabel}>إجمالي الديون القائمة</Text>
                  <Text style={[s.subRowVal, { color: '#d97706', fontSize: 22 }]}>{formatMAD(creditTotal)}</Text>
                </View>
                {Object.entries(app.credit ?? {})
                  .filter(([, c]) => !c.pendingDeletion)
                  .sort(([, a], [, b]) => (b.total || 0) - (a.total || 0))
                  .map(([id, c]) => (
                    <TouchableOpacity
                      key={id}
                      style={s.creditRow}
                      onPress={() => router.push(`/customer/${encodeURIComponent(id)}`)}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.creditName}>{c.name}</Text>
                        {c.phone ? <Text style={s.creditPhone}>{c.phone}</Text> : null}
                      </View>
                      <Text style={s.creditChev}>←</Text>
                      <Text style={[s.creditAmt, { color: (c.total || 0) > 0 ? '#ef4444' : '#10b981' }]}>
                        {formatMAD(c.total || 0)}
                      </Text>
                    </TouchableOpacity>
                  ))
                }
                {Object.values(app.credit ?? {}).filter(c => !c.pendingDeletion).length === 0 && (
                  <Text style={s.emptyTxt}>لا توجد ديون قائمة</Text>
                )}
              </View>
            )}

            {selectedCat === '__other__' && (() => {
              const sales = [...otherSales].reverse();
              const useGroups = filter === 'year' || filter === 'month';
              const groupKey = filter === 'year' ? 'monthKey' : 'dateString';
              const cardStyle = [s.card, { backgroundColor: '#fdf4ff', borderColor: '#a21caf', borderWidth: 3 }] as any;

              if (useGroups && drillMonth) {
                const drillSales = sales.filter(s => s[groupKey as keyof typeof s] === drillMonth);
                return (
                  <View style={cardStyle}>
                    <TouchableOpacity onPress={() => { setDrillMonth(null); setExpandedSaleId(null); }} style={s.archiveBackBtn}>
                      <Text style={s.archiveBackTxt}>← العودة</Text>
                    </TouchableOpacity>
                    <Text style={[s.cardTitle, { color: '#a21caf' }]}>🎧 أخرى — {drillMonth} ({drillSales.length} عملية)</Text>
                    {drillSales.length === 0 ? <Text style={s.emptyTxt}>لا توجد عمليات</Text> : drillSales.map(sale => renderSaleRow(sale))}
                  </View>
                );
              }

              if (useGroups) {
                const groups: Record<string, typeof sales> = {};
                for (const sale of sales) {
                  const key = (sale[groupKey as keyof typeof sale] as string) ?? '';
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(sale);
                }
                const sorted = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
                return (
                  <View style={cardStyle}>
                    <Text style={[s.cardTitle, { color: '#a21caf' }]}>🎧 أخرى ({sales.length} عملية)</Text>
                    {sorted.length === 0 ? <Text style={s.emptyTxt}>لا توجد عمليات في هذه الفترة</Text>
                      : sorted.map(([key, items]) => {
                          const rev  = items.reduce((sum, r) => sum + (r.sell || 0), 0);
                          const prof = items.reduce((sum, r) => sum + ((r.sell || 0) - (r.buy || 0)), 0);
                          return (
                            <TouchableOpacity key={key} style={s.archiveRow} onPress={() => { setDrillMonth(key); setExpandedSaleId(null); }} activeOpacity={0.75}>
                              <View style={{ flex: 1 }}>
                                <Text style={s.archiveMonth}>{key}</Text>
                                <Text style={s.archiveCount}>{items.length} عملية</Text>
                              </View>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={s.archiveRevenue}>{formatMAD(rev)}</Text>
                                <Text style={[s.archiveProfit, { color: prof >= 0 ? '#10b981' : '#ef4444' }]}>{prof >= 0 ? '+' : ''}{formatMAD(prof)}</Text>
                              </View>
                              <Text style={s.archiveChev}>←</Text>
                            </TouchableOpacity>
                          );
                        })
                    }
                  </View>
                );
              }

              return (
                <View style={cardStyle}>
                  <Text style={[s.cardTitle, { color: '#a21caf' }]}>🎧 أخرى ({sales.length} عملية)</Text>
                  {sales.length === 0 ? <Text style={s.emptyTxt}>لا توجد عمليات في هذه الفترة</Text> : sales.map(sale => renderSaleRow(sale))}
                </View>
              );
            })()}

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
                    <Text style={s.topSupName}>● أكثر مورد — {topSupplier[1].name ?? topSupplier[0]}</Text>
                    <Text style={[s.topSupDebt, { color: '#ef4444' }]}>{formatMAD(topSupplier[1].total ?? 0)}</Text>
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

        {/* ── رأس مال الاكسسوار ── */}
        {filter !== 'archive' && (
          <View style={[s.card, { borderWidth: 2, borderColor: '#e879f9', backgroundColor: '#fdf4ff' }]}>
            <Text style={[s.cardTitle, { color: '#a21caf' }]}>🎧 رأس مال الاكسسوار والأخرى</Text>
            <View style={s.supGrid}>
              <View style={[s.supCard, { borderTopColor: '#a21caf' }]}>
                <Text style={[s.supLabel, { textAlign: 'left' }]}>عدد المنتجات</Text>
                <Text style={[s.supVal, { color: '#a21caf', textAlign: 'left' }]}>{otherItemCount}</Text>
              </View>
              <View style={[s.supCard, { borderTopColor: '#7c3aed' }]}>
                <Text style={[s.supLabel, { textAlign: 'left' }]}>إجمالي الكمية</Text>
                <Text style={[s.supVal, { color: '#7c3aed', textAlign: 'left' }]}>{otherTotalQty} قطعة</Text>
              </View>
            </View>
            <View style={s.supGrid}>
              <View style={[s.supCard, { borderTopColor: '#0284c7' }]}>
                <Text style={[s.supLabel, { textAlign: 'left' }]}>رأس المال 🏷️</Text>
                <Text style={[s.supVal, { color: '#0284c7', textAlign: 'left' }]}>{formatMAD(otherCapital)}</Text>
              </View>
              <View style={[s.supCard, { borderTopColor: '#10b981' }]}>
                <Text style={[s.supLabel, { textAlign: 'left' }]}>قيمة البيع 💰</Text>
                <Text style={[s.supVal, { color: '#10b981', textAlign: 'left' }]}>{formatMAD(otherSellValue)}</Text>
              </View>
            </View>
            <View style={[s.supCard, { borderTopColor: otherSellValue - otherCapital >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }]}>
              <Text style={[s.supLabel, { textAlign: 'left' }]}>هامش الربح المتوقع</Text>
              <Text style={[s.supVal, { color: otherSellValue - otherCapital >= 0 ? '#10b981' : '#ef4444', textAlign: 'left' }]}>
                {formatMAD(otherSellValue - otherCapital)}
              </Text>
            </View>
          </View>
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
  root: { flex: 1, backgroundColor: 'transparent' },

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
    borderRadius: 10,
    padding: 6,
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  statLabel: { fontSize: 10, color: '#64748b', fontWeight: '700', textAlign: 'center', marginBottom: 3, lineHeight: 13 },
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
  subCardInner: { width: '100%' },
  subCardActive: {
    backgroundColor: '#fffbeb',
    borderColor: '#d97706',
  },
  subCatName: { fontSize: 11, fontWeight: '800', marginBottom: 6, lineHeight: 16, textAlign: 'left' },
  subStatLine: { fontSize: 11, color: '#64748b', fontWeight: '600', marginBottom: 2, textAlign: 'left' },
  subStatVal:  { fontSize: 12, fontWeight: '900' },
  subStatNum:  { fontWeight: '800', color: '#1e293b' },
  subRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  subRowLabel: { fontSize: 11, color: '#64748b', fontWeight: '700' },
  subRowVal:   { fontSize: 13, fontWeight: '800', color: '#1e293b' },

  addInp: {
    borderWidth: 1.5, borderColor: '#fde68a', borderRadius: 12,
    padding: 12, fontSize: 14, color: '#1e293b',
    backgroundColor: '#fff', fontWeight: '600', textAlign: 'right',
  },
  creditRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 4,
    borderTopWidth: 1, borderTopColor: '#fde68a',
    gap: 8,
  },
  creditName:  { fontSize: 14, fontWeight: '800', color: '#1e293b', textAlign: 'left' },
  creditPhone: { fontSize: 11, color: '#94a3b8', fontWeight: '600', textAlign: 'left', marginTop: 2 },
  creditAmt:   { fontSize: 15, fontWeight: '900' },
  creditChev:  { fontSize: 16, color: '#d97706' },

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
  cardTitle: { fontSize: 15, fontWeight: '900', color: '#1e293b', textAlign: 'left', marginBottom: 14 },
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
  opName:   { fontSize: 14, fontWeight: '700', color: '#1e293b', textAlign: 'left' },
  opMeta:   { fontSize: 11, color: '#94a3b8', fontWeight: '600', textAlign: 'left', marginTop: 2 },
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
  archiveMonth:   { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  archiveCount:   { fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 },
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
  supLabel: { fontSize: 11, color: '#64748b', fontWeight: '700', textAlign: 'left', marginBottom: 6 },
  supVal:   { fontSize: 15, fontWeight: '900', textAlign: 'left' },
  supSub:   { fontSize: 10, color: '#64748b', fontWeight: '600', marginTop: 2, textAlign: 'left' },

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
