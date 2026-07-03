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
});
