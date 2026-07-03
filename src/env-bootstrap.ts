// Env bootstrap for non-Next entrypoints (worker, scripts). Next.js loads
// .env.local and .env automatically; standalone `tsx` processes do not, so
// anything they need beyond DATABASE_URL's hardcoded fallback (notably
// CREDENTIALS_ENCRYPTION_KEY) was silently unset. That made a local
// `pnpm worker` mark good credentials invalid on the first live job.
//
// Import this FIRST, before any module whose top-level body reads process.env
// (e.g. src/db/client.ts). Precedence matches Next: real shell env wins over
// files, and .env.local wins over .env — process.loadEnvFile never overwrites
// an already-set var, so loading .env.local first achieves that ordering.
// On Render every var comes from the dashboard and no files exist; the
// ENOENT guard makes that a no-op.
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
