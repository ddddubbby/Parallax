// Pure CSV serialization (EX-3). RFC 4180-ish: quote fields containing a
// comma, quote, or newline; double up embedded quotes. No project-layer
// imports (C-7).

// Spreadsheet formula-injection guard (CWE-1236): a cell value starting
// with =, +, -, @, tab, CR, or LF can execute as a live formula the moment
// someone opens the CSV in Excel/Sheets. Exports include raw model-origin
// text (D-040's threat model: untrusted in live mode — raw responses,
// citation titles/domains, extracted JSON), so every cell gets this guard,
// not just ones a human typed. A leading single quote is the standard
// mitigation: spreadsheet apps render the cell as literal text instead of
// evaluating it, and the quote is invisible to a plain CSV/text reader —
// JSON export (EX-3's other format) keeps raw values, since it's read as
// evidence, not opened as a spreadsheet.
const FORMULA_INJECTION_PREFIX_RE = /^[=+\-@\t\r\n]/;

function escapeCsvField(value: unknown): string {
  let str = value === null || value === undefined ? "" : String(value);
  if (FORMULA_INJECTION_PREFIX_RE.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T & string)[]): string {
  const header = columns.map(escapeCsvField).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(row[c])).join(","));
  return [header, ...lines].join("\r\n");
}
