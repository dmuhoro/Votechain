import { create } from 'zustand';
import { Voter } from '../types';

interface AuthStore {
  user: Voter | null;
  token: string | null;
  isLoading: boolean;
  setUser: (user: Voter | null) => void;
  setToken: (token: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  logout: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setToken: (token) => {
    if (token) {
      localStorage.setItem('authToken', token);
    } else {
      localStorage.removeItem('authToken');
    }
    set({ token });
  },
  setIsLoading: (loading) => set({ isLoading: loading }),
  logout: () => {
    localStorage.removeItem('authToken');
    set({ user: null, token: null });
  },
  initialize: () => {
    const token = localStorage.getItem('authToken');
    if (token) {
      set({ token });
    }
    set({ isLoading: false });
  },
}));
