import { Injectable } from '@nestjs/common';
import type { AnalyticsOperationsView } from '@hms/shared-types';

/**
 * The operations dashboard (P29-T01 skeleton). Answers with the read instant
 * only; the visit, poli and appointment figures land in P29-T04 through an
 * analytics repository that reads the other modules' tables (D-049).
 */
@Injectable()
export class AnalyticsOperationsService {
  /** Reads the operations dashboard as of now. */
  getOperationsView(): AnalyticsOperationsView {
    return { asOf: new Date().toISOString() };
  }
}
