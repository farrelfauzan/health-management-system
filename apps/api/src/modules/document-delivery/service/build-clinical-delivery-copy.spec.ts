import { ClinicalDeliveryMessageContext } from '@hms/shared-types';

import {
  buildClinicalDeliveryMail,
  buildClinicalWhatsappCaption,
} from './build-clinical-delivery-copy';

const PASSWORD_SENTENCE = 'Buka dokumen ini dengan kata sandi berupa tanggal lahir Anda.';

function buildContext(
  overrides: Partial<ClinicalDeliveryMessageContext> = {},
): ClinicalDeliveryMessageContext {
  return {
    clinicName: 'Klinik Sehat',
    patientName: 'Rina Wulandari',
    category: 'LAB_RESULT',
    documentDate: new Date('2026-09-25T00:00:00.000Z'),
    passwordSentence: PASSWORD_SENTENCE,
    ...overrides,
  };
}

/**
 * FR-E4-27 is a rule about what is *absent*: the caption may name the
 * clinic, the document type and the date, and nothing a lock screen should
 * not show. The snapshot pins the shape; the second test proves the type
 * has no way to carry a value into it.
 */
describe('buildClinicalWhatsappCaption', () => {
  it('names the clinic, the patient, the document type and the date, then the scheme', () => {
    const actual = buildClinicalWhatsappCaption(buildContext());

    expect(actual).toBe(
      [
        'Klinik Sehat: hasil laboratorium atas nama Rina Wulandari, tanggal 25 September 2026. Dokumen terlampir.',
        PASSWORD_SENTENCE,
        'Klinik Sehat: lab result for Rina Wulandari, dated 25 September 2026. The document is attached.',
      ].join('\n\n'),
    );
  });

  it('has no field through which a title, a value or a diagnosis can pass', () => {
    // The context type carries no title and no free text besides the fixed
    // password sentence; a caller holding "HbA1c 9.2%" has nowhere to put it.
    const context = buildContext({ category: 'RADIOLOGY', documentDate: null });

    const actual = buildClinicalWhatsappCaption(context);

    expect(Object.keys(context).sort()).toEqual([
      'category',
      'clinicName',
      'documentDate',
      'passwordSentence',
      'patientName',
    ]);
    expect(actual).toContain('hasil radiologi atas nama Rina Wulandari. Dokumen terlampir.');
    expect(actual).not.toMatch(/, tanggal |, dated /);
  });

  it('labels every category in both languages', () => {
    const actual = buildClinicalWhatsappCaption(buildContext({ category: 'DISCHARGE_SUMMARY' }));

    expect(actual).toContain('resume pulang');
    expect(actual).toContain('discharge summary');
  });
});

describe('buildClinicalDeliveryMail', () => {
  it('builds a bilingual subject from the type and escapes the body into paragraphs', () => {
    const actual = buildClinicalDeliveryMail(
      buildContext({ clinicName: 'Klinik <Sehat>', category: 'REFERRAL_LETTER' }),
    );

    expect(actual.subject).toBe(
      'Surat rujukan dari Klinik <Sehat> / Referral letter from Klinik <Sehat>',
    );
    expect(actual.html).toContain('<p>Klinik &lt;Sehat&gt;: surat rujukan atas nama');
    expect(actual.text).toContain(PASSWORD_SENTENCE);
  });
});
