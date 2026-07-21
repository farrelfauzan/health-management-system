export type PaginationWindowItem = number | 'ellipsis';

const SIBLING_COUNT = 1;
const MAX_VISIBLE_PAGES = 7;

export function buildPaginationWindow(page: number, totalPages: number): PaginationWindowItem[] {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: Math.max(totalPages, 0) }, (_, index) => index + 1);
  }

  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const windowStart = Math.max(currentPage - SIBLING_COUNT, 1);
  const windowEnd = Math.min(currentPage + SIBLING_COUNT, totalPages);
  const items: PaginationWindowItem[] = [1];

  if (windowStart > 2) {
    items.push('ellipsis');
  }

  for (let pageNumber = Math.max(windowStart, 2); pageNumber <= Math.min(windowEnd, totalPages - 1); pageNumber += 1) {
    items.push(pageNumber);
  }

  if (windowEnd < totalPages - 1) {
    items.push('ellipsis');
  }

  items.push(totalPages);
  return items;
}
