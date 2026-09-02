'use client';

import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useAbility,
} from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { formatVisitLinkValue } from '#lib/patient-documents/format-visit-link-value';
import { usePatientVisitOptions } from '#lib/patient-documents/use-patient-visit-options';
import { VISIT_LINK_NONE } from '#lib/patient-documents/visit-link-value';

type VisitLinkSelectProps = {
  id: string;
  patientId: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
};

/**
 * Which of this patient's visits a document is filed under.
 *
 * A select of the patient's own encounters and admissions rather than a
 * UUID field: nobody has an encounter id to hand, and a free-text id is a
 * way to file a scan under a stranger's visit. The list is fetched through
 * the existing encounter and admission routes, gated on the caller's read
 * grants, so a role that cannot see visits is offered "general" alone.
 */
export function VisitLinkSelect({
  id,
  patientId,
  value,
  onValueChange,
  disabled = false,
}: VisitLinkSelectProps) {
  const t = useTranslations('clinical.patients.documents.visit');
  const format = useFormatter();
  const ability = useAbility();
  const options = usePatientVisitOptions(patientId, {
    canReadEncounters: ability.can('read', 'Encounter'),
    canReadAdmissions: ability.can('read', 'Admission'),
  });

  function formatVisitDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : format.dateTime(date, { dateStyle: 'medium' });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('label')}</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled || options.isPending}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={options.isPending ? t('loading') : undefined} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={VISIT_LINK_NONE}>{t('none')}</SelectItem>
          {options.encounters.map((encounter) => (
            <SelectItem
              key={encounter.id}
              value={formatVisitLinkValue({ encounterId: encounter.id, admissionId: null })}
            >
              {t('encounterOption', {
                date: formatVisitDate(encounter.startedAt),
                doctor: encounter.doctor.fullName,
              })}
            </SelectItem>
          ))}
          {options.admissions.map((admission) => (
            <SelectItem
              key={admission.id}
              value={formatVisitLinkValue({ encounterId: null, admissionId: admission.id })}
            >
              {t('admissionOption', {
                date: formatVisitDate(admission.admittedAt),
                doctor: admission.admittingDoctor.fullName,
              })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-slate-500">{t('hint')}</p>
    </div>
  );
}
