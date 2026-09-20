/**
 * A stored date as the `YYYY-MM-DD` string the maternal contract uses. Dates
 * here are `@db.Date`, so the instant is already midnight UTC and truncating
 * the ISO string cannot shift the day.
 */
export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
