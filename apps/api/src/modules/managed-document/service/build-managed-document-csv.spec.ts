import { ManagedDocumentRecord } from '@hms/shared-types';

import { buildManagedDocumentCsv } from './build-managed-document-csv';

function buildRecord(overrides: Partial<ManagedDocumentRecord> = {}): ManagedDocumentRecord {
  return {
    id: 'doc-1',
    typeId: 'type-1',
    type: {
      id: 'type-1',
      code: 'AGREEMENT_PATIENT_CLINIC',
      name: 'Perjanjian pasien–klinik',
      behavior: 'GENERIC',
      contentMode: 'EITHER',
      requiresPatient: true,
      requiresDoctor: false,
      isApprovalRequired: false,
      allowSelfApproval: false,
      requiredApprovals: 1,
      isActive: true,
    },
    status: 'ISSUED',
    title: 'Perjanjian biaya',
    documentNumber: 'AGR/2026/0007',
    contentHtml: '<p>secret body</p>',
    storageKey: null,
    storageMimeType: null,
    storageSizeBytes: null,
    patient: { id: 'patient-1', fullName: 'Rina Wulandari' },
    doctor: null,
    subjectTemplateId: null,
    subjectDocumentId: null,
    subjectInvoiceId: null,
    subjectDocument: null,
    draftedBy: { id: 'user-1', email: 'admin@klinik.example' },
    issuedAt: new Date('2026-09-30T03:00:00.000Z'),
    createdAt: new Date('2026-09-30T02:00:00.000Z'),
    updatedAt: new Date('2026-09-30T03:00:00.000Z'),
    ...overrides,
  };
}

describe('buildManagedDocumentCsv', () => {
  it('emits a header and one metadata line per document, never the body', () => {
    const actual = buildManagedDocumentCsv([buildRecord()]);

    expect(actual.split('\r\n')[0]).toBe(
      'id,typeCode,typeName,title,documentNumber,status,patient,doctor,draftedBy,createdAt,issuedAt',
    );
    expect(actual).toContain(
      'doc-1,AGREEMENT_PATIENT_CLINIC,Perjanjian pasien–klinik,Perjanjian biaya,AGR/2026/0007,ISSUED,Rina Wulandari,,admin@klinik.example,2026-09-30T02:00:00.000Z,2026-09-30T03:00:00.000Z',
    );
    expect(actual).not.toContain('secret body');
  });

  it('quotes cells with commas or quotes and neutralises formula leads', () => {
    const actual = buildManagedDocumentCsv([
      buildRecord({ title: 'Surat "resmi", edisi 2', documentNumber: '=HYPERLINK("x")' }),
    ]);

    expect(actual).toContain('"Surat ""resmi"", edisi 2"');
    expect(actual).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('never carries a storage key even for an uploaded document', () => {
    const actual = buildManagedDocumentCsv([
      buildRecord({
        contentHtml: null,
        storageKey: 'documents/managed/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
        storageMimeType: 'application/pdf',
        storageSizeBytes: 1024,
      }),
    ]);

    expect(actual).not.toContain('documents/managed');
  });
});
