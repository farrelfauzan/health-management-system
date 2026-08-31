import { PdfRenderOptions } from './pdf.types';

/**
 * Provider-neutral HTML→PDF contract injected by feature services, mirroring
 * `ObjectStorageService`: implementations own every renderer concern, and
 * feature modules depend on this abstraction rather than on a renderer SDK or
 * an HTTP client pointed at one.
 *
 * The input is **self-contained HTML** — every asset already inlined as a
 * `data:` URI. That is not a convenience, it is the security contract
 * (NFR-SEC-03): the renderer is deployed with outbound network access denied,
 * so a template that retains a remote reference renders without it rather
 * than reaching for it.
 */
export abstract class PdfRendererService {
  /**
   * Renders self-contained HTML and resolves with the PDF bytes.
   *
   * Fails closed: an unconfigured, unreachable, slow, or misbehaving renderer
   * raises `ServiceUnavailableException` rather than hanging or resolving with
   * something that is not a PDF. Callers record the failure against their own
   * row; nothing in billing may be blocked by it.
   */
  abstract render(html: string, options: PdfRenderOptions): Promise<Uint8Array>;
}
