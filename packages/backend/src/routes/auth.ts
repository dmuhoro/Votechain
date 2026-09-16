import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseService';
import { protect } from '../middleware/authMiddleware';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OTP_RATE_LIMIT } from '../config';
import { Request, Response } from 'express';
import * as crypto from 'crypto';

const router = Router();

// Dedicated client for user-facing auth flows. Kept separate from the shared
// service-role client (`supabase`) because verifyOtp stores the user session in
// memory; if it ran on the shared client, every subsequent .from() write would
// authenticate as `authenticated` (Bearer user token) instead of service_role.
const authSupabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Extend Request type for authenticated user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    is_admin: boolean;
    is_verified_voter: boolean;
  };
}

// Schema for sending OTP
const sendOtpSchema = z.object({
  email: z.string().email(),
});

router.post("/send-otp",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: OTP_RATE_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many OTP requests. Please try again later." },
  }),
  async (req: Request, res: Response) => {
  try {
    const { email } = sendOtpSchema.parse(req.body);

    const { error } = await authSupabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: process.env.CORS_ORIGIN, // Redirect back to frontend after magic link click
      },
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.status(200).json({ message: "OTP sent to your email." });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(500).json({ message: error.message });
  }
});

// Schema for verifying OTP. Accepts either a numeric OTP code (e.g. 6 digits) or
// the token from a Supabase magic-link email (often 40-60 chars). We try the
// Schema for verifying OTP. Accepts either a numeric OTP code (e.g. 6 digits) or
// the token from a Supabase magic-link email (40-60 chars, consumed on use).
const verifyOtpSchema = z.object({
  email: z.string().email(),
  token: z.string().min(6), // Minimum 6; magic-link tokens are longer
});

router.post("/verify-otp", async (req: Request, res: Response) => {
  try {
    const { email, token } = verifyOtpSchema.parse(req.body);

    // Modern GoTrue (v2.195+) stores magic-link tokens in `one_time_tokens` and
    // requires verifying via `token_hash` (no `email`/`token`). The `{email,
    // token}` path only matches legacy `users.confirmation_token`/`recovery_token`
    // columns, which are empty in the new scheme. Numeric OTPs (6-digit) still
    // verify via `{email, token, type: "email"}`.
    const isMagicLink = token.length > 6;

    const { data, error } = await authSupabase.auth.verifyOtp(
      isMagicLink
        ? { token_hash: token, type: "magiclink" }
        : { email, token, type: "email" }
    );

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    if (!data.session) {
      return res.status(400).json({ message: "OTP verification failed, no session." });
    }

    res.status(200).json({ message: "Successfully verified OTP", session: data.session });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(500).json({ message: error.message });
  }
});

// Schema for voter registration
const registerVoterSchema = z.object({
  email: z.string().email(),
  nationalId: z.string().min(5), // Example min length, adjust as needed
});

router.post("/register-voter", protect, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, nationalId } = registerVoterSchema.parse(req.body);

    if (!req.user || req.user.email !== email) {
      return res.status(403).json({ message: "Unauthorized registration attempt." });
    }

    // Hash national ID before storing
    const nationalIdHash = crypto.createHash("sha256").update(nationalId).digest("hex");

    // Check if voter already exists
    const { data: existingVoter } = await supabase
      .from("voters")
      .select("id")
      .eq("email", email)
      .single();

    if (existingVoter) {
      return res.status(409).json({ message: "Voter with this email already registered." });
    }

    // Insert new voter record
    const { data, error } = await supabase
      .from("voters")
      .insert({
        id: req.user.id, // Use Supabase auth user ID
        email,
        national_id_hash: nationalIdHash,
      })
      .select();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.status(201).json({ message: "Voter registered successfully", voter: data[0] });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(500).json({ message: error.message });
  }
});

router.get("/me", protect, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated." });
  }

  // For /me, we return the authenticated user's profile from our voters table
  const { data: voterProfile, error } = await supabase
    .from("voters")
    .select("id, email, is_verified, created_at")
    .eq("id", req.user.id)
    .single();

  if (error) {
    // If user is authenticated but not in voters table, it means they just signed up
    // and need to complete registration.
    if (error.code === "PGRST116") { // No rows found
      return res.status(200).json({
        id: req.user.id,
        email: req.user.email,
        is_admin: req.user.is_admin,
        is_verified: false, // Not yet registered in our table
        needsRegistration: true,
      });
    }
    return res.status(500).json({ message: error.message });
  }

  res.status(200).json({
    ...voterProfile,
    is_admin: req.user.is_admin,
  });
});

export default router;
