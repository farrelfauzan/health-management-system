'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BpjsPcareConfigView,
  BpjsPcareConnectionTestResult,
  UpsertBpjsPcareConfigInput,
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
  bpjsPcareConfigControllerDeleteConfigV1,
  bpjsPcareConfigControllerTestConnectionV1,
  bpjsPcareConfigControllerUpsertConfigV1,
  getBpjsPcareConfigControllerGetConfigV1QueryKey,
} from '#lib/api/generated/bpjs-pcare/bpjs-pcare';
import { isApiStatusError } from '#lib/api/is-api-status-error';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { useBpjsConfig } from '#lib/integrations/use-integration-queries';

type FormState = {
  environment: 'DEVELOPMENT' | 'PRODUCTION';
  consId: string;
  kdProviderPpk: string;
  pcareUsername: string;
  secretKey: string;
  userKey: string;
  pcarePassword: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  environment: 'DEVELOPMENT',
  consId: '',
  kdProviderPpk: '',
  pcareUsername: '',
  secretKey: '',
  userKey: '',
  pcarePassword: '',
  isActive: true,
};

function configToForm(config: BpjsPcareConfigView): FormState {
  return {
    environment: config.environment,
    consId: config.consId,
    kdProviderPpk: config.kdProviderPpk,
    pcareUsername: config.pcareUsername,
    secretKey: '',
    userKey: '',
    pcarePassword: '',
    isActive: config.isActive,
  };
}

export function BpjsSettingsPanel() {
  const t = useTranslations('operations.integrations');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const configQuery = useBpjsConfig();
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
    mutationFn: async (payload: UpsertBpjsPcareConfigInput) => {
      const response = await bpjsPcareConfigControllerUpsertConfigV1(payload);
      return parseApiSuccess<BpjsPcareConfigView>(response, t('labels.saveError')).data;
    },
    onSuccess: async (saved) => {
      setForm(configToForm(saved));
      await queryClient.invalidateQueries({
        queryKey: getBpjsPcareConfigControllerGetConfigV1QueryKey(),
      });
      toast.success('BPJS PCare settings saved.');
    },
    onError: (error) => setFormError(notifyApiError(error, t('labels.saveError'))),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await bpjsPcareConfigControllerTestConnectionV1();
      return parseApiSuccess<BpjsPcareConnectionTestResult>(response, t('labels.testError')).data;
    },
    onSuccess: (result) => {
      if (result.isSuccessful) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      void queryClient.invalidateQueries({
        queryKey: getBpjsPcareConfigControllerGetConfigV1QueryKey(),
      });
    },
    onError: (error) => notifyApiError(error, t('labels.testError')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => bpjsPcareConfigControllerDeleteConfigV1(),
    onSuccess: async () => {
      setForm(EMPTY_FORM);
      await queryClient.invalidateQueries({
        queryKey: getBpjsPcareConfigControllerGetConfigV1QueryKey(),
      });
      toast.success('BPJS PCare configuration removed.');
    },
    onError: (error) => notifyApiError(error, t('labels.removeError')),
  });

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    const payload: UpsertBpjsPcareConfigInput = {
      environment: form.environment,
      consId: form.consId.trim(),
      kdProviderPpk: form.kdProviderPpk.trim(),
      pcareUsername: form.pcareUsername.trim(),
      isActive: form.isActive,
      ...(form.secretKey.trim() ? { secretKey: form.secretKey.trim() } : {}),
      ...(form.userKey.trim() ? { userKey: form.userKey.trim() } : {}),
      ...(form.pcarePassword ? { pcarePassword: form.pcarePassword } : {}),
    };
    await saveMutation.mutateAsync(payload).catch(() => undefined);
  }

  if (configQuery.isPending) {
    return <p className="text-sm text-slate-500">{t('labels.loadingSettings')}</p>;
  }

  if (configQuery.isError && !isUnconfigured) {
    return (
      <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
        {t('labels.configError')}
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('labels.credentials')}</CardTitle>
        <CardDescription>
          Configure the facility account. Stored secrets are never returned by the API.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          {isUnconfigured ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {t('labels.credentials')}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bpjs-environment">{t('labels.environment')}</Label>
              <Select
                value={form.environment}
                onValueChange={(value) =>
                  updateField('environment', value as FormState['environment'])
                }
              >
                <SelectTrigger id="bpjs-environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEVELOPMENT">{t('development')}</SelectItem>
                  <SelectItem value="PRODUCTION">{t('production')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpjs-cons-id">{t('labels.consumerId')}</Label>
              <Input
                id="bpjs-cons-id"
                required
                maxLength={32}
                value={form.consId}
                onChange={(event) => updateField('consId', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpjs-provider-code">{t('labels.providerCode')}</Label>
              <Input
                id="bpjs-provider-code"
                required
                maxLength={32}
                value={form.kdProviderPpk}
                onChange={(event) => updateField('kdProviderPpk', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpjs-username">{t('labels.username')}</Label>
              <Input
                id="bpjs-username"
                required
                maxLength={128}
                autoComplete="off"
                value={form.pcareUsername}
                onChange={(event) => updateField('pcareUsername', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpjs-secret">
                Secret key {config?.hasSecretKey ? `(saved ····${config.secretKeyLast4})` : ''}
              </Label>
              <Input
                id="bpjs-secret"
                type="password"
                required={!config?.hasSecretKey}
                autoComplete="new-password"
                placeholder={config?.hasSecretKey ? t('keepSecret') : undefined}
                value={form.secretKey}
                onChange={(event) => updateField('secretKey', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpjs-user-key">
                User key {config?.hasUserKey ? `(saved ····${config.userKeyLast4})` : ''}
              </Label>
              <Input
                id="bpjs-user-key"
                type="password"
                required={!config?.hasUserKey}
                autoComplete="new-password"
                placeholder={config?.hasUserKey ? t('keepSecret') : undefined}
                value={form.userKey}
                onChange={(event) => updateField('userKey', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpjs-password">
                PCare password {config?.hasPcarePassword ? '(saved)' : ''}
              </Label>
              <Input
                id="bpjs-password"
                type="password"
                required={!config?.hasPcarePassword}
                autoComplete="new-password"
                placeholder={config?.hasPcarePassword ? t('keepSecret') : undefined}
                value={form.pcarePassword}
                onChange={(event) => updateField('pcarePassword', event.target.value)}
              />
            </div>
            <label className="flex items-center gap-3 self-end pb-2 text-sm font-medium">
              <Checkbox
                checked={form.isActive}
                onCheckedChange={(checked) => updateField('isActive', checked === true)}
              />
              Enable PCare bridging
            </label>
          </div>

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
                    if (
                      window.confirm(
                        'Remove the BPJS PCare configuration? Submission processing will stop.',
                      )
                    ) {
                      deleteMutation.mutate();
                    }
                  }}
                >
                  Remove configuration
                </Button>
              </>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
