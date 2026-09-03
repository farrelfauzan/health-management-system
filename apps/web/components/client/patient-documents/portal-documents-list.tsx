'use client';

import { useState } from 'react';
import { Button } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PortalDocumentRow } from '#components/client/patient-documents/portal-document-row';
import { usePortalDocuments } from '#lib/patient-documents/use-portal-documents';

/**
 * The patient's Documents screen (FR-E2-13, US-E2-04).
 *
 * The empty state explains *why* it is empty — documents appear once the
 * clinic releases them — rather than saying "no documents". A patient who has
 * had blood drawn and sees an empty page needs to know the result exists and
 * is not shared yet, not to conclude the clinic lost it.
 *
 * No inline preview in v1, and the page says so (§7.2.6). A download that
 * silently does nothing on a phone is worse than one that warned it would
 * download.
 */
export function PortalDocumentsList() {
  const t = useTranslations('clinical.portal.documents');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const query = usePortalDocuments();

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-heading text-xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="text-sm text-slate-500">{t('subtitle')}</p>
      </header>

      {query.isPending ? <p className="text-sm text-slate-400">{t('loading')}</p> : null}

      {/* One fixed sentence, not the API's message. On staff screens the
          server's wording is useful — it names a refusal a clinician can act
          on. A patient can act on none of it, and "Request failed with status
          code 500" is a worse thing to hand someone waiting on a test result
          than a plain sentence saying it did not load. */}
      {query.isError ? <p className="text-sm text-red-600">{t('loadError')}</p> : null}

      {query.isSuccess && query.documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center">
          <p className="font-medium text-slate-700">{t('emptyTitle')}</p>
          <p className="mt-1 text-sm text-slate-500">{t('emptyDescription')}</p>
        </div>
      ) : null}

      {query.documents.length > 0 ? (
        <ul className="space-y-2">
          {query.documents.map((document) => (
            <PortalDocumentRow key={document.id} document={document} onError={setErrorMessage} />
          ))}
        </ul>
      ) : null}

      {query.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? t('loadingMore') : t('loadMore')}
        </Button>
      ) : null}

      {query.documents.length > 0 ? (
        <p className="text-xs text-slate-400">{t('downloadNotice')}</p>
      ) : null}

      {errorMessage === null ? null : <p className="text-sm text-red-600">{errorMessage}</p>}
    </section>
  );
}
