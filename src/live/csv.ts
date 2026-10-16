function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  // CSV quoting does not stop spreadsheet formula evaluation after import.
  const startsWithFormula = /^\s*[=+\-@]/.test(text);
  const isNumericLiteral = (typeof value === 'number' && Number.isFinite(value))
    || (typeof value === 'string' && /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i.test(value));
  const safeText = startsWithFormula && !isNumericLiteral ? "'" + text : text;
  return '"' + safeText.replaceAll('"', '""') + '"';
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const content = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
