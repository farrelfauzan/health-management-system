'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  EncounterDetail,
  EncounterPrognosisValue,
  UpdateEncounterSoapInput,
} from '@hms/shared-types';
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { encounterControllerUpdateEncounterSoapV1 } from '#lib/api/generated/encounters/encounters';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateEncounterQueries } from '#lib/encounters/invalidate-encounter-queries';
import { SOAP_SECTIONS } from '#lib/encounters/soap-sections';
import { EncounterPrognosisSelect } from '#components/client/encounters/encounter-prognosis-select';

type SoapValues = Record<(typeof SOAP_SECTIONS)[number]['key'], string>;

type EncounterSoapCardProps = {
  encounter: EncounterDetail;
  isEditable: boolean;
};

export function EncounterSoapCard({ encounter, isEditable }: EncounterSoapCardProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [values, setValues] = useState<SoapValues>({
    subjective: encounter.subjective ?? '',
    objective: encounter.objective ?? '',
    assessment: encounter.assessment ?? '',
    plan: encounter.plan ?? '',
  });
  const [prognosis, setPrognosis] = useState<EncounterPrognosisValue | null>(
    encounter.prognosis ?? null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const saveMutation = useMutation({
    mutationFn: (payload: UpdateEncounterSoapInput) =>
      encounterControllerUpdateEncounterSoapV1(encounter.id, payload),
  });

  function handleChange(key: keyof SoapValues, value: string): void {
    setValues((current) => ({ ...current, [key]: value }));
    setIsSaved(false);
  }

  async function handleSave(): Promise<void> {
    setActionError(null);
    // Every section is sent, empty ones as null: clearing a section written by
    // mistake has to erase it, and an omitted field would leave it standing.
    const payload: UpdateEncounterSoapInput = {
      subjective: values.subjective.trim() || null,
      objective: values.objective.trim() || null,
      assessment: values.assessment.trim() || null,
      plan: values.plan.trim() || null,
      prognosis,
    };

    try {
      const response = await saveMutation.mutateAsync(payload);
      parseApiSuccess<EncounterDetail>(response, t('encounters.soap.error'));
      await invalidateEncounterQueries(queryClient);
      setIsSaved(true);
    } catch (error) {
      setActionError(notifyApiError(error, t('encounters.soap.error')));
    }
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="font-heading text-base">{t('encounters.soap.title')}</CardTitle>
        {isEditable ? (
          <div className="flex items-center gap-3">
            {isSaved ? <span className="text-xs text-success">{t('encounters.saved')}</span> : null}
            <Button
              type="button"
              size="sm"
              className="bg-primary-container hover:bg-primary"
              disabled={saveMutation.isPending}
              onClick={() => void handleSave()}
            >
              {saveMutation.isPending ? t('common.saving') : t('encounters.soap.save')}
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {actionError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {actionError}
          </p>
        ) : null}
        {SOAP_SECTIONS.map((section) => (
          <div key={section.key}>
            <label
              htmlFor={`soap-${section.key}`}
              className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
            >
              {t(`encounters.soap.${section.key}`)}
            </label>
            {isEditable ? (
              <Textarea
                id={`soap-${section.key}`}
                rows={3}
                placeholder={t(`encounters.soap.${section.key}Placeholder`)}
                value={values[section.key]}
                onChange={(event) => handleChange(section.key, event.target.value)}
              />
            ) : (
              <p
                id={`soap-${section.key}`}
                className="min-h-9 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
              >
                {values[section.key] || (
                  <span className="text-slate-400">{t('common.notRecorded')}</span>
                )}
              </p>
            )}
          </div>
        ))}
        <EncounterPrognosisSelect
          value={prognosis}
          isEditable={isEditable}
          onChange={(selected) => {
            setPrognosis(selected);
            setIsSaved(false);
          }}
        />
      </CardContent>
    </Card>
  );
}
