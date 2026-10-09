import type {
  EditAction as ServiceEditAction,
  EditRecordState,
} from "@shared/types/CoreTypes";

/** What a numbered /edit menu choice does in the bot flow. */
export type EditAction =
  | "SET_END_HOUR"
  | "SET_START_AND_END"
  | "LOG_HOURS"
  | "ADD_PERIOD"
  | "EDIT_PERIOD"
  | "DELETE_PERIOD"
  | "CONVERT_TO_WORK"
  | "MARK_ABSENCE"
  | "CANCEL";

export interface EditMenuEntry {
  action: EditAction;
  /** botLabels key of the option's text */
  labelKey: string;
}

interface MenuDefinition extends EditMenuEntry {
  /** The service action this choice performs — the entry is shown only when it's allowed. */
  serviceAction: ServiceEditAction;
}

const SET_END_HOUR: MenuDefinition = {
  action: "SET_END_HOUR",
  serviceAction: "SET_END_HOUR",
  labelKey: "edit.menu.setEndHour",
};
const ADD_PERIOD: MenuDefinition = {
  action: "ADD_PERIOD",
  serviceAction: "ADD_WORK_PERIOD",
  labelKey: "edit.menu.addPeriod",
};
const EDIT_PERIOD: MenuDefinition = {
  action: "EDIT_PERIOD",
  serviceAction: "EDIT_WORK_PERIOD",
  labelKey: "edit.menu.editPeriod",
};
const DELETE_PERIOD: MenuDefinition = {
  action: "DELETE_PERIOD",
  serviceAction: "DELETE_WORK_PERIOD",
  labelKey: "edit.menu.deletePeriod",
};
const CHANGE_ABSENCE: MenuDefinition = {
  action: "MARK_ABSENCE",
  serviceAction: "MARK_ABSENCE",
  labelKey: "edit.menu.changeAbsence",
};
// On a half day, replacing the absence with a regular work day is exactly
// what SET_START_AND_END_HOURS does (refunding any debit).
const CONVERT_TO_WORK: MenuDefinition = {
  action: "CONVERT_TO_WORK",
  serviceAction: "SET_START_AND_END_HOURS",
  labelKey: "edit.menu.convertToWork",
};

/** Every option a state can offer, in menu order (Cancel is always appended last). */
const MENUS: Record<EditRecordState, MenuDefinition[]> = {
  NO_RECORD: [
    { action: "SET_START_AND_END", serviceAction: "SET_START_AND_END_HOURS", labelKey: "edit.menu.setStartAndEnd" },
    { action: "MARK_ABSENCE", serviceAction: "MARK_ABSENCE", labelKey: "edit.menu.markAbsence" },
  ],
  OPEN_WORK_RECORD: [
    SET_END_HOUR,
    { action: "SET_START_AND_END", serviceAction: "SET_START_AND_END_HOURS", labelKey: "edit.menu.wholeDay" },
    { action: "MARK_ABSENCE", serviceAction: "MARK_ABSENCE", labelKey: "edit.menu.markAbsenceInstead" },
  ],
  CLOSED_WORK_RECORD: [
    { action: "SET_START_AND_END", serviceAction: "SET_START_AND_END_HOURS", labelKey: "edit.menu.wholeDay" },
    ADD_PERIOD,
    EDIT_PERIOD,
    DELETE_PERIOD,
    { action: "MARK_ABSENCE", serviceAction: "MARK_ABSENCE", labelKey: "edit.menu.markAbsenceInstead" },
  ],
  ABSENCE_RECORD: [
    { action: "SET_START_AND_END", serviceAction: "SET_START_AND_END_HOURS", labelKey: "edit.menu.setStartAndEndInstead" },
    CHANGE_ABSENCE,
  ],
  HALF_DAY_RECORD: [
    { action: "LOG_HOURS", serviceAction: "LOG_HOURS", labelKey: "edit.menu.logHours" },
    ADD_PERIOD,
    EDIT_PERIOD,
    DELETE_PERIOD,
    CHANGE_ABSENCE,
    CONVERT_TO_WORK,
  ],
  HALF_DAY_OPEN_RECORD: [
    SET_END_HOUR,
    { action: "LOG_HOURS", serviceAction: "LOG_HOURS", labelKey: "edit.menu.logHoursAsOne" },
    CHANGE_ABSENCE,
    CONVERT_TO_WORK,
  ],
};

/**
 * The numbered /edit menu for a date: the options of its state that the
 * service currently allows (see getEditDayOptions' allowedActions), then
 * Cancel. On a half day that already has hours, "Log hours worked" replaces
 * them all, so it says so.
 */
export function buildEditMenu(
  state: EditRecordState,
  allowedActions: ServiceEditAction[],
  periodCount: number
): EditMenuEntry[] {
  const entries: EditMenuEntry[] = MENUS[state]
    .filter((entry) => allowedActions.includes(entry.serviceAction))
    .map(({ action, labelKey }) =>
      action === "LOG_HOURS" && periodCount > 0
        ? { action, labelKey: "edit.menu.logHoursAsOne" }
        : { action, labelKey }
    );
  return [...entries, { action: "CANCEL", labelKey: "edit.menu.cancel" }];
}
