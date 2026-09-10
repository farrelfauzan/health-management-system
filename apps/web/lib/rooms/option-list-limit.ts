/**
 * How many wards, rooms, or classes a picker loads at once. Every picker and
 * every "is there anything to pick?" check reads the list with this same
 * limit so they share one cached query: a panel that decides "no wards yet"
 * and the dialog behind its Add button must be looking at the same answer.
 */
export const ROOM_OPTION_LIST_LIMIT = 100;
