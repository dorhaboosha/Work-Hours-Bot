import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEditMenu } from "./editActions";

const actionsOf = (menu: ReturnType<typeof buildEditMenu>) => menu.map((e) => e.action);

describe("buildEditMenu", () => {
  it("offers the whole-day, add, edit and delete options on a closed work day, then Cancel", () => {
    const menu = buildEditMenu(
      "CLOSED_WORK_RECORD",
      ["SET_START_AND_END_HOURS", "ADD_WORK_PERIOD", "EDIT_WORK_PERIOD", "DELETE_WORK_PERIOD", "MARK_ABSENCE", "CANCEL"],
      2
    );

    assert.deepEqual(actionsOf(menu), [
      "SET_START_AND_END",
      "ADD_PERIOD",
      "EDIT_PERIOD",
      "DELETE_PERIOD",
      "MARK_ABSENCE",
      "CANCEL",
    ]);
    assert.equal(menu[0].labelKey, "edit.menu.wholeDay");
  });

  it("leaves out the options the service doesn't allow (e.g. Add at the period limit)", () => {
    const menu = buildEditMenu(
      "CLOSED_WORK_RECORD",
      ["SET_START_AND_END_HOURS", "EDIT_WORK_PERIOD", "DELETE_WORK_PERIOD", "MARK_ABSENCE", "CANCEL"],
      4
    );

    assert.ok(!actionsOf(menu).includes("ADD_PERIOD"));
  });

  it("always ends with Cancel, even when the service doesn't list it (no record)", () => {
    const menu = buildEditMenu("NO_RECORD", ["SET_START_AND_END_HOURS", "MARK_ABSENCE"], 0);

    assert.deepEqual(actionsOf(menu), ["SET_START_AND_END", "MARK_ABSENCE", "CANCEL"]);
  });

  it("says 'as one period' for Log hours on a half day that already has hours", () => {
    const allowed = [
      "LOG_HOURS", "ADD_WORK_PERIOD", "EDIT_WORK_PERIOD", "DELETE_WORK_PERIOD",
      "SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL",
    ] as const;

    assert.equal(buildEditMenu("HALF_DAY_RECORD", [...allowed], 0)[0].labelKey, "edit.menu.logHours");
    assert.equal(buildEditMenu("HALF_DAY_RECORD", [...allowed], 2)[0].labelKey, "edit.menu.logHoursAsOne");
  });

  it("turns a half day into a work day through SET_START_AND_END_HOURS", () => {
    const menu = buildEditMenu(
      "HALF_DAY_RECORD",
      ["LOG_HOURS", "SET_START_AND_END_HOURS", "MARK_ABSENCE", "CANCEL"],
      0
    );

    assert.deepEqual(actionsOf(menu), ["LOG_HOURS", "MARK_ABSENCE", "CONVERT_TO_WORK", "CANCEL"]);
  });
});
