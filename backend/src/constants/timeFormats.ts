/** Matches a valid HH:mm value (00:00–23:59). */
export const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Matches a valid start–end range (e.g. "09:00-17:30"), capturing each side. */
export const HH_MM_RANGE_RE = /^((?:[01]\d|2[0-3]):[0-5]\d)-((?:[01]\d|2[0-3]):[0-5]\d)$/;

/** Matches the dd-mm date argument used by /edit (e.g. "12-06"). */
export const DD_MM_RE = /^\d{2}-\d{2}$/;
