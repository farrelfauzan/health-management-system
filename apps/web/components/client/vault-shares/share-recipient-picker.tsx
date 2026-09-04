'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  VAULT_DOCUMENT_SHARE_RECIPIENT_SEARCH_MIN_LENGTH,
  type VaultDocumentShareRecipientView,
} from '@hms/shared-types';
import { Label, MultiCombobox, type MultiComboboxOption } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useDebouncedValue } from '#hooks/use-debounced-value';
import { vaultShareRecipientControllerListShareRecipientsV1 } from '#lib/api/generated/document-management/document-management';
import { parseApiSuccess } from '#lib/api/response';

const SEARCH_DEBOUNCE_MS = 300;

type ShareRecipientPickerProps = {
  selected: VaultDocumentShareRecipientView[];
  onChange: (recipients: VaultDocumentShareRecipientView[]) => void;
};

/**
 * Names the people to hand a document to (FR-E3-13).
 *
 * Search-driven rather than a dropdown of everyone, and it answers nothing
 * below three characters — a doctor holds no `user.read:any` grant, so this
 * lookup exists only because sharing requires naming a person, and it is
 * shaped so it cannot be walked to enumerate staff. The role codes are shown
 * because an owner about to hand over their KTP should be able to tell an
 * administrator from another clinician before they do.
 *
 * Several people can be picked in one go: the picks stay as chips while the
 * search moves on, so an owner sharing with a whole team does not repeat the
 * dialog once per colleague. Each pick still becomes its own share.
 */
export function ShareRecipientPicker({ selected, onChange }: ShareRecipientPickerProps) {
  const t = useTranslations('vault.sharing.recipient');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const hasEnoughCharacters =
    search.trim().length >= VAULT_DOCUMENT_SHARE_RECIPIENT_SEARCH_MIN_LENGTH;
  const isSearchable = debouncedSearch.length >= VAULT_DOCUMENT_SHARE_RECIPIENT_SEARCH_MIN_LENGTH;

  const recipientsQuery = useQuery({
    queryKey: ['vault-share-recipients', debouncedSearch],
    enabled: isSearchable,
    retry: false,
    queryFn: async () =>
      parseApiSuccess<VaultDocumentShareRecipientView[]>(
        await vaultShareRecipientControllerListShareRecipientsV1({ search: debouncedSearch }),
        t('error'),
      ).data,
  });

  const results: VaultDocumentShareRecipientView[] = recipientsQuery.data ?? [];
  const options: MultiComboboxOption[] = results.map((recipient) => ({
    value: recipient.id,
    label: recipient.email,
    description: recipient.roleCodes.join(', '),
  }));
  // Earlier picks drop out of `results` as soon as the search changes; this
  // keeps their labels on the chips and their records available to `onChange`.
  const knownRecipients = new Map<string, VaultDocumentShareRecipientView>(
    [...selected, ...results].map((recipient) => [recipient.id, recipient]),
  );
  const selectedLabels = Object.fromEntries(
    selected.map((recipient) => [recipient.id, recipient.email]),
  );

  function handleChange(ids: string[]): void {
    onChange(
      ids
        .map((id) => knownRecipients.get(id))
        .filter(
          (recipient): recipient is VaultDocumentShareRecipientView => recipient !== undefined,
        ),
    );
  }

  function resolveEmptyMessage(): string {
    if (!hasEnoughCharacters) {
      return t('minLength', { count: VAULT_DOCUMENT_SHARE_RECIPIENT_SEARCH_MIN_LENGTH });
    }
    if (!isSearchable || recipientsQuery.isPending) {
      return t('searching');
    }
    if (recipientsQuery.isError) {
      /* A failed lookup is not an empty one. Conflating them cost real
         debugging time once already: a route collision made every search
         answer 400, and this branch reported it as "nobody matching" — a
         wrong answer that looked like a right one. */
      return t('error');
    }
    return t('empty');
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="vault-share-recipient">{t('label')}</Label>
      <MultiCombobox
        id="vault-share-recipient"
        options={options}
        values={selected.map((recipient) => recipient.id)}
        selectedLabels={selectedLabels}
        placeholder={t('placeholder')}
        searchPlaceholder={t('searchPlaceholder')}
        emptyMessage={resolveEmptyMessage()}
        hasError={recipientsQuery.isError}
        searchValue={search}
        onSearchValueChange={setSearch}
        shouldFilter={false}
        removeLabel={(label) => t('remove', { email: label })}
        onChange={handleChange}
      />
      <p className="text-xs text-slate-500">{t('hint')}</p>
    </div>
  );
}
