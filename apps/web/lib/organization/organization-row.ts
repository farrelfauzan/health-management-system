import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import type { Row } from '@tanstack/react-table';

import type { organizationTableFeatures } from '#lib/organization/organization-table-features';

/**
 * One row of the org chart as TanStack sees it (SJ-90).
 *
 * `Row` is generic over the enabled feature set in v9, so this alias exists to
 * keep `Row<typeof organizationTableFeatures, OrganizationUnitTreeNode>` from
 * being spelled out in every component that passes a row down.
 */
export type OrganizationRow = Row<typeof organizationTableFeatures, OrganizationUnitTreeNode>;
