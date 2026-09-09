import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MAX_ROWS_PER_STATEMENT = 5000;

/**
 * The region master data is a generated SQL file (P19-T10), and CI never
 * seeds — so this reads the artefact that ships and asserts the things a
 * broken regeneration would get wrong silently: a header that no longer says
 * where the rows came from or under which licence, a level that vanished, a
 * statement too large for a comfortable transaction, or a write path that
 * would not be idempotent. The load itself is proven against Postgres in
 * `regions-seed.integration.spec.ts`.
 */
describe('Region master data seed', () => {
  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'wilayah.sql'), 'utf8');

  function readDeclaredCount(table: string): number {
    const match = new RegExp(`^--\\s+${table}\\s+(\\d+)$`, 'm').exec(seedSql);
    expect(match).not.toBeNull();
    return Number(match?.[1]);
  }

  function countTuplesPerStatement(table: string): number[] {
    const statements = seedSql.split(`INSERT INTO "${table}"`).slice(1);
    return statements.map((statement) => {
      const values = statement.slice(0, statement.indexOf(') AS seed('));
      return values.split('\n').filter((line) => line.startsWith("('")).length;
    });
  }

  it('records its source, licence and dataset commit in the header', () => {
    expect(seedSql).toContain('https://github.com/cahyadsn/wilayah');
    expect(seedSql).toContain('Licence: MIT');
    expect(seedSql).toMatch(/^-- Commit:\s+[0-9a-f]{7,40}$/m);
  });

  it('carries every level at the size the Kemendagri list has', () => {
    expect(readDeclaredCount('provinces')).toBe(38);
    expect(readDeclaredCount('regencies')).toBeGreaterThanOrEqual(500);
    expect(readDeclaredCount('districts')).toBeGreaterThanOrEqual(7000);
    expect(readDeclaredCount('villages')).toBeGreaterThanOrEqual(80000);
  });

  it('writes exactly the declared number of rows per level, in statements of bounded size', () => {
    for (const table of ['provinces', 'regencies', 'districts', 'villages']) {
      const perStatement = countTuplesPerStatement(table);
      expect(perStatement.reduce((sum, count) => sum + count, 0)).toBe(readDeclaredCount(table));
      expect(Math.max(...perStatement)).toBeLessThanOrEqual(MAX_ROWS_PER_STATEMENT);
    }
  });

  it('is idempotent by construction and never uses COPY', () => {
    const upserts = seedSql.match(/ON CONFLICT \("code"\) DO UPDATE/g) ?? [];
    const inserts = seedSql.match(/INSERT INTO "/g) ?? [];

    expect(upserts.length).toBe(inserts.length);
    expect(seedSql).not.toMatch(/COPY\s/);
  });

  it('inserts parents before children so the foreign keys hold mid-load', () => {
    const order = ['provinces', 'regencies', 'districts', 'villages'].map((table) =>
      seedSql.indexOf(`INSERT INTO "${table}"`),
    );

    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(order.every((index) => index > -1)).toBe(true);
  });
});
