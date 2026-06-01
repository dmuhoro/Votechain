import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../services/supabaseService';
import { protect } from '../middleware/authMiddleware';
import { Request, Response } from 'express';
import * as crypto from 'crypto';

const router = Router();

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

router.post("/send-otp", async (req: Request, res: Response) => {
  try {
    const { email } = sendOtpSchema.parse(req.body);

    const { data, error } = await supabase.auth.signInWithOtp({
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

// Schema for verifying OTP (not directly used for magic link, but good for consistency)
const verifyOtpSchema = z.object({
  email: z.string().email(),
  token: z.string().min(6).max(6), // Assuming 6 digit OTP
});

// Note: Supabase magic link handles verification automatically on redirect.
// This endpoint would be for a traditional OTP flow, which is not the primary method here.
// Keeping it as a placeholder if a direct OTP entry is desired later.
router.post("/verify-otp", async (req: Request, res: Response) => {
  try {
    const { email, token } = verifyOtpSchema.parse(req.body);

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

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
    const { data: existingVoter, error: fetchError } = await supabase
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
