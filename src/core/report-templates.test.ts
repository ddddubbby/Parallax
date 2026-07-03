import { describe, expect, it } from "vitest";
import { generateSection, REPORT_SECTIONS, type ReportContext } from "./report-templates";

const BASE_CTX: ReportContext = {
  clientBrandName: "LedgerFox",
  competitorNames: ["SpendPilot", "Northstar AP"],
  runMode: "mock",
  isMock: true,
  isPartial: false,
  repetitions: 5,
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
  misinformation: [],
  citedSources: [],
  sentiment: { positive: 0.6, neutral: 0.3, mixed: 0.05, negative: 0.05 },
};

// RB-5: report tone is client-facing, cautious, evidence-led — never
// promises rankings or guaranteed remediation. These check for AFFIRMATIVE
// promissory phrasing specifically — a disclaimer like "not a guarantee of
// future behavior" is exactly what RB-5 wants and must not trip this check.
const FORBIDDEN_PHRASES = ["#1", "ranked first", "will rank", "will improve", "we promise", "is guaranteed", "we guarantee"];

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
    expect(md).toContain("100");
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

  it("misinformation register reports 'no claims' cleanly when there are none", () => {
    const md = generateSection("misinformation_register", BASE_CTX);
    expect(md.toLowerCase()).toContain("no contradicted");
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
