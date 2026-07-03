// Escaping for MODEL-DERIVED text interpolated into generated markdown
// (claim text, evidence quotes, citation domains). In live mode that text
// ultimately comes from the open web via a provider, so it is untrusted:
// marked passes raw HTML through, and the print/PDF view renders the
// result via dangerouslySetInnerHTML. Operator-entered content (brand
// names, fact sheets, section edits) is NOT escaped — the operator already
// owns the report markdown and can write whatever they want in it.
//
// & < > become entities (neutralizes raw-HTML/XSS through marked while
// still rendering as the literal character), | is backslash-escaped
// (CommonMark-escapable; would otherwise break table rows), and newlines
// collapse to spaces (would otherwise escape a blockquote or table row and
// let the text inject block-level markdown structure).
export function escapeModelText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "\\|")
    .replaceAll(/\r?\n/g, " ");
}
