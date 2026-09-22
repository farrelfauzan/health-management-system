'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClinicProfileView, UpdateClinicProfileInput } from '@hms/shared-types';
import { Button, Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicProfileLogoField } from '#components/client/clinic-profile/clinic-profile-logo-field';
import { ClinicProfilePhoneField } from '#components/client/clinic-profile/clinic-profile-phone-field';
import { ClinicProfileTextField } from '#components/client/clinic-profile/clinic-profile-text-field';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { RequiredLegend } from '#components/client/shared/required-legend';
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
  const [reportingPuskesmasName, setReportingPuskesmasName] = useState(
    profile?.reportingPuskesmasName ?? '',
  );
  const [reportingPuskesmasCode, setReportingPuskesmasCode] = useState(
    profile?.reportingPuskesmasCode ?? '',
  );
  const [latitude, setLatitude] = useState(
    profile?.latitude === null || profile?.latitude === undefined ? '' : String(profile.latitude),
  );
  const [longitude, setLongitude] = useState(
    profile?.longitude === null || profile?.longitude === undefined
      ? ''
      : String(profile.longitude),
  );
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

  /**
   * The position for SATUSEHAT Locations (P24-T05) is saved as a pair: both
   * filled sends two numbers, both empty clears them, and anything else is
   * refused here before the API refuses it. The API also checks Indonesia's
   * bounding box, which is what catches latitude and longitude typed swapped.
   */
  function buildCoordinateFields(): Pick<
    UpdateClinicProfileInput,
    'latitude' | 'longitude'
  > | null {
    const trimmedLatitude = latitude.trim();
    const trimmedLongitude = longitude.trim();
    if (trimmedLatitude === '' && trimmedLongitude === '') {
      return { latitude: null, longitude: null };
    }
    const parsedLatitude = Number(trimmedLatitude.replace(',', '.'));
    const parsedLongitude = Number(trimmedLongitude.replace(',', '.'));
    if (
      trimmedLatitude === '' ||
      trimmedLongitude === '' ||
      !Number.isFinite(parsedLatitude) ||
      !Number.isFinite(parsedLongitude)
    ) {
      return null;
    }
    return { latitude: parsedLatitude, longitude: parsedLongitude };
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
      reportingPuskesmasName: toOptionalField(reportingPuskesmasName),
      reportingPuskesmasCode: toOptionalField(reportingPuskesmasCode),
      ...buildLogoField(),
      ...buildCoordinateFields(),
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

  function handleSave(): void {
    if (buildCoordinateFields() === null) {
      setNotice(null);
      setError(t('errors.coordinatesPair'));
      return;
    }
    saveMutation.mutate();
  }

  const isSaveDisabled = !canWrite || saveMutation.isPending || name.trim() === '';

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        <RequiredLegend />
        <div className="grid gap-4 md:grid-cols-2">
          <ClinicProfileTextField
            id="clinic-profile-name"
            label={t('fields.name')}
            isRequired
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
          <ClinicProfilePhoneField
            id="clinic-profile-phone-number"
            label={t('fields.phoneNumber')}
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
          <ClinicProfileTextField
            id="clinic-profile-reporting-puskesmas-name"
            label={t('fields.reportingPuskesmasName')}
            value={reportingPuskesmasName}
            disabled={!canWrite}
            onChange={setReportingPuskesmasName}
          />
          <ClinicProfileTextField
            id="clinic-profile-reporting-puskesmas-code"
            label={t('fields.reportingPuskesmasCode')}
            value={reportingPuskesmasCode}
            disabled={!canWrite}
            onChange={setReportingPuskesmasCode}
          />
          <ClinicProfileTextField
            id="clinic-profile-latitude"
            label={t('fields.latitude')}
            value={latitude}
            disabled={!canWrite}
            onChange={setLatitude}
          />
          <ClinicProfileTextField
            id="clinic-profile-longitude"
            label={t('fields.longitude')}
            value={longitude}
            disabled={!canWrite}
            onChange={setLongitude}
          />
        </div>
        <p className="text-xs text-slate-500">{t('reportingPuskesmasHint')}</p>
        <p className="text-xs text-slate-500">{t('coordinatesHint')}</p>
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
            <Button type="button" disabled={isSaveDisabled} onClick={handleSave}>
              {saveMutation.isPending ? t('saving') : t('save')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
