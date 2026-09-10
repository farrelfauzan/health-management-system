'use client';

import { Badge, Button, Icon, Input } from '@hms/ui';

import { UploadProgressIndicator } from '#components/client/documents/upload-progress-indicator';
import { InlineNotice } from '#components/client/shared/inline-notice';
import type { UploadFileEntry } from '#lib/documents/upload-file-entry';
import type { UploadFileItemLabels } from '#lib/documents/upload-file-item-labels';
import { formatDocumentSize } from '#lib/patient-documents/format-document-size';

type UploadFileItemProps = {
  entry: UploadFileEntry;
  isBatchRunning: boolean;
  labels: UploadFileItemLabels;
  /**
   * Omitted where the surface records the filename as the title and offers a
   * rename afterwards; the row then shows no text field at all.
   */
  onTitleChange?: (id: string, title: string) => void;
  onRemove: (id: string) => void;
};

/**
 * One picked file in an upload batch: its name and size, the title it will be
 * recorded under, and — once the batch runs — its own progress bar and its own
 * outcome. The outcome is per row because the batch is not all-or-nothing; a
 * person who picked six files needs to see which four landed and which two did
 * not.
 *
 * Shared by both multi-file upload dialogs. Its copy arrives as `labels`
 * rather than being read from a fixed namespace, so neither feature's catalog
 * has to move to make the row reusable.
 */
export function UploadFileItem({
  entry,
  isBatchRunning,
  labels,
  onTitleChange,
  onRemove,
}: UploadFileItemProps) {
  const isSettled = entry.outcome !== 'pending';
  const isRecorded = entry.outcome === 'recorded' || entry.outcome === 'already-recorded';
  const isInFlight = isBatchRunning && entry.progress !== null && !isSettled;
  const titleLabel = labels.buildTitleLabel?.(entry.file.name);
  return (
    <li className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{entry.file.name}</p>
          <p className="text-xs text-slate-500">{formatDocumentSize(entry.file.size)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {entry.outcome === 'recorded' ? <Badge>{labels.recorded}</Badge> : null}
          {entry.outcome === 'already-recorded' ? (
            <Badge variant="secondary">{labels.alreadyRecorded}</Badge>
          ) : null}
          {entry.outcome === 'failed' ? <Badge variant="destructive">{labels.failed}</Badge> : null}
          {isRecorded ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={labels.buildRemoveLabel(entry.file.name)}
              disabled={isBatchRunning}
              onClick={() => onRemove(entry.id)}
            >
              <Icon name="close" size={18} />
            </Button>
          )}
        </div>
      </div>
      {isRecorded || !onTitleChange || titleLabel === undefined ? null : (
        <Input
          aria-label={titleLabel}
          value={entry.title}
          disabled={isBatchRunning}
          onChange={(event) => onTitleChange(entry.id, event.target.value)}
        />
      )}
      {isInFlight && entry.progress ? (
        <UploadProgressIndicator
          progress={entry.progress}
          label={labels.buildProgressLabel(entry.progress)}
        />
      ) : null}
      {entry.errorMessage ? <InlineNotice tone="error">{entry.errorMessage}</InlineNotice> : null}
    </li>
  );
}
