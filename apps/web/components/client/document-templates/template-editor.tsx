'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  DocumentTemplateImportView,
  DocumentTemplateImportWarning,
  DocumentTemplateView,
  InvoiceItemColumnToken,
  TemplateSettingsValue,
  TemplateVariable,
  UpdateDocumentTemplateInput,
} from '@hms/shared-types';
import {
  Badge,
  Button,
  Icon,
  Input,
  Label,
  RichTextEditor,
  Skeleton,
  type RichTextEditorInstance,
} from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';

import { ItemsColumnsConfig } from '#components/client/document-templates/items-columns-config';
import { TemplateEditorActions } from '#components/client/document-templates/template-editor-actions';
import { TemplateImportButton } from '#components/client/document-templates/template-import-button';
import { TemplateImportWarnings } from '#components/client/document-templates/template-import-warnings';
import { TemplateSettingsFields } from '#components/client/document-templates/template-settings-fields';
import { TemplateVariablePalette } from '#components/client/document-templates/template-variable-palette';
import { documentTemplateControllerUpdateTemplateV1 } from '#lib/api/generated/document-templates/document-templates';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { hasItemsBlock } from '#lib/document-templates/has-items-block';
import { invalidateDocumentTemplateQueries } from '#lib/document-templates/invalidate-document-template-queries';
import { toRichTextVariables } from '#lib/document-templates/to-rich-text-variables';
import { useTemplateVariables } from '#lib/document-templates/use-template-variables';

const ITEMS_BLOCK_TOKEN = 'items';

const VARIABLE_BLOCK_NODE_NAME = 'variableBlock';

type TemplateEditorProps = {
  template: DocumentTemplateView;
  canWrite: boolean;
  onBack: () => void;
};

/**
 * The template working-copy editor (`P16-T11`): name, description, the
 * rich-text layout with variable chips, the palette that inserts them, the
 * repeating-block column config, and page setup. Saves PATCH the draft;
 * the server sanitises the HTML and canonicalises every chip, so what comes
 * back is the byte-exact dialect the render service substitutes into.
 */
export function TemplateEditor({ template, canWrite, onBack }: TemplateEditorProps) {
  const t = useTranslations('operations.billing.templates');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [name, setName] = useState<string>(template.name);
  const [description, setDescription] = useState<string>(template.description ?? '');
  const [contentHtml, setContentHtml] = useState<string>(template.contentHtml);
  const [settings, setSettings] = useState<TemplateSettingsValue>(template.settings);
  const [editor, setEditor] = useState<RichTextEditorInstance | null>(null);
  const [isItemsBlockSelected, setIsItemsBlockSelected] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<readonly DocumentTemplateImportWarning[]>(
    [],
  );
  const variablesQuery = useTemplateVariables(template.kind);
  const richTextVariables = useMemo(
    () => toRichTextVariables(variablesQuery.variables, locale),
    [variablesQuery.variables, locale],
  );
  const isDirty =
    name !== template.name ||
    description !== (template.description ?? '') ||
    contentHtml !== template.contentHtml ||
    JSON.stringify(settings) !== JSON.stringify(template.settings);
  const isEditable = canWrite && variablesQuery.isSuccess;

  const saveMutation = useMutation({
    mutationFn: async (payload: UpdateDocumentTemplateInput) =>
      parseApiSuccess<DocumentTemplateView>(
        await documentTemplateControllerUpdateTemplateV1(template.id, payload),
        t('saveError'),
      ),
    onSuccess: async (envelope) => {
      // Adopt the server's canonical HTML so the dirty check compares like
      // with like — the sanitiser may normalise what the editor emitted.
      setContentHtml(envelope.data.contentHtml);
      setSettings(envelope.data.settings);
      await invalidateDocumentTemplateQueries(queryClient);
      setError(null);
      setNotice(t('saved'));
    },
    onError: (err: unknown) => {
      setNotice(null);
      setError(resolveApiErrorMessage(err, t('saveError')));
    },
  });

  const handleEditorReady = useCallback((instance: RichTextEditorInstance | null) => {
    setEditor(instance);
  }, []);

  /**
   * The Word import (P16-T42) lands as an unsaved draft: the editor content
   * changes, the dirty badge appears, and nothing reaches the server until
   * Save — so an import that turned out wrong is undone by leaving.
   */
  function handleImported(view: DocumentTemplateImportView): void {
    setContentHtml(view.contentHtml);
    setImportWarnings(view.warnings);
    setError(null);
    setNotice(t('import.loaded'));
  }

  useEffect(() => {
    if (!editor) {
      return;
    }
    function syncSelection(): void {
      setIsItemsBlockSelected(
        editor?.isActive(VARIABLE_BLOCK_NODE_NAME, { token: ITEMS_BLOCK_TOKEN }) ?? false,
      );
    }
    editor.on('selectionUpdate', syncSelection);
    editor.on('transaction', syncSelection);
    return () => {
      editor.off('selectionUpdate', syncSelection);
      editor.off('transaction', syncSelection);
    };
  }, [editor]);

  function handleInsertVariable(variable: TemplateVariable): void {
    if (!editor || !isEditable) {
      return;
    }
    if (variable.type === 'block') {
      editor.chain().focus().insertVariableBlock({ token: variable.token }).run();
      return;
    }
    editor.chain().focus().insertVariableChip({ token: variable.token }).run();
  }

  function handleItemsColumnsChange(itemsColumns: InvoiceItemColumnToken[]): void {
    setSettings((current) => ({ ...current, itemsColumns }));
  }

  function buildPayload(): UpdateDocumentTemplateInput {
    const trimmedDescription = description.trim();
    return {
      name: name.trim(),
      description: trimmedDescription === '' ? null : trimmedDescription,
      contentHtml,
      settings,
    };
  }

  function handleSave(): void {
    setNotice(null);
    saveMutation.mutate(buildPayload());
  }

  async function saveDraft(): Promise<boolean> {
    if (!isDirty) {
      return true;
    }
    setNotice(null);
    try {
      await saveMutation.mutateAsync(buildPayload());
      return true;
    } catch {
      return false;
    }
  }

  const showItemsColumns = isItemsBlockSelected || hasItemsBlock(contentHtml);
  const isSaveDisabled = !isEditable || saveMutation.isPending || !isDirty || name.trim() === '';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <Icon name="arrow_back" size={18} />
          {t('back')}
        </Button>
        <div className="flex flex-1 items-center gap-2">
          <Label htmlFor="template-editor-name" className="sr-only">
            {t('editor.nameLabel')}
          </Label>
          <Input
            id="template-editor-name"
            value={name}
            maxLength={120}
            disabled={!canWrite}
            className="max-w-md font-medium"
            onChange={(event) => setName(event.target.value)}
          />
          {isDirty ? <Badge variant="outline">{t('unsaved')}</Badge> : null}
        </div>
        {canWrite ? (
          <TemplateImportButton
            templateId={template.id}
            isDisabled={!isEditable || saveMutation.isPending}
            onImported={handleImported}
            onError={(message) => {
              setNotice(null);
              setError(message);
            }}
          />
        ) : null}
        <Button type="button" size="sm" disabled={isSaveDisabled} onClick={handleSave}>
          <Icon name="save" size={18} />
          {t('save')}
        </Button>
      </div>
      {notice ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      ) : null}
      <TemplateImportWarnings warnings={importWarnings} onDismiss={() => setImportWarnings([])} />
      {variablesQuery.isError ? (
        <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('editor.variablesError')}
        </p>
      ) : null}
      <TemplateEditorActions
        template={template}
        canWrite={canWrite}
        isDirty={isDirty}
        isSaving={saveMutation.isPending}
        hasContent={contentHtml.trim() !== '' && contentHtml !== '<p></p>'}
        onSaveDraft={saveDraft}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="template-editor-description">{t('editor.descriptionLabel')}</Label>
            <Input
              id="template-editor-description"
              value={description}
              maxLength={500}
              disabled={!canWrite}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="template-editor-content">{t('editor.contentLabel')}</Label>
            {variablesQuery.isPending ? (
              <Skeleton
                className="h-64 w-full rounded-md"
                aria-label={t('editor.variablesLoading')}
              />
            ) : (
              <RichTextEditor
                id="template-editor-content"
                value={contentHtml}
                onValueChange={setContentHtml}
                disabled={!isEditable}
                variables={richTextVariables}
                onEditorReady={handleEditorReady}
                onImageError={() => setError(t('editor.imageError'))}
                aria-label={t('editor.contentLabel')}
                className="bg-white"
              />
            )}
          </div>
        </div>
        <aside className="space-y-4">
          <TemplateVariablePalette
            variables={variablesQuery.variables}
            disabled={!isEditable}
            onInsert={handleInsertVariable}
          />
          {showItemsColumns ? (
            <ItemsColumnsConfig
              value={settings.itemsColumns}
              variables={variablesQuery.variables}
              disabled={!isEditable}
              isHighlighted={isItemsBlockSelected}
              onChange={handleItemsColumnsChange}
            />
          ) : null}
          <TemplateSettingsFields value={settings} disabled={!isEditable} onChange={setSettings} />
        </aside>
      </div>
    </div>
  );
}
