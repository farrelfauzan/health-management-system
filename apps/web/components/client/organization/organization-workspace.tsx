'use client';

import type { OrganizationUnitTreeNode } from '@hms/shared-types';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Icon,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useAbility,
} from '@hms/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { OrganizationChartView } from '#components/client/organization/organization-chart-view';
import { OrganizationUnitArchiveDialog } from '#components/client/organization/organization-unit-archive-dialog';
import { OrganizationUnitDeleteDialog } from '#components/client/organization/organization-unit-delete-dialog';
import { OrganizationUnitFormDialog } from '#components/client/organization/organization-unit-form-dialog';
import { OrganizationUnitMembersDialog } from '#components/client/organization/organization-unit-members-dialog';
import { OrganizationUnitMoveDialog } from '#components/client/organization/organization-unit-move-dialog';
import { OrganizationTreeTable } from '#components/client/organization/organization-tree-table';
import { PageHeader } from '#components/shared/page-header';
import { useOrganizationTree } from '#lib/organization/use-organization-tree';

type UnitDialogState = {
  mode: 'archive' | 'create' | 'delete' | 'edit' | 'members' | 'move' | null;
  unit: OrganizationUnitTreeNode | null;
  parent: OrganizationUnitTreeNode | null;
};

const CLOSED_DIALOG: UnitDialogState = { mode: null, unit: null, parent: null };

/**
 * The org chart screen (SJ-2). One query for the whole tree, four dialogs, and
 * a single `canManage` flag that decides whether any of them can be opened —
 * visibility only, since the API refuses every write regardless of what this
 * renders.
 */
export function OrganizationWorkspace() {
  const t = useTranslations('operations.organization');
  const ability = useAbility();
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [dialogState, setDialogState] = useState<UnitDialogState>(CLOSED_DIALOG);
  const treeQuery = useOrganizationTree(showArchived ? { includeArchived: 'true' } : {});
  const canManage = ability.can('manage', 'OrganizationUnit');

  function closeDialog(): void {
    setDialogState(CLOSED_DIALOG);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={canManage ? t('subtitle') : t('readOnlyNotice')}
        breadcrumbs={[t('title')]}
        actions={
          canManage ? (
            <Button
              type="button"
              className="bg-primary-container hover:bg-primary"
              onClick={() => setDialogState({ mode: 'create', unit: null, parent: null })}
            >
              <Icon name="add" size={18} />
              {t('newRootUnit')}
            </Button>
          ) : null
        }
      />

      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-4">
          {/* One Tabs root around both views: the toggle is view state, not a
              route or a second query, so switching renders the same fetched
              tree — with "Show archived" still applied — without a refetch. */}
          <Tabs defaultValue="list" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                {t('unitCount', { count: treeQuery.tree.totalUnits })}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="organization-show-archived"
                    checked={showArchived}
                    onCheckedChange={(checked) => setShowArchived(checked === true)}
                  />
                  <Label htmlFor="organization-show-archived" className="text-sm text-slate-600">
                    {t('showArchived')}
                  </Label>
                </div>
                <TabsList>
                  <TabsTrigger value="list">
                    <Icon name="table_rows" size={16} />
                    {t('viewList')}
                  </TabsTrigger>
                  <TabsTrigger value="chart">
                    <Icon name="account_tree" size={16} />
                    {t('viewChart')}
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value="list">
              <OrganizationTreeTable
                roots={treeQuery.tree.roots}
                isPending={treeQuery.isPending}
                isError={treeQuery.isError}
                canManage={canManage}
                onAddChild={(parent) => setDialogState({ mode: 'create', unit: null, parent })}
                onEdit={(unit) => setDialogState({ mode: 'edit', unit, parent: null })}
                onMove={(unit) => setDialogState({ mode: 'move', unit, parent: null })}
                onArchive={(unit) => setDialogState({ mode: 'archive', unit, parent: null })}
                onDelete={(unit) => setDialogState({ mode: 'delete', unit, parent: null })}
                onViewMembers={(unit) => setDialogState({ mode: 'members', unit, parent: null })}
              />
            </TabsContent>
            <TabsContent value="chart">
              {/* The diagram is a view, not an edit surface: its one action is
                  opening the members dialog, because the natural question when
                  looking at a box is "who is in it". Everything else stays in
                  the list, so the two surfaces cannot drift apart. */}
              <OrganizationChartView
                roots={treeQuery.tree.roots}
                isError={treeQuery.isError}
                onSelectUnit={(unit) => setDialogState({ mode: 'members', unit, parent: null })}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {dialogState.mode === 'create' || dialogState.mode === 'edit' ? (
        <OrganizationUnitFormDialog
          key={dialogState.unit?.id ?? dialogState.parent?.id ?? 'new'}
          open
          unit={dialogState.unit}
          parent={dialogState.parent}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              closeDialog();
            }
          }}
        />
      ) : null}

      {dialogState.mode === 'move' && dialogState.unit ? (
        <OrganizationUnitMoveDialog
          key={dialogState.unit.id}
          open
          unit={dialogState.unit}
          roots={treeQuery.tree.roots}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              closeDialog();
            }
          }}
        />
      ) : null}

      {dialogState.mode === 'archive' && dialogState.unit ? (
        <OrganizationUnitArchiveDialog
          key={dialogState.unit.id}
          open
          unit={dialogState.unit}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              closeDialog();
            }
          }}
        />
      ) : null}

      {dialogState.mode === 'members' && dialogState.unit ? (
        <OrganizationUnitMembersDialog
          key={dialogState.unit.id}
          open
          unit={dialogState.unit}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              closeDialog();
            }
          }}
        />
      ) : null}

      {dialogState.mode === 'delete' && dialogState.unit ? (
        <OrganizationUnitDeleteDialog
          key={dialogState.unit.id}
          open
          unit={dialogState.unit}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              closeDialog();
            }
          }}
        />
      ) : null}
    </div>
  );
}
