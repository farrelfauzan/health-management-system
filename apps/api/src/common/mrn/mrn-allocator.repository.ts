import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveMrnConfig } from './mrn.config';
import { MrnAllocationRow, MrnConfig, MrnTransactionClient } from './mrn.types';

/**
 * The single-facility counter row. HMS ships one facility per deployment, so
 * every allocation targets this sentinel; a multi-facility deployment adds rows
 * keyed by real facility ids without changing the statement.
 */
const SINGLE_FACILITY_ID = '00000000-0000-0000-0000-000000000000';
const MAXIMUM_SEQUENCE_DIGITS = 18;
const DIGITS_PATTERN = /^[0-9]+$/;

/**
 * Allocates medical record numbers from `mrn_counters`.
 *
 * Allocation is one atomic `UPDATE … RETURNING` rather than `MAX(mrn) + 1`:
 * concurrent front-desk and self-service registrations race, and a duplicate
 * MRN silently merges two patients' histories. Every method takes the caller's
 * transaction client so the number is allocated inside the same transaction as
 * the patient insert. A failed create therefore rolls the counter back too and
 * the number goes to the next caller — safe, because it was never committed to
 * a record. Numbers that *do* commit are never reissued and never renumbered.
 */
@Injectable()
export class MrnAllocatorRepository {
  private readonly config: MrnConfig;

  constructor(configService: ConfigService) {
    this.config = resolveMrnConfig(configService);
  }

  /**
   * Consumes the next sequence value and renders it in the configured format.
   */
  async allocateMrn(tx: MrnTransactionClient): Promise<string> {
    const rows = await tx.$queryRaw<MrnAllocationRow[]>`
      UPDATE "mrn_counters"
         SET "next_value" = "next_value" + 1,
             "updated_at" = NOW()
       WHERE "facility_id" = ${SINGLE_FACILITY_ID}::uuid
      RETURNING "next_value" - 1 AS "allocated"
    `;

    const allocated = rows[0]?.allocated;

    if (allocated === undefined) {
      throw new Error('MRN counter row is missing: run database migrations before creating patients');
    }

    return this.formatMrn(allocated);
  }

  /**
   * Lifts the counter past an externally supplied MRN so a legacy import can
   * never be re-allocated later. MRNs that carry no usable sequence — a foreign
   * vendor's opaque code, say — leave the counter untouched: they cannot
   * collide with a generated number in the first place.
   */
  async raiseCounterAbove(tx: MrnTransactionClient, mrn: string): Promise<void> {
    const sequence = this.extractSequence(mrn);

    if (sequence === null) {
      return;
    }

    await tx.$executeRaw`
      UPDATE "mrn_counters"
         SET "next_value" = GREATEST("next_value", ${sequence}::bigint + 1),
             "updated_at" = NOW()
       WHERE "facility_id" = ${SINGLE_FACILITY_ID}::uuid
    `;
  }

  /**
   * Renders a sequence value as a zero-padded, optionally prefixed MRN. Values
   * wider than the configured padding are never truncated — the number stays
   * correct and simply grows.
   */
  formatMrn(sequence: bigint): string {
    return `${this.config.prefix}${sequence.toString().padStart(this.config.width, '0')}`;
  }

  /**
   * Reads the numeric part out of an MRN that matches the configured format.
   * Returns `null` when the value is not one this deployment could have
   * generated.
   */
  extractSequence(mrn: string): bigint | null {
    if (!mrn.startsWith(this.config.prefix)) {
      return null;
    }

    const digits = mrn.slice(this.config.prefix.length);

    if (!DIGITS_PATTERN.test(digits) || digits.length > MAXIMUM_SEQUENCE_DIGITS) {
      return null;
    }

    return BigInt(digits);
  }
}
