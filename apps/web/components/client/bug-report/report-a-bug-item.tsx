'use client';

import { useState } from 'react';
import { DropdownMenuItem, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { BugReportDialog } from '#components/client/bug-report/bug-report-dialog';

type ReportABugItemProps = {
  /**
   * Whether the clinic has bug reporting switched on (IMP-9).
   *
   * Resolved in the shell's server layout and passed down, because the feature
   * flags live in the session claims and this is a leaf client component. The
   * patient portal simply never renders this item, so there is no prop for it to
   * pass.
   */
  isEnabled: boolean;
};

/**
 * The "Report a bug" entry in the profile menu (P23-T11).
 *
 * Two gates, and both are visibility only: the entitlement, and whether this
 * account may `create` a `BugReport`. The API's `PermissionsGuard` and
 * `RequireFeature` decide what actually happens — a forged session hint buys a
 * menu item and a 403.
 *
 * Deliberately absent from the patient portal. Patients are not reporters: the
 * permission is seeded to staff roles only, and a patient describing a bug would
 * be describing their own care.
 */
export function ReportABugItem({ isEnabled }: ReportABugItemProps) {
  const t = useTranslations('authShell.bugReport');
  const ability = useAbility();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  if (!isEnabled || !ability.can('create', 'BugReport')) {
    return null;
  }
  return (
    <>
      <DropdownMenuItem
        // Without this the menu closes as the dialog mounts, which unmounts the
        // dialog with it.
        onSelect={(event) => {
          event.preventDefault();
          setIsDialogOpen(true);
        }}
      >
        <Icon name="bug_report" size={16} />
        {t('menuItem')}
      </DropdownMenuItem>
      <BugReportDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
}
