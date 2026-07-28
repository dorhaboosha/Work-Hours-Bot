import { describe, it, mock, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { Module } from "node:module";

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

describe("RecordRetentionService", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let purgeOldDailyRecords: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDeleteDailyRecordsBefore: ReturnType<typeof mock.fn<any>>;

  before(() => {
    mockDeleteDailyRecordsBefore = mock.fn(async () => 0);

    // Inject repository stub before the service is first required
    const repoKey = require.resolve(
      path.join(__dirname, "../repositories/DailyRecordRepository")
    );
    injectCacheStub(repoKey, {
      deleteDailyRecordsBefore: mockDeleteDailyRecordsBefore,
    });

    // Load RecordRetentionService fresh after the stub is in place
    const svcKey = require.resolve(
      path.join(__dirname, "./RecordRetentionService")
    );
    delete require.cache[svcKey];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const svc = require(svcKey) as typeof import("./RecordRetentionService");
    purgeOldDailyRecords = svc.purgeOldDailyRecords;
  });

  afterEach(() => {
    mockDeleteDailyRecordsBefore?.mock.resetCalls();
  });

  describe("purgeOldDailyRecords", () => {
    it("passes the computed start-of-current-UTC-month cutoff to the repository", async () => {
      await purgeOldDailyRecords(new Date("2026-07-28T10:00:00Z"));

      assert.equal(mockDeleteDailyRecordsBefore.mock.calls.length, 1);
      const cutoffArg = mockDeleteDailyRecordsBefore.mock.calls[0].arguments[0] as Date;
      assert.equal(cutoffArg.toISOString(), "2026-07-01T00:00:00.000Z");
    });

    it("returns the cutoff alongside the deleted count", async () => {
      mockDeleteDailyRecordsBefore.mock.mockImplementationOnce(async () => 42);

      const result = await purgeOldDailyRecords(new Date("2026-07-28T10:00:00Z"));

      assert.equal(result.deletedCount, 42);
      assert.equal(result.cutoff.toISOString(), "2026-07-01T00:00:00.000Z");
    });

    it("returns deletedCount 0 as a no-op when nothing is stale", async () => {
      // default mock resolves 0
      const result = await purgeOldDailyRecords(new Date("2026-07-28T10:00:00Z"));

      assert.equal(result.deletedCount, 0);
    });
  });
});
