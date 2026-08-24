import { AdmissionConflictReason } from '@hms/shared-types';

/**
 * A concurrent write that lost to one of IMP-11's partial unique indexes:
 * one open assignment per bed, one ADMITTED admission per patient.
 *
 * Its own error type rather than a `ConflictException` thrown from the
 * repository, so the persistence layer keeps owning Prisma error codes and the
 * service keeps owning what the API says.
 */
export class AdmissionConflictError extends Error {
  constructor(public readonly reason: AdmissionConflictReason) {
    super(
      reason === 'bed-occupied'
        ? 'That bed is already occupied'
        : 'That patient already has an open admission',
    );
    this.name = 'AdmissionConflictError';
  }
}
