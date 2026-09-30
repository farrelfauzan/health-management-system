import type { MedicationUnitValue } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

/** A medication unit in words ("tablet", "kapsul"); nothing when the catalog has none. */
export function useMedicationUnitLabel(): (unit: MedicationUnitValue | null | undefined) => string {
  const t = useTranslations('analytics.pharmacy.units');
  return (unit) => (unit ? t(unit) : '');
}
