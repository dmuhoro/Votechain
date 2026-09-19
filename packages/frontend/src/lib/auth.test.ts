import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  default: { get: vi.fn() },
}));

import api from './api';
import { getProfile, toVoter } from './auth';

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

describe('auth lib', () => {
  it('loads the profile from /api/auth/me', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { id: 'u1', email: 'voter@votechain.test', is_verified: true, is_admin: true },
    });
    const profile = await getProfile();
    expect(api.get).toHaveBeenCalledWith('/api/auth/me');
    expect(profile.is_verified).toBe(true);
    expect(profile.is_admin).toBe(true);
  });

  it('normalizes missing authorization flags to false', () => {
    const voter = toVoter({ id: 'u1', email: 'voter@votechain.test' });
    expect(voter).toEqual({
      id: 'u1',
      email: 'voter@votechain.test',
      is_verified: false,
      is_admin: false,
      needsRegistration: false,
    });
  });
});
