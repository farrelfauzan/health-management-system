'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClinicProfileView, UpdateClinicProfileInput } from '@hms/shared-types';
import { Button, Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicProfileLogoField } from '#components/client/clinic-profile/clinic-profile-logo-field';
import { ClinicProfileTextField } from '#components/client/clinic-profile/clinic-profile-text-field';
import { clinicProfileControllerUpdateClinicProfileV1 } from '#lib/api/generated/clinic-profile/clinic-profile';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateClinicProfileQueries } from '#lib/clinic-profile/invalidate-clinic-profile-queries';

type ClinicProfileFormProps = {
  profile: ClinicProfileView | null;
  canWrite: boolean;
};

type LogoSelection =
  | { kind: 'unchanged' }
  | { kind: 'staged'; storageKey: string; previewUrl: string }
  | { kind: 'removed' };

/**
 * The clinic-profile editor.
 *
 * Text fields are sent as trimmed strings, and an emptied optional field is
 * sent as `null` rather than `''` — the API's three-state PATCH treats absent
 * as "leave it", null as "clear it", and a blank string would store an empty
 * value that then prints as a blank line on an invoice.
 */
export function ClinicProfileForm({ profile, canWrite }: ClinicProfileFormProps) {
  const t = useTranslations('operations.administration.clinicProfile');
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile?.name ?? '');
  const [legalName, setLegalName] = useState(profile?.legalName ?? '');
  const [address, setAddress] = useState(profile?.address ?? '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phoneNumber ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [licenseNumber, setLicenseNumber] = useState(profile?.licenseNumber ?? '');
  const [taxId, setTaxId] = useState(profile?.taxId ?? '');
  const [logo, setLogo] = useState<LogoSelection>({ kind: 'unchanged' });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      parseApiSuccess(
        await clinicProfileControllerUpdateClinicProfileV1(buildPayload()),
        t('errors.saveFailed'),
      );
    },
    onSuccess: async () => {
      await invalidateClinicProfileQueries(queryClient);
      setLogo({ kind: 'unchanged' });
      setError(null);
      setNotice(t('saved'));
    },
    onError: (err: unknown) => {
      setNotice(null);
      setError(resolveApiErrorMessage(err, t('errors.saveFailed')));
    },
  });

  function toOptionalField(value: string): string | null {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  function buildLogoField(): Pick<UpdateClinicProfileInput, 'logoStorageKey'> {
    if (logo.kind === 'staged') {
      return { logoStorageKey: logo.storageKey };
    }
    if (logo.kind === 'removed') {
      return { logoStorageKey: null };
    }
    return {};
  }

  function buildPayload(): UpdateClinicProfileInput {
    return {
      name: name.trim(),
      legalName: toOptionalField(legalName),
      address: toOptionalField(address),
      phoneNumber: toOptionalField(phoneNumber),
      email: toOptionalField(email),
      licenseNumber: toOptionalField(licenseNumber),
      taxId: toOptionalField(taxId),
      ...buildLogoField(),
    };
  }

  function handleLogoStaged(storageKey: string, previewUrl: string): void {
    setError(null);
    setLogo({ kind: 'staged', storageKey, previewUrl });
  }

  function handleLogoRemoved(): void {
    setError(null);
    setLogo({ kind: 'removed' });
  }

  const isSaveDisabled = !canWrite || saveMutation.isPending || name.trim() === '';

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        {notice ? (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>
        ) : null}
        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <ClinicProfileTextField
            id="clinic-profile-name"
            label={t('fields.name')}
            value={name}
            disabled={!canWrite}
            onChange={setName}
          />
          <ClinicProfileTextField
            id="clinic-profile-legal-name"
            label={t('fields.legalName')}
            value={legalName}
            disabled={!canWrite}
            onChange={setLegalName}
          />
          <ClinicProfileTextField
            id="clinic-profile-address"
            label={t('fields.address')}
            value={address}
            disabled={!canWrite}
            onChange={setAddress}
          />
          <ClinicProfileTextField
            id="clinic-profile-phone-number"
            label={t('fields.phoneNumber')}
            type="tel"
            value={phoneNumber}
            disabled={!canWrite}
            onChange={setPhoneNumber}
          />
          <ClinicProfileTextField
            id="clinic-profile-email"
            label={t('fields.email')}
            type="email"
            value={email}
            disabled={!canWrite}
            onChange={setEmail}
          />
          <ClinicProfileTextField
            id="clinic-profile-license-number"
            label={t('fields.licenseNumber')}
            value={licenseNumber}
            disabled={!canWrite}
            onChange={setLicenseNumber}
          />
          <ClinicProfileTextField
            id="clinic-profile-tax-id"
            label={t('fields.taxId')}
            value={taxId}
            disabled={!canWrite}
            onChange={setTaxId}
          />
        </div>
        <ClinicProfileLogoField
          storedLogoUrl={logo.kind === 'removed' ? null : (profile?.logoUrl ?? null)}
          previewUrl={logo.kind === 'staged' ? logo.previewUrl : null}
          disabled={!canWrite}
          onStaged={handleLogoStaged}
          onRemoved={handleLogoRemoved}
          onError={setError}
        />
        {canWrite ? (
          <div className="flex justify-end">
            <Button type="button" disabled={isSaveDisabled} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? t('saving') : t('save')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
