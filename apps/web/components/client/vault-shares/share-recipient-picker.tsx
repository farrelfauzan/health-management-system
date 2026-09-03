'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  VAULT_DOCUMENT_SHARE_RECIPIENT_SEARCH_MIN_LENGTH,
  type VaultDocumentShareRecipientView,
} from '@hms/shared-types';
import { Input, Label, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { vaultDocumentShareControllerListShareRecipientsV1 } from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';

type ShareRecipientPickerProps = {
  selected: VaultDocumentShareRecipientView | null;
  onSelect: (recipient: VaultDocumentShareRecipientView | null) => void;
};

/**
 * Names one person to hand a document to (FR-E3-13).
 *
 * Search-driven rather than a dropdown of everyone, and it answers nothing
 * below three characters — a doctor holds no `user.read:any` grant, so this
 * lookup exists only because sharing requires naming a person, and it is
 * shaped so it cannot be walked to enumerate staff. The role codes are shown
 * because an owner about to hand over their KTP should be able to tell an
 * administrator from another clinician before they do.
 */
export function ShareRecipientPicker({ selected, onSelect }: ShareRecipientPickerProps) {
  const t = useTranslations('vault.sharing.recipient');
  const [search, setSearch] = useState('');
  const isSearchable = search.trim().length >= VAULT_DOCUMENT_SHARE_RECIPIENT_SEARCH_MIN_LENGTH;

  const recipientsQuery = useQuery({
    queryKey: ['vault-share-recipients', search.trim()],
    enabled: isSearchable,
    retry: false,
    queryFn: async () =>
      parseApiSuccess<VaultDocumentShareRecipientView[]>(
        await vaultDocumentShareControllerListShareRecipientsV1({ search: search.trim() }),
        t('error'),
      ).data,
  });

  return (
    <div className="space-y-2">
      <Label htmlFor="vault-share-recipient">{t('label')}</Label>
      <Input
        id="vault-share-recipient"
        value={search}
        placeholder={t('placeholder')}
        onChange={(event) => {
          setSearch(event.target.value);
          onSelect(null);
        }}
      />
      {selected ? (
        <p className="text-sm text-slate-700">{t('selected', { email: selected.email })}</p>
      ) : !isSearchable ? (
        <p className="text-xs text-slate-500">
          {t('minLength', { count: VAULT_DOCUMENT_SHARE_RECIPIENT_SEARCH_MIN_LENGTH })}
        </p>
      ) : recipientsQuery.isPending ? (
        <p className="text-xs text-slate-500">{t('searching')}</p>
      ) : (recipientsQuery.data ?? []).length === 0 ? (
        <p className="text-xs text-slate-500">{t('empty')}</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1">
          {(recipientsQuery.data ?? []).map((recipient) => (
            <li key={recipient.id}>
              <button
                type="button"
                onClick={() => onSelect(recipient)}
                className={cn(
                  'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm',
                  'hover:bg-slate-50',
                )}
              >
                <span className="text-slate-900">{recipient.email}</span>
                <span className="text-xs text-slate-500">{recipient.roleCodes.join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
