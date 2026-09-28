/** How a dashboard's time series is bucketed (PRD FR-FDN-04). */
export type AnalyticsGranularity = 'day' | 'week' | 'month';

/**
 * A clinical or demographic count too small to show (1–4 by default, PRD
 * FR-FDN-05). The number is withheld, not rounded: a "<5" that could be
 * recovered by subtraction would be no protection at all.
 */
export type AnalyticsSuppressedCount = {
  suppressed: true;
};

export type AnalyticsCount = number | AnalyticsSuppressedCount;

/**
 * The filter's comparison period: its totals, and its series so a chart can
 * draw last month's line under this month's. Its buckets start at the
 * comparison period's own dates; a chart pairs them by position.
 */
export type AnalyticsComparison<TTotals, TSeries> = {
  from: string;
  to: string;
  totals: TTotals;
  series: TSeries;
};

/**
 * What every dashboard answers (PRD FR-FDN-06): headline totals, the time
 * series, the breakdowns, and the comparison period's totals when asked.
 * Each dashboard names its own shapes.
 */
export type AnalyticsDashboardData<TTotals, TSeries, TBreakdowns> = {
  totals: TTotals;
  series: TSeries;
  breakdowns: TBreakdowns;
  comparison?: AnalyticsComparison<TTotals, TSeries>;
};

/**
 * `generatedAt` is the instant the figures were read, shown as "Data per …"
 * (NFR-AN-04). A cached answer keeps the instant it was first read.
 */
export type AnalyticsResponseMeta = {
  from: string;
  to: string;
  timezone: string;
  granularity: AnalyticsGranularity;
  generatedAt: string;
};

export type AnalyticsResponse<TData> = {
  data: TData;
  meta: AnalyticsResponseMeta;
};

/** `Registration.type`, the three kinds of visit (PRD FR-OPS-01). */
export type AnalyticsVisitType = 'CONSULTATION' | 'LAB_ONLY' | 'ADMISSION';

/**
 * Where a visit came from (PRD FR-OPS-05): booked by staff, over WhatsApp or
 * Telegram, through Mobile JKN, or a walk-in with no appointment at all.
 */
export type AnalyticsBookingChannel = 'WALK_IN' | 'STAFF' | 'WHATSAPP' | 'TELEGRAM' | 'MOBILE_JKN';

/**
 * The operations headline (P29-T04). A visit is a registration checked in or
 * completed; a new patient is one whose first visit ever falls in the
 * period. The no-show rate is NO_SHOW / (COMPLETED + NO_SHOW), `null` when
 * neither happened.
 */
export type AnalyticsOperationsTotals = {
  visits: number;
  newPatients: number;
  returningPatients: number;
  walkIns: number;
  appointments: number;
  completedAppointments: number;
  noShowAppointments: number;
  noShowRatePercent: number | null;
};

/** One bucket of the visit trend; `bucket` is its first local date. */
export type AnalyticsVisitSeriesPoint = {
  bucket: string;
  visits: number;
  consultation: number;
  labOnly: number;
  admission: number;
};

export type AnalyticsVisitsByType = {
  type: AnalyticsVisitType;
  visits: number;
};

/**
 * Visits at one poli. `specialtyId` is null for a visit registered without
 * one. `previousVisits` is the comparison period's count, present only when
 * `compare` is on.
 */
export type AnalyticsVisitsByPoli = {
  specialtyId: string | null;
  specialtyName: string | null;
  visits: number;
  previousVisits?: number;
};

/** Visits seen by one clinician, through `Encounter.doctorId`. */
export type AnalyticsVisitsByDoctor = {
  doctorId: string;
  doctorName: string;
  visits: number;
  previousVisits?: number;
};

export type AnalyticsAppointmentOutcome = {
  status: string;
  appointments: number;
};

/**
 * One booking channel. For walk-ins `bookings` and `completed` both count
 * the visits themselves and the no-show rate is `null`: nobody fails to turn
 * up for a visit they are already at.
 */
export type AnalyticsBookingChannelRow = {
  channel: AnalyticsBookingChannel;
  bookings: number;
  completed: number;
  noShows: number;
  noShowRatePercent: number | null;
};

export type AnalyticsOperationsBreakdowns = {
  visitsByType: AnalyticsVisitsByType[];
  visitsByPoli: AnalyticsVisitsByPoli[];
  visitsByDoctor: AnalyticsVisitsByDoctor[];
  appointmentOutcomes: AnalyticsAppointmentOutcome[];
  bookingChannels: AnalyticsBookingChannelRow[];
};

/**
 * The operations dashboard (P29-T04, PRD FR-OPS-01 to 05). Counts only: no
 * patient appears in it, by identifier or otherwise.
 */
export type AnalyticsOperationsData = AnalyticsDashboardData<
  AnalyticsOperationsTotals,
  AnalyticsVisitSeriesPoint[],
  AnalyticsOperationsBreakdowns
>;
