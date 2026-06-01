import { z } from "zod";

const envSchema = z.object({
  PORT: z.preprocess(Number, z.number().int().positive().default(3001)),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  RELAYER_PRIVATE_KEY: z.string(),
  SEPOLIA_RPC_URL: z.string().url(),
  CONTRACT_ADDRESS: z.string().startsWith("0x").length(42), // Ethereum address
  SERVER_SECRET: z.string().min(32), // For nullifier generation
  ADMIN_EMAILS: z.string().transform((str) => str.split(",").map((email) => email.trim())),
  CORS_ORIGIN: z.string().url(),
});

try {
  envSchema.parse(process.env);
} catch (error) {
  console.error("❌ Invalid environment variables:", error);
  process.exit(1);
}

declare global {
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}

export const {
  PORT,
  NODE_ENV,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  RELAYER_PRIVATE_KEY,
  SEPOLIA_RPC_URL,
  CONTRACT_ADDRESS,
  SERVER_SECRET,
  ADMIN_EMAILS,
  CORS_ORIGIN,
} = process.env;
