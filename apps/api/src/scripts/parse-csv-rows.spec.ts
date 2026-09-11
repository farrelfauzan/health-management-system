import { parseCsvRows } from './parse-csv-rows';

describe('parseCsvRows', () => {
  it('splits a plain file into rows of fields', () => {
    const actualRows = parseCsvRows('code,display\nA00,Cholera\n');

    expect(actualRows).toEqual([
      ['code', 'display'],
      ['A00', 'Cholera'],
    ]);
  });

  it('keeps a comma that sits inside a quoted title', () => {
    const actualRows = parseCsvRows('code,display\nA00.0,"Cholera, biovar cholerae"\n');

    expect(actualRows[1]).toEqual(['A00.0', 'Cholera, biovar cholerae']);
  });

  it('reads a doubled quote as one literal quote', () => {
    const actualRows = parseCsvRows('code,display\nE10,"Child""s diabetes"\n');

    expect(actualRows[1]).toEqual(['E10', 'Child"s diabetes']);
  });

  it('keeps a newline that sits inside a quoted title', () => {
    const actualRows = parseCsvRows('code,display\nA01,"Typhoid\nfever"\n');

    expect(actualRows).toHaveLength(2);
    expect(actualRows[1]).toEqual(['A01', 'Typhoid\nfever']);
  });

  it('strips a byte order mark from the first field', () => {
    const actualRows = parseCsvRows('﻿code,display\nA00,Cholera\n');

    expect(actualRows[0]).toEqual(['code', 'display']);
  });

  it('ignores carriage returns so a CRLF export parses as rows', () => {
    const actualRows = parseCsvRows('code,display\r\nA00,Cholera\r\n');

    expect(actualRows).toEqual([
      ['code', 'display'],
      ['A00', 'Cholera'],
    ]);
  });

  it('keeps a final row that has no trailing newline', () => {
    const actualRows = parseCsvRows('code,display\nZ99,Unspecified');

    expect(actualRows[1]).toEqual(['Z99', 'Unspecified']);
  });

  it('returns no rows for empty content', () => {
    expect(parseCsvRows('')).toEqual([]);
  });
});
