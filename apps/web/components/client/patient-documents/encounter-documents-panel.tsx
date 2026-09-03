'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { EncounterDocumentsGroup } from '#components/client/patient-documents/encounter-documents-group';
import { isForbiddenError } from '#lib/api/is-forbidden-error';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { useEncounterDocuments } from '#lib/patient-documents/use-encounter-documents';

type EncounterDocumentsPanelProps = {
  encounterId: string;
};

/**
 * The Documents panel in the doctor's encounter workspace (FR-E2-05,
 * US-E2-02): this visit's files first, then the rest of the patient's record,
 * so a clinician is not consulting from memory or a phone photo.
 *
 * **Collapsed by default with a count badge** (§7.2.6). The panel sits beside
 * vitals and diagnoses in a workspace that is already dense, and most
 * consultations do not need the file open — but a doctor does need to know at
 * a glance whether there is anything in it, which is what the badge is for.
 * The badge is rendered from the fetched counts, so the query runs while
 * collapsed; the alternative, fetching on expand, would make the badge a lie
 * until someone clicked it.
 *
 * The open/closed state is per panel, not global: it is a property of this
 * consultation, not a preference to carry between patients.
 *
 * A 403 renders as a distinct access-lost state rather than an error toast.
 * A doctor's reach here is an assignment or an attended encounter and either
 * can be revoked mid-session (§7.2.7) — the honest thing to show then is that
 * access ended, not that something broke.
 */
export function EncounterDocumentsPanel({ encounterId }: EncounterDocumentsPanelProps) {
  const t = useTranslations('clinical.encounters.documents');
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const query = useEncounterDocuments(encounterId);

  const thisVisit = query.data?.data.thisVisit ?? [];
  const history = query.data?.data.history ?? [];
  const totalCount = thisVisit.length + history.length;
  const isAccessLost = isForbiddenError(query.error);

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((wasOpen) => !wasOpen)}
        >
          <CardTitle className="font-heading text-base">
            {t('title')}
            {query.isSuccess ? (
              <span className="ml-2 text-xs font-normal text-slate-400">{totalCount}</span>
            ) : null}
          </CardTitle>
          <Icon name={isOpen ? 'expand_less' : 'expand_more'} size={20} />
        </button>
      </CardHeader>
      {isOpen ? (
        <CardContent className="space-y-4">
          {query.isPending ? <p className="text-sm text-slate-400">{t('loading')}</p> : null}
          {isAccessLost ? <p className="text-sm text-slate-500">{t('accessLost')}</p> : null}
          {query.isError && !isAccessLost ? (
            <p className="text-sm text-red-600">{resolveApiErrorMessage(query.error, t('loadError'))}</p>
          ) : null}
          {query.isSuccess ? (
            <>
              <EncounterDocumentsGroup
                label={t('thisVisit')}
                emptyLabel={t('thisVisitEmpty')}
                documents={thisVisit}
                encounterId={encounterId}
                onResult={setResultMessage}
                onError={setErrorMessage}
              />
              <EncounterDocumentsGroup
                label={t('history')}
                emptyLabel={t('historyEmpty')}
                documents={history}
                encounterId={encounterId}
                onResult={setResultMessage}
                onError={setErrorMessage}
              />
            </>
          ) : null}
          {resultMessage === null ? null : (
            <p className="text-sm text-emerald-700">{resultMessage}</p>
          )}
          {errorMessage === null ? null : <p className="text-sm text-red-600">{errorMessage}</p>}
        </CardContent>
      ) : null}
    </Card>
  );
}
