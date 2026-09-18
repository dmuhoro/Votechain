import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { createDeferred } from './testUtils';
import { useResults } from './useResults';
import { useNetworkStore } from '../store/networkStore';

vi.mock('../lib/api', () => {
  const actual = vi.importActual<typeof import('../lib/api')>('../lib/api');
  const api = { get: vi.fn(), post: vi.fn() };
  return { ...actual, default: api };
});

import api from '../lib/api';

interface HookValue {
  results: unknown[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refetch: () => void;
}

const mount = (electionId: number) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let captured: HookValue | undefined;
  function Harness() {
    captured = useResults(electionId);
    return null;
  }
  act(() => {
    root.render(<Harness />);
  });
  return {
    get: () => captured as HookValue,
    root,
    container,
  };
};

beforeEach(() => {
  vi.restoreAllMocks();
  useNetworkStore.setState({ isOnline: true, listening: false });
});

describe('useResults — offline-boot wedge regression', () => {
  it('does not wedge in "Loading" when isOnline flips right after mount (offline PWA boot)', async () => {
    const first = createDeferred<{ data: { name: string; party: string; voteCount: number }[] }>();
    const second = createDeferred<{ data: { name: string; party: string; voteCount: number }[] }>();
    (api.get as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const harness = mount(1);

    // First request is in flight (isOnline was true at first render).
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(harness.get().isLoading).toBe(true);

    // Offline boot: the network store flips to offline right after mount.
    act(() => {
      useNetworkStore.setState({ isOnline: false });
    });

    // The stale first response arrives AFTER the connectivity flip — the pattern
    // that used to suppress every state update and wedge the loader forever.
    const staleData = [{ name: 'Stale', party: 'Old', voteCount: 99 }];
    await act(async () => {
      first.resolve({ data: staleData });
    });

    // The fix supersedes the stale in-flight request and issues a fresh one.
    expect(api.get).toHaveBeenCalledTimes(2);

    const freshData = [{ name: 'A', party: 'Alpha', voteCount: 1 }];
    await act(async () => {
      second.resolve({ data: freshData });
    });

    expect(harness.get().isLoading).toBe(false);
    expect(harness.get().error).toBeNull();
    // The stale response must NOT overwrite the fresh one.
    expect(harness.get().results.map((r) => (r as { name: string }).name)).toEqual(['A']);
    expect(harness.get().lastUpdated).toBeInstanceOf(Date);

    harness.root.unmount();
    harness.container.remove();
  });
});