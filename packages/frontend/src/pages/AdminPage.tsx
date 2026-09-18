import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { toErrorMessage } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageShell from '../components/PageShell';

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    candidates: [{ name: '', party: '' }],
    startTime: '',
    endTime: '',
  });
  const [voters, setVoters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.is_admin) {
      navigate('/');
      return;
    }
    fetchVoters();
  }, [user, navigate]);

  const fetchVoters = async () => {
    try {
      const response = await api.get('/api/admin/voters');
      setVoters(response.data);
    } catch (err: any) {
      setError(toErrorMessage(err, 'Failed to load voters'));
      console.error('Error fetching voters:', err);
    }
  };

  const handleCreateElection = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post('/api/admin/elections/create', {
        title: formData.title,
        description: formData.description,
        candidates: formData.candidates.filter(c => c.name),
        startTime: formData.startTime,
        endTime: formData.endTime,
      });

      setSuccess('Election created successfully!');
      setFormData({
        title: '',
        description: '',
        candidates: [{ name: '', party: '' }],
        startTime: '',
        endTime: '',
      });
    } catch (err: any) {
      setError(toErrorMessage(err, 'Failed to create election'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyVoter = async (voterId: string) => {
    try {
      await api.patch(`/api/admin/voters/${voterId}/verify`);
      await fetchVoters();
      setSuccess('Voter verified successfully!');
    } catch (err: any) {
      setError(toErrorMessage(err, 'Failed to verify voter'));
    }
  };

  const addCandidate = () => {
    setFormData({
      ...formData,
      candidates: [...formData.candidates, { name: '', party: '' }],
    });
  };

  const removeCandidate = (index: number) => {
    setFormData({
      ...formData,
      candidates: formData.candidates.filter((_, i) => i !== index),
    });
  };

  const updateCandidate = (index: number, field: string, value: string) => {
    const newCandidates = [...formData.candidates];
    newCandidates[index] = { ...newCandidates[index], [field]: value };
    setFormData({ ...formData, candidates: newCandidates });
  };

  return (
    <PageShell title="Admin Dashboard">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold md:text-4xl">Admin Dashboard</h1>
        <Button variant="secondary" onClick={() => navigate('/')} className="hidden md:inline-flex">
          Home
        </Button>
      </div>

      {error && (
        <Card className="mb-6 border border-red-700 bg-red-900">
          <p className="text-red-200">{error}</p>
        </Card>
      )}

      {success && (
        <Card className="mb-6 border border-green-700 bg-green-900">
          <p className="text-green-200">{success}</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Create Election Form */}
        <Card>
          <h2 className="mb-6 text-xl font-bold md:text-2xl">Create Election</h2>
          <form onSubmit={handleCreateElection} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="election-title">
                Election Title
              </label>
              <input
                id="election-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="election-description">
                Description
              </label>
              <textarea
                id="election-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="election-start">
                  Start Time
                </label>
                <input
                  id="election-start"
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="election-end">
                  End Time
                </label>
                <input
                  id="election-end"
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Candidates</label>
              <div className="mb-4 space-y-2">
                {formData.candidates.map((candidate, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Name"
                      value={candidate.name}
                      onChange={(e) => updateCandidate(index, 'name', e.target.value)}
                      className="w-1/2 flex-1 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Party"
                      value={candidate.party}
                      onChange={(e) => updateCandidate(index, 'party', e.target.value)}
                      className="w-1/2 flex-1 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                    />
                    {formData.candidates.length > 1 && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeCandidate(index)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="secondary" size="sm" onClick={addCandidate} className="w-full">
                Add Candidate
              </Button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              className="w-full"
            >
              Create Election
            </Button>
          </form>
        </Card>

        {/* Voters List */}
        <Card>
          <h2 className="mb-6 text-xl font-bold md:text-2xl">Voters</h2>
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {voters.map((voter) => (
              <div key={voter.id} className="flex items-center justify-between rounded-lg bg-gray-700 p-4">
                <div className="min-w-0 pr-3">
                  <p className="truncate font-semibold">{voter.email}</p>
                  <p className="text-sm text-gray-400">
                    {voter.is_verified ? '✓ Verified' : '⚠ Not Verified'}
                  </p>
                </div>
                {!voter.is_verified && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleVerifyVoter(voter.id)}
                  >
                    Verify
                  </Button>
                )}
              </div>
            ))}
            {voters.length === 0 && (
              <p className="py-8 text-center text-gray-400">No voters found.</p>
            )}
          </div>
        </Card>
      </div>
    </PageShell>
  );
};

export default AdminPage;