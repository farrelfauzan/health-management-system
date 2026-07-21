import Link from 'next/link';
import { Button } from '@hms/ui';

import { AdminPlaceholderPage } from '#components/server/shell/admin-placeholder-page';

export default function AdminAdministrationPage() {
  return (
    <AdminPlaceholderPage
      routeKey="administration"
      action={
        <Button asChild variant="outline">
          <Link href="/admin/users">Open user management</Link>
        </Button>
      }
    />
  );
}
