import { DoctorTodayPanel } from '#components/client/encounters/doctor-today-panel';
import { resolveClinicToday } from '#lib/shared/clinic-today';

export default function DoctorDashboardPage() {
  // Resolved on the server so a browser in another timezone cannot decide
  // which clinic day "today" means.
  return <DoctorTodayPanel today={resolveClinicToday()} />;
}
