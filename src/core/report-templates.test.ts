import { describe, expect, it } from "vitest";
import {
  generateResonanceSection,
  generateSection,
  REPORT_SECTIONS,
  RESONANCE_REPORT_SECTIONS,
  type ReportContext,
  type ResonanceReportContext,
} from "./report-templates";

const BASE_CTX: ReportContext = {
  clientBrandName: "LedgerFox",
  competitorNames: ["SpendPilot", "Northstar AP"],
  runMode: "mock",
  runDate: "2026-07-04",
  isMock: true,
  isPartial: false,
  repetitions: 5,
  plannedCalls: 100,
  costCapUsd: 20,
  providers: ["mock"],
  modes: ["ungrounded"],
  metrics: [
    { scopeType: "overall", metricKey: "mention_rate", n: 100, value: 0.6, ciLow: 0.5, ciHigh: 0.7 },
    { scopeType: "overall", metricKey: "recommendation_rate", n: 100, value: 0.3, ciLow: 0.22, ciHigh: 0.39 },
    { scopeType: "overall", metricKey: "share_of_voice", n: 100, value: 0.45, ciLow: null, ciHigh: null },
    { scopeType: "overall", metricKey: "avg_first_position", n: 60, value: 1.8, ciLow: null, ciHigh: null },
    { scopeType: "overall", metricKey: "stability_index", n: 20, value: 0.7, ciLow: null, ciHigh: null },
  ],
  findings: [],
  evidenceExcerpts: [],
  misinformation: [],
  citedSources: [],
  sentiment: { positive: 0.6, neutral: 0.3, mixed: 0.05, negative: 0.05 },
  brandMetrics: [],
};

// RB-5: report tone is client-facing, cautious, evidence-led — never
// promises rankings or guaranteed remediation. These check for AFFIRMATIVE
// promissory phrasing specifically — a disclaimer like "not a guarantee of
// future behavior" is exactly what RB-5 wants and must not trip this check.
const FORBIDDEN_PHRASES = ["#1", "ranked first", "will rank", "will improve", "we promise", "is guaranteed", "we guarantee"];
const RESONANCE_FORBIDDEN_PHRASES = ["will increase sales", "predicted revenue", "guaranteed uplift", "roi of"];

const RESONANCE_CTX: ResonanceReportContext = {
  studyName: "AI framing repair",
  runMode: "mock",
  runDate: "2026-07-05",
  isMock: true,
  genericUnconditioned: false,
  repetitions: 5,
  providers: ["mock"],
  modes: ["ungrounded"],
  anchorSetVersion: "purchase_intent.v1",
  anchorSetCalibrated: false,
  embeddingModel: "mock-fixture",
  variants: [
    {
      stimulusId: "stim-1",
      label: "Measured AI framing",
      stimulusKind: "measured_ai",
      n: 30,
      piMean: 3.2,
      pmf: [0.05, 0.1, 0.35, 0.35, 0.15],
      sufficientN: true,
    },
    {
      stimulusId: "stim-2",
      label: "Corrected proof framing",
      stimulusKind: "corrected",
      n: 10,
      piMean: 3.7,
      pmf: [0.02, 0.08, 0.25, 0.4, 0.25],
      sufficientN: false,
    },
  ],
  deltas: [
    {
      label: "Corrected proof framing",
      baselineLabel: "Measured AI framing",
      n: 10,
      deltaPiMean: 0.5,
      directionalOnly: true,
    },
  ],
  personaRows: [
    {
      panelPersonaLabel: "Primary buyer",
      stimulusLabel: "Corrected proof framing",
      n: 5,
      piMean: 3.8,
      directionalOnly: true,
    },
  ],
  evidence: [
    {
      stimulusLabel: "Corrected proof framing",
      responseId: "response-001",
      panelPersonaLabel: "Primary buyer",
      meanScore: 3.8,
      rawText: 'I would consider it after seeing the proof. <script>alert("x")</script>',
    },
  ],
};

describe("report templates (RB-4)", () => {
  it("generates non-empty markdown for all nine sections", () => {
    for (const { key } of REPORT_SECTIONS) {
      const md = generateSection(key, BASE_CTX);
      expect(md.length).toBeGreaterThan(0);
    }
  });

  it("never uses promissory or ranking-guarantee language (RB-5)", () => {
    for (const { key } of REPORT_SECTIONS) {
      const md = generateSection(key, BASE_CTX).toLowerCase();
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(md, `section "${key}" should not contain "${phrase}"`).not.toContain(phrase);
      }
    }
  });

  it("executive summary names the client brand and reports observed figures with a sample count", () => {
    const md = generateSection("executive_summary", BASE_CTX);
    expect(md).toContain("LedgerFox");
    expect(md).toContain("60%");
    expect(md).toContain("n=100");
    expect(md).toContain("providers: mock");
    expect(md).toContain("modes: ungrounded");
    expect(md).toContain("run date: 2026-07-04");
  });

  it("methodology is generated from the real run config and metric glossary", () => {
    const md = generateSection("method_confidence", BASE_CTX);
    expect(md).toContain("| Planned calls | 100 |");
    expect(md).toContain("| Run cost cap | $20.00 |");
    expect(md).toContain("valid or QA-reviewed");
    expect(md).toContain("Mention Rate");
    expect(md).toContain("Wilson 95% confidence interval");
    expect(md).toContain("Point estimate only");
  });

  it("recommendations section explicitly marks itself as an operator-completed scaffold, not final advice", () => {
    const md = generateSection("recommendations", BASE_CTX);
    expect(md.toLowerCase()).toContain("operator is responsible");
  });

  it("shows MOCK badge language when the run is mock, omits it otherwise", () => {
    const mockMd = generateSection("executive_summary", BASE_CTX);
    expect(mockMd).toContain("MOCK");
    const liveMd = generateSection("executive_summary", { ...BASE_CTX, isMock: false, runMode: "live_audit" });
    expect(liveMd).not.toContain("MOCK");
  });

  it("raw answer appendix points to the CSV/JSON export rather than duplicating raw text inline", () => {
    const md = generateSection("raw_answer_appendix", BASE_CTX);
    expect(md.toLowerCase()).toContain("csv/json");
  });

  it("raw answer appendix cites deterministic response excerpts for findings", () => {
    const md = generateSection("raw_answer_appendix", {
      ...BASE_CTX,
      findings: [
        {
          id: "finding-1",
          findingType: "source_concentration",
          severity: "low",
          title: "Citations concentrated on example.com",
          bodyMd: "example.com dominates citations",
          evidence: { domain: "example.com", n: 10 },
          directionalOnly: false,
        },
      ],
      evidenceExcerpts: [
        {
          findingId: "finding-1",
          findingType: "source_concentration",
          findingTitle: "Citations concentrated on example.com",
          responseId: "response-001",
          providerId: "mock",
          generationMode: "ungrounded",
          quote: 'Raw answer with <img src=x onerror="alert(1)"> and | table',
        },
      ],
    });
    expect(md).toContain("response-001");
    expect(md).toContain("&lt;img");
    expect(md).toContain("\\|");
    expect(md).not.toContain("<img");
  });

  it("misinformation register reports 'no claims' cleanly when there are none", () => {
    const md = generateSection("misinformation_register", BASE_CTX);
    expect(md.toLowerCase()).toContain("no contradicted");
  });
});

describe("resonance report templates (RR-3)", () => {
  it("generates non-empty markdown for all resonance sections", () => {
    for (const { key } of RESONANCE_REPORT_SECTIONS) {
      expect(generateResonanceSection(key, RESONANCE_CTX).length).toBeGreaterThan(0);
    }
  });

  it("states simulated/directional caveats without business-outcome promises", () => {
    const md = RESONANCE_REPORT_SECTIONS.map(({ key }) => generateResonanceSection(key, RESONANCE_CTX))
      .join("\n\n")
      .toLowerCase();
    expect(md).toContain("simulated");
    expect(md).toContain("directional");
    expect(md).toContain("uncalibrated anchor sets");
    expect(md).toContain("not predicted buying behavior");
    for (const phrase of RESONANCE_FORBIDDEN_PHRASES) {
      expect(md, `resonance report should not contain "${phrase}"`).not.toContain(phrase);
    }
  });

  it("escapes model-origin resonance evidence", () => {
    const md = generateResonanceSection("resonance_evidence", RESONANCE_CTX);
    expect(md).toContain("&lt;script&gt;");
    expect(md).not.toContain("<script>");
  });
});

// Model-derived text (claim text, evidence quotes, citation domains) comes
// from provider output — in live mode, from the open web. The print/PDF
// view renders generated markdown via marked + dangerouslySetInnerHTML,
// and marked passes raw HTML through, so unescaped model text would be an
// XSS path. Escaping happens at the template source (src/core/md.ts).
describe("model-derived text is escaped in generated markdown", () => {
  it("neutralizes raw HTML in claim text and evidence quotes", () => {
    const md = generateSection("misinformation_register", {
      ...BASE_CTX,
      misinformation: [
        {
          claimText: 'LedgerFox is <script>alert("pwned")</script> insecure',
          verdict: "contradicted",
          severity: "high",
          evidenceQuote: '<img src=x onerror="alert(1)">',
          factStatement: null,
        },
      ],
    });
    expect(md).not.toContain("<script>");
    expect(md).not.toContain("<img");
    expect(md).toContain("&lt;script&gt;");
  });

  it("neutralizes HTML and table-breaking pipes in citation domains", () => {
    const md = generateSection("sources", {
      ...BASE_CTX,
      citedSources: [{ domain: 'evil.example<script>x</script> | 999 |', total: 3 }],
    });
    expect(md).not.toContain("<script>");
    // An unescaped pipe would terminate the table cell early and let the
    // domain fabricate its own citation-count column.
    expect(md).toContain("\\|");
  });

  it("collapses newlines so a multi-line quote cannot escape its blockquote and inject block-level markdown", () => {
    const md = generateSection("misinformation_register", {
      ...BASE_CTX,
      misinformation: [
        {
          claimText: "line one\n### injected heading\n<div>block</div>",
          verdict: "unsupported",
          severity: "low",
          evidenceQuote: null,
          factStatement: null,
        },
      ],
    });
    expect(md).not.toContain("\n### injected heading");
    expect(md).not.toContain("<div>");
  });
});
