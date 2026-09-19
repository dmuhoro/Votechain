import api from './api';
import { Voter } from '../types';

/**
 * Fetch the authenticated voter's profile from the backend.
 *
 * The Supabase session proves *identity* only. Authorization flags
 * (`is_verified`, `is_admin`) live in our `voters` table, so they must be
 * loaded explicitly after sign-in — the session object does not carry them.
 */
export const getProfile = async (): Promise<Voter> => {
  const { data } = await api.get<Voter>('/api/auth/me');
  return data;
};

/** Merge a backend profile into the minimal user we can build from a session. */
export const toVoter = (profile: Partial<Voter> & { id: string; email: string }): Voter => ({
  id: profile.id,
  email: profile.email,
  is_verified: !!profile.is_verified,
  is_admin: !!profile.is_admin,
  needsRegistration: !!profile.needsRegistration,
});
