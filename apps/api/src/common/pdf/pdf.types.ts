/**
 * Renderer configuration resolved from the environment at startup.
 *
 * `baseUrl` is deliberately allowed to be empty. The sidecar is optional
 * infrastructure (`P16-T01`): a deployment without it must still boot, serve
 * billing, and record payments — it just cannot produce a PDF, which the
 * adapter reports as a service error on the one request that wanted one.
 */
export type PdfRendererConfig = {
  readonly baseUrl: string;
  readonly requestTimeoutMs: number;
  readonly maxOutputBytes: number;
};

/**
 * Page geometry, in inches because that is the unit the renderer speaks and
 * converting twice only invents rounding. Every field is optional; omitted
 * values fall back to the ISO A4 defaults in `pdf.config.ts`.
 */
export type PdfPageMargins = {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
};

export type PdfRenderOptions = {
  readonly paperWidthInches?: number;
  readonly paperHeightInches?: number;
  readonly marginInches?: PdfPageMargins;
  readonly landscape?: boolean;
  /**
   * Background colours and images. Off in the renderer's own default, which
   * is wrong for a document whose header block is a filled rectangle, so the
   * adapter defaults it on.
   */
  readonly printBackground?: boolean;
  /**
   * Honour `@page` rules in the template's own CSS instead of the paper size
   * above. A template author who sets `@page { size: A5 }` means it.
   */
  readonly preferCssPageSize?: boolean;
  /**
   * Correlation id echoed into the renderer's logs. Carries no PII: an
   * invoice number is a business identifier that a shared container's log is
   * not the place for, so callers pass a request id.
   */
  readonly traceId?: string;
};

/**
 * One document to lock with a user password (`P16-T37`). The password is a
 * value the caller resolved for this send and must not keep; it is neither
 * logged nor stored by anything in this module.
 */
export type EncryptPdfRequest = {
  readonly pdf: Uint8Array;
  readonly userPassword: string;
};
