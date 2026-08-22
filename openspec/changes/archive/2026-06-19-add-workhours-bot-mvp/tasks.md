# Tasks

> Each task is scoped to ~10–15 minutes of human effort. If any item grows beyond that, split it further.

## 1. Project Scaffolding
- [x] 1.1 Create root files: `.gitignore`, root `package.json` (workspaces optional), and `README.md` outline
- [x] 1.2 Create `backend/` with `package.json` and install Express + TypeScript dev deps
- [x] 1.3 Add `backend/tsconfig.json` with path aliases `@/` → `backend/src` and `@shared/` → `shared/src`
- [x] 1.4 Create `shared/` with `package.json` and `tsconfig.json`
- [x] 1.5 Create `backend/.env.example` with `PORT`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `NODE_ENV`
- [x] 1.6 Add `backend/src/config/Env.ts` to load and validate environment variables

## 2. Docker & Database
- [x] 2.1 Create root `docker-compose.yml` with the `postgres:16` service (db `workhours_bot`, port `5432`, named volume)
- [x] 2.2 Verify the database starts with `docker compose up -d` and is reachable on `5432`
- [x] 2.3 Install and initialize Prisma in `backend/` (`prisma`, `@prisma/client`)
- [x] 2.4 Define the `UserSettings` Prisma model with `@map` snake_case columns and `@unique` on `telegramId`
- [x] 2.5 Define the `DailyRecord` Prisma model with `@@unique([telegramId, workDate])` and the three documented indexes
- [x] 2.6 Run the initial migration (`prisma migrate dev`) and generate the client

## 3. Shared Package (`shared/src`)
- [x] 3.1 Add core types: `UserSettings`, `DailyRecord`, ID aliases, and `Weekday` with `WEEKDAY_LABELS`
- [x] 3.2 Add view/result types: `WorkdayStatus`, `EndWorkdayResult`, `WorkSummary`, `SummaryPeriod`
- [x] 3.3 Add request types: `SetupUserSettingsInput`, `StartWorkdayInput`, `EndWorkdayInput`, summary/list queries
- [x] 3.4 Add `ApiSuccess`, `ApiError`, `ApiResponse`, and the `ErrorCode` union
- [x] 3.5 Implement `decimalHoursToMinutes` and `isWorkday` with unit tests
- [x] 3.6 Implement `formatMinutesAsDuration` and `formatBalance` with unit tests

## 4. Backend Foundation (api-contract)
- [x] 4.1 Add `utils/ApiResponse.ts` success/error envelope helpers
- [x] 4.2 Add `utils/AppError.ts` and `utils/ErrorCodes.ts` typed error classes mapped to HTTP status
- [x] 4.3 Add `middlewares/ErrorMiddleware.ts` translating `AppError` into the standard error envelope
- [x] 4.4 Add `middlewares/ValidateMiddleware.ts` running Zod schemas and returning `VALIDATION_ERROR`
- [x] 4.5 Add `app.ts` (Express app, JSON parsing, route mounting, error middleware) and `server.ts` (bootstrap)
- [x] 4.6 Add `utils/DateUtils.ts` for timezone-aware local date and UTC conversion helpers
- [x] 4.7 Add unit tests for `DateUtils` covering local `workDate` and previous-day end-time conversion

## 5. User Settings (user-settings)
- [x] 5.1 Add `validators/SettingsSchemas.ts` Zod schema (positive int minutes, workdays 0–6, non-empty timezone)
- [x] 5.2 Add `repositories/UserSettingsRepository.ts` (find by `telegramId`, upsert)
- [x] 5.3 Add `services/SettingsService.ts` create/update with decimal-hours conversion and defaults
- [x] 5.4 Add `services/SettingsService.ts` getByTelegramId with `USER_SETTINGS_NOT_FOUND` handling
- [x] 5.5 Add `controllers/SettingsController.ts` for setup + get
- [x] 5.6 Add `routes/SettingsRoutes.ts` (`POST /settings/setup`, `GET /settings/:telegramId`)
- [x] 5.7 Add tests for setup create, update, decimal conversion, and defaults

## 6. Workday Tracking (workday-tracking)
- [x] 6.1 Add `validators/WorkdaySchemas.ts` (start body; end body with optional `HH:mm` `manualEndTime`)
- [x] 6.2 Add `repositories/DailyRecordRepository.ts` (find active/open, find by date, create, update, list by range)
- [x] 6.3 Add `services/TimeCalculationService.ts` (expected end, worked minutes, balance)
- [x] 6.4 Implement `WorkdayService.startWorkday` (create today's record + expected end time)
- [x] 6.5 Add start guards: already-started and `PREVIOUS_RECORD_STILL_OPEN`
- [x] 6.6 Implement `WorkdayService.getTodayStatus` (worked-so-far, remaining clamped to 0)
- [x] 6.7 Implement `WorkdayService.endWorkday` for today's active record (current time)
- [x] 6.8 Implement `WorkdayService.endWorkday` previous-day branch (require + apply `manualEndTime` to original `workDate`)
- [x] 6.9 Add end guards: `ACTIVE_RECORD_NOT_FOUND`, `DAILY_RECORD_ALREADY_CLOSED`, `MANUAL_END_TIME_REQUIRED`
- [x] 6.10 Add `controllers/WorkdayController.ts` (start, status, end, list)
- [x] 6.11 Add `routes/WorkdayRoutes.ts` (`POST /workdays/start`, `GET /workdays/status/:telegramId`, `POST /workdays/end`, `GET /workdays/:telegramId`)
- [x] 6.12 Add tests for start/status/end-today flows
- [x] 6.13 Add tests for previous-day close (correct date, no current-time usage) and invalid `HH:mm`

## 7. Work Summaries (work-summaries)
- [x] 7.1 Add `validators/SummarySchemas.ts` (optional `date`, optional `month`)
- [x] 7.2 Add `SummaryService` week-window computation from configured workdays + reference date
- [x] 7.3 Add `SummaryService` month-window computation from configured workdays
- [x] 7.4 Implement summary aggregation (required, worked, balance; missing days = 0 worked)
- [x] 7.5 Include open current-day worked-so-far in summary totals
- [x] 7.6 Add `PREVIOUS_RECORD_STILL_OPEN` guard to both summaries
- [x] 7.7 Add `controllers/SummaryController.ts` and `routes/SummaryRoutes.ts` (`/summaries/week/...`, `/summaries/month/...`)
- [x] 7.8 Add tests for weekly and monthly totals including missing-day and open-day cases

## 8. Telegram Bot (api-contract command mapping)
- [x] 8.1 Add `bot/Bot.ts` initialization using `TELEGRAM_BOT_TOKEN`
- [x] 8.2 Add `bot/BotCommands.ts` registration for `/setup`, `/start`, `/status`, `/end`, `/week`, `/month`
- [x] 8.3 Add `bot/utils` message formatting helpers (HH:mm times, signed balance)
- [x] 8.4 Implement `SetupCommandHandler` (collect fields with defaults → SettingsService)
- [x] 8.5 Implement `StartCommandHandler` and `StatusCommandHandler`
- [x] 8.6 Implement `EndCommandHandler` parsing optional `HH:mm` argument
- [x] 8.7 Implement `WeekCommandHandler` and `MonthCommandHandler`
- [x] 8.8 Map typed errors to friendly bot messages with next-action guidance

## 9. Validation & Wrap-up
- [x] 9.1 Manually exercise each command end to end against the local Docker database
- [x] 9.2 Verify `.env` is gitignored and only `.env.example` is committed
- [x] 9.3 Run `openspec validate add-workhours-bot-mvp --strict` and resolve any issues
