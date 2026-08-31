'use client';

import { useRef, useState } from 'react';
import { CLINIC_LOGO_MAX_UPLOAD_SIZE_BYTES } from '@hms/shared-types';
import { Button, Label } from '@hms/ui';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { isAcceptedLogoMimeType } from '#lib/clinic-profile/is-accepted-logo-mime-type';
import { uploadClinicLogo } from '#lib/clinic-profile/upload-clinic-logo';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';

type ClinicProfileLogoFieldProps = {
  /** Signed URL for the stored logo, or null when none is configured. */
  storedLogoUrl: string | null;
  /** Object URL for a file staged in this editing session, if any. */
  previewUrl: string | null;
  disabled: boolean;
  onStaged: (storageKey: string, previewUrl: string) => void;
  onRemoved: () => void;
  onError: (message: string) => void;
};

const LOGO_PREVIEW_EDGE_PIXELS = 96;

/**
 * The logo half of the form.
 *
 * Picking a file uploads it immediately — the bytes have to reach storage
 * before the profile can name them — but nothing on the clinic's record
 * changes until Save. An administrator who picks a file and then leaves has
 * staged an object nobody claims, which is the same harmless outcome as a
 * document upload nobody confirms.
 *
 * The preview is an `<img>` against the signed URL. That URL is served with
 * `Content-Disposition: attachment`, which browsers apply to navigations and
 * ignore for subresource loads — so the image renders here while opening the
 * URL directly still downloads rather than rendering (SJ-21 §5).
 */
export function ClinicProfileLogoField({
  storedLogoUrl,
  previewUrl,
  disabled,
  onStaged,
  onRemoved,
  onError,
}: ClinicProfileLogoFieldProps) {
  const t = useTranslations('operations.administration.clinicProfile.logo');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const visibleUrl = previewUrl ?? storedLogoUrl;

  async function handleFileSelected(file: File): Promise<void> {
    if (!isAcceptedLogoMimeType(file.type)) {
      onError(t('errors.unsupportedType'));
      return;
    }
    if (file.size > CLINIC_LOGO_MAX_UPLOAD_SIZE_BYTES) {
      onError(t('errors.tooLarge'));
      return;
    }
    setIsUploading(true);
    try {
      const storageKey = await uploadClinicLogo({ file, mimeType: file.type });
      onStaged(storageKey, URL.createObjectURL(file));
    } catch (err: unknown) {
      onError(resolveApiErrorMessage(err, t('errors.failed')));
    } finally {
      setIsUploading(false);
      // Cleared so picking the *same* file again still fires a change event.
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="clinic-profile-logo">{t('label')}</Label>
      <div className="flex items-center gap-4">
        <div className="flex size-24 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {visibleUrl ? (
            <Image
              src={visibleUrl}
              alt={t('previewAlt')}
              width={LOGO_PREVIEW_EDGE_PIXELS}
              height={LOGO_PREVIEW_EDGE_PIXELS}
              className="max-h-24 w-auto object-contain"
              unoptimized
            />
          ) : (
            <span className="px-2 text-center text-xs text-slate-400">{t('empty')}</span>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled || isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? t('uploading') : t('choose')}
            </Button>
            {visibleUrl ? (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled || isUploading}
                onClick={onRemoved}
              >
                {t('remove')}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-slate-500">{t('hint')}</p>
        </div>
      </div>
      <input
        ref={fileInputRef}
        id="clinic-profile-logo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleFileSelected(file);
          }
        }}
      />
    </div>
  );
}
