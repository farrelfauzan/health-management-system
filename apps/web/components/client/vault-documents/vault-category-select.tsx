'use client';

import { VAULT_DOCUMENT_CATEGORIES, type VaultDocumentCategoryValue } from '@hms/shared-types';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

const NO_CATEGORY_VALUE = 'NONE';

type VaultCategorySelectProps = {
  id: string;
  value: VaultDocumentCategoryValue | null;
  onChange: (value: VaultDocumentCategoryValue | null) => void;
};

/**
 * Which drawer a document goes in (§7.3.3).
 *
 * A filing aid for the owner and nothing more: nobody reviews these
 * categories, no workflow verifies them, and no completeness check is run
 * against them. "Not filed" is a first-class option rather than a validation
 * error, because a vault has no audience but its owner and an owner who has
 * not decided yet is not making a mistake.
 */
export function VaultCategorySelect({ id, value, onChange }: VaultCategorySelectProps) {
  const t = useTranslations('vault');

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('edit.fields.category')}</Label>
      <Select
        value={value ?? NO_CATEGORY_VALUE}
        onValueChange={(next) =>
          onChange(next === NO_CATEGORY_VALUE ? null : (next as VaultDocumentCategoryValue))
        }
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CATEGORY_VALUE}>{t('categories.NONE')}</SelectItem>
          {VAULT_DOCUMENT_CATEGORIES.map((category) => (
            <SelectItem key={category} value={category}>
              {t(`categories.${category}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
