import type { DocumentCategoryValue } from '#document-management/schemas';
import type {
  NonCapitationClaimStatusValue,
  NonCapitationServiceTypeValue,
} from '#bpjs-non-capitation/schemas';
import type { NonCapitationExaminerProfession } from '#bpjs-non-capitation/types';

/**
 * The Indonesian labels the CSV and the PDF letter print (P25-T16). The web
 * reads its own copy from `operations.json`; these are for the files the
 * induk receives, which are in Indonesian whatever the operator's locale.
 */
export const NON_CAPITATION_LABELS: {
  readonly serviceType: Readonly<Record<NonCapitationServiceTypeValue, string>>;
  readonly status: Readonly<Record<NonCapitationClaimStatusValue, string>>;
  readonly profession: Readonly<Record<NonCapitationExaminerProfession, string>>;
  readonly documentCategory: Readonly<Partial<Record<DocumentCategoryValue, string>>>;
} = {
  serviceType: {
    ANTENATAL_MIDWIFE: 'ANC oleh bidan',
    ANTENATAL_DOCTOR: 'ANC oleh dokter',
    ANTENATAL_DOCTOR_ULTRASOUND: 'ANC oleh dokter dengan USG',
    PRE_REFERRAL: 'Pra rujukan',
    DELIVERY_WITH_DOCTOR: 'Persalinan, tim dengan dokter',
    DELIVERY_HEALTH_WORKER_TEAM: 'Persalinan, tim 2 nakes tanpa dokter',
    POSTNATAL_MOTHER_NEWBORN: 'PNC ibu dan bayi (kunjungan 1-3)',
    POSTNATAL_MOTHER: 'PNC ibu (kunjungan 4)',
    FAMILY_PLANNING_IUD: 'KB AKDR',
    FAMILY_PLANNING_IMPLANT: 'KB implan',
    FAMILY_PLANNING_INJECTION: 'KB suntik',
  },
  status: {
    OPEN: 'Belum dikirim',
    DUE_SOON: 'Segera jatuh tempo',
    LATE: 'Terlambat',
    EXPIRED: 'Kedaluwarsa',
    SENT: 'Sudah dikirim',
  },
  profession: {
    DOCTOR: 'Dokter',
    MIDWIFE: 'Bidan',
  },
  documentCategory: {
    KIA_BOOK_COPY: 'Salinan buku KIA / kartu ibu',
    PARTOGRAPH: 'Salinan partograf',
    BIRTH_CERTIFICATE: 'Surat keterangan kelahiran',
    REFERRAL_LETTER: 'Surat rujukan',
    FAMILY_PLANNING_BOOK: 'Buku peserta KB',
    CONSENT_FORM: 'Persetujuan tindakan',
  },
};
