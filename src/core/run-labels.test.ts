import { describe, expect, it } from "vitest";
import { startRunLabel } from "./run-labels";

describe("startRunLabel (M32 / D-088)", () => {
  it("maps each run mode to the operator vocabulary", () => {
    expect(startRunLabel("mock")).toBe("Start mock run");
    expect(startRunLabel("live_validation")).toBe("Start live validation");
    expect(startRunLabel("live_audit")).toBe("Start live audit");
  });
});
