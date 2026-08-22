# Change: Upgrade WorkHours Bot from MVP to V1.1

## Why
The MVP only tracks plain work start/end and fixes previous open days with `/end HH:mm`. Real daily usage needs language choice, editable settings, a single safe way to fix any past date, and the ability to mark absences (sick, vacation, holiday, etc.) so weekly/monthly summaries reflect reality. The `docs/` (Spec, API, Architecture, DatabaseSchema, DataModels) have been updated to V1.1 and this change brings the specs in line with them.

## What Changes
- **User settings**: add a `language` field (`en`/`he`); `/setup` becomes first-time-only and no longer overwrites existing settings (**BREAKING**); add `/settings` (view) and `/settings_edit` (partial update); require the user to choose/confirm workdays, timezone, and language during setup.
- **Workdays**: every daily record carries a `recordType` (defaults to `WORK`); blocked-by-previous and no-active messages now point users to `/edit dd-mm`.
- **Edit flow**: add `/edit dd-mm` to inspect a date's state (`OPEN_WORK_RECORD`, `NO_RECORD`, `CLOSED_WORK_RECORD`, `ABSENCE_RECORD`) and apply `SET_END_HOUR`, `SET_START_AND_END_HOURS`, or `MARK_ABSENCE`. Entered times always belong to the edited date.
- **Remove `/end HH:mm`** and the `MANUAL_END_TIME_REQUIRED` error code (**BREAKING**); previous open days are fixed only through `/edit dd-mm`.
- **Absence records**: add record types `SICK`, `VACATION`, `HOLIDAY`, `HOLIDAY_EVE`, `UNPAID_ABSENCE`, `ELECTION` with an absence credit rule.
- **Summaries**: weekly/monthly summaries credit absence days by type and always report the current period (drop the MVP `date`/`month` query parameters) (**BREAKING**).
- **API contract**: refresh error codes (add `SETUP_ALREADY_COMPLETED`, `INVALID_DATE_FORMAT`, `INVALID_TIME_FORMAT`, `INVALID_TIME_RANGE`, `INVALID_RECORD_TYPE`; remove `MANUAL_END_TIME_REQUIRED`), refresh the command→endpoint mapping (add `/settings`, `/settings_edit`, `/edit`, `/help`; remove `/end HH:mm`), and render bot messages in the user's language.
- **Database**: `user_settings` gains `language`; `daily_records` gains `record_type` and makes `start_time`/`expected_end_time`/`end_time` nullable for absences (**BREAKING** schema change).

## Impact
- Affected specs: `user-settings`, `workday-tracking`, `work-summaries`, `api-contract`, and new `absence-records`.
- Affected code: `backend/src/bot` (new handlers + multi-step flows + localization), `backend/src/services` (`SettingsService`, `WorkdayService`, new `EditWorkdayService`, `SummaryService`, localization), `backend/src/repositories` (`DailyRecordRepository`), `backend/src/validators`, `backend/src/utils` (record-type credit, date/range helpers), `shared/src` types/schemas, and `backend/prisma/schema.prisma` + a migration.
- Docs already updated: `docs/Spec.md`, `docs/API.md`, `docs/Architecture.md`, `docs/DatabaseSchema.md`, `docs/DataModels.md`.
