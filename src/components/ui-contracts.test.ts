import { describe, expect, it } from "vitest";

describe("M43 shared UI contracts", () => {
  it("keeps pending and status behavior in the shared primitive layer", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(path.join(process.cwd(), "src/components/ui.tsx"), "utf8");
    expect(source).toContain("pendingLabel");
    expect(source).toContain('aria-busy={pending || undefined}');
    expect(source).toContain("label-mono min-h-11");
    expect(source).toContain("React.forwardRef");
    expect(source).toContain('data-field-error={errors?.length ? "true" : undefined}');
    expect(source).toContain("export function InlineStatus");
    expect(source).toContain('tone === "danger" ? "alert" : "status"');
  });

  it("uses the accessible shared confirmation and static dossier loading", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dialog = await fs.readFile(
      path.join(process.cwd(), "src/components/ui/dialog.tsx"),
      "utf8",
    );
    const loading = await fs.readFile(
      path.join(process.cwd(), "src/components/page-loading.tsx"),
      "utf8",
    );
    expect(dialog).toContain("export function AppConfirmDialog");
    expect(dialog).toContain("<AppDialog");
    expect(loading).toContain("label = \"Preparing this view\"");
    expect(loading).not.toContain("loading-pulse");
    expect(loading).not.toContain("animate-pulse");
  });
});
