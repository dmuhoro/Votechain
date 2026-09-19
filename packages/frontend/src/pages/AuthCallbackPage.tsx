import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

const CALLBACK_TIMEOUT_MS = 20000;

const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { setUser, setToken } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    let settled = false;

    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      handler();
    };

    const timeout = window.setTimeout(() => {
      finish(() => setError('Sign-in timed out. Check your connection and try again.'));
    }, CALLBACK_TIMEOUT_MS);

    const handleCallback = async () => {
      try {
        const { data, error: sessionError } = await getSupabase().auth.getSession();
        if (sessionError) throw sessionError;

        if (!data.session) {
          finish(() => navigate('/login', { replace: true }));
          return;
        }

        const session = data.session;
        setToken(session.access_token);
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          is_verified: false,
          is_admin: false,
          needsRegistration: true,
        });

        // Hydrate authorization flags (is_verified / is_admin) from our API —
        // the Supabase session does not carry them.
        try {
          const { getProfile, toVoter } = await import('../lib/auth');
          const profile = await getProfile();
          setUser(toVoter(profile));
        } catch {
          // Keep the session-derived user; a reload can retry hydration.
        }

        finish(() => navigate('/', { replace: true }));
      } catch {
        finish(() => setError('Could not complete sign-in. Check your connection and try again.'));
      } finally {
        window.clearTimeout(timeout);
      }
    };

    handleCallback();
    return () => window.clearTimeout(timeout);
  }, [navigate, setUser, setToken]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 p-6">
        <div className="w-full max-w-md rounded-lg bg-gray-800 p-8 text-center shadow-lg">
          <h1 className="text-lg font-semibold text-red-400">Sign-in did not complete</h1>
          <p className="mt-3 text-sm text-gray-300">{error}</p>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900">
      <p className="animate-pulse text-gray-400">Completing sign in...</p>
    </div>
  );
};

export default AuthCallbackPage;