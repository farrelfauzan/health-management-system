import { buildDocumentApprovalDigestMail } from './build-document-approval-digest-copy';

function buildItem(index: number, drafterEmail = 'drafter@klinik.example') {
  return {
    documentTitle: `FAQ ${index}`,
    documentTypeName: 'Dokumen korpus klinik',
    drafterEmail,
    dueAt: null,
    reason: null,
    actionUrl: `https://app.example/admin/documents/doc-${index}`,
  };
}

const BASE_CONTEXT = {
  clinicName: 'Klinik Sehat Bersama',
  items: [buildItem(1), buildItem(2), buildItem(3)],
  overviewUrl: 'https://app.example/admin/documents?tab=approvals',
};

describe('buildDocumentApprovalDigestMail', () => {
  it('counts the documents and names the clinic in the subject', () => {
    const actual = buildDocumentApprovalDigestMail({ ...BASE_CONTEXT, kind: 'REQUESTED' });

    expect(actual.subject).toBe('Permintaan persetujuan: 3 dokumen / Klinik Sehat Bersama');
  });

  it('lists every document with its own link, and one link for the whole list', () => {
    const actual = buildDocumentApprovalDigestMail({ ...BASE_CONTEXT, kind: 'REQUESTED' });

    for (const item of BASE_CONTEXT.items) {
      expect(actual.text).toContain(item.documentTitle);
      expect(actual.text).toContain(item.actionUrl);
      expect(actual.html).toContain(`href="${item.actionUrl}"`);
    }
    expect(actual.text).toContain(BASE_CONTEXT.overviewUrl);
  });

  it('names a sole requester once in the lead rather than on every line', () => {
    const actual = buildDocumentApprovalDigestMail({ ...BASE_CONTEXT, kind: 'REQUESTED' });

    expect(actual.text).toContain('drafter@klinik.example meminta persetujuan Anda atas 3 dokumen');
    expect(actual.text).not.toContain('Diajukan oleh');
  });

  it('names the requester per document when a list mixes drafters', () => {
    const actual = buildDocumentApprovalDigestMail({
      ...BASE_CONTEXT,
      kind: 'REQUESTED',
      items: [buildItem(1, 'a@klinik.example'), buildItem(2, 'b@klinik.example')],
    });

    expect(actual.text).toContain('Diajukan oleh / Submitted by: a@klinik.example');
    expect(actual.text).toContain('Diajukan oleh / Submitted by: b@klinik.example');
  });

  it('says overdue documents are still pending, so nobody reads the list as auto-decided', () => {
    const actual = buildDocumentApprovalDigestMail({ ...BASE_CONTEXT, kind: 'OVERDUE' });

    expect(actual.text).toContain('tidak ada yang disetujui secara otomatis');
    expect(actual.text).toContain('nothing is approved automatically');
  });

  it('carries each deadline on its own document', () => {
    const actual = buildDocumentApprovalDigestMail({
      ...BASE_CONTEXT,
      kind: 'DUE_SOON',
      items: [{ ...buildItem(1), dueAt: new Date('2026-10-03T10:00:00Z') }, buildItem(2)],
    });

    expect(actual.text.match(/Tenggat/g)).toHaveLength(1);
  });

  it('is Indonesian first and English after (NFR-I18N-01)', () => {
    const actual = buildDocumentApprovalDigestMail({ ...BASE_CONTEXT, kind: 'APPROVED' });

    expect(actual.text.indexOf('telah disetujui')).toBeLessThan(
      actual.text.indexOf('have been approved'),
    );
  });

  it('escapes a title that carries markup rather than rendering it', () => {
    const actual = buildDocumentApprovalDigestMail({
      ...BASE_CONTEXT,
      kind: 'REQUESTED',
      items: [{ ...buildItem(1), documentTitle: '<script>alert(1)</script>' }],
    });

    expect(actual.html).not.toContain('<script>');
    expect(actual.html).toContain('&lt;script&gt;');
  });
});
