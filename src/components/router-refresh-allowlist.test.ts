import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * M47 / D-118: `router.refresh()` is allowlisted only for login (post-cookie)
 * and async framing-batch terminal handling. Actions that already call
 * `revalidatePath` must not double-refresh.
 */
const ALLOWLIST = new Set([
  "src/app/login/page.tsx",
  "src/components/resonance/study-wizard.tsx",
]);

function walkAppSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkAppSources(full, out);
    else if (
      (name.endsWith(".tsx") || name.endsWith(".ts")) &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".test.tsx")
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("M47 router.refresh allowlist", () => {
  it("permits router.refresh only in login and framing-batch terminal handling", () => {
    const root = join(process.cwd(), "src");
    const hits: Array<{ file: string; line: number; text: string }> = [];
    for (const file of walkAppSources(root)) {
      const rel = relative(process.cwd(), file).replaceAll("\\", "/");
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((text, i) => {
        // Match call sites only (ignore comments that mention the API).
        if (/\brouter\.refresh\s*\(/.test(text) && !text.trimStart().startsWith("//") && !text.trimStart().startsWith("*")) {
          hits.push({ file: rel, line: i + 1, text: text.trim() });
        }
      });
    }

    const unexpected = hits.filter((h) => !ALLOWLIST.has(h.file));
    expect(unexpected, JSON.stringify(unexpected, null, 2)).toEqual([]);

    const login = hits.filter((h) => h.file === "src/app/login/page.tsx");
    expect(login.length).toBe(1);

    const wizard = hits.filter((h) => h.file === "src/components/resonance/study-wizard.tsx");
    expect(wizard.length).toBe(1);
    expect(wizard[0]!.text).toContain("router.refresh()");
    const wizardSrc = readFileSync(join(process.cwd(), "src/components/resonance/study-wizard.tsx"), "utf8");
    expect(wizardSrc).toMatch(/onTerminal=\{\(\) => \{\s*setFramingBatch\(null\);\s*router\.refresh\(\);/);
  });
});
