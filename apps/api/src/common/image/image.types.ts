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

export type ReencodeImageParams = {
  readonly content: Uint8Array;
  /**
   * Longest edge the output keeps. A larger image is scaled down preserving
   * aspect ratio; a smaller one is left alone rather than upscaled into
   * blurry pixels it never had.
   */
  readonly maxEdgePixels: number;
};

export type ReencodeImageResult = {
  readonly content: Uint8Array;
  readonly widthPixels: number;
  readonly heightPixels: number;
};
