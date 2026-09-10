'use client';

import { Can } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PatientsCreateButton } from '#components/client/patients/patients-create-button';
import { PageHeader } from '#components/shared/page-header';
import { useShellBreadcrumbRoot } from '#lib/navigation/use-shell-breadcrumb-root';

/**
 * The patients page's title block, shared by the admin workspace and the
 * doctor's directory so both keep the same header and the same create gate.
 */
export function PatientsPageHeader() {
  const t = useTranslations('clinical');
  const root = useShellBreadcrumbRoot();

  return (
    <PageHeader
      title={t('patients.title')}
      subtitle={t('patients.subtitle')}
      breadcrumbs={[root, { label: t('patients.title') }]}
      actions={
        <Can action="create" subject="Patient">
          <PatientsCreateButton />
        </Can>
      }
    />
  );
}
