import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';

const MIGRATION_SQL_PATH = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260912000000_require_patient_core_demographics',
  'migration.sql',
);

/**
 * The `P17-T05` acceptance criterion, tested against the guard that actually
 * ships.
 *
 * The SQL is **read out of the migration file** rather than restated here. A
 * copy would let the two drift, and the whole value of this guard is that it
 * runs at deploy time — a test asserting a paraphrase of it would pass while
 * the real thing did something else.
 *
 * Every case runs inside a transaction that is rolled back, so the suite never
 * leaves the schema altered. The abort case does not even need the rollback
 * arranged: the guard raising is what aborts the transaction, which is exactly
 * the behaviour under test.
 */
describe('require-core-demographics migration guard against Postgres', () => {
  const TEST_MARKER = 'p17-t05-guard';

  let prisma: PrismaService;
  let guardSql: string;

  /**
   * The `DO $$ … $$;` block at the top of the migration, without the three
   * `ALTER` statements that follow it.
   */
  function extractGuard(migrationSql: string): string {
    const start = migrationSql.indexOf('DO $$');
    const end = migrationSql.indexOf('$$;', start);
    if (start === -1 || end === -1) {
      throw new Error('Migration no longer contains a DO $$ … $$; guard block');
    }
    return migrationSql.slice(start, end + '$$;'.length);
  }

  /**
   * Drops the constraint, plants a row that violates it, and runs the guard —
   * all inside one transaction so the schema is restored either way.
   *
   * Dropping the constraint is what makes the case reachable at all: the
   * migration has already run against this database, so a violating row cannot
   * otherwise exist.
   */
  async function runGuardAgainstViolatingRow(missingColumn: string): Promise<void> {
    await prisma.executeTransaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `ALTER TABLE "patient_profiles" ALTER COLUMN "${missingColumn}" DROP NOT NULL`,
      );
      await tx.$executeRawUnsafe(`
        INSERT INTO "patient_profiles"
               ("id", "mrn", "full_name", "date_of_birth", "sex", "phone_number", "address", "updated_at")
        VALUES (gen_random_uuid(), '${TEST_MARKER}', '${TEST_MARKER}', DATE '1990-01-01', 'FEMALE',
                '628121000007', 'Bandung', NOW())
      `);
      await tx.$executeRawUnsafe(
        `UPDATE "patient_profiles" SET "${missingColumn}" = NULL WHERE "mrn" = '${TEST_MARKER}'`,
      );
      await tx.$executeRawUnsafe(guardSql);
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    guardSql = extractGuard(readFileSync(MIGRATION_SQL_PATH, 'utf8'));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('passes against a database with no incomplete profile', async () => {
    // The migration has already been applied to this database, so the columns
    // are NOT NULL and no violating row can exist. The guard must be silent.
    await expect(prisma.$executeRawUnsafe(guardSql)).resolves.not.toThrow();
  });

  it.each(['date_of_birth', 'sex', 'address'])(
    'aborts when a profile is missing %s',
    async (missingColumn) => {
      await expect(runGuardAgainstViolatingRow(missingColumn)).rejects.toThrow(/P17-T05/);
    },
  );

  it('names the offending record so an operator does not have to hunt for it', async () => {
    // Postgres's own SET NOT NULL failure names the column and not the row,
    // which leaves somebody searching a patient table mid-deploy.
    await expect(runGuardAgainstViolatingRow('date_of_birth')).rejects.toThrow(
      /Offending ids \(first 50\): [0-9a-f-]{36}/,
    );
  });

  it('changes nothing when it aborts', async () => {
    await expect(runGuardAgainstViolatingRow('address')).rejects.toThrow();

    // The planted row is gone with the transaction, and so is the dropped
    // constraint: a failed deploy leaves the database exactly as it was.
    const planted = await prisma.patientProfile.findMany({ where: { mrn: TEST_MARKER } });
    expect(planted).toHaveLength(0);
    const [column] = await prisma.$queryRaw<{ isNullable: string }[]>`
      SELECT "is_nullable" AS "isNullable"
        FROM "information_schema"."columns"
       WHERE "table_name" = 'patient_profiles' AND "column_name" = 'address'
    `;
    expect(column?.isNullable).toBe('NO');
  });

  it('never repairs a row instead of refusing', () => {
    // A DEFAULT, or an UPDATE filling in a placeholder birth date, is how a
    // made-up date of birth enters a medical record and stays there for
    // twenty-five years under PMK 24/2022. A failed deploy is the correct
    // outcome, so the guard is allowed to read and to raise, and nothing else.
    expect(guardSql).not.toMatch(/\bUPDATE\b/i);
    expect(guardSql).not.toMatch(/\bDEFAULT\b/i);
    expect(guardSql).not.toMatch(/\bDELETE\b/i);
    expect(guardSql).toMatch(/RAISE EXCEPTION/);
  });
});
