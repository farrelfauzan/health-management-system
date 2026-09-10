'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

type CredentialCatalogHintProps = {
  /** Raw stored text that matched no option, if this field holds one. */
  legacyValue?: string;
};

/**
 * There is no free-text fallback on these fields any more (P19-T14), so the
 * form has to say where a missing option comes from — and, when the stored
 * value predates the catalog, what it was, or an admin editing the profile
 * would silently drop a credential they cannot read anywhere on the screen.
 */
export function CredentialCatalogHint({ legacyValue }: CredentialCatalogHintProps) {
  const t = useTranslations('clinical');
  return (
    <p className="text-xs text-slate-500">
      {legacyValue ? (
        <span className="mr-1 text-amber-700">
          {t('doctors.credentials.legacyNotice', { value: legacyValue })}
        </span>
      ) : null}
      <Link
        href="/admin/settings/doctor-credentials"
        className="underline underline-offset-2 hover:text-primary"
      >
        {t('doctors.credentials.manageLink')}
      </Link>
    </p>
  );
}
