'use client';

import {
  DOCUMENT_INGEST_STATUSES,
  DOCUMENT_VISIBILITIES,
  type DocumentIngestStatusValue,
  type DocumentVisibilityValue,
} from '@hms/shared-types';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

/** The sentinel for "no filter", since a Select cannot hold `undefined`. */
export const CLINIC_DOCUMENT_FILTER_ALL = 'ALL';

type ClinicDocumentFiltersProps = {
  ingestStatus: DocumentIngestStatusValue | typeof CLINIC_DOCUMENT_FILTER_ALL;
  visibility: DocumentVisibilityValue | typeof CLINIC_DOCUMENT_FILTER_ALL;
  onIngestStatusChange: (
    value: DocumentIngestStatusValue | typeof CLINIC_DOCUMENT_FILTER_ALL,
  ) => void;
  onVisibilityChange: (
    value: DocumentVisibilityValue | typeof CLINIC_DOCUMENT_FILTER_ALL,
  ) => void;
};

/**
 * Status and visibility filters.
 *
 * These two and not more. Status is how an admin finds the documents that
 * failed to ingest — the ones sitting in the corpus answering nothing — and
 * visibility is how they audit what the patient channel can reach. Both are
 * questions with a consequence; language and purpose are not, and a filter bar
 * that offers every column teaches people to ignore it.
 */
export function ClinicDocumentFilters({
  ingestStatus,
  visibility,
  onIngestStatusChange,
  onVisibilityChange,
}: ClinicDocumentFiltersProps) {
  const t = useTranslations('clinicCorpus.filters');

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-2">
        <Label htmlFor="clinic-document-filter-status">{t('status')}</Label>
        <Select
          value={ingestStatus}
          onValueChange={(value) =>
            onIngestStatusChange(
              value as DocumentIngestStatusValue | typeof CLINIC_DOCUMENT_FILTER_ALL,
            )
          }
        >
          <SelectTrigger id="clinic-document-filter-status" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CLINIC_DOCUMENT_FILTER_ALL}>{t('all')}</SelectItem>
            {DOCUMENT_INGEST_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`statuses.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="clinic-document-filter-visibility">{t('visibility')}</Label>
        <Select
          value={visibility}
          onValueChange={(value) =>
            onVisibilityChange(
              value as DocumentVisibilityValue | typeof CLINIC_DOCUMENT_FILTER_ALL,
            )
          }
        >
          <SelectTrigger id="clinic-document-filter-visibility" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CLINIC_DOCUMENT_FILTER_ALL}>{t('all')}</SelectItem>
            {DOCUMENT_VISIBILITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`visibilities.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
