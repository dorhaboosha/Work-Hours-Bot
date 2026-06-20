import { describe, it, mock, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { Module } from "node:module";

// Helper to inject a stub into the CJS require cache before the module under
// test is loaded for the first time, then reload the target module cleanly.
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

describe("SettingsService", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setupSettings: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getSettingsOrThrow: any;
  let DEFAULT_TIMEZONE: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let DEFAULT_WORKDAYS: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockUpsert: ReturnType<typeof mock.fn<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockFind: ReturnType<typeof mock.fn<any>>;
  let baseSetupInput: { timezone: string; workdays: number[]; language: "en" | "he" };

  before(() => {
    mockUpsert = mock.fn(async (input: Record<string, unknown>) => ({
      id: "test-id",
      telegramId: input["telegramId"],
      dailyRequiredMinutes: input["dailyRequiredMinutes"],
      timezone: input["timezone"],
      workdays: input["workdays"],
      language: input["language"] ?? "en",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    mockFind = mock.fn(async (_telegramId: string) => null);

    // Inject repository stub into require cache BEFORE the service is loaded
    const repoKey = require.resolve(
      path.join(__dirname, "../repositories/UserSettingsRepository")
    );
    injectCacheStub(repoKey, {
      findUserSettingsByTelegramId: mockFind,
      upsertUserSettings: mockUpsert,
    });

    // Evict any cached version of the service so it re-requires the stub repo
    const svcKey = require.resolve(
      path.join(__dirname, "../services/SettingsService")
    );
    delete require.cache[svcKey];

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const svc = require(svcKey) as typeof import("./SettingsService");
    setupSettings = svc.setupSettings;
    getSettingsOrThrow = svc.getSettingsOrThrow;
    DEFAULT_TIMEZONE = svc.DEFAULT_TIMEZONE;
    DEFAULT_WORKDAYS = svc.DEFAULT_WORKDAYS;
    baseSetupInput = { timezone: DEFAULT_TIMEZONE, workdays: [0, 1, 2, 3, 4], language: "en" };
  });

  afterEach(() => {
    mockUpsert?.mock.resetCalls();
    mockFind?.mock.resetCalls();
  });


  // ── setupSettings – decimal conversion ──────────────────────────────────────

  describe("setupSettings – decimal conversion", () => {
    it("converts 8.8 decimal hours to 528 minutes", async () => {
      await setupSettings({ telegramId: "1", dailyHoursOrMinutes: 8.8, ...baseSetupInput });

      assert.equal(mockUpsert.mock.calls[0].arguments[0].dailyRequiredMinutes, 528);
    });

    it("converts 7.5 decimal hours to 450 minutes", async () => {
      await setupSettings({ telegramId: "2", dailyHoursOrMinutes: 7.5, ...baseSetupInput });

      assert.equal(mockUpsert.mock.calls[0].arguments[0].dailyRequiredMinutes, 450);
    });

    it("treats values >= 60 as already-converted minutes and rounds", async () => {
      await setupSettings({ telegramId: "3", dailyHoursOrMinutes: 527.6, ...baseSetupInput });

      assert.equal(mockUpsert.mock.calls[0].arguments[0].dailyRequiredMinutes, 528);
    });

    it("passes an exact integer minute count unchanged", async () => {
      await setupSettings({ telegramId: "4", dailyHoursOrMinutes: 480, ...baseSetupInput });

      assert.equal(mockUpsert.mock.calls[0].arguments[0].dailyRequiredMinutes, 480);
    });
  });

  // ── setupSettings – field passthrough ────────────────────────────────────────

  describe("setupSettings – field passthrough", () => {
    it("passes timezone to upsert", async () => {
      await setupSettings({
        telegramId: "5",
        dailyHoursOrMinutes: 480,
        timezone: "America/New_York",
        workdays: [1, 2, 3, 4, 5],
        language: "en",
      });

      assert.equal(mockUpsert.mock.calls[0].arguments[0].timezone, "America/New_York");
    });

    it("passes workdays to upsert", async () => {
      await setupSettings({
        telegramId: "6",
        dailyHoursOrMinutes: 480,
        timezone: "UTC",
        workdays: [1, 2, 3, 4, 5],
        language: "en",
      });

      assert.deepEqual(mockUpsert.mock.calls[0].arguments[0].workdays, [1, 2, 3, 4, 5]);
    });

    it("passes language to upsert", async () => {
      await setupSettings({
        telegramId: "7",
        dailyHoursOrMinutes: 480,
        timezone: "UTC",
        workdays: [0, 1, 2, 3, 4],
        language: "he",
      });

      assert.equal(mockUpsert.mock.calls[0].arguments[0].language, "he");
    });
  });

  // ── setupSettings – first-time-only guard ────────────────────────────────────

  describe("setupSettings – first-time-only guard", () => {
    it("calls upsertUserSettings once for a new user", async () => {
      await setupSettings({ telegramId: "new-user", dailyHoursOrMinutes: 480, ...baseSetupInput });

      assert.equal(mockUpsert.mock.calls.length, 1);
      assert.equal(mockUpsert.mock.calls[0].arguments[0].telegramId, "new-user");
    });

    it("throws SETUP_ALREADY_COMPLETED when settings already exist", async () => {
      mockFind.mock.mockImplementationOnce(async () => ({
        id: "existing-id",
        telegramId: "returning-user",
        dailyRequiredMinutes: 480,
        timezone: "UTC",
        workdays: [0, 1, 2, 3, 4],
        language: "en",
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await assert.rejects(
        () =>
          setupSettings({
            telegramId: "returning-user",
            dailyHoursOrMinutes: 480,
            ...baseSetupInput,
          }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal((err as unknown as { code: string }).code, "SETUP_ALREADY_COMPLETED");
          return true;
        }
      );

      assert.equal(mockUpsert.mock.calls.length, 0);
    });
  });

  // ── getSettingsOrThrow ───────────────────────────────────────────────────────

  describe("getSettingsOrThrow", () => {
    it("throws AppError USER_SETTINGS_NOT_FOUND when settings are absent", async () => {
      mockFind.mock.mockImplementationOnce(async () => null);

      await assert.rejects(
        () => getSettingsOrThrow("ghost"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal(
            (err as unknown as { code: string }).code,
            "USER_SETTINGS_NOT_FOUND"
          );
          return true;
        }
      );
    });

    it("returns the settings record when it exists", async () => {
      const record = {
        id: "s1",
        telegramId: "real-user",
        dailyRequiredMinutes: 480,
        timezone: "UTC",
        workdays: [0, 1, 2, 3, 4],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockFind.mock.mockImplementationOnce(async () => record);

      const result = await getSettingsOrThrow("real-user");
      assert.deepEqual(result, record);
    });
  });
});
