import { defineConfig } from "drizzle-kit";

// The `out` path is pinned per ENGINEERING_SPEC.md section 2 (C-6):
// migrations live in git under src/db/migrations, never drizzle-kit's default.
export default defineConfig({
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5432/parallax",
  },
});
