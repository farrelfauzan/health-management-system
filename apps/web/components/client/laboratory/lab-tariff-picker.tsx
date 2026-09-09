'use client';

import { Combobox, type ComboboxOption } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { formatRupiah } from '#lib/billing/format-rupiah';
import { useServiceTariffsList } from '#lib/billing/use-service-tariffs-list';

/** A picker needs the whole LAB price list, not a page of it. */
const LAB_TARIFFS_PAGE_SIZE = 100;

const NO_TARIFF_VALUE = 'none';

type LabTariffPickerProps = {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (serviceTariffId: string) => void;
};

/**
 * Attaches a price to a test or a panel (`P18-T15`) — the bit that makes the
 * catalog worth editing, because an unpriced test silently bills nothing and
 * the invoice generator reports it only as a gap. Offers the active LAB
 * tariffs; a tariff is made under Billing, so the picker links nowhere and
 * says so in its empty state.
 */
export function LabTariffPicker({ id, value, disabled = false, onChange }: LabTariffPickerProps) {
  const t = useTranslations('operations.laboratory.catalog');
  const tariffsQuery = useServiceTariffsList({
    page: 1,
    limit: LAB_TARIFFS_PAGE_SIZE,
    isActive: 'true',
    category: 'LAB',
  });
  const options: ComboboxOption[] = [
    { value: NO_TARIFF_VALUE, label: t('noTariff') },
    ...tariffsQuery.tariffs.map((tariff) => ({
      value: tariff.id,
      label: `${tariff.name} · ${formatRupiah(tariff.price)}`,
      keywords: [tariff.code],
    })),
  ];

  return (
    <Combobox
      id={id}
      options={options}
      value={value === '' ? NO_TARIFF_VALUE : value}
      placeholder={t('tariffPlaceholder')}
      searchPlaceholder={t('search')}
      emptyMessage={t('noTariffsYet')}
      isLoading={tariffsQuery.isPending}
      disabled={disabled}
      onChange={(next) => onChange(next === NO_TARIFF_VALUE ? '' : next)}
    />
  );
}
