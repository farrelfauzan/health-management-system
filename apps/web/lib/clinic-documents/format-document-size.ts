const BYTES_PER_KILOBYTE = 1024;

/**
 * A stored file's size, rounded to something a person reads at a glance.
 *
 * Anything under a megabyte is shown in kilobytes, with a floor of 1 KB so a
 * very small document does not read as "0 KB" — which looks like a failed
 * upload rather than a short file.
 */
export function formatDocumentSize(sizeBytes: number): string {
  const kilobytes = sizeBytes / BYTES_PER_KILOBYTE;
  return kilobytes < BYTES_PER_KILOBYTE
    ? `${Math.max(1, Math.round(kilobytes))} KB`
    : `${(kilobytes / BYTES_PER_KILOBYTE).toFixed(1)} MB`;
}
