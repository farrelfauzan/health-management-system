import { PrismaClient } from '../../generated/prisma/client';

/**
 * Adapter-only wire types for medical record number allocation. Infrastructure
 * details of how a sequence becomes a printable MRN never leave the API, so
 * they stay here rather than in `@hms/shared-types`.
 */
export type MrnConfig = {
  /** Optional facility prefix, e.g. `RM-`. Empty by default. */
  readonly prefix: string;
  /** Zero-padding width of the numeric part. */
  readonly width: number;
};

/**
 * The transaction-scoped Prisma client handed to the allocator. Allocation must
 * share the caller's transaction so a rolled-back patient create rolls back
 * with it, which is why the client is passed in rather than injected.
 */
export type MrnTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

/** Single row returned by the atomic `UPDATE … RETURNING` allocation. */
export type MrnAllocationRow = {
  readonly allocated: bigint;
};
