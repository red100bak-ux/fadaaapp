import { ActivityLog, ActivityType } from '../types';
import { useAppStore } from '../store/appStore';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function logActivity(
  type: ActivityType,
  msg: string,
  by: string,
  amount?: number
): void {
  // fallback to phone if name is empty
  const { auth: currentAuth } = useAppStore.getState();
  const resolvedBy = by || currentAuth?.name || currentAuth?.phone || '';
  const entry: ActivityLog = {
    id: generateId(),
    type,
    msg,
    amount,
    ts: new Date().toISOString(),
    by: resolvedBy,
    read: false,
  };

  const { updateApp } = useAppStore.getState();
  updateApp((prev) => {
    const existing = prev.activityLog ?? [];
    return { ...prev, activityLog: [entry, ...existing].slice(0, 200) };
  });
}

export function markOneRead(id: string): void {
  const { updateApp } = useAppStore.getState();
  updateApp((prev) => ({
    ...prev,
    activityLog: (prev.activityLog ?? []).map((l) => l.id === id ? { ...l, read: true } : l),
  }));
}

export function markAllRead(): void {
  const { updateApp } = useAppStore.getState();
  updateApp((prev) => ({
    ...prev,
    activityLog: (prev.activityLog ?? []).map((l) => ({ ...l, read: true })),
  }));
}

export function getActivityColor(type: ActivityType): string {
  switch (type) {
    case 'sell':        return '#10b981'; // green
    case 'return':      return '#f97316'; // orange
    case 'add_stock':   return '#3b82f6'; // blue
    case 'credit_add':  return '#f59e0b'; // yellow
    case 'credit_pay':  return '#10b981'; // green
    case 'delete_req':  return '#dc2626'; // red
    case 'expense':     return '#dc2626'; // red
    case 'salary':      return '#7c3aed'; // purple
    case 'supplier_add':return '#f59e0b'; // yellow
    case 'supplier_pay':return '#10b981'; // green
    default:            return '#6b7280'; // gray
  }
}

export function getActivityIcon(type: ActivityType): string {
  switch (type) {
    case 'sell':        return '💰';
    case 'return':      return '🔄';
    case 'add_stock':   return '📦';
    case 'credit_add':  return '💳';
    case 'credit_pay':  return '💵';
    case 'delete_req':  return '🗑️';
    case 'expense':     return '💸';
    case 'salary':      return '👷';
    case 'supplier_add':return '🏪';
    case 'supplier_pay':return '✅';
    default:            return '📝';
  }
}

export function getActivityName(type: ActivityType): string {
  switch (type) {
    case 'sell':        return 'بيع';
    case 'add_stock':   return 'ستوك';
    case 'credit_add':  return 'كريدي';
    case 'credit_pay':  return 'تسديد';
    case 'delete_req':  return 'حذف';
    case 'expense':     return 'مصروف';
    case 'salary':      return 'راتب';
    case 'supplier_add':return 'مورد';
    case 'supplier_pay':return 'دفع';
    default:            return 'عملية';
  }
}
