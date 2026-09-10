import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

const SEED_TIMEOUT_MS = 120_000;
const REGION_TABLES = ['provinces', 'regencies', 'districts', 'villages'] as const;

type RegionTable = (typeof REGION_TABLES)[number];

/**
 * Loads `prisma/wilayah.sql` into the real database the way `pnpm db:seed`
 * does and checks what a clinic would see afterwards (P19-T10): every level
 * has the row count the file declares, and running it again changes nothing
 * — which is what makes it safe to leave in the seed script for every
 * environment. Plain `pg` rather than Prisma, because the file is a
 * multi-statement transaction and that is the simple-query protocol's job.
 */
describe('Region master data seed against Postgres', () => {
  const seedSql = readFileSync(resolve(process.cwd(), 'prisma', 'wilayah.sql'), 'utf8');
  let client: Client;

  function readDeclaredCount(table: RegionTable): number {
    const match = new RegExp(`^--\\s+${table}\\s+(\\d+)$`, 'm').exec(seedSql);
    return Number(match?.[1]);
  }

  async function countRows(table: RegionTable): Promise<number> {
    const result = await client.query<{ count: string }>(`SELECT count(*) AS count FROM "${table}"`);
    return Number(result.rows[0]?.count);
  }

  async function readLatestUpdate(): Promise<string | null> {
    const result = await client.query<{ latest: string | null }>(
      'SELECT max("updated_at")::text AS latest FROM "villages"',
    );
    return result.rows[0]?.latest ?? null;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it(
    'loads every level to its declared size and re-running touches nothing',
    async () => {
      await client.query(seedSql);

      for (const table of REGION_TABLES) {
        expect(await countRows(table)).toBe(readDeclaredCount(table));
      }
      const inputLatestUpdate = await readLatestUpdate();

      await client.query(seedSql);

      expect(await readLatestUpdate()).toBe(inputLatestUpdate);
      expect(await countRows('villages')).toBe(readDeclaredCount('villages'));
    },
    SEED_TIMEOUT_MS,
  );

  it('keeps the chain intact: every child names a parent that exists', async () => {
    const orphans = await client.query<{ orphans: string }>(`
      SELECT
        (SELECT count(*) FROM "regencies" r LEFT JOIN "provinces" p ON p."code" = r."province_code" WHERE p."code" IS NULL)
        + (SELECT count(*) FROM "districts" d LEFT JOIN "regencies" r ON r."code" = d."regency_code" WHERE r."code" IS NULL)
        + (SELECT count(*) FROM "villages" v LEFT JOIN "districts" d ON d."code" = v."district_code" WHERE d."code" IS NULL)
        AS orphans
    `);

    expect(Number(orphans.rows[0]?.orphans)).toBe(0);
  });
});
