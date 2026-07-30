'use client';

import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';

import type { CreatePatientDtoPrivacyNotice } from '#lib/api/generated/model/createPatientDtoPrivacyNotice';
import { CreatePatientDtoPrivacyNoticeOutcome } from '#lib/api/generated/model/createPatientDtoPrivacyNoticeOutcome';
import { CreatePatientDtoPrivacyNoticeSubjectType } from '#lib/api/generated/model/createPatientDtoPrivacyNoticeSubjectType';
import { useCurrentPrivacyNotice } from '#lib/patients/use-current-privacy-notice';

type PrivacyNoticeCaptureProps = {
  isEnabled: boolean;
  isPatientOwnVariant: boolean;
  value?: CreatePatientDtoPrivacyNotice;
  onChange: (value: CreatePatientDtoPrivacyNotice | undefined) => void;
};

export function PrivacyNoticeCapture({
  isEnabled,
  isPatientOwnVariant,
  value,
  onChange,
}: PrivacyNoticeCaptureProps) {
  const locale = useLocale() === 'en' ? 'en' : 'id';
  const t = useTranslations('clinical.privacyNotice');
  const noticeQuery = useCurrentPrivacyNotice(isEnabled);
  const notice = noticeQuery.notice;

  function updateEvidence(
    patch: Partial<CreatePatientDtoPrivacyNotice> & Pick<CreatePatientDtoPrivacyNotice, 'outcome'>,
  ): void {
    if (!notice) return;
    onChange({
      privacyNoticeVersionId: notice.id,
      locale,
      subjectType: isPatientOwnVariant
        ? CreatePatientDtoPrivacyNoticeSubjectType.SELF
        : (value?.subjectType ?? CreatePatientDtoPrivacyNoticeSubjectType.SELF),
      provenance: isPatientOwnVariant ? 'PATIENT_PORTAL' : 'FRONT_DESK',
      representativeName: value?.representativeName,
      representativeRelation: value?.representativeRelation,
      ...patch,
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="font-heading text-sm font-semibold text-slate-900">{t('title')}</h3>
        <p className="mt-1 text-xs text-slate-600">{t('notConsent')}</p>
      </div>

      {noticeQuery.isPending ? <p className="text-sm text-slate-500">{t('loading')}</p> : null}
      {noticeQuery.isError ? (
        <p role="alert" className="text-sm text-rose-700">
          {t('loadError')}
        </p>
      ) : null}
      {notice ? (
        <>
          {!notice.counselApproved ? (
            <p
              role="status"
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
            >
              {t('counselPending')}
            </p>
          ) : null}
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700">
            {notice.content[locale]}
          </div>
          <p className="text-xs text-slate-500">{t('version', { version: notice.version })}</p>

          <div className="space-y-1.5">
            <label className="block font-heading text-xs font-medium text-slate-600" htmlFor="privacy-outcome">
              {t('outcomeLabel')}
            </label>
            <Select
              value={value?.outcome ?? ''}
              onValueChange={(outcome) =>
                updateEvidence({ outcome: outcome as CreatePatientDtoPrivacyNotice['outcome'] })
              }
            >
              <SelectTrigger
                id="privacy-outcome"
                className="w-full"
                data-allowed-outcomes={
                  isPatientOwnVariant
                    ? 'ACKNOWLEDGED,PROVIDED_ACKNOWLEDGEMENT_DECLINED'
                    : 'ACKNOWLEDGED,PROVIDED_ACKNOWLEDGEMENT_DECLINED,DEFERRED_EMERGENCY'
                }
              >
                <SelectValue placeholder={t('selectOutcome')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CreatePatientDtoPrivacyNoticeOutcome.ACKNOWLEDGED}>
                  {t('outcomes.ACKNOWLEDGED')}
                </SelectItem>
                <SelectItem
                  value={CreatePatientDtoPrivacyNoticeOutcome.PROVIDED_ACKNOWLEDGEMENT_DECLINED}
                >
                  {t('outcomes.PROVIDED_ACKNOWLEDGEMENT_DECLINED')}
                </SelectItem>
                {!isPatientOwnVariant ? (
                  <SelectItem value={CreatePatientDtoPrivacyNoticeOutcome.DEFERRED_EMERGENCY}>
                    {t('outcomes.DEFERRED_EMERGENCY')}
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>

          {!isPatientOwnVariant ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block font-heading text-xs font-medium text-slate-600" htmlFor="privacy-subject">
                  {t('subjectLabel')}
                </label>
                <Select
                  value={value?.subjectType ?? CreatePatientDtoPrivacyNoticeSubjectType.SELF}
                  onValueChange={(subjectType) => {
                    if (!value) return;
                    onChange({
                      ...value,
                      subjectType: subjectType as CreatePatientDtoPrivacyNotice['subjectType'],
                      representativeName: undefined,
                      representativeRelation: undefined,
                    });
                  }}
                >
                  <SelectTrigger id="privacy-subject" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CreatePatientDtoPrivacyNoticeSubjectType.SELF}>{t('self')}</SelectItem>
                    <SelectItem value={CreatePatientDtoPrivacyNoticeSubjectType.REPRESENTATIVE}>
                      {t('representative')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {value?.subjectType === CreatePatientDtoPrivacyNoticeSubjectType.REPRESENTATIVE ? (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    aria-label={t('representativeName')}
                    placeholder={t('representativeName')}
                    value={value.representativeName ?? ''}
                    onChange={(event) => onChange({ ...value, representativeName: event.target.value })}
                  />
                  <Input
                    aria-label={t('representativeRelation')}
                    placeholder={t('representativeRelation')}
                    value={value.representativeRelation ?? ''}
                    onChange={(event) =>
                      onChange({ ...value, representativeRelation: event.target.value })
                    }
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
