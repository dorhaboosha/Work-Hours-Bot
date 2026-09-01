# WorkHours Bot Database Schema (PostgreSQL) — V1.1

This document describes the PostgreSQL database schema for the **WorkHours Bot** V1.1.

The database stores:
- User work settings
- User language preference
- Daily work records
- Absence records
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
| language | TEXT | User bot language, example: `en` or `he` |
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

### Language Mapping

| value | language |
|---|---|
| en | English |
| he | Hebrew |

### Constraints / Indexes

- `PRIMARY KEY (id)`
- `UNIQUE (telegram_id)`
- `daily_required_minutes > 0`
- `workdays` must contain at least one day
- each value in `workdays` should be between `0` and `6`
- `language` must be one of: `en`, `he`
- `INDEX (telegram_id)`

### Important Rules

- A user can have only one settings row.
- `/setup` creates the settings row only if it does not already exist.
- If settings already exist, `/setup` must not overwrite them.
- Existing settings should be updated through `/settings_edit`.

### Prisma Field Mapping

PostgreSQL uses `snake_case` column names; Prisma maps them to `camelCase` in TypeScript:

- `telegram_id` (DB) → `telegramId` (Prisma / TypeScript)
- `daily_required_minutes` (DB) → `dailyRequiredMinutes`
- `created_at` (DB) → `createdAt`
- `updated_at` (DB) → `updatedAt`

---

## Daily Records

Stores each daily work or absence record for a Telegram user.

| column | type | notes |
|---|---|---|
| id | UUID (PK) | Primary key |
| telegram_id | TEXT | Telegram user identifier |
| work_date | DATE | Local work date according to user's timezone |
| record_type | TEXT | Type of daily record, example: `WORK`, `SICK`, `VACATION` |
| start_time | TIMESTAMPTZ NULL | Workday start timestamp, stored in UTC. Null for absence records |
| expected_end_time | TIMESTAMPTZ NULL | Calculated expected end time, stored in UTC. Null for absence records |
| end_time | TIMESTAMPTZ NULL | Actual end time, null while workday is active or for absence records |
| worked_minutes | INTEGER NULL | Total worked or credited minutes. Null only while a workday is active |
| created_at | TIMESTAMPTZ | default `now()` |
| updated_at | TIMESTAMPTZ | auto-updated |

### Record Types

| value | meaning | worked_minutes behavior |
|---|---|---|
| WORK | Regular workday | Actual worked minutes |
| SICK | Sick day | Full required day |
| VACATION | Vacation day | Full required day |
| HOLIDAY | Holiday / paid day off | Full required day |
| HOLIDAY_EVE | Holiday evening / shortened paid day | Half required day |
| UNPAID_ABSENCE | Unpaid absence | 0 minutes |
| ELECTION | Election day / paid day off | Full required day |

### Constraints / Indexes

- `PRIMARY KEY (id)`
- `UNIQUE (telegram_id, work_date)`
- `record_type` must be one of:
  - `WORK`
  - `SICK`
  - `VACATION`
  - `HOLIDAY`
  - `HOLIDAY_EVE`
  - `UNPAID_ABSENCE`
  - `ELECTION`
- `worked_minutes >= 0`
- `INDEX (telegram_id)`
- `INDEX (telegram_id, work_date)`
- `INDEX (telegram_id, record_type)`
- `INDEX (telegram_id, end_time)`

### Important Rules

- A user cannot have more than one daily record for the same `work_date`.
- A user cannot have more than one open workday.
- A record is considered open only when:
  - `record_type = 'WORK'`
  - `start_time IS NOT NULL`
  - `end_time IS NULL`
- Absence records should not have `start_time`, `expected_end_time`, or `end_time`.
- Absence records should have `worked_minutes` set according to the absence credit rule.
- `work_date` is based on the user's configured timezone, not directly on UTC date.
- Missing workdays are not stored as records. They are calculated as `0` worked minutes in weekly/monthly summaries.
- `/edit dd-mm` creates or updates a daily record for the selected date in the current year.
- V1.1 does not include a `note` column.

### Work Record Rules

For `record_type = 'WORK'`:
- `start_time` is required.
- `expected_end_time` is required.
- `end_time` is null while the workday is open.
- `worked_minutes` is null while the workday is open.
- When the workday is closed, `end_time` is set and `worked_minutes` is calculated.

### Absence Record Rules

For these record types:
- `SICK`
- `VACATION`
- `HOLIDAY`
- `HOLIDAY_EVE`
- `UNPAID_ABSENCE`
- `ELECTION`

The record should have:
- `start_time = NULL`
- `expected_end_time = NULL`
- `end_time = NULL`
- `worked_minutes` set according to the credit rule

### Absence Credit Rule

The credit is calculated by the service layer using the user's `daily_required_minutes`.

| record_type | credited worked_minutes |
|---|---:|
| SICK | `daily_required_minutes` |
| VACATION | `daily_required_minutes` |
| HOLIDAY | `daily_required_minutes` |
| HOLIDAY_EVE | `daily_required_minutes / 2` |
| UNPAID_ABSENCE | `0` |
| ELECTION | `daily_required_minutes` |

Example with `daily_required_minutes = 528`:

| record_type | worked_minutes |
|---|---:|
| SICK | 528 |
| VACATION | 528 |
| HOLIDAY | 528 |
| HOLIDAY_EVE | 264 |
| UNPAID_ABSENCE | 0 |
| ELECTION | 528 |

### Prisma Field Mapping

PostgreSQL uses `snake_case` column names; Prisma maps them to `camelCase` in TypeScript:

- `telegram_id` (DB) → `telegramId`
- `work_date` (DB) → `workDate`
- `record_type` (DB) → `recordType`
- `start_time` (DB) → `startTime`
- `expected_end_time` (DB) → `expectedEndTime`
- `end_time` (DB) → `endTime`
- `worked_minutes` (DB) → `workedMinutes`
- `created_at` (DB) → `createdAt`
- `updated_at` (DB) → `updatedAt`

---

## Relationships

In V1.1, the relationship between `user_settings` and `daily_records` is based on `telegram_id`.

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
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_settings_language_check
    CHECK (language IN ('en', 'he')),

  CONSTRAINT user_settings_workdays_not_empty_check
    CHECK (array_length(workdays, 1) > 0)
);
```

### daily_records

```sql
CREATE TABLE daily_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id TEXT NOT NULL,
  work_date DATE NOT NULL,
  record_type TEXT NOT NULL DEFAULT 'WORK',
  start_time TIMESTAMPTZ NULL,
  expected_end_time TIMESTAMPTZ NULL,
  end_time TIMESTAMPTZ NULL,
  worked_minutes INTEGER NULL CHECK (worked_minutes IS NULL OR worked_minutes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT daily_records_telegram_id_work_date_unique
    UNIQUE (telegram_id, work_date),

  CONSTRAINT daily_records_record_type_check
    CHECK (
      record_type IN (
        'WORK',
        'SICK',
        'VACATION',
        'HOLIDAY',
        'HOLIDAY_EVE',
        'UNPAID_ABSENCE',
        'ELECTION'
      )
    ),

  CONSTRAINT daily_records_work_record_check
    CHECK (
      record_type <> 'WORK'
      OR start_time IS NOT NULL
    ),

  CONSTRAINT daily_records_absence_record_check
    CHECK (
      record_type = 'WORK'
      OR (
        start_time IS NULL
        AND expected_end_time IS NULL
        AND end_time IS NULL
        AND worked_minutes IS NOT NULL
      )
    )
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

CREATE INDEX idx_daily_records_telegram_id_record_type
ON daily_records (telegram_id, record_type);

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
enum DailyRecordType {
  WORK
  SICK
  VACATION
  HOLIDAY
  HOLIDAY_EVE
  UNPAID_ABSENCE
  ELECTION
}

model UserSettings {
  id                   String   @id @default(uuid())
  telegramId           String   @unique @map("telegram_id")
  dailyRequiredMinutes Int      @map("daily_required_minutes")
  timezone             String
  workdays             Int[]
  language             String   @default("en")
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")

  @@map("user_settings")
}

model DailyRecord {
  id              String          @id @default(uuid())
  telegramId      String          @map("telegram_id")
  workDate        DateTime        @map("work_date") @db.Date
  recordType      DailyRecordType @default(WORK) @map("record_type")
  startTime       DateTime?       @map("start_time")
  expectedEndTime DateTime?       @map("expected_end_time")
  endTime         DateTime?       @map("end_time")
  workedMinutes   Int?            @map("worked_minutes")
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  @@unique([telegramId, workDate])
  @@index([telegramId])
  @@index([telegramId, workDate])
  @@index([telegramId, recordType])
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
- Breaks are not stored separately in V1.1 because the required daily hours already include break time.
- Missing workdays are not stored as records. They are calculated as `0` worked minutes in weekly/monthly summaries.
- Absence records are stored as daily records with a non-`WORK` `record_type`.
- V1.1 does not store a `note` field.
- The database should run locally through Docker Compose, not through a manually installed PostgreSQL instance.
