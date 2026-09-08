import { ConfigService } from '@nestjs/config';
import { PDFParse } from 'pdf-parse';

import { GotenbergPdfRendererService } from '../../common/pdf/gotenberg-pdf-renderer.service';
import { buildLabReportHtml } from './service/build-lab-report-html';
import { BUILT_IN_LAB_REPORT_TEMPLATE } from './service/built-in-lab-report-template';

/**
 * `P18-T05` acceptance against a real Gotenberg: the built-in sheet keeps a
 * routine panel on one page, and a long one breaks cleanly onto a second with
 * the table header repeated. A mock cannot answer either — the page count is
 * Chromium's decision — which is why this runs against the container.
 *
 * Opt-in by the same gate the renderer adapter's own round trip uses, for
 * the same reason: the compose sidecar publishes no port on purpose. See
 * `gotenberg-pdf-renderer.integration.spec.ts` for the `docker run` line.
 */
const rendererBaseUrl = process.env.PDF_RENDERER_INTEGRATION_TEST_BASE_URL ?? '';
const describeWhenConfigured = rendererBaseUrl === '' ? describe.skip : describe;

if (rendererBaseUrl === '') {
  console.warn(
    '[lab-report-render.integration] skipped: set PDF_RENDERER_INTEGRATION_TEST_BASE_URL to a running Gotenberg to render the built-in lab report against a real renderer.',
  );
}

describeWhenConfigured('Lab report rendering against Gotenberg', () => {
  const RENDERER_TIMEOUT_MS = 30_000;
  /** The ticket's line: a routine panel of this size is one sheet. */
  const ONE_PAGE_RESULT_COUNT = 25;
  /** Enough rows to run past A4 on any reasonable line height. */
  const MULTI_PAGE_RESULT_COUNT = 70;
  const A4 = { paperWidthInches: 8.27, paperHeightInches: 11.69 };

  function buildConfigService(): ConfigService {
    const values: Record<string, string> = {
      PDF_RENDERER_BASE_URL: rendererBaseUrl,
      PDF_RENDERER_TIMEOUT_MS: String(RENDERER_TIMEOUT_MS),
    };
    return { get: (key: string) => values[key] } as unknown as ConfigService;
  }

  function buildHtml(resultCount: number, amendmentNotice = ''): string {
    return buildLabReportHtml({
      contentHtml: BUILT_IN_LAB_REPORT_TEMPLATE.contentHtml,
      values: {
        'clinic.name': 'Klinik Sehat Bersama',
        'patient.fullName': 'Siti Rahayu',
        'patient.mrn': 'MRN00000123',
        'order.number': 'LAB/20260907/0001',
        'report.verifierName': 'dr. Andi Wijaya',
        'report.releasedAt': '7 September 2026, 11:40',
        'report.amendmentNotice': amendmentNotice,
      },
      lines: Array.from({ length: resultCount }, (_line, index) => ({
        'result.no': String(index + 1),
        'result.test': `Pemeriksaan nomor ${index + 1}`,
        'result.value': '11,2',
        'result.unit': 'g/dL',
        'result.flag': index % 5 === 0 ? '▼' : '',
        'result.referenceRange': '12 – 16',
      })),
    });
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
    'keeps a panel of 25 results on one A4 page',
    async () => {
      const service = new GotenbergPdfRendererService(buildConfigService());

      const bytes = await service.render(buildHtml(ONE_PAGE_RESULT_COUNT), A4);

      const parsed = await readPdf(bytes);
      expect(parsed.pageCount).toBe(1);
      expect(parsed.text).toContain('LAB/20260907/0001');
      expect(parsed.text).toContain('Pemeriksaan nomor 25');
      expect(parsed.text).not.toContain('AMENDED');
    },
    RENDERER_TIMEOUT_MS,
  );

  it(
    'breaks a long panel across pages without losing a row',
    async () => {
      const service = new GotenbergPdfRendererService(buildConfigService());

      const bytes = await service.render(
        buildHtml(MULTI_PAGE_RESULT_COUNT, 'AMENDED — menggantikan laporan tanggal 7 September 2026'),
        A4,
      );

      const parsed = await readPdf(bytes);
      expect(parsed.pageCount).toBeGreaterThanOrEqual(2);
      expect(parsed.text).toContain('Pemeriksaan nomor 1');
      expect(parsed.text).toContain(`Pemeriksaan nomor ${MULTI_PAGE_RESULT_COUNT}`);
      expect(parsed.text).toContain('AMENDED');
    },
    RENDERER_TIMEOUT_MS,
  );
});
