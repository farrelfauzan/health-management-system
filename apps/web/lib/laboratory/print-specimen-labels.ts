import type { LabSpecimenLabel } from '@hms/shared-types';

import { buildSpecimenLabelHtml } from '#lib/laboratory/build-specimen-label-html';

/**
 * Opens the label sheet in a new window and asks the browser to print it
 * (P18-T08). Returns false when the browser blocked the popup, so the caller
 * can say so instead of silently printing nothing — a rack of unlabelled
 * tubes is the failure this screen exists to prevent.
 */
export function printSpecimenLabels(labels: readonly LabSpecimenLabel[], locale = 'id'): boolean {
  if (labels.length === 0) {
    return false;
  }
  const printWindow = window.open('', '_blank', 'width=480,height=640');
  if (!printWindow) {
    return false;
  }
  printWindow.document.open();
  printWindow.document.write(buildSpecimenLabelHtml(labels, locale));
  printWindow.document.close();
  printWindow.focus();
  printWindow.addEventListener('load', () => {
    printWindow.print();
  });
  return true;
}
