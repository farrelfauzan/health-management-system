import { isStatementTimeoutError } from './is-statement-timeout-error';

describe('isStatementTimeoutError', () => {
  it.each([
    ['a SQLSTATE on the error', { code: '57014' }],
    ['a raw-query error carrying it in meta', { code: 'P2010', meta: { code: '57014' } }],
    ['a driver-adapter cause', { message: 'failed', cause: { originalCode: '57014' } }],
    ['only the Postgres message', new Error('canceling statement due to statement timeout')],
  ])('recognises %s', (_label, inputError) => {
    expect(isStatementTimeoutError(inputError)).toBe(true);
  });

  it.each([
    ['a unique violation', { code: '23505' }],
    ['a plain error', new Error('connection refused')],
    ['nothing', undefined],
  ])('does not mistake %s for a timeout', (_label, inputError) => {
    expect(isStatementTimeoutError(inputError)).toBe(false);
  });
});
