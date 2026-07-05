import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SimulatedBadge } from "./simulated-badge";

describe("SimulatedBadge", () => {
  it("renders the reserved simulation stamp text", () => {
    expect(renderToStaticMarkup(createElement(SimulatedBadge))).toContain("SIMULATED");
  });
});
