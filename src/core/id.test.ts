import { describe, expect, it } from "vitest";
import { isUuid } from "./id";

describe("isUuid", () => {
  it("accepts canonical UUIDs and rejects malformed route params before DB queries", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000000")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
