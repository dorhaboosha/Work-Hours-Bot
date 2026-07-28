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

describe("RecordRetentionJob", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runRecordRetentionOnce: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let startRecordRetentionJob: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPurgeOldDailyRecords: ReturnType<typeof mock.fn<any>>;

  before(() => {
    mockPurgeOldDailyRecords = mock.fn(async () => ({
      cutoff: new Date("2026-07-01T00:00:00Z"),
      deletedCount: 0,
    }));

    // Inject service stub before the job module is first required
    const svcKey = require.resolve(
      path.join(__dirname, "../services/RecordRetentionService")
    );
    injectCacheStub(svcKey, {
      purgeOldDailyRecords: mockPurgeOldDailyRecords,
    });

    const jobKey = require.resolve(path.join(__dirname, "./RecordRetentionJob"));
    delete require.cache[jobKey];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const job = require(jobKey) as typeof import("./RecordRetentionJob");
    runRecordRetentionOnce = job.runRecordRetentionOnce;
    startRecordRetentionJob = job.startRecordRetentionJob;
  });

  afterEach(() => {
    mockPurgeOldDailyRecords?.mock.resetCalls();
  });

  describe("runRecordRetentionOnce – success", () => {
    it("logs the deleted count and cutoff via console.log", async () => {
      mockPurgeOldDailyRecords.mock.mockImplementationOnce(async () => ({
        cutoff: new Date("2026-07-01T00:00:00Z"),
        deletedCount: 5,
      }));
      const logMock = mock.method(console, "log", () => undefined);

      try {
        await runRecordRetentionOnce();

        assert.equal(logMock.mock.calls.length, 1);
        const message = logMock.mock.calls[0].arguments[0] as string;
        assert.match(message, /\[RecordRetentionJob\]/);
        assert.match(message, /5/);
        assert.match(message, /2026-07-01/);
      } finally {
        logMock.mock.restore();
      }
    });
  });

  describe("runRecordRetentionOnce – failure", () => {
    it("logs via console.error and does not throw when the service rejects", async () => {
      mockPurgeOldDailyRecords.mock.mockImplementationOnce(async () => {
        throw new Error("db unavailable");
      });
      const errorMock = mock.method(console, "error", () => undefined);

      try {
        await assert.doesNotReject(() => runRecordRetentionOnce());

        assert.equal(errorMock.mock.calls.length, 1);
        const [label, err] = errorMock.mock.calls[0].arguments;
        assert.match(label as string, /\[RecordRetentionJob\]/);
        assert.ok(err instanceof Error);
      } finally {
        errorMock.mock.restore();
      }
    });
  });

  describe("startRecordRetentionJob – in-flight guard", () => {
    it("skips a scheduled tick while a previous run is still pending, then resumes once it settles", async () => {
      let resolvePendingPurge: (() => void) | undefined;
      mockPurgeOldDailyRecords.mock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePendingPurge = () =>
              resolve({ cutoff: new Date("2026-07-01T00:00:00Z"), deletedCount: 1 });
          })
      );

      const originalSetInterval = global.setInterval;
      let intervalCallback: (() => void) | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).setInterval = (cb: () => void) => {
        intervalCallback = cb;
        return 0 as unknown as NodeJS.Timeout;
      };

      try {
        startRecordRetentionJob(1000);
        assert.equal(mockPurgeOldDailyRecords.mock.calls.length, 1); // immediate run started, still pending

        intervalCallback?.(); // tick fires while the first run is in flight
        assert.equal(mockPurgeOldDailyRecords.mock.calls.length, 1); // skipped, no overlapping call

        resolvePendingPurge?.();
        await new Promise((resolve) => setImmediate(resolve)); // let the in-flight run settle

        intervalCallback?.(); // next tick, guard should be clear now
        assert.equal(mockPurgeOldDailyRecords.mock.calls.length, 2);
      } finally {
        global.setInterval = originalSetInterval;
      }
    });
  });
});
