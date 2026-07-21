export function formatStatusLabel(status: string): string {
  return status.trim().replace(/[_-]+/g, ' ').toUpperCase();
}
