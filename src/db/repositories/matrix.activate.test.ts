import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { activateTemplatesForAspect } from "@/db/repositories/matrix";
import { promptTemplates } from "@/db/schema";

// M23 (D-079): the coverage panel's "activate" control, verified against
// the real DB (D-078's ephemeral test-DB isolation makes this safe — never
// the dev DB). b2b/comparison's default quota (12) exactly equals its
// persona x market x 3-variant combo pool for the seeded demo project, so
// activating v4/v5 here cannot change any other test's cell counts even
// under parallel test-file execution (verified against src/core/matrix.ts's
// orderedCombos: v4/v5 only enter the ">=2 variantIdx" group behind v3 for
// the same persona/market, and the quota never needs to reach past v3).
let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

async function setActive(variantKey: string, active: boolean) {
  await db
    .update(promptTemplates)
    .set({ active })
    .where(
      and(
        eq(promptTemplates.archetype, "b2b"),
        eq(promptTemplates.intent, "comparison"),
        eq(promptTemplates.variantKey, variantKey),
      ),
    );
}

afterAll(async () => {
  if (dbUp) {
    // Always restore the opt-in default (inactive), regardless of pass/fail.
    await setActive("v4", false);
    await setActive("v5", false);
  }
  await pool.end().catch(() => {});
});

describe.skipIf(!dbUp)("activateTemplatesForAspect (M23/D-079)", () => {
  it("flips only the matching archetype+aspect rows, idempotently, leaving other aspects untouched", async () => {
    await setActive("v4", false);
    await setActive("v5", false);

    const activated = await activateTemplatesForAspect("b2b", "pricing");
    expect(activated).toBe(1);

    const [priceRow] = await db
      .select({ active: promptTemplates.active })
      .from(promptTemplates)
      .where(
        and(
          eq(promptTemplates.archetype, "b2b"),
          eq(promptTemplates.intent, "comparison"),
          eq(promptTemplates.variantKey, "v4"),
        ),
      );
    expect(priceRow?.active).toBe(true);

    // Second call: nothing left inactive for this aspect, so 0 rows flip
    // (idempotent — no duplicate row, no error).
    const again = await activateTemplatesForAspect("b2b", "pricing");
    expect(again).toBe(0);

    // The promo row (a different aspect) is untouched.
    const [promoRow] = await db
      .select({ active: promptTemplates.active })
      .from(promptTemplates)
      .where(
        and(
          eq(promptTemplates.archetype, "b2b"),
          eq(promptTemplates.intent, "comparison"),
          eq(promptTemplates.variantKey, "v5"),
        ),
      );
    expect(promoRow?.active).toBe(false);
  });
});
