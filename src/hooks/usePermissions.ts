import { useAppStore } from '../store/appStore';

export function usePermissions() {
  const auth = useAppStore((s) => s.auth);
  const role = auth?.role ?? 'view';

  const isSuper = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuper;
  const isStaff = role === 'staff';
  const isView  = role === 'view';

  return {
    role,
    isSuper,
    isAdmin,
    isStaff,
    isView,

    // ───── الستوك ─────
    canSell:          !isView,          // كل الأدوار ما عدا view
    canAddProduct:    isAdmin,          // admin+
    canEditProduct:   isAdmin,          // admin+
    canDeleteDirect:  isAdmin,          // admin+ يحذف مباشرة
    canRequestDelete: isStaff,          // staff يرسل طلب حذف
    canApproveDelete: isAdmin,          // admin+ يوافق/يرفض طلبات الحذف

    // ───── الكريدي ─────
    canAddCustomer:   isAdmin,
    canEditCustomer:  isSuper,
    canDeleteCustomer: isAdmin,
    canRecordZaad:    !isView,          // staff + admin+ يزيدو كريدي
    canRecordPayment: isAdmin,          // admin+ فقط يسجل التسديد

    // ───── الموردين ─────
    canViewSuppliers: isAdmin,
    canAddSupplier:   isSuper,
    canEditSupplier:  isSuper,
    canDeleteSupplier: isSuper,
    canSupplierTransaction: isAdmin,    // شراء أو تسديد
    canManageChecks:  isAdmin,

    // ───── الإصلاح ─────
    canRegisterRepair: !isView,
    canEditRepair:    isAdmin,
    canCancelRepair:  isSuper,

    // ───── الحصيلة ─────
    canViewReport:    isAdmin,
    canResetReport:   isSuper,

    // ───── الخدام والمصاريف ─────
    canViewStaff:     isAdmin,
    canManageEmployees: isSuper,
    canAddExpense:    isAdmin,
    canAddIncome:     isSuper,

    // ───── الإدارة ─────
    canViewAdmin:     isAdmin,
    canManageUsers:   isSuper,
    canManageBackup:  isSuper,
    canResetPin:      isSuper,
  };
}
