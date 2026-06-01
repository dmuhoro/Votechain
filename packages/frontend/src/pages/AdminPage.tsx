import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

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
    }
    fetchVoters();
  }, [user, navigate]);

  const fetchVoters = async () => {
    try {
      const response = await api.get('/api/admin/voters');
      setVoters(response.data);
    } catch (err: any) {
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
      setError(err.response?.data?.message || 'Failed to create election');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyVoter = async (voterId: string) => {
    try {
      await api.patch(`/api/admin/voters/${voterId}/verify`);
      fetchVoters();
      setSuccess('Voter verified successfully!');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to verify voter');
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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 py-12">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Admin Dashboard</h1>
          <Button variant="secondary" onClick={() => navigate('/')}>
            Home
          </Button>
        </div>

        {error && (
          <Card className="bg-red-900 border border-red-700 mb-8">
            <p className="text-red-200">{error}</p>
          </Card>
        )}

        {success && (
          <Card className="bg-green-900 border border-green-700 mb-8">
            <p className="text-green-200">{success}</p>
          </Card>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Create Election Form */}
          <Card>
            <h2 className="text-2xl font-bold mb-6">Create Election</h2>
            <form onSubmit={handleCreateElection} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Election Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Start Time</label>
                  <input
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">End Time</label>
                  <input
                    type="datetime-local"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Candidates</label>
                <div className="space-y-2 mb-4">
                  {formData.candidates.map((candidate, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Name"
                        value={candidate.name}
                        onChange={(e) => updateCandidate(index, 'name', e.target.value)}
                        className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                      />
                      <input
                        type="text"
                        placeholder="Party"
                        value={candidate.party}
                        onChange={(e) => updateCandidate(index, 'party', e.target.value)}
                        className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
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
            <h2 className="text-2xl font-bold mb-6">Voters</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {voters.map((voter) => (
                <div key={voter.id} className="bg-gray-700 rounded-lg p-4 flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{voter.email}</p>
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
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
