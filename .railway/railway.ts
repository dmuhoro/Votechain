import { defineRailway, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const backend = service("backend", {
    build: "npm run compile -w contracts && npm run build -w backend",
    start: "node packages/backend/dist/index.js",
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    replicas: { "sfo": 1 },
    env: { ADMIN_EMAILS: preserve(), CONTRACT_ADDRESS: preserve(), CORS_ORIGIN: preserve(), NODE_ENV: preserve(), OTP_RATE_LIMIT: preserve(), OWNER_PRIVATE_KEY: preserve(), PORT: preserve(), RELAYER_PRIVATE_KEY: preserve(), SEPOLIA_RPC_URL: preserve(), SERVER_SECRET: preserve(), SUPABASE_SERVICE_ROLE_KEY: preserve(), SUPABASE_URL: preserve() },
  });

  return project("votechain", {
    resources: [backend],
  });
});
