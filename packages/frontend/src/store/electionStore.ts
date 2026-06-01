import { create } from 'zustand';
import { Election, Candidate, ElectionResult } from '../types';

interface ElectionStore {
  elections: Election[];
  selectedElection: Election | null;
  candidates: Candidate[];
  results: ElectionResult[];
  isLoading: boolean;
  setElections: (elections: Election[]) => void;
  setSelectedElection: (election: Election | null) => void;
  setCandidates: (candidates: Candidate[]) => void;
  setResults: (results: ElectionResult[]) => void;
  setIsLoading: (loading: boolean) => void;
}

export const useElectionStore = create<ElectionStore>((set) => ({
  elections: [],
  selectedElection: null,
  candidates: [],
  results: [],
  isLoading: false,
  setElections: (elections) => set({ elections }),
  setSelectedElection: (election) => set({ selectedElection: election }),
  setCandidates: (candidates) => set({ candidates }),
  setResults: (results) => set({ results }),
  setIsLoading: (loading) => set({ isLoading: loading }),
}));
