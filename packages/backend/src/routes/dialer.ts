import { Router, Request } from "express";
import { z } from "zod";
import { ethers } from "ethers";
import { protect } from "../middleware/authMiddleware";
import { CONTRACT_ADDRESS, SEPOLIA_RPC_URL } from "../config";
import VoteChainArtifact from "../artifacts/VoteChain.json";
import {
  provisionPin,
  bindDialerPhone,
  dialerPhone,
  electionById,
  isElectionOpen,
  lookupVoteByCode,
  handleInboundSms,
  DialerError,
} from "../services/dialerService";
import type { ChainCandidate } from "../services/offlineBallotService";
import { getSmsGateway } from "../services/smsGateway";

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    is_admin: boolean;
    is_verified_voter: boolean;
  };
}

const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const voteChainContract = new ethers.Contract(CONTRACT_ADDRESS, VoteChainArtifact.abi, provider);

async function fetchChainCandidates(chainElectionId: number): Promise<ChainCandidate[]> {
  const [names, parties] = await voteChainContract.getResults(chainElectionId);
  return names.map((name: string, index: number) => ({
    id: index + 1,
    name,
    party: parties[index] ?? "",
  }));
}

// GET /api/dialer/phone — the voter's current phone binding (null when unbound).
router.get("/phone", protect, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Authentication required." });
    const phone = await dialerPhone(req.user.id);
    res.status(200).json({ phoneNumber: phone });
  } catch (error: any) {
    if (error instanceof DialerError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error("Error reading dialer phone:", error);
    res.status(500).json({ message: error.message || "Failed to read phone binding." });
  }
});

// POST /api/dialer/phone — bind (or re-bind) the dialer phone for a verified voter.
const bindPhoneSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/, "Use a plain international number, digits only (e.g. +254…).")
    .min(7)
    .max(15),
});

router.post("/phone", protect, async (req: AuthenticatedRequest, res) => {
  try {
    const { phoneNumber } = bindPhoneSchema.parse(req.body);
    if (!req.user) return res.status(401).json({ message: "Authentication required." });

    if (!req.user.is_verified_voter) {
      return res.status(403).json({
        message: "Dialer voting is only available to verified voters.",
      });
    }

    await bindDialerPhone(req.user.id, phoneNumber);
    res.status(200).json({ message: "Dialer phone bound successfully.", phoneNumber });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    if (error instanceof DialerError) {
      return res.status(error.statusCode).json({ message: error.message, reason: error.reason });
    }
    console.error("Error binding dialer phone:", error);
    res.status(500).json({ message: error.message || "Failed to bind phone." });
  }
});

// POST /api/dialer/codes — provision a one-time 6-digit PIN for an open election.
const provisionSchema = z.object({
  electionId: z.number().int().positive(),
});

router.post("/codes", protect, async (req: AuthenticatedRequest, res) => {
  try {
    const { electionId } = provisionSchema.parse(req.body);
    if (!req.user) return res.status(401).json({ message: "Authentication required." });
    if (!req.user.is_verified_voter) {
      return res.status(403).json({ message: "Dialer voting is only available to verified voters." });
    }

    const phone = await dialerPhone(req.user.id);
    if (!phone) {
      return res.status(409).json({
        message: "Bind your phone number in the Dialer page before requesting a code.",
        reason: "phone_unbound",
      });
    }

    const election = await electionById(electionId);
    if (!election) {
      return res.status(404).json({ message: "Election not found." });
    }
    if (!isElectionOpen(election, new Date())) {
      return res.status(409).json({ message: "Election is not open for voting." });
    }

    const { pin, exists } = await provisionPin(
      req.user.id,
      electionId,
      phone,
      election.end_time
    );

    res.status(exists ? 200 : 201).json({
      message: exists
        ? "A dialer PIN already existed for this election. Re-issued a new one."
        : "Dialer PIN issued. Text: VOTE <electionCode> <candidateId> <pin>",
      pin,
      electionCode: election.dial_code,
      electionTitle: election.title,
      expiresAt: election.end_time,
      exists,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    if (error instanceof DialerError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error("Error provisioning dialer code:", error);
    res.status(500).json({ message: error.message || "Failed to provision dialer code." });
  }
});

// POST /api/dialer/sms — carrier-gateway webhook shape. NOT protect-gated: the
// phone binding + one-time PIN are the credentials (ADR-009 §6).
const inboundSchema = z.object({
  From: z.string().min(7).max(15),
  Body: z.string().min(1).max(200),
  MessageSid: z.string().optional(),
  gateway: z.string().default("simulated"),
});

router.post("/sms", async (req, res) => {
  try {
    const { From, Body, gateway } = inboundSchema.parse(req.body);

    // The outbound gateway is selected by env (simulated by default). We use
    // the BEST-EFFORT gateway for the reply; the intake result IS the reply.
    const smsGateway = getSmsGateway();

    const result = await handleInboundSms(
      { From, Body, gateway },
      {
        fetchChainCandidates,
        gatewayName: gateway,
        gateway: smsGateway,
      }
    );

    await smsGateway.send({ to: From, body: result.reply }).catch((err: unknown) => {
      console.error("Failed to send dialer SMS reply:", err);
    });

    res.status(200).json({
      message: result.reply,
      outcome: result.outcome,
      ...(result.electionId !== undefined ? { electionId: result.electionId } : {}),
      ...(result.voteCode ? { voteCode: result.voteCode } : {}),
      ...(result.txHash ? { txHash: result.txHash } : {}),
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error("Error handling dialer SMS:", error);
    res.status(500).json({ message: error.message || "Failed to handle dialer SMS." });
  }
});

// GET /api/dialer/receipts/:code — public on-demand verification by vote code.
const receiptSchema = z.object({
  code: z.string().regex(/^[a-zA-Z0-9]{1,16}$/),
});

router.get("/receipts/:code", async (req, res) => {
  try {
    const { code } = receiptSchema.parse(req.params);
    const normalized = code.toUpperCase();

    const record = await lookupVoteByCode(normalized);
    if (!record) {
      return res.status(404).json({ message: "No vote found for that receipt code." });
    }

    const election = await electionById(record.election_id).catch(() => null);

    res.status(200).json({
      message: "Vote verified successfully.",
      voteCode: normalized,
      electionTitle: election?.title ?? `Election #${record.election_id}`,
      txHash: record.tx_hash,
      blockNumber: record.block_number,
      explorerUrl: `https://sepolia.etherscan.io/tx/${record.tx_hash}`,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error("Error verifying dialer receipt:", error);
    res.status(500).json({ message: error.message || "Failed to verify receipt." });
  }
});

export default router;