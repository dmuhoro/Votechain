import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { setUser, setToken } = useAuthStore();

  useEffect(() => {
    const handleCallback = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        navigate('/login', { replace: true });
        return;
      }

      const session = data.session;
      const { user } = session;

      setToken(session.access_token);
      setUser({
        id: user.id,
        email: user.email || '',
        is_verified: false,
        is_admin: false,
        needsRegistration: true,
      });

      navigate('/', { replace: true });
    };

    handleCallback();
  }, [navigate, setUser, setToken]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
      <p className="text-gray-400">Completing sign in...</p>
    </div>
  );
};

export default AuthCallbackPage;