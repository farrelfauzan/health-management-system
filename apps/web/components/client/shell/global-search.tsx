'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Icon,
  useAbility,
} from '@hms/ui';

import { GlobalSearchGroup } from '#components/client/shell/global-search-group';
import type { GlobalSearchGroupItem } from '#components/client/shell/global-search-group';
import { useDebouncedValue } from '#hooks/use-debounced-value';
import { filterNavSections } from '#lib/shell/filter-nav-sections';
import { DOCTOR_NAV_SECTIONS } from '#lib/shell/doctor-nav-items';
import { ADMIN_NAV_SECTIONS } from '#lib/shell/nav-items';
import { useGlobalSearchResults } from '#lib/shell/use-global-search-results';

const PATIENT_SEARCH_PATH = '/admin/patients';
const SEARCH_DEBOUNCE_MS = 250;

export function GlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const ability = useAbility();
  const t = useTranslations('authShell.shell.search');
  const navigationT = useTranslations('authShell.shell.navigation');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  // Entity fan-out targets /admin detail pages, so the doctor shell keeps the
  // palette to navigation links only.
  const isDoctorPortal = pathname?.startsWith('/doctor') ?? false;
  const results = useGlobalSearchResults({
    search: debouncedQuery,
    isEnabled: isOpen && !isDoctorPortal,
  });
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsOpen((wasOpen) => !wasOpen);
      }
    }
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, []);
  const handleOpenChange = useCallback((nextOpen: boolean): void => {
    setIsOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
    }
  }, []);
  const handleNavigate = useCallback(
    (href: string): void => {
      handleOpenChange(false);
      router.push(href);
    },
    [handleOpenChange, router],
  );
  const trimmedQuery = query.trim();
  const navigationItems = useMemo<GlobalSearchGroupItem[]>(() => {
    const sections = filterNavSections(
      ability,
      isDoctorPortal ? DOCTOR_NAV_SECTIONS : ADMIN_NAV_SECTIONS,
    );
    const items = sections.flatMap((section) =>
      section.items.map((item) => ({
        key: `nav-${item.href}`,
        title: navigationT(item.labelKey),
        icon: item.icon,
        href: item.href,
      })),
    );
    if (!trimmedQuery) {
      return items;
    }
    const lowered = trimmedQuery.toLowerCase();
    return items.filter((item) => item.title.toLowerCase().includes(lowered));
  }, [ability, isDoctorPortal, navigationT, trimmedQuery]);
  const patientItems: GlobalSearchGroupItem[] = results.patients.map((patient) => ({
    key: `patient-${patient.id}`,
    title: patient.fullName,
    subtitle: patient.mrn,
    href: `${PATIENT_SEARCH_PATH}/${patient.id}`,
  }));
  const doctorItems: GlobalSearchGroupItem[] = results.doctors.map((doctor) => ({
    key: `doctor-${doctor.id}`,
    title: doctor.fullName,
    subtitle: doctor.specialty,
    href: `/admin/doctors/${doctor.id}`,
  }));
  const userItems: GlobalSearchGroupItem[] = results.users.map((user) => ({
    key: `user-${user.id}`,
    title: user.email,
    subtitle: user.roles.map((role) => role.name).join(', '),
    href: `/admin/administration?tab=users&q=${encodeURIComponent(user.email)}`,
  }));
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={t('label')}
        className="flex h-10 w-full max-w-xl items-center gap-2 rounded-lg bg-surface-container-low px-3 text-left text-sm text-muted-foreground"
      >
        <Icon name="search" size={20} />
        <span className="flex-1 truncate">{t('placeholder')}</span>
        <kbd className="pointer-events-none rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>
      <CommandDialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        title={t('title')}
        description={t('description')}
        shouldFilter={false}
      >
        <CommandInput value={query} onValueChange={setQuery} placeholder={t('placeholder')} />
        <CommandList>
          <CommandEmpty>{t('empty')}</CommandEmpty>
          {trimmedQuery && !isDoctorPortal ? (
            <CommandItem
              value="free-text-search"
              onSelect={() =>
                handleNavigate(`${PATIENT_SEARCH_PATH}?q=${encodeURIComponent(trimmedQuery)}`)
              }
            >
              <Icon name="search" size={18} className="text-muted-foreground" />
              <span className="truncate">{t('freeText', { query: trimmedQuery })}</span>
            </CommandItem>
          ) : null}
          <GlobalSearchGroup
            heading={t('groups.patients')}
            items={patientItems}
            onNavigate={handleNavigate}
          />
          <GlobalSearchGroup
            heading={t('groups.doctors')}
            items={doctorItems}
            onNavigate={handleNavigate}
          />
          <GlobalSearchGroup
            heading={t('groups.users')}
            items={userItems}
            onNavigate={handleNavigate}
          />
          <GlobalSearchGroup
            heading={t('groups.navigation')}
            items={navigationItems}
            onNavigate={handleNavigate}
          />
        </CommandList>
      </CommandDialog>
    </>
  );
}
