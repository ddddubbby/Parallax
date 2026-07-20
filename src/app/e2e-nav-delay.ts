import { cookies } from "next/headers";

/**
 * M47 / D-118: optional server-side delay for Playwright presence checks.
 * Active only when the `e2e-nav-delay=1` cookie is set (transition-feedback
 * spec) or `E2E_NAV_DELAY_MS` is a positive number. Not a product timing gate.
 * Lives under `src/app` so `src/core` stays Next-free (C-7).
 */
export async function e2eNavDelay(): Promise<void> {
  const fromEnv = Number(process.env.E2E_NAV_DELAY_MS ?? 0);
  let ms = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 0;
  if (ms <= 0) {
    try {
      const jar = await cookies();
      if (jar.get("e2e-nav-delay")?.value === "1") ms = 1_500;
    } catch {
      // cookies() unavailable outside a request — no-op
    }
  }
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
