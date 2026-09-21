import {
  PostnatalExaminationRecord,
  PostnatalSubjectValue,
  PostnatalVisitCodeValue,
} from '@hms/shared-types';

/** The postnatal visit one bundle reports, as the encounter read returns it (P25-T12). */
export type PostnatalVisitBundleRow = {
  subject: PostnatalSubjectValue;
  visitCode: PostnatalVisitCodeValue | null;
  pregnancyEpisode: {
    id: string;
    satusehatPostnatalEpisodeOfCareId: string | null;
    deliveryRecord: { birthAt: Date } | null;
  };
  examination: PostnatalExaminationRecord | null;
};
