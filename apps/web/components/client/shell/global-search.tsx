'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { Icon, Input } from '@hms/ui';

const PATIENT_SEARCH_PATH = '/admin/patients';

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState<string>('');
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }
    router.push(`${PATIENT_SEARCH_PATH}?q=${encodeURIComponent(trimmedQuery)}`);
  }
  return (
    <form role="search" onSubmit={handleSubmit} className="relative w-full max-w-xl">
      <Icon
        name="search"
        size={20}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search patients"
        placeholder="Search patients by name or ID..."
        className="h-10 rounded-lg border-none bg-surface-container-low pl-10 shadow-none"
      />
    </form>
  );
}
