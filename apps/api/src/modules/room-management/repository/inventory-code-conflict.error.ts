/**
 * A ward, room or bed code that is already taken among live rows.
 *
 * Its own error type rather than a `ConflictException` thrown from the
 * repository, for the same reason `TariffIdentifierConflictError` is: the
 * repository owns Prisma error codes and the service owns HTTP status, and
 * a repository that threw `ConflictException` would make the persistence
 * layer decide what the API says.
 */
export class InventoryCodeConflictError extends Error {
  constructor(public readonly scope: 'bed' | 'room class' | 'room' | 'ward') {
    super(`A live ${scope} with this code already exists`);
    this.name = 'InventoryCodeConflictError';
  }
}
