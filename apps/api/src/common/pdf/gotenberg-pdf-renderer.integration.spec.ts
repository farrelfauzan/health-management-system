import { AddressInfo } from 'node:net';
import { Server, createServer } from 'node:http';

import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFParse } from 'pdf-parse';

import { GotenbergPdfRendererService } from './gotenberg-pdf-renderer.service';

/**
 * `P16-T01` acceptance: the renderer adapter against a real Gotenberg
 * container.
 *
 * `gotenberg-pdf-renderer.service.spec.ts` covers the adapter's logic with
 * `fetch` stubbed, which is the right shape for the validation branches and
 * for pinning the multipart body. What a mock cannot prove is the half of
 * this feature that lives in the container: that the part named `index.html`
 * is the one Chromium actually renders, that the bytes coming back parse as a
 * PDF with the pages and the embedded fonts a printed invoice needs, and —
 * the security-relevant one — that a template carrying a remote reference
 * renders *without fetching it*. Those failures are invisible to a mock and
 * are exactly the properties D-026 was accepted on.
 *
 * **Opt-in by design.** The suite runs only when
 * `PDF_RENDERER_INTEGRATION_TEST_BASE_URL` names a renderer, and skips
 * cleanly otherwise, so a normal `pnpm integration:test` needs no container.
 * The gate is a dedicated variable rather than `PDF_RENDERER_BASE_URL`
 * because the compose sidecar publishes no port on purpose: reaching it means
 * a deliberate throwaway container, and keying off the application's own
 * variable would let a misconfigured run drive whatever renderer the app is
 * pointed at.
 *
 *   docker run --rm -p 3010:3000 --add-host host.docker.internal:host-gateway \
 *     gotenberg/gotenberg:8.36.0 gotenberg --api-timeout=30s \
 *     --chromium-deny-private-ips --chromium-deny-public-ips \
 *     --libreoffice-disable-routes --pdfengines-disable-routes
 *   PDF_RENDERER_INTEGRATION_TEST_BASE_URL=http://127.0.0.1:3010 pnpm integration:test
 */
const rendererBaseUrl = process.env.PDF_RENDERER_INTEGRATION_TEST_BASE_URL ?? '';
const describeWhenConfigured = rendererBaseUrl === '' ? describe.skip : describe;

if (rendererBaseUrl === '') {
  console.warn(
    '[gotenberg-pdf-renderer.integration] skipped: set PDF_RENDERER_INTEGRATION_TEST_BASE_URL to a running Gotenberg to run the round trip against a real renderer.',
  );
}

describeWhenConfigured('Gotenberg PDF renderer integration', () => {
  const RENDERER_TIMEOUT_MS = 30_000;
  const INVOICE_NUMBER = 'INV-20260830-0007';
  /**
   * Enough line items to force pagination past the third page on any
   * reasonable line height. The assertions below check "at least three", not
   * "exactly three": the page count is Chromium's line-breaking decision, and
   * pinning it would make a browser patch release look like a regression.
   */
  const LINE_ITEM_COUNT = 70;
  /**
   * How the renderer addresses this test process. Docker's own alias for the
   * host by default, which is what a container started with
   * `--add-host host.docker.internal:host-gateway` resolves.
   */
  const callbackHost =
    process.env.PDF_RENDERER_INTEGRATION_TEST_CALLBACK_HOST ?? 'host.docker.internal';

  function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
    const values: Record<string, string> = {
      PDF_RENDERER_BASE_URL: rendererBaseUrl,
      PDF_RENDERER_TIMEOUT_MS: String(RENDERER_TIMEOUT_MS),
      ...overrides,
    };
    return { get: (key: string) => values[key] } as unknown as ConfigService;
  }

  function buildInvoiceHtml(headExtra = '', bodyExtra = ''): string {
    const rows = Array.from({ length: LINE_ITEM_COUNT }, (_item, index) => {
      const itemNumber = index + 1;
      return `<tr><td>${itemNumber}</td><td>Tindakan pemeriksaan umum nomor ${itemNumber}</td><td class="n">Rp 125.000</td></tr>`;
    }).join('');
    return `<!doctype html><html lang="id"><head><meta charset="utf-8">${headExtra}
<style>
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; margin: 0; }
  .sheet { padding: 18mm 16mm; }
  header { border-bottom: 3px solid #0f766e; background: #f0fdfa; padding-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  td { border-bottom: 1px solid #e2e8f0; padding: 5px 8px; }
  td.n { text-align: right; }
</style></head><body><div class="sheet">
<header><h1>Klinik Sehat Bersama</h1><p>FAKTUR ${INVOICE_NUMBER}</p></header>
<table><tbody>${rows}</tbody></table>
<p>Terbilang: lima juta dua ratus lima puluh ribu rupiah</p>
${bodyExtra}
</div></body></html>`;
  }

  async function readPdf(bytes: Uint8Array): Promise<{ pageCount: number; text: string }> {
    const parser = new PDFParse({ data: bytes });
    try {
      const parsed = await parser.getText({ pageJoiner: '' });
      return { pageCount: parsed.total ?? 0, text: parsed.text };
    } finally {
      await parser.destroy();
    }
  }

  it(
    'renders a multi-page invoice into a parseable PDF with its fonts embedded',
    async () => {
      const service = new GotenbergPdfRendererService(buildConfigService());

      const bytes = await service.render(buildInvoiceHtml(), { traceId: 'p16-t01-round-trip' });

      const raw = Buffer.from(bytes).toString('latin1');
      expect(raw.slice(0, 5)).toBe('%PDF-');
      // Chromium's PDF backend (Skia) emits 1.4 headers, not 1.7. Recorded in
      // D-026 because it is the input to the P16-T37 encryption choice, not
      // because anything here depends on it.
      expect(raw.slice(0, 8)).toBe('%PDF-1.4');
      // Subsetted TrueType programs carried inside the file. A receipt that
      // relied on the reader having Georgia would render differently on every
      // machine that opened it.
      expect(raw).toContain('/FontFile2');
      const parsed = await readPdf(bytes);
      expect(parsed.pageCount).toBeGreaterThanOrEqual(3);
      expect(parsed.text).toContain(INVOICE_NUMBER);
      expect(parsed.text).toContain('Terbilang');
    },
    RENDERER_TIMEOUT_MS,
  );

  describe('outbound isolation (NFR-SEC-03)', () => {
    let trackerServer: Server;
    let trackerPort: number;
    let trackerRequestPaths: string[];

    beforeEach(async () => {
      trackerRequestPaths = [];
      trackerServer = createServer((request, response) => {
        trackerRequestPaths.push(request.url ?? '');
        response.writeHead(200, { 'Content-Type': 'image/png' });
        response.end();
      });
      await new Promise<void>((resolve) => trackerServer.listen(0, '0.0.0.0', resolve));
      trackerPort = (trackerServer.address() as AddressInfo).port;
    });

    afterEach(async () => {
      await new Promise<void>((resolve, reject) =>
        trackerServer.close((err) => (err ? reject(err) : resolve())),
      );
    });

    it(
      'renders a template carrying remote references without fetching any of them',
      async () => {
        const trackerOrigin = `http://${callbackHost}:${trackerPort}`;
        // The control. "Nothing arrived" is only evidence if something could
        // have: this proves the counter and the socket work before the
        // absence of a hit is read as isolation. It does not prove the
        // renderer *container* has a route here — that half is Docker's
        // `internal: true` network, asserted in the compose file and in D-026.
        await fetch(`http://127.0.0.1:${trackerPort}/control.png`);
        expect(trackerRequestPaths).toEqual(['/control.png']);
        trackerRequestPaths = [];
        const html = buildInvoiceHtml(
          `<link rel="stylesheet" href="${trackerOrigin}/tracker.css">`,
          `<img src="${trackerOrigin}/tracker.png" width="10" height="10" alt="">`,
        );

        const bytes = await new GotenbergPdfRendererService(buildConfigService()).render(html, {});

        // Both halves matter. The render must succeed — a stray remote
        // reference in a template is a warning, never a failed invoice — and
        // nothing may leave the renderer to resolve it.
        expect(trackerRequestPaths).toEqual([]);
        const parsed = await readPdf(bytes);
        expect(parsed.pageCount).toBeGreaterThanOrEqual(3);
        expect(parsed.text).toContain(INVOICE_NUMBER);
      },
      RENDERER_TIMEOUT_MS,
    );
  });

  it(
    'fails closed with a clear error when the sidecar is unreachable, instead of hanging',
    async () => {
      // A port nothing is listening on, with a deadline far shorter than this
      // test's: a renderer that is down must cost one request, not one worker.
      const service = new GotenbergPdfRendererService(
        buildConfigService({
          PDF_RENDERER_BASE_URL: 'http://127.0.0.1:1',
          PDF_RENDERER_TIMEOUT_MS: '2000',
        }),
      );

      await expect(service.render('<p>Faktur</p>', {})).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
    RENDERER_TIMEOUT_MS,
  );
});
