import { useAppStore } from '../store/appStore';

export function useAuthBg(): string {
  const auth = useAppStore((s) => s.auth);
  const liveColor = useAppStore((s) => auth?.phone ? s.app.users[auth.phone]?.color : undefined);
  const color = liveColor || auth?.color;
  return color ? color + '18' : '#f8fafc';
}
