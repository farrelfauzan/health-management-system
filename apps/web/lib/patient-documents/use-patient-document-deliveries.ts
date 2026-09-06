import type { ApiSuccess, PatientDocumentDeliveryTimelineView } from '@hms/shared-types';

import {
  getPatientDocumentDetailControllerListDeliveriesV1QueryKey,
  patientDocumentDetailControllerListDeliveriesV1,
} from '#lib/api/generated/document-management/document-management';
import { useApiQuery } from '#lib/api/use-api-query';

const QUEUED_POLL_INTERVAL_MS = 5_000;

/**
 * The delivery timeline of one clinical file (`P16-T40`), with the
 * per-category default the release dialog pre-checks (FR-E4-28). Polls
 * while a send is in flight, exactly as the invoice timeline does, so the
 * clinician watches QUEUED become SENT.
 */
export function usePatientDocumentDeliveries(documentId: string, isEnabled: boolean = true) {
  const query = useApiQuery<PatientDocumentDeliveryTimelineView>({
    queryKey: getPatientDocumentDetailControllerListDeliveriesV1QueryKey(documentId),
    queryFn: (signal) => patientDocumentDetailControllerListDeliveriesV1(documentId, signal),
    errorMessage: 'Failed to load the delivery timeline',
    enabled: isEnabled && documentId.length > 0,
    options: {
      refetchInterval: (activeQuery) => {
        const envelope = activeQuery.state.data as
          | ApiSuccess<PatientDocumentDeliveryTimelineView>
          | undefined;
        const isInFlight = envelope?.data.deliveries.some(
          (delivery) => delivery.status === 'QUEUED',
        );
        return isInFlight ? QUEUED_POLL_INTERVAL_MS : false;
      },
    },
  });

  return {
    ...query,
    timeline: query.data,
  };
}
