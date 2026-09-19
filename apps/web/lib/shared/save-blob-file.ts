/**
 * Saves bytes the API returned as a file. Revoked in a `finally` so a click
 * that throws does not leak the blob for the life of the tab.
 */
export function saveBlobFile({ blob, fileName }: { blob: Blob; fileName: string }): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
