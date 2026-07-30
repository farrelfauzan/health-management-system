import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import enMessages from '../messages/en.json';
import enAuthShellMessages from '../messages/en/auth-shell.json';
import enClinicalMessages from '../messages/en/clinical.json';
import enDashboardAiMessages from '../messages/en/dashboard-ai.json';
import enOperationsMessages from '../messages/en/operations.json';
import enPharmacyInventoryMessages from '../messages/en/pharmacy-inventory.json';
import enSharedMessages from '../messages/en/shared.json';
import idMessages from '../messages/id.json';
import idAuthShellMessages from '../messages/id/auth-shell.json';
import idClinicalMessages from '../messages/id/clinical.json';
import idDashboardAiMessages from '../messages/id/dashboard-ai.json';
import idOperationsMessages from '../messages/id/operations.json';
import idPharmacyInventoryMessages from '../messages/id/pharmacy-inventory.json';
import idSharedMessages from '../messages/id/shared.json';
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
  },
  id: {
    ...idMessages,
    ...idAuthShellMessages,
    ...idClinicalMessages,
    ...idOperationsMessages,
    ...idPharmacyInventoryMessages,
    ...idDashboardAiMessages,
    ...idSharedMessages,
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
