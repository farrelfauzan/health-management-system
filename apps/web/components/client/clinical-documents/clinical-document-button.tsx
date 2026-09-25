'use client';

import { Button, Icon } from '@hms/ui';

type ClinicalDocumentButtonProps = {
  label: string;
  isIssuing: boolean;
  onIssue: () => void;
};

/**
 * The one look every "print this letter" action takes: an outline button with
 * a print icon that disables itself while the PDF renders, so a second click
 * cannot file a second copy of the same letter.
 */
export function ClinicalDocumentButton({ label, isIssuing, onIssue }: ClinicalDocumentButtonProps) {
  return (
    <Button type="button" variant="outline" size="sm" disabled={isIssuing} onClick={onIssue}>
      <Icon name="print" size={16} />
      {label}
    </Button>
  );
}
