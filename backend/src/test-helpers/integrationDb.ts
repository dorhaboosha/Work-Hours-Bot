/**
 * Shared setup/teardown helpers for integration tests (`*.itest.ts`) that run
 * against a real Postgres instance instead of mocking `@/config/PrismaClient`.
 *
 * Deliberately NOT named `*.test.ts` so `npm test`'s glob (`src/**\/*.test.ts`)
 * never picks this up — importing it (and its `prisma` import chain) requires
 * a fully configured environment (DATABASE_URL etc.) that unit test runs
 * don't provide, and `Env.ts` calls `process.exit(1)` on invalid/missing env
 * vars, which would kill the entire unit test run rather than just this file.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/config/PrismaClient";
import { Env } from "@/config/Env";
import type { UserSettings } from "@/generated/prisma/client";

/** Prefix so test-created rows are unmistakably distinct from any real Telegram user id (all-numeric). */
const TEST_ID_PREFIX = "itest-";

export function testTelegramId(): string {
  return `${TEST_ID_PREFIX}${randomUUID()}`;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Refuses to run when DATABASE_URL doesn't look like a local database.
 * Integration tests delete rows by telegramId prefix — cheap insurance
 * against ever pointing this at a real (e.g. Render) database by mistake.
 * Call once per test file, in a top-level `before()`.
 *
 * Parses the URL and checks the hostname for an *exact* match against
 * localhost/127.0.0.1/::1 — a substring/regex check on the raw string would
 * also pass something like "evil-localhost-lookalike.attacker.com", which
 * contains "localhost" as a substring but isn't local at all.
 */
export function assertSafeTestDatabase(): void {
  let hostname: string;
  try {
    hostname = new URL(Env.DATABASE_URL).hostname;
  } catch {
    throw new Error(
      "Refusing to run integration tests: DATABASE_URL is not a valid URL."
    );
  }

  if (!LOCAL_HOSTNAMES.has(hostname)) {
    throw new Error(
      `Refusing to run integration tests: DATABASE_URL's host ("${hostname}") does not look ` +
        "like a local database (expected localhost/127.0.0.1). Point it at your docker-compose " +
        "Postgres (see backend/.env.example) before running `npm run test:integration`."
    );
  }
}

export interface TestSettingsOverrides {
  telegramId?: string;
  timezone?: string;
  dailyRequiredMinutes?: number;
  vacationAccrualRate?: number;
  sickAccrualRate?: number;
  vacationBalance?: number;
  sickBalance?: number;
  accrualAnchorAt?: Date;
  accrualAppliedThrough?: Date;
}

/**
 * Creates a UserSettings row for a fresh test user (random itest-prefixed
 * telegramId unless overridden). Defaults anchor accrual bookkeeping at "now,
 * already caught up through the current month" so tests that aren't about
 * accrual don't pick up incidental accrual deltas — override
 * accrualAnchorAt/accrualAppliedThrough explicitly to test accrual itself.
 */
export async function createTestSettings(
  overrides: TestSettingsOverrides = {}
): Promise<UserSettings> {
  const telegramId = overrides.telegramId ?? testTelegramId();
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return prisma.userSettings.create({
    data: {
      telegramId,
      timezone: overrides.timezone ?? "UTC",
      dailyRequiredMinutes: overrides.dailyRequiredMinutes ?? 480,
      workdays: [0, 1, 2, 3, 4],
      vacationAccrualRate: overrides.vacationAccrualRate ?? 1,
      sickAccrualRate: overrides.sickAccrualRate ?? 1.5,
      vacationBalance: overrides.vacationBalance ?? 10,
      sickBalance: overrides.sickBalance ?? 10,
      accrualAnchorAt: overrides.accrualAnchorAt ?? now,
      accrualAppliedThrough: overrides.accrualAppliedThrough ?? currentMonthStart,
    },
  });
}

/**
 * Deletes every row (daily_records + user_settings) created for `telegramId`.
 * Call from a `finally`/`after` hook so a failed assertion still leaves the
 * database clean for the next run.
 */
export async function cleanupTestUser(telegramId: string): Promise<void> {
  await prisma.dailyRecord.deleteMany({ where: { telegramId } });
  await prisma.userSettings.deleteMany({ where: { telegramId } });
}
