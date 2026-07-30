export function formatStatusLabel(
  status: string,
  locale = 'id',
  labels: Readonly<Record<string, string>> = {},
): string {
  const normalizedStatus = status
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');

  return labels[normalizedStatus] ?? normalizedStatus.replace(/_+/g, ' ').toLocaleUpperCase(locale);
}
