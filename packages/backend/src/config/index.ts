import { z } from "zod";

const envSchema = z.object({
  PORT: z.preprocess(Number, z.number().int().positive().default(3001)),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  RELAYER_PRIVATE_KEY: z.string(),
  OWNER_PRIVATE_KEY: z.string(),
  SEPOLIA_RPC_URL: z.string().url(),
  SEPOLIA_EXPLORER: z.string().url().default("https://sepolia.etherscan.io"),
  CONTRACT_ADDRESS: z.string().startsWith("0x").length(42), // Ethereum address
  SERVER_SECRET: z.string().min(32), // For nullifier generation
  ADMIN_EMAILS: z.string().transform((str) => str.split(",").map((email) => email.trim())),
  CORS_ORIGIN: z.string().url(),
  OTP_RATE_LIMIT: z.coerce.number().int().positive().default(5),
});

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}

let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error("❌ Invalid environment variables:", error);
  throw new Error("Invalid environment variables - refusing to boot (Article IV.2).");
}

export const {
  PORT,
  NODE_ENV,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  RELAYER_PRIVATE_KEY,
  OWNER_PRIVATE_KEY,
  SEPOLIA_RPC_URL,
  SEPOLIA_EXPLORER,
  CONTRACT_ADDRESS,
  SERVER_SECRET,
  ADMIN_EMAILS,
  CORS_ORIGIN,
  OTP_RATE_LIMIT,
} = env;
