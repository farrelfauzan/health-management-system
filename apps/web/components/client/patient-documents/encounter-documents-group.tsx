'use client';

import type { PatientDocumentView } from '@hms/shared-types';

import { EncounterDocumentRow } from '#components/client/patient-documents/encounter-document-row';

type EncounterDocumentsGroupProps = {
  label: string;
  emptyLabel: string;
  documents: PatientDocumentView[];
  encounterId: string;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

/**
 * One labelled group inside the encounter panel — *This visit* or *History*.
 *
 * An empty group still renders its heading and an empty line rather than
 * disappearing. A consultation with nothing filed today and a thick history
 * should read as "nothing new today", not as a panel that silently lost a
 * section; and the reverse — history collapsing away — would make a
 * first-visit patient look identical to a failed load.
 */
export function EncounterDocumentsGroup({
  label,
  emptyLabel,
  documents,
  encounterId,
  onResult,
  onError,
}: EncounterDocumentsGroupProps) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h3>
      {documents.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((document) => (
            <EncounterDocumentRow
              key={document.id}
              document={document}
              encounterId={encounterId}
              onResult={onResult}
              onError={onError}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
