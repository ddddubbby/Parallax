// Escaping for untrusted text interpolated into generated markdown (provider
// output, citation domains, project names, fact-sheet statements). The
// print/PDF view renders marked output via dangerouslySetInnerHTML, and
// marked passes raw HTML through, so generated markdown must neutralize any
// string that is not fixed template prose. Operator section edits remain a
// deliberate trust boundary: the operator directly owns edited markdown.
//
// & < > become entities (neutralizes raw-HTML/XSS through marked while
// still rendering as the literal character), Markdown control characters
// that can create links/images/emphasis/headings are escaped, | is
// backslash-escaped (would otherwise break table rows), and newlines
// collapse to spaces (would otherwise escape a blockquote or table row and
// let the text inject block-level markdown structure).
export function escapeModelText(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([`*_[\]()#!])/g, "\\$1")
    .replaceAll("|", "\\|")
    .replaceAll(/\r?\n/g, " ");
}
