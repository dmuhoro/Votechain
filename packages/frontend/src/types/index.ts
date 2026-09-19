export interface Voter {
  id: string;
  email: string;
  is_verified: boolean;
  is_admin: boolean;
  needsRegistration?: boolean;
}

export interface Election {
  id: number;
  chain_election_id: number;
  dial_code?: string | null;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  contract_address: string;
  created_at: string;
}

export interface Candidate {
  id: number;
  name: string;
  party: string;
  voteCount?: number;
}

export interface ElectionResult {
  name: string;
  party: string;
  voteCount: number;
}

export interface VoteReceipt {
  txHash: string;
  blockNumber: number;
  explorerUrl: string;
  electionTitle: string;
  candidateVotedFor: string;
  candidateParty: string;
  timestamp: string | null;
}

export interface AuthSession {
  user: Voter;
  token: string;
}

export interface ElectionStats {
  activeElections: number;
  totalVotes: number;
  registeredVoters: number;
}
