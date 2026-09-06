import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The seeded catalog is what a clinic actually starts from, and CI runs
 * `migrate deploy` without ever seeding — so no integration spec can observe
 * these rows. This reads the SQL, which is the artefact that ships, and
 * asserts the invariants a broken catalog would violate silently: a numeric
 * test with no unit renders an entry box with no idea what it is measuring, a
 * numeric test with no range flags nothing, a duplicated LOINC code sends two
 * local tests under one national identity, and a panel naming a test that does
 * not exist is a panel nobody can order.
 */
describe('Laboratory catalog seed', () => {
  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'lab-catalog.sql'), 'utf8');

  type SeededTest = {
    code: string;
    loincCode: string | null;
    resultType: string;
    unit: string | null;
    codedOptionCount: number;
  };

  function extractSection(startMarker: string): string[] {
    const start = seedSql.indexOf(startMarker);
    expect(start).toBeGreaterThan(-1);
    const body = seedSql.slice(start + startMarker.length);
    const end = body.indexOf('\n)');
    return body
      .slice(0, end)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('('));
  }

  const seededTests: SeededTest[] = extractSection(
    "WITH seed_lab_tests(code, name, loinc_code, loinc_display, specimen_type, result_type, unit, decimals, coded_options) AS (\n  VALUES",
  ).map((line) => {
    const code = /^\('([^']+)'/.exec(line)?.[1] ?? '';
    const loincCode = /, (?:NULL|'([^']*)'), (?:NULL|'(?:[^']|'')*'), '(?:WHOLE_BLOOD|SERUM|PLASMA|URINE|STOOL|SPUTUM|SWAB|OTHER)'/.exec(
      line,
    )?.[1];
    const resultType = /'(NUMERIC|TEXT|CODED)'/.exec(line)?.[1] ?? '';
    const unit = /'(?:NUMERIC|TEXT|CODED)', (?:NULL|'([^']*)')/.exec(line)?.[1];
    const codedOptionCount = line.includes('ARRAY[]::TEXT[]')
      ? 0
      : (/ARRAY\[([^\]]*)\]::TEXT\[\]/.exec(line)?.[1]?.split(',').length ?? 0);
    return {
      code,
      loincCode: loincCode ?? null,
      resultType,
      unit: unit ?? null,
      codedOptionCount,
    };
  });

  const seededRangeTestCodes = extractSection(
    'WITH seed_ranges(test_code, sex, low, high, critical_low, critical_high, text_normal) AS (\n  VALUES',
  ).map((line) => /^\('([^']+)'/.exec(line)?.[1] ?? '');

  const seededPanelCodes = extractSection('WITH seed_panels(code, name) AS (\n  VALUES').map(
    (line) => /^\('([^']+)'/.exec(line)?.[1] ?? '',
  );

  const seededMembers = extractSection(
    'WITH seed_members(panel_code, test_code, sort_order) AS (\n  VALUES',
  ).map((line) => {
    const matched = /^\('([^']+)', '([^']+)', (\d+)\)/.exec(line);
    return { panelCode: matched?.[1] ?? '', testCode: matched?.[2] ?? '', sortOrder: Number(matched?.[3]) };
  });

  it('seeds a catalog worth starting from', () => {
    expect(seededTests.length).toBeGreaterThanOrEqual(40);
    expect(seededPanelCodes.length).toBeGreaterThanOrEqual(5);
  });

  it('gives every NUMERIC test a unit', () => {
    const numericWithoutUnit = seededTests
      .filter((test) => test.resultType === 'NUMERIC' && test.unit === null)
      .map((test) => test.code);

    expect(numericWithoutUnit).toEqual([]);
  });

  it('gives every NUMERIC test at least one reference range', () => {
    const numericWithoutRange = seededTests
      .filter(
        (test) => test.resultType === 'NUMERIC' && !seededRangeTestCodes.includes(test.code),
      )
      .map((test) => test.code);

    expect(numericWithoutRange).toEqual([]);
  });

  it('gives every CODED test its option list', () => {
    const codedWithoutOptions = seededTests
      .filter((test) => test.resultType === 'CODED' && test.codedOptionCount === 0)
      .map((test) => test.code);

    expect(codedWithoutOptions).toEqual([]);
  });

  it('never repeats a LOINC code — one code is one observation', () => {
    const loincCodes = seededTests
      .map((test) => test.loincCode)
      .filter((code): code is string => code !== null);

    expect(loincCodes.length).toBe(new Set(loincCodes).size);
  });

  it('never repeats a local code', () => {
    const codes = seededTests.map((test) => test.code);

    expect(codes.length).toBe(new Set(codes).size);
  });

  it('names only tests that exist from every panel', () => {
    const testCodes = new Set(seededTests.map((test) => test.code));
    const missing = seededMembers
      .filter((member) => !testCodes.has(member.testCode))
      .map((member) => `${member.panelCode}/${member.testCode}`);

    expect(missing).toEqual([]);
  });

  it('names only panels that exist from every member row', () => {
    const panelCodes = new Set(seededPanelCodes);
    const orphaned = seededMembers
      .filter((member) => !panelCodes.has(member.panelCode))
      .map((member) => member.panelCode);

    expect(orphaned).toEqual([]);
  });

  it('numbers each panel’s members from one, without gaps or ties', () => {
    for (const panelCode of seededPanelCodes) {
      const orders = seededMembers
        .filter((member) => member.panelCode === panelCode)
        .map((member) => member.sortOrder)
        .sort((left, right) => left - right);

      expect(orders).toEqual(orders.map((_, index) => index + 1));
    }
  });

  it('states the LOINC licence in the header, since the codes are copied under it', () => {
    expect(seedSql).toContain('Regenstrief Institute');
    expect(seedSql).toContain('loinc.org/license');
  });

  it('is idempotent by construction — every insert names its conflict target', () => {
    expect(seedSql).toContain('ON CONFLICT ("code") DO UPDATE');
    expect(seedSql).toContain('ON CONFLICT ("panel_id", "lab_test_id") DO UPDATE');
  });
});
