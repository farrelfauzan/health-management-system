import {
  SatusehatResourceSkipReasonValue,
  SatusehatSubmissionResourcePayload,
} from '@hms/shared-types';

import {
  SatusehatCreatedResourceLocation,
  SatusehatFhirTransactionBundle,
} from '../../../common/satusehat/satusehat-fhir.types';

/**
 * Collects what one submission sent and what it left out, so the outbox row can
 * say more than "a bundle reached SATUSEHAT" (P21-T02).
 *
 * The service already knew all of this and threw it away: every id the platform
 * assigned was resolved to write back two of them, and every item dropped for a
 * missing catalog code was logged and forgotten. This gathers both during bundle
 * building, then pairs the ids in once the transaction response is parsed.
 *
 * **Nothing clinical is collected.** A skip is recorded as a category and a
 * count, never as the medication or procedure that was skipped, because the
 * resulting list is rendered on the ADMIN-gated integrations monitor. The local
 * record id is the only link back to what an item was, and following it needs a
 * doctor's permission (P21-T04).
 */
export class SatusehatResourceListBuilder {
  private readonly localRecordIdsByFullUrl = new Map<string, string>();
  private readonly skipped: SatusehatSubmissionResourcePayload[] = [];

  /**
   * Notes that the entry at `fullUrl` came from a local row, so the list can
   * point back at it. Entries that exist only in the bundle — the Composition,
   * a lab-only Encounter — are simply never registered, and their `localRecordId`
   * stays null.
   */
  trackLocalRecord(fullUrl: string, localRecordId: string): void {
    this.localRecordIdsByFullUrl.set(fullUrl, localRecordId);
  }

  /**
   * Records that `count` resources of `resourceType` were left out for one
   * reason. One row per skipped item rather than a single row with a count,
   * so the monitor can group them by reason without parsing anything.
   */
  recordSkipped(
    resourceType: string,
    reason: SatusehatResourceSkipReasonValue,
    count: number,
  ): void {
    for (let index = 0; index < count; index += 1) {
      this.skipped.push({
        resourceType,
        outcome: 'SKIPPED',
        skipReason: reason,
        satusehatId: null,
        localRecordId: null,
        isBackfilled: false,
      });
    }
  }

  /**
   * The finished list: one SENT row per bundle entry, plus every skip recorded
   * while the bundle was built.
   *
   * A SENT row whose id could not be paired keeps a null `satusehatId` — the
   * resource went, but `extractCreatedResources` could not tell which one it
   * became, so it can never be read back. That is deliberately not a skip:
   * calling it one would claim the national record lacks something it holds.
   */
  build(
    bundle: SatusehatFhirTransactionBundle,
    createdResources: ReadonlyMap<string, SatusehatCreatedResourceLocation>,
  ): SatusehatSubmissionResourcePayload[] {
    const sent = bundle.entry.map((entry) => ({
      resourceType: entry.request.url,
      outcome: 'SENT' as const,
      skipReason: null,
      satusehatId: createdResources.get(entry.fullUrl)?.id ?? null,
      localRecordId: this.localRecordIdsByFullUrl.get(entry.fullUrl) ?? null,
      isBackfilled: false,
    }));
    return [...sent, ...this.skipped];
  }
}
