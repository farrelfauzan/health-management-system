'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentTemplateView } from '@hms/shared-types';
import { Button, Card, CardContent, Icon, toast, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ArchiveTemplateDialog } from '#components/client/document-templates/archive-template-dialog';
import { CreateTemplateDialog } from '#components/client/document-templates/create-template-dialog';
import { DocumentTemplatesTable } from '#components/client/document-templates/document-templates-table';
import { TemplateEditor } from '#components/client/document-templates/template-editor';
import { documentTemplateControllerSetDefaultTemplateV1 } from '#lib/api/generated/document-templates/document-templates';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateDocumentTemplateQueries } from '#lib/document-templates/invalidate-document-template-queries';
import { useDocumentTemplates } from '#lib/document-templates/use-document-templates';

const TEMPLATE_KIND = 'INVOICE';

/**
 * The Templates tab of the billing workspace (`P16-T11`). The list and the
 * editor share one panel: opening a template swaps the list for the editor
 * in place, and the editor reads its template from the same list query so a
 * save is reflected without a second fetch — the API has no by-id route.
 */
export function DocumentTemplatesPanel() {
  const t = useTranslations('operations.billing.templates');
  const ability = useAbility();
  const queryClient = useQueryClient();
  const canWrite = ability.can('write', 'DocumentTemplate');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const templatesQuery = useDocumentTemplates(TEMPLATE_KIND);
  const selectedTemplate =
    templatesQuery.templates.find((template) => template.id === selectedTemplateId) ?? null;

  const setDefaultMutation = useMutation({
    mutationFn: async (template: DocumentTemplateView) =>
      parseApiSuccess(
        await documentTemplateControllerSetDefaultTemplateV1(template.id),
        t('actions.setDefaultError'),
      ),
    onSuccess: async () => {
      await invalidateDocumentTemplateQueries(queryClient);
      toast.success(t('actions.setDefaultSuccess'));
    },
    onError: (err: unknown) => notifyApiError(err, t('actions.setDefaultError')),
  });
  const [templateToArchive, setTemplateToArchive] = useState<DocumentTemplateView | null>(null);

  if (selectedTemplate !== null) {
    return (
      <TemplateEditor
        key={selectedTemplate.id}
        template={selectedTemplate}
        canWrite={canWrite}
        onBack={() => setSelectedTemplateId(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('description')}</p>
        {canWrite ? (
          <Button
            type="button"
            size="sm"
            className="bg-primary-container hover:bg-primary"
            onClick={() => setIsCreateOpen(true)}
          >
            <Icon name="add" size={18} />
            {t('new')}
          </Button>
        ) : null}
      </div>
      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <DocumentTemplatesTable
            templates={templatesQuery.templates}
            isPending={templatesQuery.isPending}
            isError={templatesQuery.isError}
            canWrite={canWrite}
            isMutating={setDefaultMutation.isPending}
            onEdit={(template) => setSelectedTemplateId(template.id)}
            onSetDefault={(template) => setDefaultMutation.mutate(template)}
            onArchive={setTemplateToArchive}
          />
        </CardContent>
      </Card>
      <ArchiveTemplateDialog
        template={templateToArchive}
        onOpenChange={(open) => {
          if (!open) setTemplateToArchive(null);
        }}
        onArchived={(message) => toast.success(message)}
        onFailed={(message) => toast.error(message)}
      />
      {isCreateOpen ? (
        <CreateTemplateDialog
          open={isCreateOpen}
          kind={TEMPLATE_KIND}
          onOpenChange={setIsCreateOpen}
          onCreated={(template) => {
            setIsCreateOpen(false);
            setSelectedTemplateId(template.id);
          }}
        />
      ) : null}
    </div>
  );
}
