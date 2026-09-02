const BYTES_PER_KILOBYTE = 1024;
const KILOBYTES_PER_MEGABYTE = 1024;

/** `sizeBytes` as the short human figure a table column has room for. */
export function formatDocumentSize(sizeBytes: number): string {
  const kilobytes = sizeBytes / BYTES_PER_KILOBYTE;
  if (kilobytes < KILOBYTES_PER_MEGABYTE) {
    return `${Math.max(1, Math.round(kilobytes))} KB`;
  }
  return `${(kilobytes / KILOBYTES_PER_MEGABYTE).toFixed(1)} MB`;
}
