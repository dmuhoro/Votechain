import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNetworkStore } from './networkStore';

describe('networkStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset the singleton between tests.
    useNetworkStore.setState({ isOnline: true, listening: false });
  });

  it('starts online', () => {
    expect(useNetworkStore.getState().isOnline).toBe(true);
  });

  it('init attaches window listeners exactly once (StrictMode guard)', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');

    useNetworkStore.getState().init();
    useNetworkStore.getState().init(); // second call must be a no-op

    expect(useNetworkStore.getState().listening).toBe(true);
    const offlineCalls = addSpy.mock.calls.filter(([type]) => type === 'offline').length;
    const onlineCalls = addSpy.mock.calls.filter(([type]) => type === 'online').length;
    expect(offlineCalls).toBe(1);
    expect(onlineCalls).toBe(1);
  });
});