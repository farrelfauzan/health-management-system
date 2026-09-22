import { ANTENATAL_LAB_TEST_MATCHERS } from '#maternal-reporting/antenatal-lab-tests';
import type {
  AntenatalLabClassification,
  MaternalReportLabResultSource,
} from '#maternal-reporting/types';

/**
 * Random blood glucose at or above this is the screening-positive figure the
 * antenatal 10T uses for gestational diabetes (Permenkes 21/2021 Lampiran I,
 * pemeriksaan gula darah); the urine strip's `+` grades count as positive too.
 */
const GLUCOSE_POSITIVE_MG_PER_DL = 200;

const NEGATIVE_PATTERN = /\b(non[- ]?reaktif|negatif|negative|normal)\b/i;
const POSITIVE_PATTERN = /(reaktif|positif|positive|\+)/i;

/**
 * Which LB3-KIA test a laboratory result belongs to, and how it reads
 * (P25-T15, D-040). `null` for a result of any other test.
 *
 * Positive is a coded or text answer that says reactive or positive (or a
 * strip grade like `+2`) and does not say non-reactive; glucose is also
 * positive at ≥ 200 mg/dL. Haemoglobin is returned as the number for the
 * anaemia bands to read; it is never "positive".
 */
export function classifyAntenatalLabResult(
  result: MaternalReportLabResultSource,
): AntenatalLabClassification | null {
  const matcher = ANTENATAL_LAB_TEST_MATCHERS.find(
    (candidate) =>
      (result.loincCode !== null && candidate.loincCodes.includes(result.loincCode)) ||
      candidate.localCodes.includes(result.testCode.toUpperCase()),
  );
  if (matcher === undefined) {
    return null;
  }
  if (matcher.test === 'HB') {
    return { test: 'HB', isPositive: false, haemoglobin: result.valueNumeric };
  }
  const answer = result.valueCoded ?? result.valueText ?? '';
  const isCodedPositive = !NEGATIVE_PATTERN.test(answer) && POSITIVE_PATTERN.test(answer);
  const isGlucoseHigh =
    matcher.test === 'GLUCOSE' &&
    result.valueNumeric !== null &&
    result.valueNumeric >= GLUCOSE_POSITIVE_MG_PER_DL;
  return { test: matcher.test, isPositive: isCodedPositive || isGlucoseHigh, haemoglobin: null };
}
