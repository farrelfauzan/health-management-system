import type idMessages from '../messages/id.json';
import type idAuthShellMessages from '../messages/id/auth-shell.json';
import type idClinicalMessages from '../messages/id/clinical.json';
import type idDashboardAiMessages from '../messages/id/dashboard-ai.json';
import type idOperationsMessages from '../messages/id/operations.json';
import type idPharmacyInventoryMessages from '../messages/id/pharmacy-inventory.json';
import type idSharedMessages from '../messages/id/shared.json';
import type { APP_LOCALES } from './config';

type SharedMessages = {
  shared: {
    accessibility: typeof idSharedMessages.shared.accessibility;
    pagination: typeof idSharedMessages.shared.pagination;
    statuses: Record<string, string>;
  };
};

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof APP_LOCALES)[number];
    Messages: typeof idMessages &
      typeof idAuthShellMessages &
      typeof idClinicalMessages &
      typeof idDashboardAiMessages &
      typeof idOperationsMessages &
      typeof idPharmacyInventoryMessages &
      SharedMessages;
  }
}
