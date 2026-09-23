'use client';

import { ROLE_TEMPLATES, type RoleTemplateCodeValue } from '@hms/shared-types';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

const BLANK_VALUE = 'BLANK';

type RoleTemplateSelectProps = {
  id: string;
  value: RoleTemplateCodeValue | null;
  onChange: (value: RoleTemplateCodeValue | null) => void;
};

/**
 * "Start from" when creating a role (P22-T05). A template grants a working
 * permission set with the role — sign-in, screen access and every dependency
 * included — so its members can do the job without further edits. "Blank"
 * still gets the baseline keys every role carries.
 */
export function RoleTemplateSelect({ id, value, onChange }: RoleTemplateSelectProps) {
  const t = useTranslations('operations.administration.roles.templates');
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="font-heading text-xs text-slate-600">
        {t('label')}
      </Label>
      <Select
        value={value ?? BLANK_VALUE}
        onValueChange={(next) =>
          onChange(next === BLANK_VALUE ? null : (next as RoleTemplateCodeValue))
        }
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={BLANK_VALUE}>{t('blank')}</SelectItem>
          {ROLE_TEMPLATES.map((template) => (
            <SelectItem key={template.code} value={template.code}>
              {t(`items.${template.code}.name`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-slate-500">
        {value ? t(`items.${value}.description`) : t('blankHint')}
      </p>
    </div>
  );
}
