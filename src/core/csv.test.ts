import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv (EX-3)", () => {
  it("serializes plain rows with a header", () => {
    const csv = toCsv([{ a: 1, b: "x" }], ["a", "b"]);
    expect(csv).toBe("a,b\r\n1,x");
  });

  it("quotes fields containing a comma", () => {
    const csv = toCsv([{ text: "hello, world" }], ["text"]);
    expect(csv).toBe('text\r\n"hello, world"');
  });

  it("quotes fields containing a newline", () => {
    const csv = toCsv([{ text: "line1\nline2" }], ["text"]);
    expect(csv).toBe('text\r\n"line1\nline2"');
  });

  it("doubles up embedded quotes", () => {
    const csv = toCsv([{ text: 'say "hi"' }], ["text"]);
    expect(csv).toBe('text\r\n"say ""hi"""');
  });

  it("renders null/undefined as an empty field", () => {
    const csv = toCsv([{ a: null, b: undefined }], ["a", "b"]);
    expect(csv).toBe("a,b\r\n,");
  });

  it("handles zero rows (header only)", () => {
    expect(toCsv([], ["a", "b"])).toBe("a,b");
  });

  // Fix D (post-M10-prep audit round 2, CWE-1236): raw model-origin text
  // (grounded citation titles, extracted claim text) flows into these
  // exports untrusted in live mode — a leading =/+/-/@ opens a live-formula
  // path the moment the CSV is opened in Excel/Sheets.
  describe("neutralizes spreadsheet formula injection (CWE-1236)", () => {
    it.each([
      ["=", "=SUM(A1:A10)"],
      ["+", "+1+1"],
      ["-", "-2+3"],
      ["@", "@SUM(1,2)"],
      ["tab", "\tmalicious"],
      ["CR", "\rmalicious"],
    ])("prefixes a leading %s with a single quote so it renders as text, not a formula", (_label, dangerous) => {
      const csv = toCsv([{ text: dangerous }], ["text"]);
      expect(csv).toContain(`'${dangerous}`);
      // Never bare — a spreadsheet app would still evaluate the unescaped value.
      expect(csv).not.toContain(`\r\n${dangerous}`);
    });

    it("still quotes a formula-guarded value that also contains a comma", () => {
      const csv = toCsv([{ text: "=A1,B1" }], ["text"]);
      expect(csv).toBe("text\r\n\"'=A1,B1\"");
    });

    it("leaves ordinary text (no leading danger character) untouched", () => {
      const csv = toCsv([{ text: "LedgerFox is a great tool" }], ["text"]);
      expect(csv).toBe("text\r\nLedgerFox is a great tool");
    });

    it("does not flag a dangerous character that isn't the first one", () => {
      const csv = toCsv([{ text: "revenue = cost + profit" }], ["text"]);
      expect(csv).toBe("text\r\nrevenue = cost + profit");
    });
  });
});
