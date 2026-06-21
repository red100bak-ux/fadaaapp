import { useAppStore } from '../store/appStore';

export function usePermissions() {
  const auth = useAppStore((s) => s.auth);
  const users = useAppStore((s) => s.app.users);
  const role = auth?.role ?? 'staff';

  const isPransibal      = !!(auth?.phone && users[auth.phone]?.isSuperAdmin);
  const canEditStock      = !!(auth?.phone && users[auth.phone]?.permissions?.canEditStock);
  const canEditCredit     = !!(auth?.phone && users[auth.phone]?.permissions?.canEditCredit);
  const canEditSuppliers  = !!(auth?.phone && users[auth.phone]?.permissions?.canEditSuppliers);
  const canEditRepair     = !!(auth?.phone && users[auth.phone]?.permissions?.canEditRepair);
  const canViewStaffPerm      = !!(auth?.phone && users[auth.phone]?.permissions?.canViewStaff);
  const canViewSuppliersPerm  = !!(auth?.phone && users[auth.phone]?.permissions?.canViewSuppliers);

  const isSuper = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuper;
  const isStaff = role === 'staff';

  return {
    role,
    isPransibal,
    isSuper,
    isAdmin,
    isStaff,
    isView: false,

    // ───── الستوك ─────
    canSell:          true,
    canReturn:        true,
    canAddProduct:    isAdmin,
    canEditProduct:   isAdmin || canEditStock,
    canDeleteDirect:  false,
    canRequestDelete: isAdmin,
    canApproveDelete: isPransibal,

    // ───── الكريدي ─────
    canAddCustomer:   isAdmin,
    canEditCustomer:  isSuper || canEditCredit,
    canDeleteCustomer: isPransibal,
    canRecordZaad:    true,
    canRecordPayment: isAdmin,

    // ───── الموردين ─────
    canViewSuppliers:       isPransibal || canViewSuppliersPerm,
    canAddSupplier:         isPransibal,
    canEditSupplier:        isPransibal || canEditSuppliers,
    canDeleteSupplier:      isPransibal,
    canSupplierTransaction: isPransibal || canViewSuppliersPerm,
    canManageChecks:        isPransibal || canViewSuppliersPerm,

    // ───── الإصلاح ─────
    canRegisterRepair: true,
    canEditRepair:     isAdmin || canEditRepair,
    canCancelRepair:   isPransibal,

    // ───── الحصيلة ─────
    canViewReport:  isAdmin,
    canResetReport: isPransibal,

    // ───── الخدام والمصاريف ─────
    canViewStaff:       isPransibal || canViewStaffPerm,
    canManageEmployees: isPransibal,
    canAddExpense:      isSuper,
    canAddIncome:       isPransibal,

    // ───── الإدارة ─────
    canViewAdmin:     isAdmin,
    canManageUsers:   isPransibal,
    canManageBackup:  isPransibal,
    canResetPin:      isPransibal,
  };
}
