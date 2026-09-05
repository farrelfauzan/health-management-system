import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeliveryActionKind, DeliveryView } from '@hms/shared-types';

import {
  deliveryActionControllerCancelV1,
  deliveryActionControllerRetryV1,
  deliveryActionControllerRevokeV1,
} from '#lib/api/generated/invoice-delivery/invoice-delivery';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateBillingQueries } from '#lib/billing/invalidate-billing-queries';

type DeliveryActionRequest = {
  deliveryId: string;
  action: DeliveryActionKind;
};

function callAction(request: DeliveryActionRequest) {
  switch (request.action) {
    case 'retry':
      return deliveryActionControllerRetryV1(request.deliveryId);
    case 'revoke':
      return deliveryActionControllerRevokeV1(request.deliveryId);
    case 'cancel':
      return deliveryActionControllerCancelV1(request.deliveryId);
  }
}

/**
 * The three things a cashier can do to one delivery row (P16-T25/T38): queue
 * a failed one again, withdraw one, or call off one that has not gone yet.
 * One mutation rather than three so a row's buttons share a pending state.
 */
export function useDeliveryAction(errorMessage: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: DeliveryActionRequest) => {
      const response = await callAction(request);
      return parseApiSuccess<DeliveryView>(response, errorMessage);
    },
    onSuccess: async () => {
      await invalidateBillingQueries(queryClient);
    },
  });
}
