import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /health", () => {
  it("returns 200 with ok status and no external dependencies", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", service: "parallax-web" });
  });
});
