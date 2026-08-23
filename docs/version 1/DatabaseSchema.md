# WorkHours Bot Database Schema (PostgreSQL) — MVP

This document describes the PostgreSQL database schema for the **WorkHours Bot** MVP.

The database stores:
- User work settings
- Daily work records
- Work-hour tracking data used for daily, weekly, and monthly summaries

Local development:
- PostgreSQL runs inside Docker using Docker Compose.
- The backend connects to the database using the `DATABASE_URL` environment variable.

---

## Tables

## User Settings

Stores the Telegram user's work-hour configuration.

| column | type | notes |
|---|---|---|
| id | UUID (PK) | Primary key |
| telegram_id | TEXT | Telegram user identifier, unique |
| daily_required_minutes | INTEGER | Required daily work time in minutes, must be > 0 |
| timezone | TEXT | User timezone, example: `Asia/Jerusalem` |
| workdays | INTEGER[] | Workdays represented as numbers, example: `{0,1,2,3,4}` |
| created_at | TIMESTAMPTZ | default `now()` |
| updated_at | TIMESTAMPTZ | auto-updated |

### Workdays Mapping

| value | day |
|---|---|
| 0 | Sunday |
| 1 | Monday |
| 2 | Tuesday |
| 3 | Wednesday |
| 4 | Thursday |
| 5 | Friday |
| 6 | Saturday |

Example:
```txt
Sunday-Thursday = {0,1,2,3,4}
Monday-Friday = {1,2,3,4,5}
```

### Constraints / Indexes

- `PRIMARY KEY (id)`
- `UNIQUE (telegram_id)`
- `daily_required_minutes > 0`
- `workdays` must contain at least one day
- each value in `workdays` should be between `0` and `6`
- `INDEX (telegram_id)`

### Prisma Field Mapping

PostgreSQL uses `snake_case` column names; Prisma maps them to `camelCase` in TypeScript:

- `telegram_id` (DB) → `telegramId` (Prisma / TypeScript)
- `daily_required_minutes` (DB) → `dailyRequiredMinutes`
- `created_at` (DB) → `createdAt`
- `updated_at` (DB) → `updatedAt`

---

## Daily Records

Stores each daily work record for a Telegram user.

| column | type | notes |
|---|---|---|
| id | UUID (PK) | Primary key |
| telegram_id | TEXT | Telegram user identifier |
| work_date | DATE | Local work date according to user's timezone |
| start_time | TIMESTAMPTZ | Workday start timestamp, stored in UTC |
| expected_end_time | TIMESTAMPTZ | Calculated expected end time, stored in UTC |
| end_time | TIMESTAMPTZ NULL | Actual end time, null while workday is active |
| worked_minutes | INTEGER NULL | Total worked minutes, null until the workday is ended |
| created_at | TIMESTAMPTZ | default `now()` |
| updated_at | TIMESTAMPTZ | auto-updated |

### Constraints / Indexes

- `PRIMARY KEY (id)`
- `UNIQUE (telegram_id, work_date)`
- `worked_minutes >= 0`
- `INDEX (telegram_id)`
- `INDEX (telegram_id, work_date)`
- `INDEX (telegram_id, end_time)`

### Important Rules

- A user cannot have more than one daily record for the same `work_date`.
- A record with `end_time = NULL` is considered an active/open workday.
- The system should prevent starting a new workday if the same user has an older open record.
- `work_date` is based on the user's configured timezone, not directly on UTC date.
- `worked_minutes` is calculated only when the user ends the workday.

### Prisma Field Mapping

PostgreSQL uses `snake_case` column names; Prisma maps them to `camelCase` in TypeScript:

- `telegram_id` (DB) → `telegramId`
- `work_date` (DB) → `workDate`
- `start_time` (DB) → `startTime`
- `expected_end_time` (DB) → `expectedEndTime`
- `end_time` (DB) → `endTime`
- `worked_minutes` (DB) → `workedMinutes`
- `created_at` (DB) → `createdAt`
- `updated_at` (DB) → `updatedAt`

---

## Relationships

In the MVP, the relationship between `user_settings` and `daily_records` is based on `telegram_id`.

```txt
user_settings.telegram_id 1 ──── * daily_records.telegram_id
```

This means:
- One Telegram user has one settings row.
- One Telegram user can have many daily records.
- Each daily record belongs to one Telegram user.

---

## Suggested SQL Shape

This section is a reference only. Prisma migrations should be the source of truth during implementation.

### user_settings

```sql
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id TEXT NOT NULL UNIQUE,
  daily_required_minutes INTEGER NOT NULL CHECK (daily_required_minutes > 0),
  timezone TEXT NOT NULL,
  workdays INTEGER[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### daily_records

```sql
CREATE TABLE daily_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id TEXT NOT NULL,
  work_date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  expected_end_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NULL,
  worked_minutes INTEGER NULL CHECK (worked_minutes IS NULL OR worked_minutes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT daily_records_telegram_id_work_date_unique
    UNIQUE (telegram_id, work_date)
);
```

### Indexes

```sql
CREATE INDEX idx_user_settings_telegram_id
ON user_settings (telegram_id);

CREATE INDEX idx_daily_records_telegram_id
ON daily_records (telegram_id);

CREATE INDEX idx_daily_records_telegram_id_work_date
ON daily_records (telegram_id, work_date);

CREATE INDEX idx_daily_records_telegram_id_end_time
ON daily_records (telegram_id, end_time);
```

---

## Prisma Model Reference

This section is a reference only. The final implementation should be placed in:

```txt
backend/prisma/schema.prisma
```

```prisma
model UserSettings {
  id                   String   @id @default(uuid())
  telegramId           String   @unique @map("telegram_id")
  dailyRequiredMinutes Int      @map("daily_required_minutes")
  timezone             String
  workdays             Int[]
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")

  @@map("user_settings")
}

model DailyRecord {
  id              String    @id @default(uuid())
  telegramId      String    @map("telegram_id")
  workDate        DateTime  @map("work_date") @db.Date
  startTime       DateTime  @map("start_time")
  expectedEndTime DateTime  @map("expected_end_time")
  endTime         DateTime? @map("end_time")
  workedMinutes   Int?      @map("worked_minutes")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  @@unique([telegramId, workDate])
  @@index([telegramId])
  @@index([telegramId, workDate])
  @@index([telegramId, endTime])
  @@map("daily_records")
}
```

---

## Notes

- All timestamps should be stored in UTC.
- User-facing times should be converted to the user's configured timezone.
- `work_date` should represent the local date of the workday according to the user's timezone.
- Durations should be stored and calculated in minutes.
- Decimal hours should not be stored directly.
- Breaks are not stored separately in the MVP because the required daily hours already include break time.
- Missing workdays are not stored as records. They are calculated as `0` worked minutes in weekly/monthly summaries.
- The database should run locally through Docker Compose, not through a manually installed PostgreSQL instance.
