import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // M8: vi.stubGlobal("fetch", ...) mutates a genuinely shared global —
    // confirmed by repeated full-suite runs flaking (src/modules/settings
    // /actions.test.ts's and src/modules/extraction/live-pipeline.test.ts's
    // stubs raced and leaked into each other). Vitest's default per-file
    // isolation doesn't protect against this; running files sequentially
    // does, at a small, acceptable cost given the ~4s suite runtime.
    fileParallelism: false,
  },
});
