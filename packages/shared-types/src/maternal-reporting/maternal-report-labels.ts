/**
 * The Indonesian words the registers print for stored enum values (P25-T15).
 * Register cells are text on paper, so the translation lives with the layout
 * rather than in a UI catalog the CSV and PDF cannot reach.
 */
export const MATERNAL_REPORT_LABELS = {
  contraceptiveMethod: {
    PILL: 'Pil',
    INJECTABLE_1_MONTH: 'Suntik 1 bulan',
    INJECTABLE_3_MONTH: 'Suntik 3 bulan',
    CONDOM: 'Kondom',
    IUD: 'IUD/AKDR',
    IMPLANT: 'Implan',
  },
  acceptorType: { NEW: 'Baru', CONTINUING: 'Aktif' },
  discontinuationReason: {
    SIDE_EFFECT: 'Efek samping',
    WANTS_PREGNANCY: 'Ingin hamil',
    METHOD_CHANGE: 'Ganti metode',
    MEDICAL_REASON: 'Alasan medis',
    LOST_TO_FOLLOW_UP: 'Putus kontak',
    OTHER: 'Lainnya',
  },
  deliveryMode: {
    SPONTANEOUS_VAGINAL: 'Normal (spontan)',
    ASSISTED_VAGINAL: 'Pervaginam dengan tindakan',
    CAESAREAN: 'Seksio sesarea',
  },
  birthOutcome: { LIVE_BIRTH: 'Hidup', STILLBIRTH: 'Lahir mati' },
  sex: { MALE: 'L', FEMALE: 'P' },
  shkResult: { NORMAL: 'Normal', RECALL: 'Recall', INVALID_SAMPLE: 'Sampel tidak valid' },
  deathPatientKind: { MOTHER: 'Ibu', NEWBORN: 'Bayi baru lahir', OTHER: 'Lainnya' },
  payer: { JKN: 'JKN', GENERAL: 'Umum' },
  yes: 'Ya',
  no: 'Tidak',
  noVillage: 'Tanpa desa',
  empty: '',
} as const;
