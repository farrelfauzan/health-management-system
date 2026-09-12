/** The Notion property types the Bug Board check knows how to require. */
export type NotionBugBoardFieldType = 'title' | 'rich_text' | 'select' | 'date';

/**
 * One property HMS writes to the Bug Board, and what it has to be for a
 * publish to succeed. `options` is listed only where HMS writes a fixed value:
 * a `select` whose option is missing rejects the whole page, so an option the
 * publisher never sends is not this check's business.
 */
export type NotionBugBoardFieldRequirement = {
  readonly field: string;
  readonly type: NotionBugBoardFieldType;
  readonly options?: readonly string[];
};

/**
 * The connector's circuit breaker as the status view reports it. Per process:
 * a replica that has been failing says so, and a replica that has not does
 * not, which is the honest answer when the two disagree.
 */
export type NotionCircuitBreakerStateValue = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
