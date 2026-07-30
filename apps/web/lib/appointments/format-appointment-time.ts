export function formatAppointmentTime(scheduledAt: string, locale = 'id-ID'): string {
  return new Date(scheduledAt).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatTimeInputValue(scheduledAt: string): string {
  const date = new Date(scheduledAt);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatAppointmentDate(scheduledAt: string, locale = 'id-ID'): string {
  return new Date(scheduledAt).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
