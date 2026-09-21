'use client';

import type { DeliveryRecordView } from '@hms/shared-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { NewbornCareRow } from '#components/client/maternal-care/newborn-care-row';

type DeliveryCardProps = {
  delivery: DeliveryRecordView | null;
  motherPatientId: string;
  onRecord: () => void;
  onRecordNewborn: () => void;
  onIssueCertificate: (newbornCareRecordId: string) => void;
  isIssuing: boolean;
  /**
   * "Mulai KB pasca salin" (P25-T14): starts a KB course linked to this birth.
   * Left out where KB is not offered.
   */
  onStartFamilyPlanning?: (deliveryRecordId: string) => void;
};

/**
 * The Persalinan section of the pregnancy tab (P25-T09, FR-INC-01).
 *
 * Read-only here, with the writing done in dialogs: the section is what a
 * midwife glances at afterwards, and the kala times are entered once.
 */
export function DeliveryCard({
  delivery,
  motherPatientId,
  onRecord,
  onRecordNewborn,
  onIssueCertificate,
  isIssuing,
  onStartFamilyPlanning,
}: DeliveryCardProps) {
  const t = useTranslations();

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="font-heading text-base">
          {t('maternalCare.delivery.title')}
        </CardTitle>
        {delivery === null ? (
          <Button type="button" variant="outline" size="sm" onClick={onRecord}>
            <Icon name="add" size={16} />
            {t('maternalCare.delivery.actions.record')}
          </Button>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {onStartFamilyPlanning === undefined ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onStartFamilyPlanning(delivery.id)}
              >
                <Icon name="family_restroom" size={16} />
                {t('maternalCare.familyPlanning.actions.startPostDelivery')}
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onRecordNewborn}>
              <Icon name="child_care" size={16} />
              {t('maternalCare.delivery.actions.recordNewborn')}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {delivery === null ? (
          <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('maternalCare.delivery.empty')}
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-400">{t('maternalCare.delivery.birthAt')}</dt>
                <dd className="text-slate-900">{delivery.birthAt}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">{t('maternalCare.delivery.mode')}</dt>
                <dd className="text-slate-900">
                  {t(`maternalCare.delivery.modes.${delivery.mode}`)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">{t('maternalCare.delivery.attendant')}</dt>
                <dd className="text-slate-900">{delivery.attendantName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">{t('maternalCare.delivery.tear')}</dt>
                <dd className="text-slate-900">
                  {t(`maternalCare.delivery.tears.${delivery.perinealTearGrade}`)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">{t('maternalCare.delivery.bloodLoss')}</dt>
                <dd className="text-slate-900">
                  {delivery.bloodLossMl === null ? '—' : `${delivery.bloodLossMl} mL`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">{t('maternalCare.delivery.uterotonic')}</dt>
                <dd className="text-slate-900">{delivery.uterotonicName ?? '—'}</dd>
              </div>
            </dl>

            {delivery.referredOut ? (
              <p className="rounded-lg bg-warning-tint px-3 py-2 text-sm text-warning-strong">
                {t('maternalCare.delivery.referredOut', {
                  reason: delivery.referralReason ?? '—',
                })}
              </p>
            ) : null}

            {delivery.newborns.length > 0 ? (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {delivery.newborns.map((newborn) => (
                  <NewbornCareRow
                    key={newborn.id}
                    newborn={newborn}
                    motherPatientId={motherPatientId}
                    onIssueCertificate={onIssueCertificate}
                    isIssuing={isIssuing}
                  />
                ))}
              </ul>
            ) : (
              <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">
                {t('maternalCare.delivery.newborns.empty')}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
