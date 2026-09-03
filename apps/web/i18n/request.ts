import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import enMessages from '../messages/en.json';
import enAuthShellMessages from '../messages/en/auth-shell.json';
import enClinicalMessages from '../messages/en/clinical.json';
import enDashboardAiMessages from '../messages/en/dashboard-ai.json';
import enOperationsMessages from '../messages/en/operations.json';
import enPharmacyInventoryMessages from '../messages/en/pharmacy-inventory.json';
import enSharedMessages from '../messages/en/shared.json';
// P16-T18. Its own catalog rather than a block in `dashboard-ai.json`,
// where the personal knowledge base lives. The two features hold the same
// file types and differ only in whether a document's passages reach an AI
// provider — filing the vault's copy beside the assistant's would be the
// exact confusion the epic exists to prevent.
import enVaultMessages from '../messages/en/vault.json';
import idMessages from '../messages/id.json';
import idAuthShellMessages from '../messages/id/auth-shell.json';
import idClinicalMessages from '../messages/id/clinical.json';
import idDashboardAiMessages from '../messages/id/dashboard-ai.json';
import idOperationsMessages from '../messages/id/operations.json';
import idPharmacyInventoryMessages from '../messages/id/pharmacy-inventory.json';
import idSharedMessages from '../messages/id/shared.json';
import idVaultMessages from '../messages/id/vault.json';
import { LOCALE_COOKIE_NAME, resolveAppLocale } from './config';

const messages = {
  en: {
    ...enMessages,
    ...enAuthShellMessages,
    ...enClinicalMessages,
    ...enOperationsMessages,
    ...enPharmacyInventoryMessages,
    ...enDashboardAiMessages,
    ...enSharedMessages,
    ...enVaultMessages,
  },
  id: {
    ...idMessages,
    ...idAuthShellMessages,
    ...idClinicalMessages,
    ...idOperationsMessages,
    ...idPharmacyInventoryMessages,
    ...idDashboardAiMessages,
    ...idSharedMessages,
    ...idVaultMessages,
  },
};

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = resolveAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return {
    locale,
    messages: messages[locale],
    timeZone: process.env.NEXT_PUBLIC_CLINIC_TIMEZONE ?? 'Asia/Jakarta',
  };
});
