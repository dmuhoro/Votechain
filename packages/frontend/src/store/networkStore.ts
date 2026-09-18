import { create } from 'zustand';

interface NetworkStore {
  isOnline: boolean;
  listening: boolean;
  init: () => void;
}

const isSupported = () => typeof window !== 'undefined' && typeof navigator !== 'undefined';

const computeOnline = (): boolean => {
  if (!isSupported()) return true;
  return navigator.onLine ?? true;
};

export const useNetworkStore = create<NetworkStore>((set, get) => ({
  isOnline: true,
  listening: false,
  init: () => {
    if (!isSupported() || get().listening) return;
    const sync = () => set({ isOnline: computeOnline() });
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();
    set({ listening: true });
  },
}));