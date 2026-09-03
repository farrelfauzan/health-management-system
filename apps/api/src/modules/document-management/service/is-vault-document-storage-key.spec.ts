import { isPersonalDocumentStorageKey } from './is-personal-document-storage-key';
import { isVaultDocumentStorageKey } from './is-vault-document-storage-key';
import { buildVaultDocumentStorageKeyPrefix } from './vault-document-storage-key-prefix';

const DOCUMENT_UUID = '9f1c7c2e-3a52-4f0b-9e33-1c9a5f0a77b1';

describe('isVaultDocumentStorageKey', () => {
  it('accepts a key minted under the owner type’s own vault prefix', () => {
    const inputKey = `${buildVaultDocumentStorageKeyPrefix('DOCTOR')}/${DOCUMENT_UUID}.pdf`;

    expect(isVaultDocumentStorageKey(inputKey, 'DOCTOR')).toBe(true);
  });

  it('accepts a key with no extension', () => {
    const inputKey = `${buildVaultDocumentStorageKeyPrefix('ADMIN')}/${DOCUMENT_UUID}`;

    expect(isVaultDocumentStorageKey(inputKey, 'ADMIN')).toBe(true);
  });

  it('refuses another owner type’s vault key', () => {
    const inputKey = `${buildVaultDocumentStorageKeyPrefix('ADMIN')}/${DOCUMENT_UUID}.pdf`;

    expect(isVaultDocumentStorageKey(inputKey, 'DOCTOR')).toBe(false);
  });

  it('refuses a personal knowledge-base key', () => {
    const inputKey = `documents/doctor/${DOCUMENT_UUID}.pdf`;

    expect(isVaultDocumentStorageKey(inputKey, 'DOCTOR')).toBe(false);
  });

  it('refuses a clinic-corpus key', () => {
    const inputKey = `documents/clinic/${DOCUMENT_UUID}.pdf`;

    expect(isVaultDocumentStorageKey(inputKey, 'DOCTOR')).toBe(false);
  });

  it('refuses a patient clinical key', () => {
    const inputKey = `documents/patient/${DOCUMENT_UUID}.pdf`;

    expect(isVaultDocumentStorageKey(inputKey, 'DOCTOR')).toBe(false);
  });

  it('refuses a traversal that dresses a foreign key as a vault key', () => {
    const inputKey = `documents/vault/doctor/../../clinic/${DOCUMENT_UUID}.pdf`;

    expect(isVaultDocumentStorageKey(inputKey, 'DOCTOR')).toBe(false);
  });

  // The pair that matters: the knowledge base ingests its documents and sends
  // the passages to an embedding provider, the vault never does. Neither
  // check may accept the other's keys, or the confirm step stops being the
  // thing that decides which of those two a stored object is.
  it('and the knowledge-base check reject each other’s keys', () => {
    const vaultKey = `${buildVaultDocumentStorageKeyPrefix('DOCTOR')}/${DOCUMENT_UUID}.pdf`;
    const knowledgeBaseKey = `documents/doctor/${DOCUMENT_UUID}.pdf`;

    expect(isPersonalDocumentStorageKey(vaultKey, 'DOCTOR')).toBe(false);
    expect(isVaultDocumentStorageKey(knowledgeBaseKey, 'DOCTOR')).toBe(false);
  });
});
