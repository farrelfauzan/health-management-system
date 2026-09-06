import { buildDocxFixture } from '../../../../test/fixtures/build-docx-fixture';
import { validateDocxContent } from './validate-docx-content';

describe('validateDocxContent', () => {
  it('accepts a genuine Word file', async () => {
    const content = await buildDocxFixture();

    expect(validateDocxContent(content)).toEqual({ isAccepted: true });
  });

  it('refuses a PDF renamed to .docx on its first bytes', () => {
    const content = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n');

    expect(validateDocxContent(content)).toEqual({
      isAccepted: false,
      reason: 'Uploaded file is not a Word (.docx) document',
    });
  });

  it('refuses a ZIP that carries no Word document', async () => {
    const content = await buildDocxFixture({ omitDocumentPart: true });

    expect(validateDocxContent(content)).toEqual({
      isAccepted: false,
      reason: 'Uploaded archive carries no Word document',
    });
  });

  it('refuses a ZIP signature that does not sit at offset zero', async () => {
    const content = Buffer.concat([Buffer.from('prologue'), await buildDocxFixture()]);

    expect(validateDocxContent(content).isAccepted).toBe(false);
  });
});
