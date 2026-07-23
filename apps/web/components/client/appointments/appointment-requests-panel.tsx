'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppointmentListItem, AppointmentResponse } from '@hms/shared-types';
import { Card, CardContent, CardHeader, CardTitle, useAbility } from '@hms/ui';

import { AppointmentRequestRow } from '#components/client/appointments/appointment-request-row';
import { RejectRequestDialog } from '#components/client/appointments/reject-request-dialog';
import { appointmentManagementControllerApproveAppointmentV1 } from '#lib/api/generated/appointment-management/appointment-management';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateAppointmentQueries } from '#lib/appointments/invalidate-appointment-queries';
import { useAppointmentRequests } from '#lib/appointments/use-appointment-requests';

const APPROVE_ERROR_FALLBACK = 'Unable to approve the appointment request. Please try again.';

export function AppointmentRequestsPanel() {
  const ability = useAbility();
  const queryClient = useQueryClient();
  const canApprove = ability.can('approve', 'Appointment');
  const requestsQuery = useAppointmentRequests();
  const [rejectingRequest, setRejectingRequest] = useState<AppointmentListItem | null>(null);
  const approveMutation = useMutation({
    mutationFn: (requestId: string) =>
      appointmentManagementControllerApproveAppointmentV1(requestId, {}),
  });

  if (!canApprove || (!requestsQuery.isPending && requestsQuery.requests.length === 0)) {
    return null;
  }

  async function handleApprove(request: AppointmentListItem): Promise<void> {
    try {
      const response = await approveMutation.mutateAsync(request.id);
      parseApiSuccess<AppointmentResponse>(response, APPROVE_ERROR_FALLBACK);
      await invalidateAppointmentQueries(queryClient);
    } catch (error) {
      notifyApiError(error, APPROVE_ERROR_FALLBACK);
    }
  }

  return (
    <Card className="rounded-xl border-amber-200 bg-amber-50/40 shadow-none">
      <CardHeader>
        <CardTitle className="font-heading text-sm">
          Pending Appointment Requests ({requestsQuery.meta?.total ?? requestsQuery.requests.length}
          )
        </CardTitle>
      </CardHeader>
      <CardContent>
        {requestsQuery.isPending ? (
          <p className="text-sm text-slate-500">Loading requests…</p>
        ) : (
          <ul className="space-y-2">
            {requestsQuery.requests.map((request) => (
              <AppointmentRequestRow
                key={request.id}
                request={request}
                isBusy={approveMutation.isPending}
                onApprove={(item) => void handleApprove(item)}
                onReject={setRejectingRequest}
              />
            ))}
          </ul>
        )}
      </CardContent>

      {rejectingRequest ? (
        <RejectRequestDialog
          key={rejectingRequest.id}
          open={Boolean(rejectingRequest)}
          onOpenChange={(open) => {
            if (!open) {
              setRejectingRequest(null);
            }
          }}
          request={rejectingRequest}
        />
      ) : null}
    </Card>
  );
}
