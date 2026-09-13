import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { SatusehatSubmissionResourcePayload } from '@hms/shared-types';

import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { SatusehatHttpClient } from '../common/satusehat/satusehat-http.client';
import { SatusehatSearchBundle } from '../common/satusehat/satusehat.types';
import { buildBackfilledResourceRows } from './build-backfilled-resource-rows';
import { parseSatusehatBackfillOptions } from './parse-satusehat-backfill-options';

/**
 * Resource types searchable by visit, verified against the live platform
 * (P21-T01).
 *
 * `MedicationDispense` is **deliberately absent.** Its `?encounter=` parameter
 * is accepted, silently ignored, and answers with an unrelated row — two
 * different nonexistent encounter ids returned the same dispense, whose real
 * context was a third encounter. Including it, as the ticket originally
 * described, would stamp another visit's dispense onto every row this touches.
 * The working form needs `context=` **and** `subject=`, and `subject` is the
 * patient's IHS number, which is stored encrypted; decrypting one per row for a
 * provenance backfill is not worth it, so dispenses stay unknown here.
 *
 * `Medication` is absent for the same practical reason: it is reachable only
 * through each MedicationRequest's `medicationReference`, which is a second
 * request per prescription line for a link nothing reads.
 *
 * `AllergyIntolerance` and `Immunization` search by patient only, and allergy
 * ids are already stored locally — so allergies are copied from the local
 * column instead, and immunizations are left unknown rather than decrypting a
 * patient identifier.
 */
const ENCOUNTER_SEARCHABLE_TYPES = [
  'Condition',
  'Observation',
  'Procedure',
  'MedicationRequest',
  'ClinicalImpression',
  'Composition',
] as const;

const REQUEST_SPACING_MS = 250;

type BackfillCandidate = {
  id: string;
  encounter_id: string;
  satusehat_encounter_id: string;
};

type RowOutcome = 'FILLED' | 'NOTHING_FOUND' | 'ALREADY_LISTED';

type BackfillResult = {
  submissionId: string;
  outcome: RowOutcome;
  resourceCount: number;
};

/**
 * Rebuilds the P21-T02 resource list for encounters submitted before it shipped
 * (P21-T05).
 *
 * Those rows carry only their Encounter id, so the monitor's detail drawer and
 * the doctor's check have nothing to show for them. The platform still holds
 * what was sent, and it is searchable by visit — so the list can be
 * reconstructed, with one honest limitation: **what a submission left out cannot
 * be recovered.** Every row written here is flagged `isBackfilled` so the UI
 * says skipped items are unknown for it rather than implying nothing was
 * skipped.
 *
 * Idempotent: a submission that already has a list is skipped, so a second run
 * reports every row ALREADY_LISTED. Never touches PENDING or FAILED rows —
 * they have nothing on the platform to find.
 *
 * Requests are sequential and spaced, because the circuit breaker inside
 * `SatusehatHttpClient` is shared with the submission worker and a burst here
 * would open it for live traffic.
 *
 * Usage:
 *   `pnpm --filter @hms/api backfill:satusehat-resources -- --org-id=<id> [--dry-run]`
 */
async function backfillSatusehatResources(): Promise<void> {
  const options = parseSatusehatBackfillOptions(process.argv.slice(2));
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const configuredOrganizationId = context
      .get(ConfigService)
      .get<string>('SATUSEHAT_ORGANIZATION_ID');
    if (!options.organizationId || options.organizationId !== configuredOrganizationId) {
      // The identifier match is organisation-scoped, so running with one
      // deployment's credentials against another's rows would recover no local
      // ids and look like a clean run. A refusal is the honest outcome.
      console.error(
        'Refusing to run: --org-id must be given and must equal SATUSEHAT_ORGANIZATION_ID.',
      );
      process.exitCode = 1;
      return;
    }
    const prisma = context.get(PrismaService);
    const httpClient = context.get(SatusehatHttpClient);
    const candidates = await prisma.$queryRaw<BackfillCandidate[]>`
      SELECT s."id", s."encounter_id", s."satusehat_encounter_id"
      FROM "satusehat_submissions" s
      WHERE s."status" = 'SUBMITTED'
        AND s."kind" = 'ENCOUNTER'
        AND s."encounter_id" IS NOT NULL
        AND s."satusehat_encounter_id" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "satusehat_submission_resources" r
          WHERE r."submission_id" = s."id"
        )
      ORDER BY s."created_at" ASC
    `;
    if (candidates.length === 0) {
      console.log('Nothing to backfill: every submitted encounter already has a resource list.');
      return;
    }
    console.log(
      `${options.isDryRun ? 'Dry run: ' : ''}rebuilding the list for ${candidates.length} submission(s)...`,
    );
    const results = await backfillEachRow({
      candidates,
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

async function backfillEachRow(input: {
  candidates: readonly BackfillCandidate[];
  httpClient: SatusehatHttpClient;
  prisma: PrismaService;
  organizationId: string;
  isDryRun: boolean;
}): Promise<BackfillResult[]> {
  const results: BackfillResult[] = [];
  for (const candidate of input.candidates) {
    try {
      const rows = await collectResourceRows({
        httpClient: input.httpClient,
        organizationId: input.organizationId,
        satusehatEncounterId: candidate.satusehat_encounter_id,
      });
      const allergyRows = await collectLocalAllergyRows(input.prisma, candidate.encounter_id);
      const allRows = [...rows, ...allergyRows];
      if (allRows.length === 0) {
        results.push({ submissionId: candidate.id, outcome: 'NOTHING_FOUND', resourceCount: 0 });
        continue;
      }
      if (!input.isDryRun) {
        await input.prisma.satusehatSubmissionResource.createMany({
          data: allRows.map((row) => ({ submissionId: candidate.id, ...row })),
        });
      }
      results.push({
        submissionId: candidate.id,
        outcome: 'FILLED',
        resourceCount: allRows.length,
      });
    } catch (caughtError) {
      console.error(
        `Stopped after ${results.length} row(s): ${caughtError instanceof Error ? caughtError.message : String(caughtError)}`,
      );
      process.exitCode = 1;
      return results;
    }
  }
  return results;
}

/** Everything the platform holds for one visit, one searchable type at a time. */
async function collectResourceRows(input: {
  httpClient: SatusehatHttpClient;
  organizationId: string;
  satusehatEncounterId: string;
}): Promise<SatusehatSubmissionResourcePayload[]> {
  const rows: SatusehatSubmissionResourcePayload[] = [];
  // The Encounter itself is known from the outbox column and needs no search.
  rows.push({
    resourceType: 'Encounter',
    outcome: 'SENT',
    skipReason: null,
    satusehatId: input.satusehatEncounterId,
    localRecordId: null,
    isBackfilled: true,
  });
  for (const resourceType of ENCOUNTER_SEARCHABLE_TYPES) {
    const bundle = await input.httpClient.sendRequest<SatusehatSearchBundle>({
      method: 'GET',
      path: `/${resourceType}`,
      query: { encounter: input.satusehatEncounterId },
    });
    const resources = (bundle.entry ?? []).map((entry) => entry.resource);
    rows.push(
      ...buildBackfilledResourceRows({
        resourceType,
        resources,
        organizationId: input.organizationId,
      }),
    );
    await delay(REQUEST_SPACING_MS);
  }
  return rows;
}

/**
 * Allergy ids are already stored locally, so they are copied rather than
 * searched — `AllergyIntolerance` is searchable by patient only, and asking
 * would mean decrypting the patient's IHS number for a provenance link we
 * already hold.
 */
async function collectLocalAllergyRows(
  prisma: PrismaService,
  encounterId: string,
): Promise<SatusehatSubmissionResourcePayload[]> {
  const encounter = await prisma.encounter.findUnique({
    where: { id: encounterId },
    select: { patientId: true },
  });
  if (encounter === null) {
    return [];
  }
  const allergies = await prisma.patientAllergy.findMany({
    where: { patientId: encounter.patientId, satusehatAllergyId: { not: null } },
    select: { id: true, satusehatAllergyId: true },
  });
  return allergies.flatMap((allergy) =>
    allergy.satusehatAllergyId === null
      ? []
      : [
          {
            resourceType: 'AllergyIntolerance',
            outcome: 'SENT' as const,
            skipReason: null,
            satusehatId: allergy.satusehatAllergyId,
            localRecordId: allergy.id,
            isBackfilled: true,
          },
        ],
  );
}

function printSummary(results: readonly BackfillResult[], isDryRun: boolean): void {
  const filled = results.filter((result) => result.outcome === 'FILLED');
  const nothingFound = results.filter((result) => result.outcome === 'NOTHING_FOUND');
  const resourceTotal = filled.reduce((total, result) => total + result.resourceCount, 0);
  console.log(
    `${isDryRun ? 'Dry run summary' : 'Summary'}: ${filled.length} submission(s) listed (${resourceTotal} resource(s)), ${nothingFound.length} with nothing found on the platform.`,
  );
  if (nothingFound.length > 0) {
    console.log(
      'Rows with nothing found were reported SUBMITTED but the platform holds no resources for that visit — worth checking one by hand before assuming it is a search problem.',
    );
  }
  if (isDryRun) {
    console.log('No rows were written. Re-run without --dry-run to apply.');
  }
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

void backfillSatusehatResources();
