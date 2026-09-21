import { SatusehatPostnatalVisit } from '@hms/shared-types';

import { PostnatalVisitBundleRow } from './postnatal-visit-bundle-row.types';

/**
 * The postnatal shape of one visit (P25-T12), or null for an ordinary one — and
 * null too for a visit whose birth record has gone, which then reports as an
 * ordinary encounter rather than failing the bundle.
 */
export function toSatusehatPostnatalVisit(
  row: PostnatalVisitBundleRow | null,
): SatusehatPostnatalVisit | null {
  if (row === null || row.pregnancyEpisode.deliveryRecord === null) {
    return null;
  }
  return {
    subject: row.subject,
    visitCode: row.visitCode,
    pregnancyEpisodeId: row.pregnancyEpisode.id,
    satusehatPostnatalEpisodeOfCareId: row.pregnancyEpisode.satusehatPostnatalEpisodeOfCareId,
    birthAt: row.pregnancyEpisode.deliveryRecord.birthAt,
    examination: row.subject === 'MOTHER' ? row.examination : null,
  };
}
