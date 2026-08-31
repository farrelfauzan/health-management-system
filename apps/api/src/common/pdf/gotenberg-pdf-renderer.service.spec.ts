import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { GotenbergPdfRendererService } from './gotenberg-pdf-renderer.service';

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    PDF_RENDERER_BASE_URL: 'http://gotenberg.test:3000',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function buildPdfBytes(byteLength = 64): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes.set(Buffer.from('%PDF-1.7', 'latin1'), 0);
  return bytes;
}

function buildResponse(
  bytes: Uint8Array,
  init: { ok?: boolean; status?: number; contentLength?: string } = {},
): unknown {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: {
      get: (name: string): string | null =>
        name.toLowerCase() === 'content-length' ? (init.contentLength ?? null) : null,
    },
    arrayBuffer: () =>
      Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  };
}

async function readFormFile(form: FormData): Promise<{ filename: string; html: string }> {
  const file = form.get('files') as File;
  return { filename: file.name, html: await file.text() };
}

describe('GotenbergPdfRendererService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('posts the HTML to the Chromium HTML route as an index.html part', async () => {
    fetchMock.mockResolvedValue(buildResponse(buildPdfBytes()));

    await new GotenbergPdfRendererService(buildConfigService()).render('<p>Faktur</p>', {});

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://gotenberg.test:3000/forms/chromium/convert/html');
    expect(init.method).toBe('POST');
    // The entry point is identified by filename, not by field order — a part
    // named anything else is treated as an asset and nothing gets rendered.
    await expect(readFormFile(init.body as FormData)).resolves.toEqual({
      filename: 'index.html',
      html: '<p>Faktur</p>',
    });
  });

  it('strips a trailing slash from the base URL rather than producing a double slash', async () => {
    fetchMock.mockResolvedValue(buildResponse(buildPdfBytes()));

    await new GotenbergPdfRendererService(
      buildConfigService({ PDF_RENDERER_BASE_URL: 'http://gotenberg.test:3000/' }),
    ).render('<p>Faktur</p>', {});

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://gotenberg.test:3000/forms/chromium/convert/html',
    );
  });

  it('defaults the page to A4 with backgrounds printed and console exceptions fatal', async () => {
    fetchMock.mockResolvedValue(buildResponse(buildPdfBytes()));

    await new GotenbergPdfRendererService(buildConfigService()).render('<p>Faktur</p>', {});

    const form = (fetchMock.mock.calls[0]?.[1] as RequestInit).body as FormData;
    expect(form.get('paperWidth')).toBe('8.27');
    expect(form.get('paperHeight')).toBe('11.69');
    expect(form.get('marginTop')).toBe('0.39');
    expect(form.get('marginLeft')).toBe('0.39');
    expect(form.get('printBackground')).toBe('true');
    expect(form.get('emulatedMediaType')).toBe('print');
    expect(form.get('failOnConsoleExceptions')).toBe('true');
  });

  it('applies caller page geometry over the defaults, per edge', async () => {
    fetchMock.mockResolvedValue(buildResponse(buildPdfBytes()));

    await new GotenbergPdfRendererService(buildConfigService()).render('<p>Faktur</p>', {
      paperWidthInches: 5.83,
      paperHeightInches: 8.27,
      marginInches: { top: 0.2, left: 0.1 },
      landscape: true,
      preferCssPageSize: true,
    });

    const form = (fetchMock.mock.calls[0]?.[1] as RequestInit).body as FormData;
    expect(form.get('paperWidth')).toBe('5.83');
    expect(form.get('paperHeight')).toBe('8.27');
    expect(form.get('marginTop')).toBe('0.2');
    expect(form.get('marginLeft')).toBe('0.1');
    // Unspecified edges keep the default rather than collapsing to zero.
    expect(form.get('marginBottom')).toBe('0.39');
    expect(form.get('landscape')).toBe('true');
    expect(form.get('preferCssPageSize')).toBe('true');
  });

  it('forwards a trace id as the renderer trace header and omits it when blank', async () => {
    fetchMock.mockResolvedValue(buildResponse(buildPdfBytes()));
    const service = new GotenbergPdfRendererService(buildConfigService());

    await service.render('<p>Faktur</p>', { traceId: 'req-42' });
    await service.render('<p>Faktur</p>', { traceId: '  ' });

    const withTrace = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers;
    const withoutTrace = (fetchMock.mock.calls[1]?.[1] as RequestInit).headers;
    expect(withTrace).toEqual({ 'Gotenberg-Trace': 'req-42' });
    expect(withoutTrace).toEqual({});
  });

  it('resolves with the renderer bytes unchanged', async () => {
    const expectedBytes = buildPdfBytes();
    fetchMock.mockResolvedValue(buildResponse(expectedBytes));

    const actualBytes = await new GotenbergPdfRendererService(buildConfigService()).render(
      '<p>Faktur</p>',
      {},
    );

    expect(Buffer.from(actualBytes)).toEqual(Buffer.from(expectedBytes));
  });

  it('fails closed when no renderer is configured, without attempting a request', async () => {
    const service = new GotenbergPdfRendererService(
      buildConfigService({ PDF_RENDERER_BASE_URL: '' }),
    );

    await expect(service.render('<p>Faktur</p>', {})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects empty HTML before spending a renderer slot on it', async () => {
    const service = new GotenbergPdfRendererService(buildConfigService());

    await expect(service.render('   ', {})).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces an upstream status without quoting the upstream body', async () => {
    fetchMock.mockResolvedValue(buildResponse(new Uint8Array(0), { ok: false, status: 409 }));

    // 409 is what Gotenberg answers when the template's own script threw, and
    // its body quotes the console output — which for these documents is a
    // patient's invoice. The status is safe to surface; the body is not.
    await expect(
      new GotenbergPdfRendererService(buildConfigService()).render('<p>Faktur</p>', {}),
    ).rejects.toThrow('PDF renderer responded with status 409');
  });

  it('reports an unreachable renderer rather than propagating the transport error', async () => {
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND gotenberg.test'));

    await expect(
      new GotenbergPdfRendererService(buildConfigService()).render('<p>Faktur</p>', {}),
    ).rejects.toThrow('PDF renderer is unreachable');
  });

  it('aborts rather than hanging when the renderer stops answering', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    await expect(
      new GotenbergPdfRendererService(buildConfigService({ PDF_RENDERER_TIMEOUT_MS: '10' })).render(
        '<p>Faktur</p>',
        {},
      ),
    ).rejects.toThrow('PDF renderer is unreachable');
  });

  it('refuses an oversized document on the declared length, before reading the body', async () => {
    const arrayBuffer = jest.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => '5000' },
      arrayBuffer,
    });

    await expect(
      new GotenbergPdfRendererService(
        buildConfigService({ PDF_RENDERER_MAX_OUTPUT_BYTES: '4096' }),
      ).render('<p>Faktur</p>', {}),
    ).rejects.toThrow('above the configured maximum');
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('refuses an oversized document that declared no length', async () => {
    fetchMock.mockResolvedValue(buildResponse(buildPdfBytes(5_000)));

    await expect(
      new GotenbergPdfRendererService(
        buildConfigService({ PDF_RENDERER_MAX_OUTPUT_BYTES: '4096' }),
      ).render('<p>Faktur</p>', {}),
    ).rejects.toThrow('above the configured maximum');
  });

  it('refuses a 200 whose body is not a PDF', async () => {
    // An interposed proxy answering an error page with a success status. The
    // caller's next act is to persist these bytes as an invoice document.
    fetchMock.mockResolvedValue(buildResponse(Buffer.from('<html>502</html>')));

    await expect(
      new GotenbergPdfRendererService(buildConfigService()).render('<p>Faktur</p>', {}),
    ).rejects.toThrow('not a PDF');
  });
});
