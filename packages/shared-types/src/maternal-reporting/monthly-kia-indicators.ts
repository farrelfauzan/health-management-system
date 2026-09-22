import { CONTRACEPTIVE_METHODS } from '#maternal-care/family-planning-schemas';
import { countAntenatalVisitsByCode } from '#maternal-reporting/count-antenatal-visits-by-code';
import { countClinicDeliveries } from '#maternal-reporting/count-clinic-deliveries';
import { countCompletedPostnatalSeries } from '#maternal-reporting/count-completed-postnatal-series';
import { countFamilyPlanningAcceptors } from '#maternal-reporting/count-family-planning-acceptors';
import { countHb0Immunizations } from '#maternal-reporting/count-hb0-immunizations';
import { countPostnatalVisitsByCode } from '#maternal-reporting/count-postnatal-visits-by-code';
import { MATERNAL_REPORT_LABELS } from '#maternal-reporting/maternal-report-labels';
import type { MonthlyKiaIndicatorDefinition, MonthlyKiaSource } from '#maternal-reporting/types';

function buildFamilyPlanningIndicators(kind: 'NEW' | 'ACTIVE'): MonthlyKiaIndicatorDefinition[] {
  const prefix = kind === 'NEW' ? 'KB baru' : 'KB aktif';
  const rule =
    kind === 'NEW'
      ? 'Kursus KB peserta baru (bukan lanjutan dari tempat lain) yang dimulai pada bulan laporan.'
      : 'Kursus KB yang masih berjalan pada hari terakhir bulan laporan: dimulai pada atau sebelum hari itu dan belum dihentikan.';
  return CONTRACEPTIVE_METHODS.map((method) => ({
    id: `kb${kind === 'NEW' ? 'New' : 'Active'}_${method}`,
    label: `${prefix} — ${MATERNAL_REPORT_LABELS.contraceptiveMethod[method]}`,
    definition: rule,
    compute: (source: MonthlyKiaSource): number =>
      countFamilyPlanningAcceptors(source, method, kind),
  }));
}

/**
 * The monthly KIA indicator set (P25-T15, FR-RPT-02), **provisional** under
 * D-040 until the pilot puskesmas' sheet is compared side by side (Q11). It
 * follows the ticket's list, not the PWS-KIA 2010 pedoman, which predates K6
 * and KF4. Every figure is a pure count over one month resolved in the
 * clinic's timezone; the rule for each is the `definition` printed beside it.
 */
export const MONTHLY_KIA_INDICATORS: readonly MonthlyKiaIndicatorDefinition[] = [
  {
    id: 'k1',
    label: 'K1 (K1 akses + K1 murni)',
    definition:
      'Kunjungan antenatal berkode K1A atau K1M yang dimulai pada bulan laporan. Kode dibekukan saat pemeriksaan ditutup; kunjungan yang belum ditutup tidak dihitung.',
    compute: (source) => countAntenatalVisitsByCode(source, ['K1A', 'K1M']),
  },
  {
    id: 'k1Murni',
    label: 'K1 murni',
    definition:
      'Kunjungan berkode K1M: kontak pertama pada trimester 1 (usia kehamilan ≤ 12 minggu, konvensi program).',
    compute: (source) => countAntenatalVisitsByCode(source, ['K1M']),
  },
  {
    id: 'k1Akses',
    label: 'K1 akses',
    definition: 'Kunjungan berkode K1A: kontak pertama setelah trimester 1 (> 12 minggu).',
    compute: (source) => countAntenatalVisitsByCode(source, ['K1A']),
  },
  {
    id: 'k4',
    label: 'K4',
    definition: 'Kunjungan berkode K4 yang dimulai pada bulan laporan.',
    compute: (source) => countAntenatalVisitsByCode(source, ['K4']),
  },
  {
    id: 'k6',
    label: 'K6',
    definition: 'Kunjungan berkode K6 yang dimulai pada bulan laporan.',
    compute: (source) => countAntenatalVisitsByCode(source, ['K6']),
  },
  {
    id: 'deliveriesByHealthWorker',
    label: 'Persalinan ditolong tenaga kesehatan di klinik',
    definition:
      'Catatan persalinan dengan waktu lahir pada bulan laporan. Setiap persalinan di klinik ditolong tenaga kesehatan terdaftar; bayi kembar dihitung satu persalinan.',
    compute: countClinicDeliveries,
  },
  {
    id: 'kfComplete',
    label: 'KF lengkap (KF1–KF4)',
    definition:
      'Ibu nifas yang keempat kunjungan KF1, KF2, KF3 dan KF4 terpenuhi, dihitung pada bulan kunjungan terakhirnya.',
    compute: (source) =>
      countCompletedPostnatalSeries(source, ['KF1', 'KF2', 'KF3', 'KF4'], (visit) =>
        visit.subject === 'MOTHER' ? visit.pregnancyEpisodeId : null,
      ),
  },
  {
    id: 'kn1',
    label: 'KN1',
    definition: 'Kunjungan neonatal berkode KN1 (6–48 jam) yang dimulai pada bulan laporan.',
    compute: (source) => countPostnatalVisitsByCode(source, ['KN1']),
  },
  {
    id: 'knComplete',
    label: 'KN lengkap (KN1–KN3)',
    definition:
      'Bayi yang ketiga kunjungan KN1, KN2 dan KN3 terpenuhi, dihitung pada bulan kunjungan terakhirnya.',
    compute: (source) =>
      countCompletedPostnatalSeries(source, ['KN1', 'KN2', 'KN3'], (visit) =>
        visit.subject === 'NEWBORN' ? visit.newbornCareRecordId : null,
      ),
  },
  ...buildFamilyPlanningIndicators('NEW'),
  ...buildFamilyPlanningIndicators('ACTIVE'),
  {
    id: 'hb0',
    label: 'HB0',
    definition:
      'Imunisasi HB0 yang tertaut ke catatan bayi baru lahir dan diberikan pada bulan laporan, menurut tanggal pemberiannya.',
    compute: countHb0Immunizations,
  },
];
