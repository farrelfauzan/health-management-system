const BYTE_ORDER_MARK = '﻿';

/**
 * Splits CSV content into rows of raw fields, honouring RFC 4180 quoting:
 * quoted fields may contain commas and newlines, and a doubled quote inside a
 * quoted field is a literal quote. Official terminology exports routinely carry
 * commas inside titles, so naive splitting silently corrupts them.
 *
 * Shared by the terminology importer and the terminology seed builder — the two
 * read the same official files, and a parser that drifted between them would
 * put different titles in the database than in the seed.
 */
export function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let field = '';
  let isQuoted = false;
  let index = 0;
  const source = content.replace(BYTE_ORDER_MARK, '');
  while (index < source.length) {
    const char = source[index];
    if (isQuoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 2;
        continue;
      }
      if (char === '"') {
        isQuoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      isQuoted = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      currentRow.push(field);
      field = '';
      index += 1;
      continue;
    }
    if (char === '\r') {
      index += 1;
      continue;
    }
    if (char === '\n') {
      currentRow.push(field);
      rows.push(currentRow);
      currentRow = [];
      field = '';
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }
  if (field.length > 0 || currentRow.length > 0) {
    currentRow.push(field);
    rows.push(currentRow);
  }
  return rows;
}
