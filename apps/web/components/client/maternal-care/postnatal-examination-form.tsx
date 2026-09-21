'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostnatalExaminationView, UpsertPostnatalExaminationInput } from '@hms/shared-types';
import { Button, Input, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PostnatalBooleanSelect } from '#components/client/maternal-care/postnatal-boolean-select';
import { PostnatalEnumSelect } from '#components/client/maternal-care/postnatal-enum-select';
import { FormLabel } from '#components/client/shared/form-label';
import { postnatalVisitControllerUpsertExaminationV1 } from '#lib/api/generated/maternal-care/maternal-care';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateMaternalCareQueries } from '#lib/maternal-care/invalidate-maternal-care-queries';
import { toOptionalNumber } from '#lib/maternal-care/to-optional-number';

type PostnatalExaminationFormProps = {
  encounterId: string;
  examination: PostnatalExaminationView | null;
  isEditable: boolean;
};

type BooleanFinding =
  | 'vaginalBleeding'
  | 'perinealInfectionSigns'
  | 'caesareanWoundInfectionSigns'
  | 'uterineContraction'
  | 'lochiaOdour'
  | 'urination'
  | 'defecation'
  | 'newbornCareCounselling'
  | 'familyPlanningCounselling';

const BOOLEAN_FINDINGS: readonly BooleanFinding[] = [
  'vaginalBleeding',
  'perinealInfectionSigns',
  'caesareanWoundInfectionSigns',
  'uterineContraction',
  'lochiaOdour',
  'urination',
  'defecation',
  'newbornCareCounselling',
  'familyPlanningCounselling',
];
const BREAST_CONDITIONS = ['NORMAL', 'SWELLING', 'REDNESS', 'NIPPLE_DISCHARGE', 'PAIN'] as const;
const LOCHIA_COLOURS = ['RUBRA', 'SEROSA', 'ALBA'] as const;
const BREAST_MILK_PRODUCTIONS = ['PRESENT', 'LOW', 'ABSENT'] as const;

function toInitialState(examination: PostnatalExaminationView | null): UpsertPostnatalExaminationInput {
  return {
    vaginalBleeding: examination?.vaginalBleeding ?? null,
    bloodLossMl: examination?.bloodLossMl ?? null,
    perineumCondition: examination?.perineumCondition ?? null,
    perinealInfectionSigns: examination?.perinealInfectionSigns ?? null,
    caesareanWoundInfectionSigns: examination?.caesareanWoundInfectionSigns ?? null,
    breastCondition: examination?.breastCondition ?? null,
    uterineContraction: examination?.uterineContraction ?? null,
    lochiaColour: examination?.lochiaColour ?? null,
    lochiaOdour: examination?.lochiaOdour ?? null,
    breastMilkProduction: examination?.breastMilkProduction ?? null,
    urination: examination?.urination ?? null,
    defecation: examination?.defecation ?? null,
    newbornCareCounselling: examination?.newbornCareCounselling ?? null,
    vitaminAGivenAt: examination?.vitaminAGivenAt ?? null,
    familyPlanningCounselling: examination?.familyPlanningCounselling ?? null,
  };
}

/**
 * The nifas examination of a mother's visit (P25-T12). Blood pressure, pulse,
 * temperature and respiration are not here — they are the vitals card's, and
 * SATUSEHAT receives them from there.
 */
export function PostnatalExaminationForm({
  encounterId,
  examination,
  isEditable,
}: PostnatalExaminationFormProps) {
  const t = useTranslations('maternalCare.postnatal.form');
  const queryClient = useQueryClient();
  const [values, setValues] = useState<UpsertPostnatalExaminationInput>(() =>
    toInitialState(examination),
  );
  const [bloodLoss, setBloodLoss] = useState<string>(examination?.bloodLossMl?.toString() ?? '');
  const setValue = <Key extends keyof UpsertPostnatalExaminationInput>(
    key: Key,
    value: UpsertPostnatalExaminationInput[Key],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const mutation = useMutation({
    mutationFn: async () =>
      postnatalVisitControllerUpsertExaminationV1(encounterId, {
        ...values,
        bloodLossMl: toOptionalNumber(bloodLoss),
      }),
    onSuccess: async () => {
      await invalidateMaternalCareQueries(queryClient);
      toast.success(t('saved'));
    },
    onError: (error) => notifyApiError(error, t('save')),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{t('vitalsHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {BOOLEAN_FINDINGS.map((finding) => (
          <PostnatalBooleanSelect
            key={finding}
            id={`postnatal-${finding}`}
            label={t(`fields.${finding}`)}
            value={values[finding] ?? null}
            onChange={(next) => setValue(finding, next)}
          />
        ))}
        <PostnatalEnumSelect
          id="postnatal-breast-condition"
          label={t('fields.breastCondition')}
          options={BREAST_CONDITIONS.map((value) => ({
            value,
            label: t(`breastConditions.${value}`),
          }))}
          value={values.breastCondition ?? null}
          onChange={(next) =>
            setValue('breastCondition', next as UpsertPostnatalExaminationInput['breastCondition'])
          }
        />
        <PostnatalEnumSelect
          id="postnatal-lochia-colour"
          label={t('fields.lochiaColour')}
          options={LOCHIA_COLOURS.map((value) => ({ value, label: t(`lochiaColours.${value}`) }))}
          value={values.lochiaColour ?? null}
          onChange={(next) =>
            setValue('lochiaColour', next as UpsertPostnatalExaminationInput['lochiaColour'])
          }
        />
        <PostnatalEnumSelect
          id="postnatal-breast-milk"
          label={t('fields.breastMilkProduction')}
          options={BREAST_MILK_PRODUCTIONS.map((value) => ({
            value,
            label: t(`breastMilkProductions.${value}`),
          }))}
          value={values.breastMilkProduction ?? null}
          onChange={(next) =>
            setValue(
              'breastMilkProduction',
              next as UpsertPostnatalExaminationInput['breastMilkProduction'],
            )
          }
        />
        <div>
          <FormLabel htmlFor="postnatal-blood-loss">{t('fields.bloodLossMl')}</FormLabel>
          <Input
            id="postnatal-blood-loss"
            type="number"
            min={0}
            value={bloodLoss}
            onChange={(event) => setBloodLoss(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <FormLabel htmlFor="postnatal-perineum">{t('fields.perineumCondition')}</FormLabel>
          <Input
            id="postnatal-perineum"
            value={values.perineumCondition ?? ''}
            onChange={(event) =>
              setValue('perineumCondition', event.target.value === '' ? null : event.target.value)
            }
          />
        </div>
        <PostnatalBooleanSelect
          id="postnatal-vitamin-a"
          label={t('fields.vitaminAGiven')}
          value={values.vitaminAGivenAt ? true : null}
          onChange={(next) =>
            setValue(
              'vitaminAGivenAt',
              next ? (examination?.vitaminAGivenAt ?? new Date().toISOString()) : null,
            )
          }
        />
      </div>
      {isEditable ? (
        <Button type="button" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {t('save')}
        </Button>
      ) : null}
    </div>
  );
}
