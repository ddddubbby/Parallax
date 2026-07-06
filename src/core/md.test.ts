import { describe, expect, it } from "vitest";
import { marked } from "marked";
import { escapeModelText } from "./md";

describe("escapeModelText", () => {
  it("neutralizes HTML and markdown link/image syntax from model-origin text", () => {
    const escaped = escapeModelText(
      '<img src=x onerror="alert(1)"> [click](javascript:alert(2)) ![x](javascript:alert(3))',
    );
    const html = marked.parse(escaped, { async: false }) as string;

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
    expect(html).toContain("&lt;img");
    expect(escaped).toContain("\\[click\\]\\(javascript:alert\\(2\\)\\)");
  });
});
