/**
 * Fills each `…Name` notification parameter from its `…Email` sibling when the
 * name is missing (P20-T06).
 *
 * Notification parameters are stored on the row when the notification is
 * raised, so rows written before accounts carried names hold only the address.
 * The copy now prints `{sharedByName}`; without this, every one of those older
 * rows would render the placeholder instead of a person. New rows carry both,
 * and for them this changes nothing.
 */
export function withDisplayNameFallbacks(
  params: Readonly<Record<string, string>> | null | undefined,
): Record<string, string> {
  const filled: Record<string, string> = { ...(params ?? {}) };
  for (const [key, value] of Object.entries(filled)) {
    if (!key.endsWith(EMAIL_SUFFIX)) {
      continue;
    }
    const nameKey = `${key.slice(0, -EMAIL_SUFFIX.length)}${NAME_SUFFIX}`;
    if (!filled[nameKey]) {
      filled[nameKey] = value;
    }
  }
  return filled;
}

const EMAIL_SUFFIX = 'Email';
const NAME_SUFFIX = 'Name';
