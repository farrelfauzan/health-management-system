'use client';

import {
  CHANNEL_KINDS,
  PROSPECTIVE_PATIENT_STATUSES,
  type ChannelKindValue,
  type ProspectivePatientSortFieldValue,
  type ProspectivePatientSortOrderValue,
  type ProspectivePatientStatusValue,
} from '@hms/shared-types';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FilterCard } from '#components/shared/filter-card';
import {
  DEFAULT_PROSPECTIVE_PATIENTS_FILTERS,
  type ProspectivePatientsFilters,
} from '#lib/prospective-patients/prospective-patients-filters';

type ProspectivePatientsFilterValues = Omit<ProspectivePatientsFilters, 'page'>;

type ProspectivePatientsFilterCardProps = {
  filters: ProspectivePatientsFilters;
  onChange: (next: ProspectivePatientsFilterValues) => void;
};

const ALL_CHANNELS_VALUE = 'ALL';

/**
 * The filter without its page number, which is the shape a change is reported
 * in: any change to what is being looked at sends the desk back to page one,
 * so this card never carries a page around to hand back stale.
 */
function withoutPage(filters: ProspectivePatientsFilters): ProspectivePatientsFilterValues {
  return {
    status: filters.status,
    channel: filters.channel,
    q: filters.q,
    sort: filters.sort,
    order: filters.order,
  };
}

/**
 * The four orderings the API offers, flattened into one select.
 *
 * Written with an underscore rather than a colon so the option doubles as its
 * own message key: one list, and a new ordering cannot be added without a
 * label for it.
 */
const SORT_OPTIONS = [
  'createdAt_asc',
  'createdAt_desc',
  'expiresAt_asc',
  'expiresAt_desc',
] as const;

type SortOption = (typeof SORT_OPTIONS)[number];

function toSortOption(
  sort: ProspectivePatientSortFieldValue,
  order: ProspectivePatientSortOrderValue,
): SortOption {
  return `${sort}_${order}`;
}

/**
 * Filters for the "From chat" table (`P19-T08`).
 *
 * Every change applies immediately rather than behind an Apply button: the
 * list is small and polled anyway, and the desk's usual move is one flick of
 * the status select to see what it resolved this morning.
 */
export function ProspectivePatientsFilterCard({
  filters,
  onChange,
}: ProspectivePatientsFilterCardProps) {
  const t = useTranslations('prospectivePatients');
  const values = withoutPage(filters);

  function handleSortChange(value: string): void {
    const [sort, order] = value.split('_') as [
      ProspectivePatientSortFieldValue,
      ProspectivePatientSortOrderValue,
    ];
    onChange({ ...values, sort, order });
  }

  return (
    <FilterCard
      actions={
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(withoutPage(DEFAULT_PROSPECTIVE_PATIENTS_FILTERS))}
        >
          {t('filters.reset')}
        </Button>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="prospective-patients-search">{t('filters.search')}</Label>
        <Input
          id="prospective-patients-search"
          className="w-64"
          value={filters.q}
          placeholder={t('filters.searchPlaceholder')}
          onChange={(event) => onChange({ ...values, q: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="prospective-patients-status">{t('filters.status')}</Label>
        <Select
          value={filters.status}
          onValueChange={(value) =>
            onChange({ ...values, status: value as ProspectivePatientStatusValue })
          }
        >
          <SelectTrigger id="prospective-patients-status" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROSPECTIVE_PATIENT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="prospective-patients-channel">{t('filters.channel')}</Label>
        <Select
          value={filters.channel ?? ALL_CHANNELS_VALUE}
          onValueChange={(value) =>
            onChange({
              ...values,
              channel: value === ALL_CHANNELS_VALUE ? undefined : (value as ChannelKindValue),
            })
          }
        >
          <SelectTrigger id="prospective-patients-channel" className="w-44">
            <SelectValue placeholder={t('filters.allChannels')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CHANNELS_VALUE}>{t('filters.allChannels')}</SelectItem>
            {CHANNEL_KINDS.map((channel) => (
              <SelectItem key={channel} value={channel}>
                {t(`channel.${channel}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="prospective-patients-sort">{t('filters.sort')}</Label>
        <Select value={toSortOption(filters.sort, filters.order)} onValueChange={handleSortChange}>
          <SelectTrigger id="prospective-patients-sort" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`sort.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </FilterCard>
  );
}
