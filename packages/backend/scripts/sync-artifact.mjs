#!/usr/bin/env node
/**
 * Syncs the compiled VoteChain contract artifact from the contracts workspace
 * into the backend bundle source directory, so `tsc` (rootDir=src) can type it
 * and `dist/` ships standalone without a monorepo-relative path.
 *
 * Runs before dev/build/start. Requires the contracts package to be compiled
 * (`npm run compile -w contracts`) first.
 */
import { existsSync, copyFileSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SOURCE = resolve(
  __dirname,
  "../../contracts/artifacts/contracts/VoteChain.sol/VoteChain.json"
);
const DEST_DIR = resolve(__dirname, "../src/artifacts");
const DEST = join(DEST_DIR, "VoteChain.json");

if (!existsSync(SOURCE)) {
  console.error(
    "[sync-artifact] Missing compiled artifact at " +
      SOURCE +
      "\nRun: npm run compile -w contracts"
  );
  process.exit(1);
}

mkdirSync(DEST_DIR, { recursive: true });
copyFileSync(SOURCE, DEST);
console.log("[sync-artifact] Copied VoteChain.json artifact -> src/artifacts/");