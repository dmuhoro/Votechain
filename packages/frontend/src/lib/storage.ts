/**
 * Safe localStorage access. Some Android WebViews / private modes throw
 * SecurityError on access; a throw here previously took down the whole app
 * (white screen). All persistence goes through this wrapper.
 */

export const AUTH_TOKEN_KEY = 'authToken';

export const safeStorage = {
  getString(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setString(key: string, value: string): boolean {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },

  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // no-op: storage unavailable
    }
  },
};