import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { SatusehatHttpClient } from '../common/satusehat/satusehat-http.client';
import { SatusehatSearchBundle } from '../common/satusehat/satusehat.types';
import { parseSatusehatBackfillOptions } from './parse-satusehat-backfill-options';
import { resolveSatusehatEncounterId } from './resolve-satusehat-encounter-id';
import { summariseSatusehatEncounterIdResults } from './summarise-satusehat-encounter-id-results';
import {
  LegacySubmissionRow,
  SatusehatEncounterIdResult,
} from './satusehat-encounter-id-backfill.types';

const ENCOUNTER_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/encounter';
const REQUEST_SPACING_MS = 250;

/**
 * Fills `satusehat_encounter_id` on rows that were submitted before commit
 * `8b73614` fixed the transaction-response parser.
 *
 * Those rows are SUBMITTED with a null IHS id: the bundle *was* sent, so the
 * retry endpoint refuses them (409, correctly), and the provenance link
 * between the local encounter and the national record is simply missing —
 * green rows with an empty IHS column in the monitor. The platform still holds
 * them under their org-scoped encounter identifier, so they can be looked up.
 *
 * Idempotent: rows that already carry an id are not selected, so a second run
 * reports zero candidates. Requests are spaced, because the sandbox rate-limits
 * and a burst would trip the circuit breaker the client shares with the worker.
 *
 * Usage:
 *   `pnpm --filter @hms/api backfill:satusehat-encounter-ids -- --org-id=<id> [--dry-run]`
 */
async function backfillSatusehatEncounterIds(): Promise<void> {
  const options = parseSatusehatBackfillOptions(process.argv.slice(2));
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const configuredOrganizationId = context
      .get(ConfigService)
      .get<string>('SATUSEHAT_ORGANIZATION_ID');
    if (!options.organizationId || options.organizationId !== configuredOrganizationId) {
      // The identifier search is organisation-scoped. Running it with one
      // deployment's credentials against another's rows would find nothing and
      // report every row NOT_FOUND — a misleading answer rather than an error.
      console.error(
        'Refusing to run: --org-id must be given and must equal SATUSEHAT_ORGANIZATION_ID.',
      );
      process.exitCode = 1;
      return;
    }
    const prisma = context.get(PrismaService);
    const httpClient = context.get(SatusehatHttpClient);
    const rows = await prisma.$queryRaw<LegacySubmissionRow[]>`
      SELECT s."id", s."encounter_id"
      FROM "satusehat_submissions" s
      WHERE s."status" = 'SUBMITTED' AND s."satusehat_encounter_id" IS NULL
      ORDER BY s."created_at" ASC
    `;
    if (rows.length === 0) {
      console.log('Nothing to backfill: every SUBMITTED row already carries an IHS encounter id.');
      return;
    }
    console.log(
      `${options.isDryRun ? 'Dry run: ' : ''}resolving ${rows.length} legacy submission(s)...`,
    );
    const results = await resolveEachRow({
      rows,
      httpClient,
      prisma,
      organizationId: options.organizationId,
      isDryRun: options.isDryRun,
    });
    printSummary(results, options.isDryRun);
  } finally {
    await context.close();
  }
}

/**
 * Sequential on purpose. The circuit breaker inside `SatusehatHttpClient` is
 * shared with the submission worker, so a parallel burst here would open it
 * for live traffic; and when it does open mid-run the loop stops and reports
 * how far it got, since a re-run simply continues from the rows still unfilled.
 */
async function resolveEachRow(input: {
  rows: readonly LegacySubmissionRow[];
  httpClient: SatusehatHttpClient;
  prisma: PrismaService;
  organizationId: string;
  isDryRun: boolean;
}): Promise<SatusehatEncounterIdResult[]> {
  const results: SatusehatEncounterIdResult[] = [];
  for (const row of input.rows) {
    const encounterExists = await input.prisma.encounter.findUnique({
      where: { id: row.encounter_id },
      select: { id: true },
    });
    if (!encounterExists) {
      results.push({
        submissionId: row.id,
        encounterId: row.encounter_id,
        outcome: 'ENCOUNTER_GONE',
        satusehatEncounterId: null,
      });
      continue;
    }
    try {
      const bundle = await input.httpClient.sendRequest<SatusehatSearchBundle>({
        method: 'GET',
        path: '/Encounter',
        query: {
          identifier: `${ENCOUNTER_IDENTIFIER_SYSTEM_PREFIX}/${input.organizationId}|${row.encounter_id}`,
        },
      });
      const result = resolveSatusehatEncounterId({
        submissionId: row.id,
        encounterId: row.encounter_id,
        bundle,
      });
      results.push(result);
      if (result.outcome === 'FILLED' && !input.isDryRun) {
        await input.prisma.satusehatSubmission.update({
          where: { id: result.submissionId },
          data: { satusehatEncounterId: result.satusehatEncounterId },
        });
      }
    } catch (caughtError) {
      console.error(
        `Stopped after ${results.length} row(s): ${caughtError instanceof Error ? caughtError.message : String(caughtError)}`,
      );
      process.exitCode = 1;
      return results;
    }
    await delay(REQUEST_SPACING_MS);
  }
  return results;
}

function printSummary(results: readonly SatusehatEncounterIdResult[], isDryRun: boolean): void {
  const summary = summariseSatusehatEncounterIdResults(results);
  console.log(
    `${isDryRun ? 'Would fill' : 'Filled'} ${summary.filled} · not found ${summary.notFound} · ambiguous ${summary.ambiguous} · encounter deleted ${summary.encounterGone}`,
  );
  for (const result of results) {
    if (result.outcome !== 'FILLED') {
      console.log(`  ${result.outcome} submission=${result.submissionId} encounter=${result.encounterId}`);
    }
  }
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

backfillSatusehatEncounterIds().catch(() => {
  console.error('SATUSEHAT encounter id backfill failed');
  process.exit(1);
});
