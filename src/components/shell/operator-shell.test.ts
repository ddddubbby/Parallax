import { describe, expect, it } from "vitest";

/**
 * M33 / D-089: the mobile drawer must use Radix Dialog (focus trap + restore),
 * not a hand-rolled aria-modal shell. This source contract test keeps the
 * regression visible without mounting Next/Radix in node vitest.
 */
describe("OperatorShell mobile drawer (M33 / D-089)", () => {
  it("builds the mobile drawer on @radix-ui/react-dialog", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = path.join(process.cwd(), "src/components/shell/operator-shell.tsx");
    const source = await fs.readFile(file, "utf8");
    expect(source).toContain('@radix-ui/react-dialog');
    expect(source).toContain("Dialog.Root");
    expect(source).toContain("Dialog.Content");
    expect(source).toContain("Dialog.Trigger");
    // Hand-rolled aria-modal without Radix must not return.
    expect(source).not.toMatch(/role="dialog"\s+aria-modal="true"/);
  });
});
