export const Colors = {
  primary: '#5c67f2',
  success: '#10b981',
  danger: '#ef4444',
  background: '#f8fafc',
  card: '#ffffff',
  text: '#1e293b',
  textMuted: '#64748b',
  border: '#e2e8f0',
  inputBg: '#f8fafc',

  primaryLight: '#eef2ff',
  successLight: '#ecfdf5',
  dangerLight: '#fee2e2',
  warningLight: '#fffbeb',
  infoLight: '#eff6ff',
} as const;

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;
