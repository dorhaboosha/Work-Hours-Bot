import { describe, it, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { Module } from "node:module";
import type { Context } from "telegraf";
import { SessionStore } from "@/bot/session/SessionStore";
import type { Session } from "@/bot/session/SessionStore";
import { AppError } from "@/utils/AppError";

function injectCacheStub(resolvedPath: string, exports: Record<string, unknown>): void {
  delete require.cache[resolvedPath];
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports,
    parent: null,
    children: [],
    paths: [],
  } as unknown as Module;
}

const USER = "user1";
const SETTINGS = { telegramId: USER, timezone: "Asia/Jerusalem" };

/** A saved closed work day with the given periods (UTC ISO strings). */
function makeResult(periods: Array<[string, string]>) {
  return {
    id: "r1",
    telegramId: USER,
    workDate: "2026-10-08",
    displayDate: "08-10",
    recordType: "WORK",
    absencePortion: null,
    startTime: periods[0]?.[0] ?? null,
    endTime: periods[periods.length - 1]?.[1] ?? null,
    workedMinutes: 120,
    periods: periods.map(([startTime, endTime]) => ({ startTime, endTime, workedMinutes: 60 })),
    creditedMinutes: 0,
    requiredMinutes: 480,
    balanceMinutes: -360,
  };
}

/** /edit options for 09-10 with a single period, 08:00–17:00 Jerusalem (UTC+3). */
function makeOptions(recordType: "WORK" | "VACATION", periodCount = 1) {
  const periods = [
    { startTime: "2026-10-09T05:00:00.000Z", endTime: "2026-10-09T14:00:00.000Z", workedMinutes: 540 },
    { startTime: "2026-10-09T15:00:00.000Z", endTime: "2026-10-09T16:00:00.000Z", workedMinutes: 60 },
  ].slice(0, periodCount);
  return {
    workDate: "2026-10-09",
    displayDate: "09-10",
    timezone: "Asia/Jerusalem",
    state: recordType === "WORK" ? "CLOSED_WORK_RECORD" : "HALF_DAY_RECORD",
    record: { recordType, absencePortion: recordType === "WORK" ? null : "HALF" },
    periods,
    allowedActions: [],
  };
}

describe("editDayFlow — work periods", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handleEditStep: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditWorkPeriod: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAddWorkPeriod: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRemoveWorkPeriod: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockGetEditDayOptions: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSetStartAndEndHours: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSetEndHour: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reply: ReturnType<typeof mock.fn<any>>;
  let ctx: Context;

  before(() => {
    mockEditWorkPeriod = mock.fn();
    mockAddWorkPeriod = mock.fn();
    mockRemoveWorkPeriod = mock.fn();
    // Default: 09-10 is a work day with one period, 08:00–17:00 Jerusalem.
    mockGetEditDayOptions = mock.fn(async () => makeOptions("WORK"));
    mockSetStartAndEndHours = mock.fn();
    mockSetEndHour = mock.fn();

    injectCacheStub(require.resolve(path.join(__dirname, "../../services/EditWorkdayService")), {
      getEditDayOptions: mockGetEditDayOptions,
      setEndHour: mockSetEndHour,
      setStartAndEndHours: mockSetStartAndEndHours,
      setHoursOnHalfDay: mock.fn(),
      markAbsence: mock.fn(),
      addWorkPeriod: mockAddWorkPeriod,
      editWorkPeriod: mockEditWorkPeriod,
      removeWorkPeriod: mockRemoveWorkPeriod,
    });
    injectCacheStub(require.resolve(path.join(__dirname, "../../services/SettingsService")), {
      getSettingsOrThrow: mock.fn(async () => SETTINGS),
    });

    const flowKey = require.resolve(path.join(__dirname, "./editDayFlow"));
    delete require.cache[flowKey];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    handleEditStep = (require(flowKey) as typeof import("./editDayFlow")).handleEditStep;
  });

  beforeEach(() => {
    SessionStore.clear(USER);
    mockEditWorkPeriod.mock.resetCalls();
    mockAddWorkPeriod.mock.resetCalls();
    mockRemoveWorkPeriod.mock.resetCalls();
    mockGetEditDayOptions.mock.resetCalls();
    mockSetStartAndEndHours.mock.resetCalls();
    mockSetEndHour.mock.resetCalls();
    reply = mock.fn(async () => undefined);
    ctx = { reply } as unknown as Context;
  });

  /** Puts the conversation in `session` and sends `text` as the user's reply. */
  async function send(session: Session, text: string): Promise<void> {
    SessionStore.set(USER, session);
    await handleEditStep(ctx, USER, text, SessionStore.get(USER));
  }
  const lastReply = (): string => reply.mock.calls[reply.mock.calls.length - 1].arguments[0];

  const menuSession = (editMenu: string[], periodCount: number): Session => ({
    step: "edit:choose_action",
    data: { ddMm: "08-10", editMenu, periodCount },
  });

  describe("a day with a single period", () => {
    it("Edit a work period goes straight to period 1's new times, without asking which", async () => {
      await send(menuSession(["SET_START_AND_END", "EDIT_PERIOD", "CANCEL"], 1), "2");

      assert.deepEqual(SessionStore.get(USER), {
        step: "edit:edit_period",
        data: { ddMm: "08-10", periodNumber: 1 },
      });
      assert.match(lastReply(), /new start and end time for this work period/);
      assert.doesNotMatch(lastReply(), /1–1/);
    });

  });

  describe("deleting the day's only period asks first", () => {
    const deleteFromMenu = () =>
      send(
        { step: "edit:choose_action", data: { ddMm: "09-10", editMenu: ["DELETE_PERIOD", "CANCEL"], periodCount: 1 } },
        "1"
      );

    it("asks to confirm, naming the period and that the record will be removed, without deleting", async () => {
      await deleteFromMenu();

      assert.equal(mockRemoveWorkPeriod.mock.calls.length, 0);
      assert.deepEqual(SessionStore.get(USER), {
        step: "edit:confirm_delete_last_period",
        data: { ddMm: "09-10" },
      });
      assert.equal(
        lastReply(),
        "Delete *08:00–17:00*? 09-10 will have no hours left, so its record will be removed.\n\n" +
          "Send *yes* to confirm, or any other message to cancel."
      );
    });

    it("deletes on yes (any case) and the record is removed", async () => {
      mockRemoveWorkPeriod.mock.mockImplementationOnce(async () => null);
      await deleteFromMenu();

      await handleEditStep(ctx, USER, " YES ", SessionStore.get(USER));

      assert.deepEqual(mockRemoveWorkPeriod.mock.calls[0].arguments, [USER, "09-10", 1]);
      assert.equal(SessionStore.get(USER), undefined);
      assert.match(lastReply(), /09-10 has no hours logged now, so its record was removed/);
    });

    it("cancels on anything else and keeps the record", async () => {
      await deleteFromMenu();

      await handleEditStep(ctx, USER, "4", SessionStore.get(USER));

      assert.equal(mockRemoveWorkPeriod.mock.calls.length, 0);
      assert.equal(SessionStore.get(USER), undefined);
      assert.equal(lastReply(), "↩️ Cancelled.");
    });

    it("says a half day keeps its absence", async () => {
      mockGetEditDayOptions.mock.mockImplementationOnce(async () => makeOptions("VACATION"));

      await deleteFromMenu();

      assert.match(lastReply(), /no hours left; its Vacation day \(half day\) stays/);
    });

    it("asks which period instead if the day no longer has exactly one", async () => {
      mockGetEditDayOptions.mock.mockImplementationOnce(async () => makeOptions("WORK", 2));

      await deleteFromMenu();

      assert.equal(SessionStore.get(USER)?.step, "edit:choose_period_to_delete");
      assert.match(lastReply(), /Send its number \(1–2\)/);
    });
  });

  describe("deleting one of several periods stays immediate", () => {
    it("deletes the chosen period without asking for confirmation", async () => {
      mockRemoveWorkPeriod.mock.mockImplementationOnce(async () =>
        makeResult([["2026-10-08T14:30:00.000Z", "2026-10-08T16:30:00.000Z"]])
      );

      await send({ step: "edit:choose_period_to_delete", data: { ddMm: "08-10", periodCount: 2 } }, "1");

      assert.deepEqual(mockRemoveWorkPeriod.mock.calls[0].arguments, [USER, "08-10", 1]);
      assert.equal(SessionStore.get(USER), undefined);
      assert.match(lastReply(), /Work period 1 deleted/);
    });
  });

  describe("a day with several periods", () => {
    it("asks which period to edit, with the range of numbers", async () => {
      await send(menuSession(["EDIT_PERIOD", "CANCEL"], 3), "1");

      assert.equal(SessionStore.get(USER)?.step, "edit:choose_period_to_edit");
      assert.match(lastReply(), /Send its number \(1–3\)/);
    });

    it("asks which period to delete, with the range of numbers", async () => {
      await send(menuSession(["DELETE_PERIOD", "CANCEL"], 2), "1");

      assert.equal(SessionStore.get(USER)?.step, "edit:choose_period_to_delete");
      assert.match(lastReply(), /Send its number \(1–2\)/);
      assert.equal(mockRemoveWorkPeriod.mock.calls.length, 0);
    });
  });

  describe("malformed times", () => {
    const startEndSession: Session = { step: "edit:set_start_end", data: { ddMm: "09-10" } };

    for (const text of ["108:00-17:00", "8-17", "08:00 17:00", "25:00-26:00"]) {
      it(`explains the HH:MM-HH:MM format for "${text}" and keeps waiting`, async () => {
        await send(startEndSession, text);

        assert.equal(mockSetStartAndEndHours.mock.calls.length, 0);
        assert.deepEqual(SessionStore.get(USER), startEndSession);
        assert.equal(
          lastReply(),
          "❌ *Invalid input.*\n\nUse the format HH:MM-HH:MM, e.g. 08:15-17:30.\n\n" +
            "Send different times, or any other command to stop."
        );
      });
    }

    it("gives each time-range step its own example", async () => {
      await send({ step: "edit:add_period", data: { ddMm: "09-10" } }, "8-17");
      assert.match(lastReply(), /e\.g\. 15:00-18:30\./);

      await send({ step: "edit:log_hours", data: { ddMm: "09-10" } }, "8-17");
      assert.match(lastReply(), /e\.g\. 13:00-17:30\./);
    });

    it("explains the HH:MM format for a malformed end hour and keeps waiting", async () => {
      const endHourSession: Session = { step: "edit:set_end_hour", data: { ddMm: "09-10" } };

      await send(endHourSession, "5pm");

      assert.equal(mockSetEndHour.mock.calls.length, 0);
      assert.deepEqual(SessionStore.get(USER), endHourSession);
      assert.match(lastReply(), /Invalid input\.\*\n\nUse the format HH:MM, e\.g\. 17:30\./);
    });

    it("explains an end before the start and keeps waiting", async () => {
      mockSetStartAndEndHours.mock.mockImplementationOnce(async () => {
        throw new AppError("INVALID_TIME_RANGE", "The end time must be after the start time.");
      });

      await send(startEndSession, "17:00-08:00");

      assert.deepEqual(SessionStore.get(USER), startEndSession);
      assert.equal(
        lastReply(),
        "❌ *Invalid input.*\n\nThe end time must be after the start time.\n\n" +
          "Send different times, or any other command to stop."
      );
    });
  });

  describe("set start and end hours after errors", () => {
    it("saves a valid range after a malformed one and an end-before-start one", async () => {
      const startEndSession: Session = { step: "edit:set_start_end", data: { ddMm: "09-10" } };
      mockSetStartAndEndHours.mock.mockImplementationOnce(async () => {
        throw new AppError("INVALID_TIME_RANGE", "The end time must be after the start time.");
      });
      // Second service call (index 1) succeeds.
      mockSetStartAndEndHours.mock.mockImplementationOnce(
        async () => ({
          ...makeResult([["2026-10-09T05:00:00.000Z", "2026-10-09T14:00:00.000Z"]]),
          displayDate: "09-10",
          workedMinutes: 540,
          balanceMinutes: 60,
          leaveRefund: null,
        }),
        1
      );

      await send(startEndSession, "108:00-17:00");
      assert.match(lastReply(), /Use the format HH:MM-HH:MM/);

      await handleEditStep(ctx, USER, "17:00-08:00", SessionStore.get(USER));
      assert.match(lastReply(), /The end time must be after the start time/);
      assert.deepEqual(SessionStore.get(USER), startEndSession);

      await handleEditStep(ctx, USER, "08:00-17:00", SessionStore.get(USER));

      // The malformed reply never reached the service; the other two did.
      assert.deepEqual(
        mockSetStartAndEndHours.mock.calls.map((c: { arguments: unknown[] }) => c.arguments.slice(2)),
        [["17:00", "08:00"], ["08:00", "17:00"]]
      );
      assert.equal(SessionStore.get(USER), undefined);
      assert.match(lastReply(), /Start and end hours saved/);
      assert.match(lastReply(), /Start: +\*08:00\*/);
      assert.match(lastReply(), /End: +\*17:00\*/);
    });
  });

  describe("rejected times", () => {
    const editPeriodSession: Session = {
      step: "edit:edit_period",
      data: { ddMm: "08-10", periodNumber: 2 },
    };

    it("keeps waiting for new times after an overlap, and saves the next valid range", async () => {
      mockEditWorkPeriod.mock.mockImplementationOnce(async () => {
        throw new AppError("INVALID_TIME_RANGE", "That overlaps work period 1 (09:00–17:30).");
      });

      await send(editPeriodSession, "17:00-19:00");

      assert.deepEqual(SessionStore.get(USER), editPeriodSession);
      assert.match(lastReply(), /That overlaps work period 1 \(09:00–17:30\)\./);
      assert.match(lastReply(), /Send different times, or any other command to stop\./);

      mockEditWorkPeriod.mock.mockImplementationOnce(async () =>
        makeResult([
          ["2026-10-08T06:00:00.000Z", "2026-10-08T14:30:00.000Z"],
          ["2026-10-08T14:30:00.000Z", "2026-10-08T16:30:00.000Z"],
        ])
      );
      await handleEditStep(ctx, USER, "17:30-19:30", SessionStore.get(USER));

      assert.deepEqual(mockEditWorkPeriod.mock.calls[1].arguments, [USER, "08-10", 2, "17:30", "19:30"]);
      assert.equal(SessionStore.get(USER), undefined);
      assert.match(lastReply(), /Work period 2 updated/);
    });

    it("keeps waiting after an overlapping new period too", async () => {
      mockAddWorkPeriod.mock.mockImplementationOnce(async () => {
        throw new AppError("INVALID_TIME_RANGE", "That overlaps work period 1 (09:00–17:30).");
      });

      await send({ step: "edit:add_period", data: { ddMm: "08-10" } }, "17:00-19:00");

      assert.equal(SessionStore.get(USER)?.step, "edit:add_period");
      assert.match(lastReply(), /Send different times/);
    });

    it("ends the conversation on any other error", async () => {
      mockEditWorkPeriod.mock.mockImplementationOnce(async () => {
        throw new AppError("VALIDATION_ERROR", "There is no work period 2 on 08-10.");
      });

      await send(editPeriodSession, "17:30-19:30");

      assert.equal(SessionStore.get(USER), undefined);
      assert.doesNotMatch(lastReply(), /Send different times/);
    });
  });
});
