'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BpjsAntreanConfigView,
  BpjsAntreanConnectionTestResult,
  UpsertBpjsAntreanConfigInput,
} from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Icon,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import {
  bpjsAntreanConfigControllerDeleteConfigV1,
  bpjsAntreanConfigControllerTestConnectionV1,
  bpjsAntreanConfigControllerUpsertConfigV1,
  getBpjsAntreanConfigControllerGetConfigV1QueryKey,
} from '#lib/api/generated/bpjs-antrean/bpjs-antrean';
import { isApiStatusError } from '#lib/api/is-api-status-error';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { useBpjsAntreanConfig } from '#lib/integrations/use-integration-queries';

type FormState = {
  environment: 'DEVELOPMENT' | 'PRODUCTION';
  consId: string;
  kdProviderPpk: string;
  secretKey: string;
  userKey: string;
  inboundUsername: string;
  inboundPassword: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  environment: 'DEVELOPMENT',
  consId: '',
  kdProviderPpk: '',
  secretKey: '',
  userKey: '',
  inboundUsername: '',
  inboundPassword: '',
  isActive: true,
};

function configToForm(config: BpjsAntreanConfigView): FormState {
  return {
    environment: config.environment,
    consId: config.consId,
    kdProviderPpk: config.kdProviderPpk,
    secretKey: '',
    userKey: '',
    inboundUsername: config.inboundUsername ?? '',
    inboundPassword: '',
    isActive: config.isActive,
  };
}

export function BpjsAntreanSettingsPanel() {
  const t = useTranslations('operations.integrations');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const configQuery = useBpjsAntreanConfig();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const config = configQuery.data;
  const isUnconfigured = configQuery.isError && isApiStatusError(configQuery.error, 404);

  useEffect(() => {
    if (config) {
      setForm(configToForm(config));
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (payload: UpsertBpjsAntreanConfigInput) => {
      const response = await bpjsAntreanConfigControllerUpsertConfigV1(payload);
      return parseApiSuccess<BpjsAntreanConfigView>(response, t('antrean.saveError')).data;
    },
    onSuccess: async (saved) => {
      setForm(configToForm(saved));
      await queryClient.invalidateQueries({
        queryKey: getBpjsAntreanConfigControllerGetConfigV1QueryKey(),
      });
      toast.success(t('antrean.saved'));
    },
    onError: (error) => setFormError(notifyApiError(error, t('antrean.saveError'))),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await bpjsAntreanConfigControllerTestConnectionV1();
      return parseApiSuccess<BpjsAntreanConnectionTestResult>(response, t('antrean.testError'))
        .data;
    },
    onSuccess: (result) => {
      if (result.isSuccessful) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      void queryClient.invalidateQueries({
        queryKey: getBpjsAntreanConfigControllerGetConfigV1QueryKey(),
      });
    },
    onError: (error) => notifyApiError(error, t('antrean.testError')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => bpjsAntreanConfigControllerDeleteConfigV1(),
    onSuccess: async () => {
      setForm(EMPTY_FORM);
      await queryClient.invalidateQueries({
        queryKey: getBpjsAntreanConfigControllerGetConfigV1QueryKey(),
      });
      toast.success(t('antrean.removed'));
    },
    onError: (error) => notifyApiError(error, t('antrean.removeError')),
  });

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    const payload: UpsertBpjsAntreanConfigInput = {
      environment: form.environment,
      consId: form.consId.trim(),
      kdProviderPpk: form.kdProviderPpk.trim(),
      isActive: form.isActive,
      ...(form.secretKey.trim() ? { secretKey: form.secretKey.trim() } : {}),
      ...(form.userKey.trim() ? { userKey: form.userKey.trim() } : {}),
      ...(form.inboundUsername.trim() ? { inboundUsername: form.inboundUsername.trim() } : {}),
      ...(form.inboundPassword ? { inboundPassword: form.inboundPassword } : {}),
    };
    await saveMutation.mutateAsync(payload).catch(() => undefined);
  }

  if (configQuery.isPending) {
    return <p className="text-sm text-slate-500">{t('antrean.loadingSettings')}</p>;
  }

  if (configQuery.isError && !isUnconfigured) {
    return (
      <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
        {t('antrean.configError')}
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('antrean.credentials')}</CardTitle>
        <CardDescription>{t('antrean.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {t('antrean.unverified')}
          </p>
          {isUnconfigured ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {t('antrean.notConfigured')}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bpjs-antrean-environment">{t('labels.environment')}</Label>
              <Select
                value={form.environment}
                onValueChange={(value) =>
                  updateField('environment', value as FormState['environment'])
                }
              >
                <SelectTrigger id="bpjs-antrean-environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEVELOPMENT">{t('development')}</SelectItem>
                  <SelectItem value="PRODUCTION">{t('production')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpjs-antrean-cons-id">{t('antrean.consumerId')}</Label>
              <Input
                id="bpjs-antrean-cons-id"
                required
                maxLength={32}
                value={form.consId}
                onChange={(event) => updateField('consId', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpjs-antrean-provider-code">{t('antrean.providerCode')}</Label>
              <Input
                id="bpjs-antrean-provider-code"
                required
                maxLength={32}
                value={form.kdProviderPpk}
                onChange={(event) => updateField('kdProviderPpk', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpjs-antrean-secret">
                {t('antrean.secretKey')}{' '}
                {config?.hasSecretKey ? `(····${config.secretKeyLast4})` : ''}
              </Label>
              <Input
                id="bpjs-antrean-secret"
                type="password"
                required={!config?.hasSecretKey}
                autoComplete="new-password"
                placeholder={config?.hasSecretKey ? t('keepSecret') : undefined}
                value={form.secretKey}
                onChange={(event) => updateField('secretKey', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpjs-antrean-user-key">
                {t('antrean.userKey')} {config?.hasUserKey ? `(····${config.userKeyLast4})` : ''}
              </Label>
              <Input
                id="bpjs-antrean-user-key"
                type="password"
                required={!config?.hasUserKey}
                autoComplete="new-password"
                placeholder={config?.hasUserKey ? t('keepSecret') : undefined}
                value={form.userKey}
                onChange={(event) => updateField('userKey', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpjs-antrean-inbound-username">{t('antrean.inboundUsername')}</Label>
              <Input
                id="bpjs-antrean-inbound-username"
                maxLength={128}
                autoComplete="off"
                value={form.inboundUsername}
                onChange={(event) => updateField('inboundUsername', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpjs-antrean-inbound-password">
                {t('antrean.inboundPassword')} {config?.hasInboundPassword ? '(saved)' : ''}
              </Label>
              <Input
                id="bpjs-antrean-inbound-password"
                type="password"
                autoComplete="new-password"
                placeholder={config?.hasInboundPassword ? t('keepSecret') : undefined}
                value={form.inboundPassword}
                onChange={(event) => updateField('inboundPassword', event.target.value)}
              />
            </div>
            <label className="flex items-center gap-3 self-end pb-2 text-sm font-medium">
              <Checkbox
                checked={form.isActive}
                onCheckedChange={(checked) => updateField('isActive', checked === true)}
              />
              {t('antrean.enable')}
            </label>
          </div>

          <p className="text-xs text-slate-500">{t('antrean.inboundHint')}</p>
          {config?.lastTestedAt ? (
            <p className="text-xs text-slate-500">
              {t('lastTest', {
                date: format.dateTime(new Date(config.lastTestedAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
                result: config.lastTestResult ?? t('noResult'),
              })}
            </p>
          ) : null}
          {formError ? (
            <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={saveMutation.isPending}>
              <Icon name="save" size={17} />
              {saveMutation.isPending ? t('synchronizing') : t('saveSettings')}
            </Button>
            {config ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={testMutation.isPending}
                  onClick={() => testMutation.mutate()}
                >
                  <Icon name="wifi_tethering" size={17} />
                  {testMutation.isPending ? t('testing') : t('testConnection')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(t('antrean.removeConfirm'))) {
                      deleteMutation.mutate();
                    }
                  }}
                >
                  {t('antrean.removeConfiguration')}
                </Button>
              </>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
