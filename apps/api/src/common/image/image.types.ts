/**
 * Infrastructure-internal types for the shared image pipeline. They stay in
 * `common/` rather than `@hms/shared-types` for the same reason
 * `storage.types.ts` does: no client ever sees them, and the pipeline they
 * describe is an implementation detail of how bytes reach the bucket.
 */
export type ValidateImageContentParams = {
  readonly content: Uint8Array;
  readonly declaredMimeType: string;
};

export type ImageContentValidationResult =
  { readonly isAccepted: true } | { readonly isAccepted: false; readonly reason: string };

/**
 * What the re-encode writes out. Chosen by the caller rather than inferred,
 * because the right answer differs by surface and neither answer is a default
 * the other could live with: a logo becomes PNG (flat colour, lossless, alpha
 * preserved), while a scanned document keeps its own format — re-encoding a
 * 15 MiB photograph as PNG would multiply its size, and a document store's
 * whole problem is that scans are large.
 */
export type ReencodeImageFormat = 'png' | 'jpeg' | 'webp';

export type ReencodeImageParams = {
  readonly content: Uint8Array;
  readonly format: ReencodeImageFormat;
  /**
   * Longest edge the output keeps. A larger image is scaled down preserving
   * aspect ratio; a smaller one is left alone rather than upscaled into
   * blurry pixels it never had.
   *
   * Omitted means no resize, which is what a scanned document needs: the
   * point of a 300 dpi scan is that the small print is readable, and a
   * thumbnail of a radiology report is not a radiology report.
   */
  readonly maxEdgePixels?: number;
};

export type ReencodeImageResult = {
  readonly content: Uint8Array;
  readonly widthPixels: number;
  readonly heightPixels: number;
};
