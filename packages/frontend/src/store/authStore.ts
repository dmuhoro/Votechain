import { create } from 'zustand';
import { getSupabase } from '../lib/supabase';
import { safeStorage, AUTH_TOKEN_KEY } from '../lib/storage';
import { Voter } from '../types';

interface AuthStore {
  user: Voter | null;
  token: string | null;
  isLoading: boolean;
  setUser: (user: Voter | null) => void;
  setToken: (token: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  logout: () => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setToken: (token) => {
    if (token) {
      safeStorage.setString(AUTH_TOKEN_KEY, token);
    } else {
      safeStorage.remove(AUTH_TOKEN_KEY);
    }
    set({ token });
  },
  setIsLoading: (loading) => set({ isLoading: loading }),
  logout: () => {
    safeStorage.remove(AUTH_TOKEN_KEY);
    set({ user: null, token: null });
  },
  initialize: async () => {
    // Restore whatever we already know from storage first so the UI has a
    // session-consistent view even if Supabase is unreachable (offline boot).
    const storedToken = safeStorage.getString(AUTH_TOKEN_KEY);
    if (storedToken) {
      set({ token: storedToken });
    }

    try {
      const { data, error } = await getSupabase().auth.getSession();
      if (error) throw error;
      const session = data.session;

      if (!session) {
        safeStorage.remove(AUTH_TOKEN_KEY);
        set({ user: null, token: null });
        return;
      }

      safeStorage.setString(AUTH_TOKEN_KEY, session.access_token);
      set({
        token: session.access_token,
        user: {
          id: session.user.id,
          email: session.user.email || '',
          is_verified: false,
          is_admin: false,
          needsRegistration: true,
        },
      });
    } catch {
      // Offline / Supabase unreachable: keep the stored session state and the
      // app bootable. The user can browse cached data; auth actions (OTP) will
      // surface a clear reconnect error when the network returns.
      set({ token: storedToken ?? null });
    } finally {
      set({ isLoading: false });
    }
  },
}));