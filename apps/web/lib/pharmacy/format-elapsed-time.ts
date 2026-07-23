const MINUTE_MS = 60 * 1000;

export function formatElapsedTime(isoTimestamp: string, now: Date = new Date()): string {
  const elapsedMs = now.getTime() - new Date(isoTimestamp).getTime();
  const totalMinutes = Math.max(0, Math.floor(elapsedMs / MINUTE_MS));
  if (totalMinutes < 1) {
    return 'Just now';
  }
  if (totalMinutes < 60) {
    return `${totalMinutes} min ago`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${totalHours}h ${minutes}m ago` : `${totalHours}h ago`;
  }
  const totalDays = Math.floor(totalHours / 24);
  return `${totalDays}d ago`;
}
