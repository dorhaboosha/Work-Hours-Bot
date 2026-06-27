/** Matches a bare HH:mm value (e.g. "09:30"). */
export const HH_MM_RE = /^\d{2}:\d{2}$/;

/** Matches a start–end range (e.g. "09:00-17:30"), capturing each side. */
export const HH_MM_RANGE_RE = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/;

/** Matches the dd-mm date argument used by /edit (e.g. "12-06"). */
export const DD_MM_RE = /^\d{2}-\d{2}$/;
