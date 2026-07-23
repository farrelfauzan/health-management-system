const RX_NUMBER_LENGTH = 6;

export function formatRxNumber(prescriptionId: string): string {
  const compactId = prescriptionId.replace(/-/g, '').slice(0, RX_NUMBER_LENGTH).toUpperCase();
  return `RX-${compactId}`;
}
