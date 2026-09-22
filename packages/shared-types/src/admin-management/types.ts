export type ListUsersParams = {
  page: number;
  limit: number;
  search?: string;
  roleCode?: string;
  isActive?: boolean;
};

/**
 * What the account repository reports after writing an operator NIK
 * (P24-T15, D-039). `DUPLICATE_NIK` is the unique blind index refusing a
 * second account with the same number; the service turns it into a 409.
 */
export type OwnAccountNikSaveOutcome = 'SAVED' | 'DUPLICATE_NIK';

/** Repository payload for the operator NIK write: the plaintext never travels further than this. */
export type SaveOwnAccountNikPayload = {
  readonly userId: string;
  readonly nik: string;
};
