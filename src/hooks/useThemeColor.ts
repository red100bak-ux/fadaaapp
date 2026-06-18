import { useAppStore } from '../store/appStore';
import { Colors } from '../theme/colors';

export const THEME_COLORS = [
  { hex: '#5c67f2', label: 'بنفسجي' },
  { hex: '#10b981', label: 'أخضر'   },
  { hex: '#ef4444', label: 'أحمر'   },
  { hex: '#2563eb', label: 'أزرق'   },
  { hex: '#db2777', label: 'وردي'   },
  { hex: '#0891b2', label: 'سماوي'  },
  { hex: '#7c3aed', label: 'موف'    },
  { hex: '#d97706', label: 'ذهبي'   },
  { hex: '#eab308', label: 'أصفر'   },
  { hex: '#1e293b', label: 'أسود'   },
  { hex: '#64748b', label: 'رمادي'  },
];

export function useThemeColor(): string {
  const auth = useAppStore((s) => s.auth);
  return auth?.color || Colors.primary;
}
