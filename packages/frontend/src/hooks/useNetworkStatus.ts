import { useNetworkStore } from '../store/networkStore';

export const useNetworkStatus = () => {
  const isOnline = useNetworkStore((s) => s.isOnline);
  return { isOnline };
};

/** True when the app is running as an installed PWA (standalone window). */
export const useIsStandalone = (): boolean => {
  if (typeof window === 'undefined' || typeof matchMedia === 'undefined') return false;
  return matchMedia('(display-mode: standalone)').matches;
};