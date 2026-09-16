import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
      } else {
        setMessage('Check your email for the magic link!');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2">VoteChain</h1>
          <p className="text-gray-400">Secure Blockchain Voting</p>
        </div>

        <form onSubmit={handleSendOTP} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
              required
            />
          </div>

          {error && (
            <div className="bg-red-900 border border-red-700 rounded-lg p-3 text-red-200 text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-green-900 border border-green-700 rounded-lg p-3 text-green-200 text-sm">
              {message}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isLoading}
            className="w-full"
          >
            Send Magic Link
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-700">
          <p className="text-gray-400 text-sm text-center mb-4">
            New to VoteChain? A magic link will be sent to your email for secure, password-free login.
          </p>
          <Button
            variant="secondary"
            size="md"
            onClick={() => navigate('/')}
            className="w-full"
          >
            Back to Home
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;
