import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { safeStorage, AUTH_TOKEN_KEY } from './storage';

describe('safeStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('returns null when storage is empty', () => {
    expect(safeStorage.getString(AUTH_TOKEN_KEY)).toBeNull();
  });

  it('persists and reads a value', () => {
    expect(safeStorage.setString(AUTH_TOKEN_KEY, 'abc')).toBe(true);
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe('abc');
    expect(safeStorage.getString(AUTH_TOKEN_KEY)).toBe('abc');
  });

  it('removes a value', () => {
    safeStorage.setString(AUTH_TOKEN_KEY, 'abc');
    safeStorage.remove(AUTH_TOKEN_KEY);
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(safeStorage.getString(AUTH_TOKEN_KEY)).toBeNull();
  });

  it('does not throw when localStorage access throws (private-mode webview)', () => {
    const proto = Object.getPrototypeOf(window.localStorage) as Storage;
    const denied = (name: 'getItem' | 'setItem' | 'removeItem') =>
      vi.spyOn(proto, name).mockImplementation(() => {
        throw new Error(`SecurityError: ${name} denied`);
      });

    denied('getItem');
    denied('setItem');
    denied('removeItem');

    expect(safeStorage.getString(AUTH_TOKEN_KEY)).toBeNull();
    expect(safeStorage.setString(AUTH_TOKEN_KEY, 'x')).toBe(false);
    expect(() => safeStorage.remove(AUTH_TOKEN_KEY)).not.toThrow();
  });
});