const ITEMS_BLOCK_MARKER = 'data-hms-var="items"';

export function hasItemsBlock(contentHtml: string): boolean {
  return contentHtml.includes(ITEMS_BLOCK_MARKER);
}
