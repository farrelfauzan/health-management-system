/**
 * The rooms strip's `?tab=` slugs, in strip order (SJ-162). Other screens
 * link to them (`/admin/rooms?tab=wards` from the "create a ward first"
 * prompt), so the slugs are part of the app's URL contract.
 */
export const ROOMS_TABS = ['occupancy', 'wards', 'rooms', 'beds', 'classes'] as const;

export type RoomsTab = (typeof ROOMS_TABS)[number];
