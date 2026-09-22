'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  NON_CAPITATION_MAX_FILING_DAY,
  type NonCapitationSettingsView,
  type UpdateNonCapitationSettingsInput,
} from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Input,
  Label,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { NonCapitationTriStateSelect } from '#components/client/integrations/non-capitation-tri-state-select';
import { FieldDescription } from '#components/client/shared/field-description';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { bpjsNonCapitationSettingsControllerUpdateSettingsV1 } from '#lib/api/generated/bpjs-non-capitation/bpjs-non-capitation';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { fromTriStateValue } from '#lib/bpjs-non-capitation/from-tri-state-value';
import { invalidateNonCapitationQueries } from '#lib/bpjs-non-capitation/invalidate-non-capitation-queries';
import { toTriStateValue } from '#lib/bpjs-non-capitation/to-tri-state-value';
import type { TriStateValue } from '#lib/bpjs-non-capitation/tri-state-value';
import { useNonCapitationSettings } from '#lib/bpjs-non-capitation/use-non-capitation-settings';

type FormState = {
  providerCode: string;
  providerName: string;
  governmentOwned: TriStateValue;
  ownEclaimLogin: TriStateValue;
  filingDay: string;
};

function toFormState(settings: NonCapitationSettingsView): FormState {
  return {
    providerCode: settings.networkParentProviderCode ?? '',
    providerName: settings.networkParentProviderName ?? '',
    governmentOwned: toTriStateValue(settings.isNetworkParentGovernmentOwned),
    ownEclaimLogin: toTriStateValue(settings.hasOwnEclaimLogin),
    filingDay: String(settings.filingDayOfMonth),
  };
}

function toPayload(form: FormState): UpdateNonCapitationSettingsInput {
  return {
    networkParentProviderCode: form.providerCode.trim() || null,
    networkParentProviderName: form.providerName.trim() || null,
    isNetworkParentGovernmentOwned: fromTriStateValue(form.governmentOwned),
    hasOwnEclaimLogin: fromTriStateValue(form.ownEclaimLogin),
    filingDayOfMonth: Number(form.filingDay),
  };
}

type NonCapitationSettingsCardProps = {
  canWrite: boolean;
};

/**
 * The induk FKTP a bidan jejaring files through (P25-T16, D-043). Every field
 * is what Q12 will answer, so none is assumed: the ownership and eClaim
 * questions keep an explicit "not known yet".
 */
export function NonCapitationSettingsCard({ canWrite }: NonCapitationSettingsCardProps) {
  const t = useTranslations('operations.integrations.nonCapitation.settings');
  const queryClient = useQueryClient();
  const settingsQuery = useNonCapitationSettings();
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(toFormState(settingsQuery.data));
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: UpdateNonCapitationSettingsInput) =>
      parseApiSuccess<NonCapitationSettingsView>(
        await bpjsNonCapitationSettingsControllerUpdateSettingsV1(payload),
        t('saveError'),
      ).data,
    onSuccess: async () => {
      await invalidateNonCapitationQueries(queryClient);
      toast.success(t('saved'));
    },
    onError: (error) => notifyApiError(error, t('saveError')),
  });

  if (settingsQuery.isError) {
    return <InlineNotice tone="error">{t('loadError')}</InlineNotice>;
  }
  if (form === null) {
    return null;
  }

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]): void {
    setForm((current) => (current === null ? current : { ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (form !== null) {
      saveMutation.mutate(toPayload(form));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <fieldset disabled={!canWrite} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="non-capitation-provider-code">{t('providerCode')}</Label>
              <Input
                id="non-capitation-provider-code"
                maxLength={20}
                value={form.providerCode}
                onChange={(event) => updateField('providerCode', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="non-capitation-provider-name">{t('providerName')}</Label>
              <Input
                id="non-capitation-provider-name"
                maxLength={200}
                value={form.providerName}
                onChange={(event) => updateField('providerName', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="non-capitation-government-owned">{t('governmentOwned')}</Label>
              <NonCapitationTriStateSelect
                id="non-capitation-government-owned"
                describedBy="non-capitation-government-owned-hint"
                value={form.governmentOwned}
                onValueChange={(value) => updateField('governmentOwned', value)}
              />
              <FieldDescription id="non-capitation-government-owned-hint">
                {t('governmentOwnedHint')}
              </FieldDescription>
            </div>
            <div className="space-y-2">
              <Label htmlFor="non-capitation-own-eclaim">{t('ownEclaimLogin')}</Label>
              <NonCapitationTriStateSelect
                id="non-capitation-own-eclaim"
                describedBy="non-capitation-own-eclaim-hint"
                value={form.ownEclaimLogin}
                onValueChange={(value) => updateField('ownEclaimLogin', value)}
              />
              <FieldDescription id="non-capitation-own-eclaim-hint">
                {t('ownEclaimLoginHint')}
              </FieldDescription>
            </div>
            <div className="space-y-2">
              <Label htmlFor="non-capitation-filing-day">{t('filingDay')}</Label>
              <Input
                id="non-capitation-filing-day"
                type="number"
                required
                min={1}
                max={NON_CAPITATION_MAX_FILING_DAY}
                aria-describedby="non-capitation-filing-day-hint"
                value={form.filingDay}
                onChange={(event) => updateField('filingDay', event.target.value)}
              />
              <FieldDescription id="non-capitation-filing-day-hint">
                {t('filingDayHint')}
              </FieldDescription>
            </div>
          </fieldset>
          {canWrite ? (
            <Button type="submit" disabled={saveMutation.isPending}>
              <Icon name="save" size={17} />
              {t('save')}
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
