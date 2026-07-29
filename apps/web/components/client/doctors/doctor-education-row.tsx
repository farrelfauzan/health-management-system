'use client';

import type { DoctorEducation } from '@hms/shared-types';

type DoctorEducationRowProps = {
  education: DoctorEducation;
};

export function DoctorEducationRow({ education }: DoctorEducationRowProps) {
  return (
    <li className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-sm font-medium text-slate-900">
        {education.degree}
        {education.fieldOfStudy ? ` · ${education.fieldOfStudy}` : null}
      </p>
      <p className="text-xs text-slate-500">
        {education.institution}
        {education.graduationYear ? ` · ${education.graduationYear}` : null}
      </p>
    </li>
  );
}
