export type EditAction =
  | "SET_END_HOUR"
  | "SET_START_AND_END"
  | "LOG_HOURS"
  | "CONVERT_TO_WORK"
  | "MARK_ABSENCE"
  | "CANCEL";

/** Maps each EditRecordState to its numbered menu choices. */
export const EDIT_ACTION_MAP: Record<string, Record<string, EditAction>> = {
  OPEN_WORK_RECORD:   { "1": "SET_END_HOUR", "2": "SET_START_AND_END", "3": "MARK_ABSENCE", "4": "CANCEL" },
  NO_RECORD:          { "1": "SET_START_AND_END", "2": "MARK_ABSENCE", "3": "CANCEL" },
  CLOSED_WORK_RECORD: { "1": "SET_START_AND_END", "2": "MARK_ABSENCE", "3": "CANCEL" },
  ABSENCE_RECORD:     { "1": "SET_START_AND_END", "2": "MARK_ABSENCE", "3": "CANCEL" },
  HALF_DAY_RECORD:      { "1": "LOG_HOURS", "2": "MARK_ABSENCE", "3": "CONVERT_TO_WORK", "4": "CANCEL" },
  HALF_DAY_OPEN_RECORD: { "1": "SET_END_HOUR", "2": "LOG_HOURS", "3": "MARK_ABSENCE", "4": "CONVERT_TO_WORK", "5": "CANCEL" },
};
