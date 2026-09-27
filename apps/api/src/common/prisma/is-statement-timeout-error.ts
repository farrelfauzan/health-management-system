import type { DatabaseErrorLike } from './prisma.types';

const QUERY_CANCELED_SQLSTATE = '57014';
const MAX_CAUSE_DEPTH = 5;

/**
 * Whether Postgres cancelled a statement for running past
 * `statement_timeout` (SQLSTATE 57014). Walks the cause chain, because the
 * Prisma driver adapter nests the database error: the SQLSTATE can surface as
 * the error's own `code`, as `meta.code` on a raw-query error, or as the
 * `originalCode` of a wrapped cause.
 */
export function isStatementTimeoutError(error: unknown, depth = 0): boolean {
  if (typeof error !== 'object' || error === null || depth > MAX_CAUSE_DEPTH) {
    return false;
  }
  const candidate = error as DatabaseErrorLike;
  const codes = [candidate.code, candidate.originalCode, candidate.meta?.code];
  if (codes.includes(QUERY_CANCELED_SQLSTATE)) {
    return true;
  }
  if (typeof candidate.message === 'string' && candidate.message.includes('statement timeout')) {
    return true;
  }
  return isStatementTimeoutError(candidate.cause, depth + 1);
}
