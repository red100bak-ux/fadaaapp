export type UserRole = 'super_admin' | 'admin' | 'staff';

export interface UserPermissions {
  canEditStock?:      boolean;
  canEditCredit?:     boolean;
  canEditSuppliers?:  boolean;
  canEditRepair?:     boolean;
  canViewStaff?:      boolean;
  canViewSuppliers?:  boolean;
}

export interface AppUser {
  name: string;
  role: UserRole;
  pin: string;
  isSuperAdmin?: boolean;
  color?: string;
  permissions?: UserPermissions;
  online?: boolean;
  lastSeen?: string;
  allowedAdminButtons?: string[];
}

export interface LinkedBarcode {
  bc: string;
  qty: number;
}

export interface StockItem {
  name: string;
  cat: string;
  buy: number;
  sell: number;
  qty: number;
  supplier?: string;
  addedBy?: string;
  editedBy?: string;
  img?: string;
  pendingDeletion?: boolean;
  deletionRequestedBy?: string;
  soldAt?: string;
  soldBy?: string;
  linkedBarcodes?: LinkedBarcode[];
  createdAt?: number;
}

export interface CreditLog {
  t: string;
  v: number;
  d: string;
  seller?: string;
}

export interface CreditCustomer {
  name: string;
  phone?: string;
  total: number;
  logs: CreditLog[];
  pendingDeletion?: boolean;
  deletionRequestedBy?: string;
}

export interface SaleRecord {
  nid: string;
  name: string;
  sell: number;
  buy: number;
  cat: string;
  time: string;
  dateString: string;
  monthKey: string;
  yearKey: string;
  seller: string;
  addedBy?: string;
  editedBy?: string;
  returnReason?: string;
  deliveredAt?: string;
  deliveredTo?: string;
  deliveredBy?: string;
}

export interface SupplierTransaction {
  type: 'add' | 'sub';
  amount: number;
  note: string;
  date: string;
  time: string;
  by: string;
}

export interface SupplierCheck {
  type: 'chik' | 'kombiala';
  name?: string;
  number: string;
  date?: string;
  due: string;
  amount: number;
  cashed?: boolean;
}

export interface SupplierCredit {
  total: number;
  history: SupplierTransaction[];
  checks?: SupplierCheck[];
  name?: string;
  phone?: string;
  notes?: string;
  logs?: CreditLog[];
  pendingDeletion?: boolean;
  deletionRequestedBy?: string;
}

export interface Employee {
  name: string;
  salary: number;
  payday?: number;
  pendingDeletion?: boolean;
  deletionRequestedBy?: string;
}

export interface ExpenseItem {
  id: string;
  type: string;
  name?: string;
  amount: number;
  note: string;
  date: string;
  time: string;
  by: string;
}

export interface Folder {
  id: string;
  name: string;
  icon: string;
  active: boolean;
  special?: string;
  colorClass?: string;
}

export type ActivityType = 'sell' | 'return' | 'add_stock' | 'credit_add' | 'credit_pay' | 'delete_req' | 'expense' | 'salary' | 'supplier_add' | 'supplier_pay' | 'other';

export interface ActivityLog {
  id: string;
  type: ActivityType;
  msg: string;
  amount?: number;
  ts: string;
  by: string;
  read: boolean;
}

export interface Reminder {
  id: string;
  title: string;
  datetime: string;
  done: boolean;
  notifId?: string;
  read?: boolean;
  note?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface ArchiveSale {
  id: string;
  bc: string;
  name: string;
  sell: number;
  buy: number;
  soldAt: string;
  soldBy?: string;
  cat: string;
  qtyBefore: number;
}

export interface PrivateExpense {
  id: string;
  amount: number;
  note: string;
  cat?: string;
  date: string;
}

export interface Secret {
  id: string;
  label: string;
  value: string;
  note?: string;
  createdAt: string;
}

export type AdminButtonType =
  | 'add_stock' | 'staff' | 'report' | 'suppliers'
  | 'cloud' | 'pending' | 'users' | 'scan_info'
  | 'calc' | 'reminder' | 'note';

export interface AppData {
  stock: Record<string, StockItem>;
  credit: Record<string, CreditCustomer>;
  supplierCredit: Record<string, SupplierCredit>;
  todaySales: SaleRecord[];
  suppliers: string[];
  users: Record<string, AppUser>;
  resetPin: string;
  partsList: Array<{ id: string; name: string }>;
  employees: Record<string, Employee>;
  monthlyExpenses: Record<string, Record<string, ExpenseItem[]>>;
  monthlyIncome: Record<string, Record<string, number>>;
  folders: Folder[];
  checks?: SupplierCheck[];
  staffMonths?: string[];
  cloudBackups?: Array<{ ts: string; label: string }>;
  activityLog?: ActivityLog[];
  adminButtons?: AdminButtonType[];
  reminders?: Reminder[];
  notes?: Note[];
  privateExpenses?: PrivateExpense[];
  secrets?: Secret[];
  archiveSales?: ArchiveSale[];
  salesMonths?: string[]; // index of months that have data in monthly docs
}

// Stored in v97_s_YYYYMM monthly documents
export interface MonthlyDoc {
  sales: SaleRecord[];
  archive: ArchiveSale[];
  log: ActivityLog[];
}

export interface AuthState {
  phone: string;
  name: string;
  role: UserRole;
  color: string;
}
