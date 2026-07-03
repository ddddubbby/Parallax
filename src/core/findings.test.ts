import { describe, expect, it } from "vitest";
import {
  findGroundedUngroundedSplit,
  findLostShortlistCells,
  findLowStabilityClusters,
  findMisinformationFlag,
  findPositioningGaps,
  findSourceConcentration,
} from "./findings";

describe("findLostShortlistCells (RB-1, D-015 directional-only)", () => {
  it("flags a high-intent cell where a competitor dominates and the client is nearly absent", () => {
    const findings = findLostShortlistCells([
      { cellId: "c1", intent: "comparison", clientRate: 0.1, topCompetitorName: "SpendPilot", topCompetitorRate: 0.8, n: 5 },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].directionalOnly).toBe(true);
    expect(findings[0].severity).toBe("high");
  });

  it("does not flag low-intent cells even with the same rates", () => {
    const findings = findLostShortlistCells([
      { cellId: "c1", intent: "discovery", clientRate: 0.1, topCompetitorName: "SpendPilot", topCompetitorRate: 0.8, n: 5 },
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does not flag when the client still has meaningful presence", () => {
    const findings = findLostShortlistCells([
      { cellId: "c1", intent: "validation", clientRate: 0.3, topCompetitorName: "SpendPilot", topCompetitorRate: 0.8, n: 5 },
    ]);
    expect(findings).toHaveLength(0);
  });

  it("is exempt from n>=30 by design — a tiny n still flags", () => {
    const findings = findLostShortlistCells([
      { cellId: "c1", intent: "comparison", clientRate: 0.0, topCompetitorName: "X", topCompetitorRate: 1.0, n: 2 },
    ]);
    expect(findings).toHaveLength(1);
  });
});

describe("findPositioningGaps (RB-1)", () => {
  it("flags attributes below the threshold, not above it", () => {
    const findings = findPositioningGaps([
      { attribute: "easy implementation", rate: 0.1, n: 100 },
      { attribute: "transparent pricing", rate: 0.5, n: 100 },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain("easy implementation");
  });

  it("escalates severity for very low rates", () => {
    const [severe] = findPositioningGaps([{ attribute: "x", rate: 0.05, n: 50 }]);
    const [mild] = findPositioningGaps([{ attribute: "y", rate: 0.25, n: 50 }]);
    expect(severe.severity).toBe("medium");
    expect(mild.severity).toBe("low");
  });
});

describe("findMisinformationFlag (RB-1)", () => {
  it("returns nothing when there are no misinformation claims", () => {
    expect(findMisinformationFlag({ highSeverityCount: 0, mediumSeverityCount: 0, totalCount: 0 })).toHaveLength(0);
  });

  it("escalates to high severity when any high-severity claim exists", () => {
    const [f] = findMisinformationFlag({ highSeverityCount: 1, mediumSeverityCount: 3, totalCount: 4 });
    expect(f.severity).toBe("high");
  });
});

describe("findGroundedUngroundedSplit (RB-1)", () => {
  it("flags a large gap between grounded and ungrounded rates", () => {
    const findings = findGroundedUngroundedSplit([
      { mode: "grounded", rate: 0.7, n: 50 },
      { mode: "ungrounded", rate: 0.4, n: 50 },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].bodyMd).toContain("grounded");
  });

  it("does not flag a small gap", () => {
    const findings = findGroundedUngroundedSplit([
      { mode: "grounded", rate: 0.52, n: 50 },
      { mode: "ungrounded", rate: 0.5, n: 50 },
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does not flag when only one mode has data", () => {
    expect(findGroundedUngroundedSplit([{ mode: "grounded", rate: 0.7, n: 50 }])).toHaveLength(0);
  });
});

describe("findSourceConcentration (RB-1)", () => {
  it("flags when one domain dominates citations", () => {
    const findings = findSourceConcentration([
      { domain: "big.example", citationCount: 45 },
      { domain: "small.example", citationCount: 5 },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain("big.example");
  });

  it("does not flag a balanced spread", () => {
    const findings = findSourceConcentration([
      { domain: "a.example", citationCount: 10 },
      { domain: "b.example", citationCount: 10 },
      { domain: "c.example", citationCount: 10 },
    ]);
    expect(findings).toHaveLength(0);
  });
});

describe("findLowStabilityClusters (RB-1, D-015 directional-only)", () => {
  it("flags cells below the stability threshold", () => {
    const findings = findLowStabilityClusters([{ cellId: "c1", intent: "comparison", stabilityIndex: 0.2, n: 5 }]);
    expect(findings).toHaveLength(1);
    expect(findings[0].directionalOnly).toBe(true);
  });

  it("does not flag stable cells", () => {
    expect(findLowStabilityClusters([{ cellId: "c1", intent: "comparison", stabilityIndex: 0.9, n: 5 }])).toHaveLength(0);
  });
});
