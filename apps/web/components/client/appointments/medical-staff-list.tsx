'use client';

import type { DoctorListItem } from '@hms/shared-types';
import { Checkbox, Skeleton } from '@hms/ui';

import { AvatarInitials } from '#components/shared/avatar-initials';

type MedicalStaffListProps = {
  doctors: DoctorListItem[];
  selectedDoctorIds: string[] | null;
  isLoading: boolean;
  onToggleDoctor: (doctorId: string) => void;
};

export function MedicalStaffList({
  doctors,
  selectedDoctorIds,
  isLoading,
  onToggleDoctor,
}: MedicalStaffListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (doctors.length === 0) {
    return <p className="text-sm text-slate-500">No active doctors available.</p>;
  }
  return (
    <div className="space-y-2">
      {doctors.map((doctor) => {
        const isSelected = selectedDoctorIds === null || selectedDoctorIds.includes(doctor.id);
        return (
          <label
            key={doctor.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 p-2 transition-colors hover:border-primary/40 hover:bg-white"
          >
            <AvatarInitials name={doctor.fullName} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">
                {doctor.fullName}
              </span>
              <span className="block truncate text-xs text-slate-500">{doctor.specialty}</span>
            </span>
            <Checkbox
              checked={isSelected}
              aria-label={`Toggle ${doctor.fullName}`}
              onCheckedChange={() => onToggleDoctor(doctor.id)}
            />
          </label>
        );
      })}
    </div>
  );
}
