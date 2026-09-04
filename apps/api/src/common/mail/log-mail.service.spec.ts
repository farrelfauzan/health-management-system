import { Logger } from '@nestjs/common';

import { LogMailService } from './log-mail.service';
import { SendMailRequest } from './mail.types';

const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];

function buildRequest(overrides: Partial<SendMailRequest> = {}): SendMailRequest {
  return {
    to: 'patient@example',
    subject: 'Kuitansi INV-0001',
    text: 'Terlampir kuitansi Anda.',
    html: '<p>Terlampir kuitansi Anda.</p>',
    ...overrides,
  };
}

describe('LogMailService', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs the recipient, subject and text body exactly as before when nothing is attached', async () => {
    const service = new LogMailService();

    const actualResult = await service.sendMail(buildRequest());

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe(
      '[mail:log-transport] to=patient@example subject=Kuitansi INV-0001\nTerlampir kuitansi Anda.',
    );
    expect(actualResult).toEqual({ accepted: true, messageId: undefined });
  });

  it('names each attachment with its type and size, and never its bytes', async () => {
    const service = new LogMailService();
    const inputContent = Uint8Array.from(PDF_MAGIC_BYTES);

    await service.sendMail(
      buildRequest({
        attachments: [
          { fileName: 'INV-0001.pdf', mimeType: 'application/pdf', content: inputContent },
          { fileName: 'lab-result.pdf', mimeType: 'application/pdf', content: new Uint8Array(3) },
        ],
      }),
    );

    const actualLine: string = logSpy.mock.calls[0][0];
    expect(actualLine).toContain('attachment: INV-0001.pdf (application/pdf, 8 bytes)');
    expect(actualLine).toContain('attachment: lab-result.pdf (application/pdf, 3 bytes)');
    // The content is a PDF header in ASCII; if the bytes leaked in any
    // encoding, one of these would be found.
    expect(actualLine).not.toContain('%PDF');
    expect(actualLine).not.toContain(Buffer.from(inputContent).toString('base64'));
    expect(actualLine).not.toContain(Buffer.from(inputContent).toString('hex'));
  });
});
