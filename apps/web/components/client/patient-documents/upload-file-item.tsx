'use client';

import { Badge, Button, Icon, Input } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { UploadProgressIndicator } from '#components/client/documents/upload-progress-indicator';
import type { DocumentUploadProgress } from '#lib/documents/upload-progress';
import { formatDocumentSize } from '#lib/patient-documents/format-document-size';
import type { UploadFileEntry } from '#lib/patient-documents/upload-file-entry';

type UploadFileItemProps = {
  entry: UploadFileEntry;
  isBatchRunning: boolean;
  onTitleChange: (id: string, title: string) => void;
  onRemove: (id: string) => void;
};

/**
 * One picked file in the upload batch: its name and size, the title it will
 * be recorded under, and — once the batch runs — its own progress bar and
 * its own outcome. The outcome is per row because the batch is not
 * all-or-nothing; a person who picked six files needs to see which four
 * landed and which two did not.
 */
export function UploadFileItem({
  entry,
  isBatchRunning,
  onTitleChange,
  onRemove,
}: UploadFileItemProps) {
  const t = useTranslations('clinical.patients.documents.uploadDialog');
  const isSettled = entry.outcome !== 'pending';
  const isRecorded = entry.outcome === 'recorded' || entry.outcome === 'already-recorded';
  const isInFlight = isBatchRunning && entry.progress !== null && !isSettled;

  function resolveProgressLabel(progress: DocumentUploadProgress): string {
    if (progress.stage === 'uploading') {
      return t('progress.uploading', { percent: progress.percent });
    }
    return t(`progress.${progress.stage}`);
  }

  return (
    <li className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{entry.file.name}</p>
          <p className="text-xs text-slate-500">{formatDocumentSize(entry.file.size)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {entry.outcome === 'recorded' ? <Badge>{t('outcome.recorded')}</Badge> : null}
          {entry.outcome === 'already-recorded' ? (
            <Badge variant="secondary">{t('outcome.alreadyRecorded')}</Badge>
          ) : null}
          {entry.outcome === 'failed' ? (
            <Badge variant="destructive">{t('outcome.failed')}</Badge>
          ) : null}
          {isRecorded ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('remove', { name: entry.file.name })}
              disabled={isBatchRunning}
              onClick={() => onRemove(entry.id)}
            >
              <Icon name="close" size={18} />
            </Button>
          )}
        </div>
      </div>
      {isRecorded ? null : (
        <Input
          aria-label={t('fileTitle', { name: entry.file.name })}
          value={entry.title}
          disabled={isBatchRunning}
          onChange={(event) => onTitleChange(entry.id, event.target.value)}
        />
      )}
      {isInFlight && entry.progress ? (
        <UploadProgressIndicator
          progress={entry.progress}
          label={resolveProgressLabel(entry.progress)}
        />
      ) : null}
      {entry.errorMessage ? <p className="text-sm text-red-700">{entry.errorMessage}</p> : null}
    </li>
  );
}
