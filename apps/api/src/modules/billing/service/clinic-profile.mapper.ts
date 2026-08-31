import { ClinicProfileRecord, ClinicProfileView } from '@hms/shared-types';

/**
 * Projects the stored row into the API's view.
 *
 * `logoUrl` is passed in rather than derived here because minting it is an
 * async call to the storage provider and a *decision*: the URL is a
 * short-lived bearer credential (D-018), so a mapper that quietly signed one
 * on every projection would put a live URL into every code path that ever
 * formats this record — including logs and cached responses. The caller signs
 * it, once, for the response it is answering.
 *
 * `hasLogo` is separate from `logoUrl` for the same reason: a client needs to
 * know a logo is configured even in a response where no URL was minted, and
 * `logoUrl === undefined` must not be read as "no logo".
 */
export function toClinicProfileView(
  record: ClinicProfileRecord,
  logoUrl?: string,
): ClinicProfileView {
  return {
    name: record.name,
    legalName: record.legalName,
    address: record.address,
    phoneNumber: record.phoneNumber,
    email: record.email,
    licenseNumber: record.licenseNumber,
    taxId: record.taxId,
    hasLogo: record.logoStorageKey !== null,
    ...(logoUrl === undefined ? {} : { logoUrl }),
    updatedAt: record.updatedAt.toISOString(),
  };
}
