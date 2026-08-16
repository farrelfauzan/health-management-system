'use client';

import { Progress } from '@hms/ui';

import type { DocumentUploadProgress } from '#lib/documents/upload-progress';

type UploadProgressIndicatorProps = {
  progress: DocumentUploadProgress;
  label: string;
};

const PREPARING_BAR_PERCENT = 4;

/**
 * The Google-Drive-style narration of an in-flight upload: a stage label, a
 * percentage when one exists, and a bar.
 *
 * Only the `uploading` stage owns a real percentage — it is the only stage
 * whose bytes this client can observe. `preparing` shows a sliver so the bar
 * reads as started, and `scanning` holds a full pulsing bar rather than
 * inventing numbers for a server-side check whose progress is not streamed.
 */
export function UploadProgressIndicator({ progress, label }: UploadProgressIndicatorProps) {
  const isUploading = progress.stage === 'uploading';
  const barValue = resolveBarValue(progress);
  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-slate-700">{label}</span>
        {isUploading ? (
          <span className="tabular-nums text-slate-500">{progress.percent}%</span>
        ) : null}
      </div>
      <Progress
        value={barValue}
        className={progress.stage === 'scanning' ? 'animate-pulse' : undefined}
      />
    </div>
  );
}

function resolveBarValue(progress: DocumentUploadProgress): number {
  if (progress.stage === 'preparing') {
    return PREPARING_BAR_PERCENT;
  }
  if (progress.stage === 'uploading') {
    return progress.percent;
  }
  return 100;
}
