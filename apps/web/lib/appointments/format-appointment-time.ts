export function formatAppointmentTime(scheduledAt: string): string {
  return new Date(scheduledAt).toLocaleTimeString('en-US', {
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

export function formatAppointmentDate(scheduledAt: string): string {
  return new Date(scheduledAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
