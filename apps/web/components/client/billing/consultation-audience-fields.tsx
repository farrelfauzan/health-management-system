'use client';

import { CLINICIAN_PROFESSIONS, type ClinicianProfessionValue } from '@hms/shared-types';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { SpecialtyCombobox } from '#components/client/doctors/specialty-combobox';
import { useSpecialtiesList } from '#lib/specialties/use-specialties-list';

/** Sentinel for "any", which a Radix `SelectItem` cannot express as an empty value. */
const ANY_PROFESSION_VALUE = 'ANY';

type ConsultationAudienceFieldsProps = {
  specialtyId: string;
  profession: ClinicianProfessionValue | '';
  onSpecialtyChange: (specialtyId: string) => void;
  onProfessionChange: (profession: ClinicianProfessionValue | '') => void;
};

/**
 * Who a consultation tariff prices. Generation matches these against the
 * clinician who held the visit, so leaving both empty is a real choice, not an
 * unfilled field: that row becomes the clinic-wide fee charged whenever no
 * poli-specific price claims the visit.
 */
export function ConsultationAudienceFields({
  specialtyId,
  profession,
  onSpecialtyChange,
  onProfessionChange,
}: ConsultationAudienceFieldsProps) {
  const t = useTranslations('operations.billing');
  const specialtiesQuery = useSpecialtiesList();

  return (
    <div className="space-y-3 rounded-md border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{t('consultationAudience.description')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="tariff-specialty" className="mb-1.5 font-heading text-xs text-slate-600">
            {t('consultationAudience.poli')}
          </Label>
          <SpecialtyCombobox
            id="tariff-specialty"
            specialties={specialtiesQuery.specialties}
            value={specialtyId}
            isLoading={specialtiesQuery.isPending}
            hasError={specialtiesQuery.isError}
            emptyOptionLabel={t('consultationAudience.anyPoli')}
            onChange={onSpecialtyChange}
          />
        </div>
        <div>
          <Label htmlFor="tariff-profession" className="mb-1.5 font-heading text-xs text-slate-600">
            {t('consultationAudience.profession')}
          </Label>
          <Select
            value={profession === '' ? ANY_PROFESSION_VALUE : profession}
            onValueChange={(value) =>
              onProfessionChange(
                value === ANY_PROFESSION_VALUE ? '' : (value as ClinicianProfessionValue),
              )
            }
          >
            <SelectTrigger id="tariff-profession" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_PROFESSION_VALUE}>
                {t('consultationAudience.anyProfession')}
              </SelectItem>
              {CLINICIAN_PROFESSIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`consultationAudience.professions.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
