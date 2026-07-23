'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@hms/ui';

import { AppointmentParticipantFields } from '#components/client/appointments/appointment-participant-fields';
import { SessionBookingForm } from '#components/client/appointments/session-booking-form';
import { SpecialRequestForm } from '#components/client/appointments/special-request-form';

type ScheduleAppointmentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: string;
};

export function ScheduleAppointmentDialog({
  open,
  onOpenChange,
  initialDate,
}: ScheduleAppointmentDialogProps) {
  const [patientId, setPatientId] = useState<string>('');
  const [doctorId, setDoctorId] = useState<string>('');

  function handleClose(): void {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">New Appointment</DialogTitle>
          <DialogDescription>
            Join a doctor&apos;s practice session, or request a specific time that the clinic must
            approve.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <AppointmentParticipantFields
            patientId={patientId}
            doctorId={doctorId}
            onPatientChange={setPatientId}
            onDoctorChange={setDoctorId}
          />
          <Tabs defaultValue="session">
            <TabsList className="w-full">
              <TabsTrigger value="session" className="flex-1">
                Join a Session
              </TabsTrigger>
              <TabsTrigger value="special-request" className="flex-1">
                Special Request
              </TabsTrigger>
            </TabsList>
            <TabsContent value="session" className="pt-2">
              <SessionBookingForm
                patientId={patientId}
                doctorId={doctorId}
                initialDate={initialDate}
                onSuccess={handleClose}
                onCancel={handleClose}
              />
            </TabsContent>
            <TabsContent value="special-request" className="pt-2">
              <SpecialRequestForm
                patientId={patientId}
                doctorId={doctorId}
                initialDate={initialDate}
                onSuccess={handleClose}
                onCancel={handleClose}
              />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
