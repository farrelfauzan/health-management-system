import { isManagedDocumentStorageKey } from './is-managed-document-storage-key';

describe('isManagedDocumentStorageKey', () => {
  it('accepts a key this surface minted', () => {
    expect(
      isManagedDocumentStorageKey('documents/managed/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf'),
    ).toBe(true);
    expect(
      isManagedDocumentStorageKey('documents/managed/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1'),
    ).toBe(true);
  });

  it('refuses keys from every other surface and anything path-shaped', () => {
    expect(
      isManagedDocumentStorageKey('documents/patient/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf'),
    ).toBe(false);
    expect(
      isManagedDocumentStorageKey(
        'documents/vault/doctor/9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1.pdf',
      ),
    ).toBe(false);
    expect(isManagedDocumentStorageKey('documents/managed/../clinic/x.pdf')).toBe(false);
    expect(isManagedDocumentStorageKey('documents/managed/not-a-uuid.pdf')).toBe(false);
  });
});
