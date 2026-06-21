import { useAppStore } from '../store/appStore';

export function usePermissions() {
  const auth = useAppStore((s) => s.auth);
  const users = useAppStore((s) => s.app.users);
  const role = auth?.role ?? 'view';

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
  const isView  = role === 'view';

  return {
    role,
    isPransibal,
    isSuper,
    isAdmin,
    isStaff,
    isView,

    // ───── الستوك ─────
    canSell:          !isView,
    canReturn:        !isView,
    canAddProduct:    isAdmin,
    canEditProduct:   isAdmin || canEditStock,
    canDeleteDirect:  false,
    canRequestDelete: isAdmin,
    canApproveDelete: isPransibal,

    // ───── الكريدي ─────
    canAddCustomer:   isAdmin,
    canEditCustomer:  isSuper || canEditCredit,
    canDeleteCustomer: isPransibal,
    canRecordZaad:    !isView,
    canRecordPayment: isAdmin,    // نقود: admin+ فقط

    // ───── الموردين ─────
    canViewSuppliers:       isPransibal || canViewSuppliersPerm,
    canAddSupplier:         isPransibal,
    canEditSupplier:        isPransibal || canEditSuppliers,
    canDeleteSupplier:      isPransibal,
    canSupplierTransaction: isPransibal || canViewSuppliersPerm,
    canManageChecks:        isPransibal || canViewSuppliersPerm,

    // ───── الإصلاح ─────
    canRegisterRepair: !isView,
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
