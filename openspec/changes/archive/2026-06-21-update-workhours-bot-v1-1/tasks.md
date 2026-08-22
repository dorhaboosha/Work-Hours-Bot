## 1. Shared types & schemas
- [x] 1.1 Add `LanguageCode` (`en`/`he`) and `language` to `UserSettings` types in `shared/src/types`
- [x] 1.2 Add `DailyRecordType` and `AbsenceRecordType` unions and `recordType` to `DailyRecord` types
- [x] 1.3 Add edit-flow types: `EditRecordState`, `EditAction`, `EditDayOptions`, `EditWorkdayInput`, `EditWorkdayResult`
- [x] 1.4 Update `WorkSummary` types and the `ErrorCode` union (add new codes, remove `MANUAL_END_TIME_REQUIRED`)
- [x] 1.5 Add pure helpers `isAbsenceRecordType` and `calculateCreditedMinutes` with unit tests
- [x] 1.6 Update Zod schemas for setup, settings-edit, and edit-day (`dd-mm`, `HH:mm`, language, record type)

## 2. Database & Prisma
- [x] 2.1 Add `language` (default `en`) to `UserSettings` in `schema.prisma`
- [x] 2.2 Add `DailyRecordType` enum and `recordType` (default `WORK`) to `DailyRecord`; make `startTime`/`expectedEndTime`/`endTime`/`workedMinutes` nullable
- [x] 2.3 Add indexes (`telegramId, recordType`) and generate the migration
- [x] 2.4 Run/verify migration on the local Docker PostgreSQL

## 3. Repositories
- [x] 3.1 Update `UserSettingsRepository` for `language` and add an update method
- [x] 3.2 Update `DailyRecordRepository` to read/write `recordType` and absence (null-time) records
- [x] 3.3 Add a "find open WORK record" query that ignores absence records

## 4. Settings service & endpoints
- [x] 4.1 Make `/setup` first-time-only: return `SETUP_ALREADY_COMPLETED` when settings exist
- [x] 4.2 Add `GET /settings/:telegramId` returning `language`
- [x] 4.3 Add `PATCH /settings/:telegramId` (partial update, at-least-one-field) for `/settings_edit`
- [x] 4.4 Wire routes/controllers and validation middleware for the three settings endpoints

## 5. Workday service & endpoints
- [x] 5.1 Set `recordType = WORK` on start; update blocked-by-previous messaging to point to `/edit dd-mm`
- [x] 5.2 Update `/end` to close only today's active workday; remove `/end HH:mm` and `manualEndTime`
- [x] 5.3 Update `/status` messaging and previous-open handling
- [x] 5.4 Update `GET /workdays/:telegramId` listing to include `recordType`

## 6. Edit-day flow
- [x] 6.1 Add date utils: resolve `dd-mm` to current-year date in the user's timezone
- [x] 6.2 Implement `EditWorkdayService` state resolution (`OPEN_WORK_RECORD`/`NO_RECORD`/`CLOSED_WORK_RECORD`/`ABSENCE_RECORD`) and allowed actions
- [x] 6.3 Add `GET /workdays/edit/:telegramId/:date` (state + allowed actions)
- [x] 6.4 Implement `SET_END_HOUR` (apply end time to original work date)
- [x] 6.5 Implement `SET_START_AND_END_HOURS` (create/replace WORK record)
- [x] 6.6 Implement `MARK_ABSENCE` (set record type + credited minutes, clear timestamps)
- [x] 6.7 Add `PATCH /workdays/edit/:telegramId/:date` with action validation and the new error codes

## 7. Summaries
- [x] 7.1 Build current week/month ranges from the user's timezone (drop MVP `date`/`month` params)
- [x] 7.2 Iterate real calendar dates, count configured workdays, credit absences by type
- [x] 7.3 Keep `PREVIOUS_RECORD_STILL_OPEN` handling pointing to `/edit dd-mm`

## 8. Bot layer & localization
- [x] 8.1 Add `LocalizationService` and `en`/`he` message catalogs
- [x] 8.2 Add/refresh handlers: `/setup`, `/settings`, `/settings_edit`, `/start`, `/status`, `/end`, `/edit`, `/week`, `/month`, `/help`
- [x] 8.3 Implement multi-step conversation state for setup, settings-edit, and edit-day
- [x] 8.4 Resolve user language before formatting and render all replies in it

## 9. Validation & docs sync
- [x] 9.1 Add service-layer tests for setup-already-completed, edit-day state machine, absence credits, and summaries
- [x] 9.2 Run `openspec validate update-workhours-bot-v1-1 --strict` and resolve any issues
- [x] 9.3 Confirm behavior matches `docs/` (Spec/API/Architecture/DatabaseSchema/DataModels)
