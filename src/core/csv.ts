// Pure CSV serialization (EX-3). RFC 4180-ish: quote fields containing a
// comma, quote, or newline; double up embedded quotes. No project-layer
// imports (C-7).

function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
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
