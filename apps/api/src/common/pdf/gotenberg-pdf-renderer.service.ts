import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  A4_PAPER_HEIGHT_INCHES,
  A4_PAPER_WIDTH_INCHES,
  DEFAULT_PAGE_MARGIN_INCHES,
  resolvePdfRendererConfig,
} from './pdf.config';
import { PdfRendererService } from './pdf-renderer.service';
import { PdfRenderOptions, PdfRendererConfig } from './pdf.types';

const CONVERT_HTML_PATH = '/forms/chromium/convert/html';
/**
 * Gotenberg identifies the document to render by filename, not by field
 * order: the part named `index.html` is the entry point and anything else
 * uploaded alongside it is an asset. HMS uploads only the one part, because
 * the HTML arriving here is already self-contained.
 */
const ENTRY_POINT_FILENAME = 'index.html';
const TRACE_HEADER = 'Gotenberg-Trace';
const PDF_MAGIC_BYTES = '%PDF-';

/**
 * Gotenberg-backed HTML→PDF rendering over `/forms/chromium/convert/html`
 * (**D-026**). Chromium runs in its own container, so a renderer crash, a
 * memory blow-up, or a parser bug lands on a process that holds no database
 * connection and no application credentials.
 *
 * Two properties of this adapter are load-bearing rather than incidental:
 *
 *   * **It never sends a URL.** Only `/convert/html` is used, never
 *     `/convert/url`. The renderer is given bytes and asked to typeset them;
 *     it is never given an address and asked to go get something.
 *   * **Every failure is a `ServiceUnavailableException` with no upstream
 *     body.** Gotenberg answers a failed conversion with Chromium's error
 *     text, which can quote the document it was handed — and the documents
 *     here are invoices and clinical letters. The status is safe to surface;
 *     the body is not.
 */
@Injectable()
export class GotenbergPdfRendererService extends PdfRendererService {
  private readonly logger = new Logger(GotenbergPdfRendererService.name);
  private readonly rendererConfig: PdfRendererConfig;

  constructor(configService: ConfigService) {
    super();
    this.rendererConfig = resolvePdfRendererConfig(configService);
  }

  async render(html: string, options: PdfRenderOptions): Promise<Uint8Array> {
    if (html.trim() === '') {
      throw new ServiceUnavailableException('PDF renderer received empty HTML');
    }
    const baseUrl = this.rendererConfig.baseUrl;
    if (baseUrl === '') {
      throw new ServiceUnavailableException(
        'PDF renderer is not configured — set PDF_RENDERER_BASE_URL to the renderer sidecar',
      );
    }
    const response = await this.postConversion(baseUrl, html, options);
    return this.readPdfBytes(response);
  }

  private async postConversion(
    baseUrl: string,
    html: string,
    options: PdfRenderOptions,
  ): Promise<Response> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.rendererConfig.requestTimeoutMs);
    try {
      const response = await fetch(`${baseUrl}${CONVERT_HTML_PATH}`, {
        method: 'POST',
        headers: this.buildHeaders(options),
        body: this.buildForm(html, options),
        signal: abortController.signal,
      });
      if (!response.ok) {
        throw new ServiceUnavailableException(
          `PDF renderer responded with status ${response.status}`,
        );
      }
      return response;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      this.logger.error(`PDF render request to ${baseUrl} failed`);
      throw new ServiceUnavailableException('PDF renderer is unreachable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildHeaders(options: PdfRenderOptions): Record<string, string> {
    if (options.traceId === undefined || options.traceId.trim() === '') {
      return {};
    }
    return { [TRACE_HEADER]: options.traceId.trim() };
  }

  private buildForm(html: string, options: PdfRenderOptions): FormData {
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), ENTRY_POINT_FILENAME);
    form.append('paperWidth', String(options.paperWidthInches ?? A4_PAPER_WIDTH_INCHES));
    form.append('paperHeight', String(options.paperHeightInches ?? A4_PAPER_HEIGHT_INCHES));
    form.append('marginTop', this.readMargin(options, 'top'));
    form.append('marginRight', this.readMargin(options, 'right'));
    form.append('marginBottom', this.readMargin(options, 'bottom'));
    form.append('marginLeft', this.readMargin(options, 'left'));
    form.append('landscape', String(options.landscape ?? false));
    form.append('printBackground', String(options.printBackground ?? true));
    form.append('preferCssPageSize', String(options.preferCssPageSize ?? false));
    // `print`, matching what a browser's Print dialog would do with the same
    // template — so a `@media print` rule an author previewed in Chrome is the
    // rule that renders here.
    form.append('emulatedMediaType', 'print');
    // A template whose script throws is a broken document, not a slightly
    // wrong one: better a failed render the UI offers to retry than a silently
    // half-populated invoice handed to a patient.
    form.append('failOnConsoleExceptions', 'true');
    return form;
  }

  private readMargin(options: PdfRenderOptions, edge: 'top' | 'right' | 'bottom' | 'left'): string {
    return String(options.marginInches?.[edge] ?? DEFAULT_PAGE_MARGIN_INCHES);
  }

  private async readPdfBytes(response: Response): Promise<Uint8Array> {
    const declaredLength = Number(response.headers.get('content-length') ?? Number.NaN);
    if (Number.isInteger(declaredLength) && declaredLength > this.rendererConfig.maxOutputBytes) {
      throw new ServiceUnavailableException(
        `PDF renderer returned ${declaredLength} bytes, above the configured maximum`,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > this.rendererConfig.maxOutputBytes) {
      throw new ServiceUnavailableException(
        `PDF renderer returned ${bytes.byteLength} bytes, above the configured maximum`,
      );
    }
    this.assertPdf(bytes);
    return bytes;
  }

  /**
   * A 200 is not evidence. A proxy interposed between the API and the sidecar
   * can answer an error page with a success status, and the caller's next act
   * is to persist these bytes as an invoice document — so the header is
   * checked before anything downstream treats them as a PDF.
   */
  private assertPdf(bytes: Uint8Array): void {
    const header = Buffer.from(bytes.subarray(0, PDF_MAGIC_BYTES.length)).toString('latin1');
    if (header !== PDF_MAGIC_BYTES) {
      throw new ServiceUnavailableException('PDF renderer returned a payload that is not a PDF');
    }
  }
}
