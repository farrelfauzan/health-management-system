const MINUTE_MS = 60 * 1000;

export function formatElapsedTime(
  isoTimestamp: string,
  now: Date = new Date(),
  locale = 'id-ID',
): string {
  const elapsedMs = now.getTime() - new Date(isoTimestamp).getTime();
  const totalMinutes = Math.max(0, Math.floor(elapsedMs / MINUTE_MS));
  if (totalMinutes < 1) {
    return locale.startsWith('id') ? 'Baru saja' : 'Just now';
  }
  if (totalMinutes < 60) {
    return locale.startsWith('id') ? `${totalMinutes} menit lalu` : `${totalMinutes} min ago`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    if (locale.startsWith('id')) {
      return minutes > 0 ? `${totalHours} jam ${minutes} menit lalu` : `${totalHours} jam lalu`;
    }
    return minutes > 0 ? `${totalHours}h ${minutes}m ago` : `${totalHours}h ago`;
  }
  const totalDays = Math.floor(totalHours / 24);
  return locale.startsWith('id') ? `${totalDays} hari lalu` : `${totalDays}d ago`;
}
