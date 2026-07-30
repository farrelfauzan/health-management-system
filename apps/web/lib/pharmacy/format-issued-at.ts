export function formatIssuedAt(value: string | undefined, locale = 'id-ID'): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const datePart = date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} · ${timePart}`;
}
