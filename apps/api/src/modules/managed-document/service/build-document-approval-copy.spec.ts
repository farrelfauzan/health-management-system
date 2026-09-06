import { buildDocumentApprovalMail } from './build-document-approval-copy';

const BASE_CONTEXT = {
  clinicName: 'Klinik Sehat Bersama',
  documentTitle: 'Perjanjian tanggung jawab biaya',
  documentTypeName: 'Perjanjian pasien–klinik',
  drafterEmail: 'drafter@klinik.example',
  dueAt: null,
  reason: null,
  actionUrl: 'https://app.example/admin/documents/abc',
};

describe('buildDocumentApprovalMail', () => {
  it('names the clinic in the subject so approval mail is not the one unfamiliar sender', () => {
    const actual = buildDocumentApprovalMail({ ...BASE_CONTEXT, kind: 'REQUESTED' });

    expect(actual.subject).toContain('Klinik Sehat Bersama');
    expect(actual.subject).toContain('Perjanjian tanggung jawab biaya');
  });

  it('carries the rejection reason verbatim (US-E5-03)', () => {
    const inputReason = 'Pasal 4 bertentangan dengan kebijakan pengembalian dana klinik.';

    const actual = buildDocumentApprovalMail({
      ...BASE_CONTEXT,
      kind: 'REJECTED',
      reason: inputReason,
    });

    expect(actual.text).toContain(inputReason);
    expect(actual.html).toContain('Pasal 4');
  });

  it('says an overdue round is still pending, so nobody reads it as auto-decided', () => {
    const actual = buildDocumentApprovalMail({
      ...BASE_CONTEXT,
      kind: 'OVERDUE',
      dueAt: new Date('2026-10-03T10:00:00Z'),
    });

    expect(actual.text).toContain('tidak ada yang disetujui secara otomatis');
    expect(actual.text).toContain('nothing is approved automatically');
  });

  it('omits the deadline line entirely when a round has no deadline', () => {
    const actual = buildDocumentApprovalMail({ ...BASE_CONTEXT, kind: 'REQUESTED' });

    expect(actual.text).not.toContain('Tenggat');
  });

  it('is Indonesian first and English after (NFR-I18N-01)', () => {
    const actual = buildDocumentApprovalMail({ ...BASE_CONTEXT, kind: 'REQUESTED' });

    expect(actual.text.indexOf('meminta persetujuan Anda')).toBeLessThan(
      actual.text.indexOf('has asked for your approval'),
    );
  });

  it('escapes a title that carries markup rather than rendering it', () => {
    const actual = buildDocumentApprovalMail({
      ...BASE_CONTEXT,
      kind: 'REQUESTED',
      documentTitle: '<img src=x onerror=alert(1)>',
    });

    expect(actual.html).not.toContain('<img');
    expect(actual.html).toContain('&lt;img');
  });

  it('always links back to the document it is about', () => {
    const actual = buildDocumentApprovalMail({ ...BASE_CONTEXT, kind: 'APPROVED' });

    expect(actual.text).toContain(BASE_CONTEXT.actionUrl);
    expect(actual.html).toContain(BASE_CONTEXT.actionUrl);
  });
});
