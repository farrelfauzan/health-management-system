'use client';

import type { NewbornCareView } from '@hms/shared-types';
import { Button, Icon } from '@hms/ui';
import Link from 'next/link';

import { NewbornCareFact } from '#components/client/maternal-care/newborn-care-fact';
import { ShkStatusChip } from '#components/client/maternal-care/shk-status-chip';
import { useTranslations } from 'next-intl';

type NewbornCareRowProps = {
  newborn: NewbornCareView;
  motherPatientId: string;
  onIssueCertificate: (newbornCareRecordId: string) => void;
  isIssuing: boolean;
};

/**
 * One baby of the birth, with the first-hour essentials (P25-T09, FR-INC-03).
 *
 * A live baby with no patient record yet is the ordinary case, not an error:
 * the midwife records the first hour while it is happening and the
 * registration form is filled in afterwards. Until then she gets a link into
 * P24-T10's "Daftarkan bayi" rather than a disabled certificate button with no
 * explanation.
 */
export function NewbornCareRow({
  newborn,
  motherPatientId,
  onIssueCertificate,
  isIssuing,
}: NewbornCareRowProps) {
  const t = useTranslations();
  const isStillbirth = newborn.outcome === 'STILLBIRTH';
  const isRegistered = newborn.newbornPatientId !== null;

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-heading text-sm text-slate-900">
            {newborn.newbornName ??
              t('maternalCare.delivery.newborns.unnamed', {
                order: newborn.birthOrder ?? 1,
              })}
          </span>
          <span className="text-xs text-slate-500">
            {t(`maternalCare.delivery.sex.${newborn.sex}`)}
          </span>
          {isStillbirth ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {t('maternalCare.delivery.outcome.STILLBIRTH')}
            </span>
          ) : null}
          {newborn.shkScreening === null ? null : (
            <ShkStatusChip
              status={newborn.shkScreening.status}
              result={newborn.shkScreening.result}
              sequence={newborn.shkScreening.sequence}
            />
          )}
        </div>
        {isStillbirth ? null : isRegistered ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isIssuing}
            onClick={() => onIssueCertificate(newborn.id)}
          >
            <Icon name="description" size={16} />
            {t('maternalCare.delivery.actions.issueBirthCertificate')}
          </Button>
        ) : (
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`/patients/${motherPatientId}?tab=newborn`}>
              <Icon name="child_care" size={16} />
              {t('maternalCare.delivery.actions.registerNewborn')}
            </Link>
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
        <NewbornCareFact
          label={t('maternalCare.delivery.newborns.weight')}
          value={
            newborn.birthWeightGrams === null
              ? null
              : t('maternalCare.delivery.newborns.grams', { grams: newborn.birthWeightGrams })
          }
        />
        <NewbornCareFact
          label={t('maternalCare.delivery.newborns.length')}
          value={newborn.lengthCm === null ? null : `${newborn.lengthCm} cm`}
        />
        <NewbornCareFact
          label={t('maternalCare.delivery.newborns.apgar')}
          value={
            newborn.apgar1Min === null && newborn.apgar5Min === null
              ? null
              : `${newborn.apgar1Min ?? '—'} / ${newborn.apgar5Min ?? '—'}`
          }
        />
        <NewbornCareFact
          label={t('maternalCare.delivery.newborns.vitaminK1')}
          value={newborn.vitaminK1GivenAt === null ? null : t('maternalCare.delivery.given')}
        />
      </dl>
    </li>
  );
}

