'use client';

import { MAX_DOCUMENT_TYPE_REQUIRED_APPROVALS } from '@hms/shared-types';
import { Checkbox, Input, Label } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { SelfApprovalWarningBanner } from '#components/client/document-types/self-approval-warning-banner';

export type DocumentTypeApprovalValues = {
  isApprovalRequired: boolean;
  allowSelfApproval: boolean;
  requiredApprovals: number;
};

type DocumentTypeApprovalFieldsProps = {
  values: DocumentTypeApprovalValues;
  disabled: boolean;
  onChange: (values: DocumentTypeApprovalValues) => void;
};

/**
 * The approval policy on the type row (FR-E5-34): whether sign-off is needed,
 * how many, and whether the drafter counts. Self-approval carries the
 * persistent banner while on (FR-E5-14) — the form is where it is decided,
 * so the form is where the consequence is spelled out.
 */
export function DocumentTypeApprovalFields({
  values,
  disabled,
  onChange,
}: DocumentTypeApprovalFieldsProps) {
  const t = useTranslations('operations.documents.types.approval');

  return (
    <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3" disabled={disabled}>
      <legend className="px-1 text-sm font-medium text-slate-900">{t('title')}</legend>
      <div className="flex items-start gap-2">
        <Checkbox
          id="document-type-approval-required"
          checked={values.isApprovalRequired}
          onCheckedChange={(value) => onChange({ ...values, isApprovalRequired: value === true })}
          className="mt-0.5"
        />
        <Label htmlFor="document-type-approval-required" className="text-sm font-normal">
          {t('isApprovalRequired')}
        </Label>
      </div>
      {values.isApprovalRequired ? (
        <div className="space-y-2 pl-6">
          <Label htmlFor="document-type-required-approvals">{t('requiredApprovals')}</Label>
          <Input
            id="document-type-required-approvals"
            type="number"
            min={1}
            max={MAX_DOCUMENT_TYPE_REQUIRED_APPROVALS}
            value={values.requiredApprovals}
            className="w-24"
            onChange={(event) =>
              onChange({ ...values, requiredApprovals: Number(event.target.value) || 1 })
            }
          />
          <div className="flex items-start gap-2">
            <Checkbox
              id="document-type-self-approval"
              checked={values.allowSelfApproval}
              onCheckedChange={(value) =>
                onChange({ ...values, allowSelfApproval: value === true })
              }
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="document-type-self-approval" className="text-sm font-normal">
                {t('allowSelfApproval')}
              </Label>
              <p className="text-xs text-slate-500">{t('selfApprovalHint')}</p>
            </div>
          </div>
          {values.allowSelfApproval ? <SelfApprovalWarningBanner /> : null}
        </div>
      ) : null}
    </fieldset>
  );
}
