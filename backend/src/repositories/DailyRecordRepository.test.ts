import { describe, it, mock, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { Module } from "node:module";

// Same require.cache stub-injection convention as the services' test files —
// stubs @/config/PrismaClient so loading this module doesn't validate env
// vars / try to actually connect. Only upsertRecordByDate is under test here
// (the debitedLeaveField/debitedLeaveDays pair-invariant guard); everything
// else in this repository is a thin, untested Prisma pass-through, matching
// the existing convention of testing at the service layer.
function injectCacheStub(
  resolvedPath: string,
  exports: Record<string, unknown>
): void {
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

const BASE_INPUT = {
  telegramId: "user1",
  workDate: new Date("2026-06-12T00:00:00Z"),
  recordType: "VACATION" as const,
  startTime: null,
  expectedEndTime: null,
  endTime: null,
  workedMinutes: 480,
};

describe("DailyRecordRepository.upsertRecordByDate — debit pair invariant", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let upsertRecordByDate: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockUpsert: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fakeClient: any;

  before(() => {
    mockUpsert = mock.fn(async (args: Record<string, unknown>) => ({
      id: "r1",
      ...(args["create"] as Record<string, unknown>),
    }));
    fakeClient = { dailyRecord: { upsert: mockUpsert } };

    const prismaClientKey = require.resolve(
      path.join(__dirname, "../config/PrismaClient")
    );
    injectCacheStub(prismaClientKey, { prisma: fakeClient });

    const repoKey = require.resolve(
      path.join(__dirname, "./DailyRecordRepository")
    );
    delete require.cache[repoKey];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const repo = require(repoKey) as typeof import("./DailyRecordRepository");
    upsertRecordByDate = repo.upsertRecordByDate;
  });

  afterEach(() => {
    mockUpsert?.mock.resetCalls();
  });

  it("throws when debitedLeaveField is set but debitedLeaveDays is not", async () => {
    await assert.rejects(
      () =>
        upsertRecordByDate(
          { ...BASE_INPUT, debitedLeaveField: "vacationBalance", debitedLeaveDays: null },
          fakeClient
        ),
      /debitedLeaveField and debitedLeaveDays must be provided together/
    );
    assert.equal(mockUpsert.mock.calls.length, 0);
  });

  it("throws when debitedLeaveDays is set but debitedLeaveField is not", async () => {
    await assert.rejects(
      () =>
        upsertRecordByDate(
          { ...BASE_INPUT, debitedLeaveField: null, debitedLeaveDays: 1 },
          fakeClient
        ),
      /debitedLeaveField and debitedLeaveDays must be provided together/
    );
    assert.equal(mockUpsert.mock.calls.length, 0);
  });

  it("does not throw when both are omitted", async () => {
    await assert.doesNotReject(() => upsertRecordByDate(BASE_INPUT, fakeClient));
    assert.equal(mockUpsert.mock.calls.length, 1);
  });

  it("does not throw when both are explicitly null", async () => {
    await assert.doesNotReject(() =>
      upsertRecordByDate(
        { ...BASE_INPUT, debitedLeaveField: null, debitedLeaveDays: null },
        fakeClient
      )
    );
    assert.equal(mockUpsert.mock.calls.length, 1);
  });

  it("does not throw when both are set", async () => {
    await assert.doesNotReject(() =>
      upsertRecordByDate(
        { ...BASE_INPUT, debitedLeaveField: "sickBalance", debitedLeaveDays: 1.5 },
        fakeClient
      )
    );
    assert.equal(mockUpsert.mock.calls.length, 1);
    const call = mockUpsert.mock.calls[0].arguments[0];
    assert.equal(call.update.debitedLeaveField, "sickBalance");
    assert.equal(call.update.debitedLeaveDays, 1.5);
  });
});
