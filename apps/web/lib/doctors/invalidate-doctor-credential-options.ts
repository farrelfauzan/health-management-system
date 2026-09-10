import type { QueryClient } from '@tanstack/react-query';

const CREDENTIAL_OPTIONS_PATH = '/api/v1/doctor-credential-options';

/**
 * Every list variant of the catalog at once — per kind, and the master-data
 * screen's include-inactive read — because adding one option changes what the
 * doctor form offers on the very next open.
 */
export async function invalidateDoctorCredentialOptions(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [path] = query.queryKey;
      return typeof path === 'string' && path.startsWith(CREDENTIAL_OPTIONS_PATH);
    },
  });
}
