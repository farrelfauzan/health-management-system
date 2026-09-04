import { ConfigService } from '@nestjs/config';

import { SmtpMailService } from './smtp-mail.service';
import { MailAttachment, SendMailRequest } from './mail.types';

const sendMailMock = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: sendMailMock })),
}));

const TEST_HOST = 'smtp.example';

const PDF_CONTENT_TYPE = 'application/pdf';

function buildService(): SmtpMailService {
  return new SmtpMailService(
    new ConfigService({ MAIL_HOST: TEST_HOST, MAIL_FROM: 'Klinik <no-reply@example>' }),
  );
}

function buildRequest(overrides: Partial<SendMailRequest> = {}): SendMailRequest {
  return {
    to: 'patient@example',
    subject: 'Kuitansi INV-0001',
    text: 'Terlampir kuitansi Anda.',
    html: '<p>Terlampir kuitansi Anda.</p>',
    ...overrides,
  };
}

function buildAttachment(fileName: string, bytes: readonly number[]): MailAttachment {
  return { fileName, mimeType: PDF_CONTENT_TYPE, content: Uint8Array.from(bytes) };
}

describe('SmtpMailService', () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ accepted: ['patient@example'], messageId: '<id@example>' });
  });

  // The regression that matters most: every caller that shipped before
  // `P16-T23` must reach nodemailer with exactly the payload it always did —
  // no `attachments` key at all, not an empty one.
  it('sends a request without attachments as the payload it always sent', async () => {
    const service = buildService();

    const actualResult = await service.sendMail(buildRequest());

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0]).toEqual({
      from: 'Klinik <no-reply@example>',
      to: 'patient@example',
      subject: 'Kuitansi INV-0001',
      text: 'Terlampir kuitansi Anda.',
      html: '<p>Terlampir kuitansi Anda.</p>',
    });
    expect(actualResult).toEqual({ accepted: true, messageId: '<id@example>' });
  });

  it('treats an explicitly empty attachment list the same as none', async () => {
    const service = buildService();

    await service.sendMail(buildRequest({ attachments: [] }));

    expect(sendMailMock.mock.calls[0][0]).not.toHaveProperty('attachments');
  });

  it('maps an attachment onto nodemailer as filename, content type and Buffer content', async () => {
    const service = buildService();
    const inputAttachment = buildAttachment('INV-0001.pdf', [0x25, 0x50, 0x44, 0x46]);

    await service.sendMail(buildRequest({ attachments: [inputAttachment] }));

    const actualPayload = sendMailMock.mock.calls[0][0];
    expect(actualPayload.attachments).toHaveLength(1);
    const [actualAttachment] = actualPayload.attachments;
    expect(actualAttachment.filename).toBe('INV-0001.pdf');
    expect(actualAttachment.contentType).toBe(PDF_CONTENT_TYPE);
    expect(Buffer.isBuffer(actualAttachment.content)).toBe(true);
    expect([...actualAttachment.content]).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  it('preserves several attachments in the order they were given', async () => {
    const service = buildService();

    await service.sendMail(
      buildRequest({
        attachments: [
          buildAttachment('first.pdf', [1]),
          buildAttachment('second.pdf', [2]),
          buildAttachment('third.pdf', [3]),
        ],
      }),
    );

    const actualNames = sendMailMock.mock.calls[0][0].attachments.map(
      (attachment: { filename: string }) => attachment.filename,
    );
    expect(actualNames).toEqual(['first.pdf', 'second.pdf', 'third.pdf']);
  });

  // A `Uint8Array` that is a view into a larger buffer — which is what a
  // sliced download or an encryption library's output usually is — must be
  // sent as its own bytes, not as the whole backing store.
  it('sends only the bytes the view covers when the attachment is a subarray', async () => {
    const service = buildService();
    const backingBytes = Uint8Array.from([9, 9, 0x25, 0x50, 9, 9]);

    await service.sendMail(
      buildRequest({
        attachments: [
          { fileName: 'view.pdf', mimeType: PDF_CONTENT_TYPE, content: backingBytes.subarray(2, 4) },
        ],
      }),
    );

    expect([...sendMailMock.mock.calls[0][0].attachments[0].content]).toEqual([0x25, 0x50]);
  });

  it('reports a refused send as not accepted rather than throwing', async () => {
    sendMailMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const service = buildService();

    const actualResult = await service.sendMail(
      buildRequest({ attachments: [buildAttachment('INV-0001.pdf', [1])] }),
    );

    expect(actualResult).toEqual({ accepted: false, messageId: undefined });
  });
});
