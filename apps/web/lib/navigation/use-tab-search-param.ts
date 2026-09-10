'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { parseTabSearchParam } from '#lib/navigation/parse-tab-search-param';

type UseTabSearchParamOptions<TTab extends string> = {
  /** The query key; `tab` for a page's own strip, something else for a strip nested inside one. */
  key?: string;
  /** The tabs this person may see, in strip order. A URL naming any other tab is ignored. */
  allowed: readonly TTab[];
  /** What shows when the URL names nothing this person may see. */
  fallback: TTab;
  /**
   * The same value read on the server page from `searchParams`, so the HTML
   * and the first client render agree on which tab is open.
   */
  initialTab?: TTab;
};

type UseTabSearchParamResult<TTab extends string> = {
  tab: TTab;
  setTab: (next: TTab) => void;
};

const DEFAULT_TAB_KEY = 'tab';

/**
 * Tab state that lives in the URL (SJ-162): the browser back button returns
 * to the previous tab instead of leaving the page, a reload keeps the tab,
 * and any tab can be linked. Changing tab *pushes* a history entry, which is
 * what makes Back work; every other query parameter on the page is kept.
 */
export function useTabSearchParam<TTab extends string>({
  key = DEFAULT_TAB_KEY,
  allowed,
  fallback,
  initialTab,
}: UseTabSearchParamOptions<TTab>): UseTabSearchParamResult<TTab> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTabSearchParam(searchParams.get(key) ?? initialTab, allowed) ?? fallback;

  function setTab(next: TTab): void {
    if (next === tab) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return { tab, setTab };
}
