import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAILS } from '../config';

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    is_admin: boolean;
    is_verified_voter: boolean;
  };
}

export const protect = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({ message: 'Not authorized, token failed' });
      }

      // Fetch voter profile from our public.voters table
      const { data: voterProfile, error: voterError } = await supabase
        .from('voters')
        .select('id, email, is_verified')
        .eq('email', user.email)
        .single();

      if (voterError || !voterProfile) {
        // This means the user authenticated with Supabase but is not in our voters table
        // This might happen if they just signed up via magic link but haven't completed registration
        req.user = {
          id: user.id,
          email: user.email!,
          is_admin: ADMIN_EMAILS.includes(user.email!),
          is_verified_voter: false, // Not yet a registered voter
        };
        return next();
      }

      req.user = {
        id: voterProfile.id,
        email: voterProfile.email,
        is_admin: ADMIN_EMAILS.includes(voterProfile.email),
        is_verified_voter: voterProfile.is_verified,
      };

      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

export const adminProtect = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.user && req.user.is_admin) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an admin' });
  }
};
