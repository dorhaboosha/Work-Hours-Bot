# Project Context

## Purpose
WorkHours Bot is a Telegram bot (V1.1) that helps users track their daily work hours. Users interact entirely through Telegram commands to configure and edit their work settings, start and end workdays, check their current status, fix past dates, mark absences, and view weekly and monthly summaries with hour balances (worked vs. required).

There is no web frontend in V1.1. The user interacts only with the Telegram bot, which is backed by a Node.js/Express backend and a PostgreSQL database.

Core capabilities:
- Configure per-user work settings (daily required minutes, timezone, workdays) through a guided `/setup` flow.
- View settings (`/settings`) and edit them (`/settings_edit`) without re-running setup.
- Start a workday and calculate the expected end time.
- Check today's live status (worked so far, remaining, expected finish).
- End today's active workday with `/end`.
- View the details of a specific date with `/record dd-mm` (read-only lookup).
- Fix or update any date in the current year with `/edit dd-mm`: close an open workday, set start/end hours, or mark an absence.
- Mark absence/day-off types (sick, vacation, holiday, holiday eve, unpaid absence, election day) that are credited in summaries.
- View weekly and monthly summaries based on real calendar dates and configured workdays.

## Tech Stack
- TypeScript
- Node.js
- Express
- Prisma ORM
- PostgreSQL (run locally via Docker Compose)
- Zod (request/input validation)
- Telegram Bot API (bot library)

Repository layout is a monorepo:
- `backend/` — Express + TypeScript backend (bot, routes, controllers, services, repositories, validators, middlewares, utils, config, Prisma).
- `shared/` — shared TypeScript types, Zod schemas, and pure utility functions reusable by the backend and a future frontend.
- `docs/` — product and technical documentation (`Spec.md`, `API.md`, `Architecture.md`, `DatabaseSchema.md`, `DataModels.md`).
- `docker-compose.yml` — local PostgreSQL setup.

## Project Conventions

### Code Style
- Language: TypeScript everywhere.
- File naming: PascalCase for class/module files (e.g., `WorkdayService.ts`, `EditWorkdayService.ts`, `DailyRecordRepository.ts`, `SettingsSchemas.ts`).
- Type/interface names: PascalCase (e.g., `UserSettings`, `DailyRecord`, `EndWorkdayResult`, `EditDayOptions`, `WorkSummary`).
- TypeScript fields use `camelCase` (e.g., `telegramId`, `dailyRequiredMinutes`, `workDate`, `recordType`).
- Database columns use `snake_case` (e.g., `telegram_id`, `daily_required_minutes`, `work_date`, `record_type`) and are mapped to `camelCase` in Prisma via `@map`.
- Path aliases for clean imports:
  - `@/` → `backend/src`
  - `@shared/` → `shared/src`
- Durations are always stored and calculated in minutes (integers). Decimal hours must be converted to minutes before saving; never store decimal hours directly.
- Timestamps are stored in UTC; user-facing times are converted to the user's configured timezone.

### Architecture Patterns
Layered backend architecture with strict responsibilities and one-directional dependencies:

- **Bot layer** (`backend/src/bot/`): Initializes the Telegram bot, registers commands, parses messages, extracts `telegramId`, manages multi-step command flows, calls services, formats Telegram responses using labels from `botLabels.json`. Must not access Prisma directly and must not contain business logic.
- **Routes layer** (`backend/src/routes/`): Defines HTTP endpoints, attaches validation middleware, routes to controllers.
- **Controllers layer** (`backend/src/controllers/`): Thin. Reads request params/body/query, calls services, returns the standard API envelope. No business logic, time calculations, or DB access.
- **Services layer** (`backend/src/services/`): Owns business logic, validates business rules, calls repositories and shared utils, performs all time/balance/summary calculations, resolves edit-day state and allowed actions, computes absence credits, decides edge-case behavior, and throws typed application errors.
- **Repositories layer** (`backend/src/repositories/`): Owns all PostgreSQL access through Prisma. No Telegram logic and no user-facing message formatting.
- **Validators layer** (`backend/src/validators/`): Zod schemas for API/setup/settings-edit/edit-day/query input validation (including `dd-mm` date and `HH:mm` time formats).
- **Utils layer** (`backend/src/utils/`): Reusable helpers (duration/date formatting, error helpers, standard API responses, record-type credit helpers, week/month range builders).
- **Shared** (`shared/src/`): Types, schemas, and pure utility functions shared across backend and a future frontend. Shared code must not import backend-only code.

Conventions:
- All API responses use a standard envelope: `{ success: true, data }` or `{ success: false, error: { code, message, details? } }`.
- Errors are represented with typed error codes: `VALIDATION_ERROR`, `USER_SETTINGS_NOT_FOUND`, `SETUP_ALREADY_COMPLETED`, `DAILY_RECORD_NOT_FOUND`, `ACTIVE_RECORD_NOT_FOUND`, `DAILY_RECORD_ALREADY_EXISTS`, `PREVIOUS_RECORD_STILL_OPEN`, `DAILY_RECORD_ALREADY_CLOSED`, `INVALID_DATE_FORMAT`, `INVALID_TIME_FORMAT`, `INVALID_TIME_RANGE`, `INVALID_RECORD_TYPE`, `CONFLICT`, `INTERNAL_ERROR`.
- HTTP status conventions: 200 OK, 201 Created, 400 validation, 404 not found, 409 conflict/invalid state, 500 internal error.
- Even though V1.1 is Telegram-first, HTTP routes exist to make business logic testable, support a future dashboard, and keep clear backend boundaries.

### Testing Strategy
- The HTTP route/controller/service split exists specifically to make business logic easy to test in isolation.
- Prefer testing the services layer (business rules, time calculations, balances, summaries, edit-day state resolution, absence credits, and edge cases) and pure shared utilities (`decimalHoursToMinutes`, `formatMinutesAsDuration`, `formatBalance`, `isWorkday`, `isAbsenceRecordType`, `calculateCreditedMinutes`).
- Keep shared utilities pure functions where possible so they are trivially unit-testable.

### Git Workflow
- `.env` must never be committed; `.env.example` should be committed.
- Secrets are always loaded from environment variables.
- Prisma migrations are the source of truth for the database schema (the SQL/Prisma snippets in `docs/` are reference only).

## Domain Context
- **User identity**: Users are identified by their Telegram `telegramId` (string). One user has exactly one settings row and many daily records, related by `telegramId`.
- **Weekdays**: Represented as numbers `0`–`6` where `0 = Sunday` … `6 = Saturday`. Example workday sets: Sunday–Thursday `[0,1,2,3,4]`, Monday–Friday `[1,2,3,4,5]`.
- **Bot language**: English only. All user-facing messages are stored in a single `botLabels.json` file (not hardcoded in handlers). V1.1 does not support language selection or multiple languages.
- **User settings**: `dailyRequiredMinutes` (integer > 0, e.g. `528` = 8h 48m), `timezone` (e.g. `Asia/Jerusalem`), and `workdays`.
- **Daily record**: One per user per `workDate`. `workDate` is the local date in the user's timezone. Each record has a `recordType`. For `WORK`, `startTime`, `expectedEndTime`, and `endTime` are UTC timestamps and a record with `endTime = null` is active/open. For absence types, those timestamps are `null`. `workedMinutes` holds actual worked minutes for `WORK` (calculated on end) or credited minutes for absence records.
- **Record types**: `WORK`, `SICK`, `VACATION`, `HOLIDAY`, `HOLIDAY_EVE`, `UNPAID_ABSENCE`, `ELECTION`.
- **Absence credit**: `SICK`, `VACATION`, `HOLIDAY`, `ELECTION` credit a full required day; `HOLIDAY_EVE` credits half a required day; `UNPAID_ABSENCE` credits 0.
- **Balance**: `balanceMinutes = workedMinutes - requiredMinutes` (positive = overtime, negative = under).
- **Telegram commands** and their backend endpoints:
  - `/setup` → `POST /settings/setup`
  - `/settings` → `GET /settings/:telegramId`
  - `/settings_edit` → `PATCH /settings/:telegramId` (daily hours, workdays, timezone only; no language field)
  - `/start` → `POST /workdays/start`
  - `/status` → `GET /workdays/status/:telegramId`
  - `/end` → `POST /workdays/end`
  - `/record dd-mm` → `GET /workdays/record/:telegramId/:date`
  - `/edit dd-mm` → `GET /workdays/edit/:telegramId/:date` and `PATCH /workdays/edit/:telegramId/:date`
  - `/week` → `GET /summaries/week/:telegramId`
  - `/month` → `GET /summaries/month/:telegramId`
  - `/help` → bot-only command, no required API endpoint

Key business rules:
- `/setup` is first-time only. If settings already exist, it must not overwrite them; the backend returns `409 SETUP_ALREADY_COMPLETED` and the bot directs the user to `/settings_edit`.
- A user cannot have more than one daily record for the same `workDate`.
- A user can have at most one open workday at a time. A record is open only when `recordType = WORK`, `startTime` is set, and `endTime` is null.
- The system must prevent starting a new workday while an older open record exists (`PREVIOUS_RECORD_STILL_OPEN`); the user fixes it with `/edit dd-mm`.
- `/end` closes only today's active workday using the current time. V1.1 does not support `/end HH:mm`.
- `/record dd-mm` is a read-only lookup: it resolves the date using the current year in the user's timezone and returns the date's state (`COMPLETED_WORK_RECORD`, `OPEN_WORK_RECORD`, `ABSENCE_RECORD`, `NO_RECORD`) without ever creating, updating, or deleting a record.
- `/edit dd-mm` resolves the date using the current year in the user's timezone and exposes allowed actions based on the date's state (`OPEN_WORK_RECORD`, `NO_RECORD`, `CLOSED_WORK_RECORD`, `ABSENCE_RECORD`): set end hour, set start and end hours, mark absence, or cancel. When setting hours for a past date, the entered times belong to that date — never the current date/time. V1.1 has no delete option.
- Summaries iterate over real calendar dates in the current week/month, count only configured workdays, treat missing configured workdays as `0` worked minutes (not stored as rows), and credit absence records by their type.
- Breaks are not modeled separately in V1.1; required daily minutes already include break time.

## Important Constraints
- V1.1 scope: Telegram bot only, no web frontend.
- All durations are integers in minutes; timestamps are UTC; `workDate` is computed from the user's timezone.
- `/edit dd-mm` uses `dd-mm` user-facing format and resolves to the current year; `HH:mm` 24-hour format is used for start/end times.
- V1.1 does not use `ManualEndTime` and does not include a `note` field.
- V1.1 is English-only; there is no `language` field in user settings, no language selection in `/setup`, and no language editing in `/settings_edit`. All bot messages live in a single `botLabels.json` file.
- PostgreSQL must run locally through Docker Compose (no manually installed PostgreSQL required).
- Database name `workhours_bot`, port `5432`.
- Documentation responsibilities (`docs/`): `Spec.md` (product requirements), `API.md` (endpoint behavior), `Architecture.md` (code structure), `DatabaseSchema.md` (tables/fields), `DataModels.md` (TypeScript models/contracts).
- Tasks in `tasks.md` must be scoped so that each item takes a human 10–15 minutes to complete. If a task would take longer, break it into sub-tasks.

## External Dependencies
- **Telegram Bot API**: Receives commands and sends responses. Requires `TELEGRAM_BOT_TOKEN`.
- **PostgreSQL**: Primary datastore, accessed via Prisma. Connection configured through `DATABASE_URL` (e.g. `postgresql://workhours:workhours_password@localhost:5432/workhours_bot`).
- **Docker / Docker Compose**: Runs the local PostgreSQL instance (`postgres:16`).

Environment variables (backend `.env`):
- `PORT` (e.g. `3000`)
- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `NODE_ENV`
