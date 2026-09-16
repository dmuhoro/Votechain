import { Router } from 'express';
import { supabase } from '../services/supabaseService';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const now = new Date().toISOString();

    const [elections, votes, voters] = await Promise.all([
      supabase
        .from('elections')
        .select('id', { count: 'exact', head: true })
        .gte('end_time', now)
        .eq('is_active', true),
      supabase.from('vote_records').select('id', { count: 'exact', head: true }),
      supabase.from('voters').select('id', { count: 'exact', head: true }),
    ]);

    const count = (r: { count: number | null }) => r.count ?? 0;

    res.status(200).json({
      activeElections: count(elections),
      totalVotes: count(votes),
      registeredVoters: count(voters),
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: error?.message || 'Failed to fetch stats' });
  }
});

export default router;