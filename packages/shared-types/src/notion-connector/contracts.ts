import { NotionCircuitBreakerStateValue } from '#notion-connector/types';

/**
 * What the Notion card on `/admin/integrations` shows without calling Notion
 * at all (P23-T04).
 *
 * `dataSourceIdLast4` is four characters on purpose: enough for an operator to
 * tell the production board from the sandbox at a glance, not enough to be a
 * board identifier worth leaking. `null` when the connector is unconfigured.
 */
export type NotionConnectorStatusView = {
  isConfigured: boolean;
  apiVersion: string;
  dataSourceIdLast4: string | null;
  circuitBreakerState: NotionCircuitBreakerStateValue;
  /**
   * When a bug report last reached the Bug Board (P23-T10), or `null` if none
   * ever has.
   *
   * The one field on this card that reflects the pipeline actually working
   * rather than merely being configured. A green connector and a
   * `lastPublishedAt` from three weeks ago is the failure this exists to make
   * visible: publishing is silent by construction — the reporter is answered at
   * intake and never sees the board — so without a timestamp here a broken
   * publisher looks exactly like a quiet month.
   */
  lastPublishedAt: string | null;
};

/**
 * One reason the Bug Board would reject a publish. `field` is the Notion
 * property name, or `connection` when the board could not be read at all —
 * a board nobody shared with this integration is the same class of problem as
 * a renamed column, and an operator reading the card wants both in one list.
 */
export type NotionBugBoardFieldProblem = {
  field: string;
  expected: string;
  actual: string;
};

/**
 * Outcome of a test-connection call. A failed test is a successful HTTP
 * response — the endpoint reports the outcome instead of erroring, the way the
 * BPJS and AI provider tests do, so the card can render the failure with each
 * problem named.
 *
 * `isConfigured: false` means nothing was called: a deployment with no Notion
 * variables is a supported state, not a failed test.
 */
export type NotionConnectionTestResult = {
  isConfigured: boolean;
  isSuccessful: boolean;
  checkedAt: string;
  problems: NotionBugBoardFieldProblem[];
};
