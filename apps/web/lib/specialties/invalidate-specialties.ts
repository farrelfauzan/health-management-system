import type { QueryClient } from '@tanstack/react-query';

const SPECIALTIES_PATH = '/api/v1/specialties';

/**
 * Every read of the poli catalog at once — the pickers' active-only list and
 * the management screen's full one — because a new or renamed poli has to
 * appear on the doctor form the next time it opens.
 */
export async function invalidateSpecialties(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [path] = query.queryKey;
      return typeof path === 'string' && path.startsWith(SPECIALTIES_PATH);
    },
  });
}
