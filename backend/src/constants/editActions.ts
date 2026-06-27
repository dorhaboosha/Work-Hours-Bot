export type EditAction = "SET_END_HOUR" | "SET_START_AND_END" | "MARK_ABSENCE" | "CANCEL";

/** Maps each EditRecordState to its numbered menu choices. */
export const EDIT_ACTION_MAP: Record<string, Record<string, EditAction>> = {
  OPEN_WORK_RECORD:   { "1": "SET_END_HOUR", "2": "SET_START_AND_END", "3": "MARK_ABSENCE", "4": "CANCEL" },
  NO_RECORD:          { "1": "SET_START_AND_END", "2": "MARK_ABSENCE", "3": "CANCEL" },
  CLOSED_WORK_RECORD: { "1": "SET_START_AND_END", "2": "MARK_ABSENCE", "3": "CANCEL" },
  ABSENCE_RECORD:     { "1": "SET_START_AND_END", "2": "MARK_ABSENCE", "3": "CANCEL" },
};
