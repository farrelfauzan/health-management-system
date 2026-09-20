'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AntenatalExaminationResponse } from '@hms/shared-types';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { FormLabel } from '#components/client/shared/form-label';
import { antenatalExaminationControllerUpsertExaminationV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';
import { toOptionalNumber } from '#lib/maternal-care/to-optional-number';

type AntenatalExaminationFormProps = {
  encounterId: string;
  examination: AntenatalExaminationResponse['examination'];
};

const PRESENTATIONS = ['CEPHALIC', 'BREECH', 'TRANSVERSE', 'UNKNOWN'] as const;
const ENGAGEMENTS = ['ENGAGED', 'NOT_ENGAGED'] as const;
const TETANUS_STATUSES = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5'] as const;

/**
 * The 10T fields that have nowhere else to live (FR-ANC-03).
 *
 * Weight, height and blood pressure are deliberately not here: they are
 * recorded on the vitals card, and a second set of inputs for them would be a
 * second reading that can disagree with the first.
 */
export function AntenatalExaminationForm({
  encounterId,
  examination,
}: AntenatalExaminationFormProps) {
  const t = useTranslations('maternalCare.examination');
  const queryClient = useQueryClient();
  const [muacCm, setMuacCm] = useState<string>(examination?.muacCm?.toString() ?? '');
  const [fundalHeightCm, setFundalHeightCm] = useState<string>(
    examination?.fundalHeightCm?.toString() ?? '',
  );
  const [fetalHeartRateBpm, setFetalHeartRateBpm] = useState<string>(
    examination?.fetalHeartRateBpm?.toString() ?? '',
  );
  const [fetalPresentation, setFetalPresentation] = useState<string>(
    examination?.fetalPresentation ?? '',
  );
  const [fetalHeadEngagement, setFetalHeadEngagement] = useState<string>(
    examination?.fetalHeadEngagement ?? '',
  );
  const [tetanusStatus, setTetanusStatus] = useState<string>(examination?.tetanusStatus ?? '');
  const [ironTabletsGiven, setIronTabletsGiven] = useState<string>(
    examination?.ironTabletsGiven?.toString() ?? '',
  );
  const [counsellingTopics, setCounsellingTopics] = useState<string>(
    (examination?.counsellingTopics ?? []).join(', '),
  );
  const [caseManagementNotes, setCaseManagementNotes] = useState<string>(
    examination?.caseManagementNotes ?? '',
  );

  const mutation = useMutation({
    mutationFn: async () =>
      antenatalExaminationControllerUpsertExaminationV1(encounterId, {
        muacCm: toOptionalNumber(muacCm),
        fundalHeightCm: toOptionalNumber(fundalHeightCm),
        fetalHeartRateBpm: toOptionalNumber(fetalHeartRateBpm),
        fetalPresentation: fetalPresentation === '' ? null : fetalPresentation,
        fetalHeadEngagement: fetalHeadEngagement === '' ? null : fetalHeadEngagement,
        tetanusStatus: tetanusStatus === '' ? null : tetanusStatus,
        ironTabletsGiven: toOptionalNumber(ironTabletsGiven),
        counsellingTopics: counsellingTopics
          .split(',')
          .map((topic) => topic.trim())
          .filter((topic) => topic.length > 0),
        caseManagementNotes: caseManagementNotes === '' ? null : caseManagementNotes,
      } as never),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('form.save'));
    },
    onError: (error) => notifyApiError(error, t('form.save')),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{t('form.vitalsHint')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <FormLabel htmlFor="muac">{t('form.muacCm')}</FormLabel>
          <Input
            id="muac"
            type="number"
            step="0.1"
            value={muacCm}
            onChange={(event) => setMuacCm(event.target.value)}
          />
        </div>
        <div>
          <FormLabel htmlFor="fundal-height">{t('form.fundalHeightCm')}</FormLabel>
          <Input
            id="fundal-height"
            type="number"
            step="0.1"
            value={fundalHeightCm}
            onChange={(event) => setFundalHeightCm(event.target.value)}
          />
        </div>
        <div>
          <FormLabel htmlFor="fhr">{t('form.fetalHeartRateBpm')}</FormLabel>
          <Input
            id="fhr"
            type="number"
            value={fetalHeartRateBpm}
            onChange={(event) => setFetalHeartRateBpm(event.target.value)}
          />
        </div>
        <div>
          <FormLabel htmlFor="presentation">{t('form.fetalPresentation')}</FormLabel>
          <Select value={fetalPresentation} onValueChange={setFetalPresentation}>
            <SelectTrigger id="presentation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESENTATIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`presentations.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <FormLabel htmlFor="engagement">{t('form.fetalHeadEngagement')}</FormLabel>
          <Select value={fetalHeadEngagement} onValueChange={setFetalHeadEngagement}>
            <SelectTrigger id="engagement">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENGAGEMENTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`engagements.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <FormLabel htmlFor="tetanus">{t('form.tetanusStatus')}</FormLabel>
          <Select value={tetanusStatus} onValueChange={setTetanusStatus}>
            <SelectTrigger id="tetanus">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TETANUS_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <FormLabel htmlFor="iron">{t('form.ironTabletsGiven')}</FormLabel>
          <Input
            id="iron"
            type="number"
            value={ironTabletsGiven}
            onChange={(event) => setIronTabletsGiven(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <FormLabel htmlFor="counselling">{t('form.counsellingTopics')}</FormLabel>
          <Input
            id="counselling"
            value={counsellingTopics}
            onChange={(event) => setCounsellingTopics(event.target.value)}
          />
        </div>
        <div className="sm:col-span-3">
          <FormLabel htmlFor="case-notes">{t('form.caseManagementNotes')}</FormLabel>
          <Input
            id="case-notes"
            value={caseManagementNotes}
            onChange={(event) => setCaseManagementNotes(event.target.value)}
          />
        </div>
      </div>
      <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {t('form.save')}
      </Button>
    </div>
  );
}
