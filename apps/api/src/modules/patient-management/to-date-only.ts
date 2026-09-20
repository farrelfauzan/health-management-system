/**
 * A stored date as the `YYYY-MM-DD` string every wire format in this module
 * uses — the API contract, and the `birthDate` SATUSEHAT validates against
 * Dukcapil. Dates of birth are stored as `@db.Date`, so the instant is
 * already midnight UTC and truncating the ISO string cannot shift the day.
 */
export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
