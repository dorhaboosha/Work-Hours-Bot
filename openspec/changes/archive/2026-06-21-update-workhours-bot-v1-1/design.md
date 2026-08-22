## Context
The MVP is archived as the current truth (`openspec/specs/`). V1.1 evolves it across five capabilities, adds multi-step bot conversations, localization, an absence model, and a breaking database migration. The behavior is fully described in `docs/` (Spec/API/Architecture/DatabaseSchema/DataModels); this design captures the decisions that span more than one capability.

## Goals / Non-Goals
- Goals:
  - One safe, unified way to fix any date in the current year (`/edit dd-mm`).
  - Editable settings without re-running setup, plus per-user language.
  - Absence types that credit summaries correctly using real calendar dates.
  - Keep the layered architecture (bot → service → repository) and the standard API envelope.
- Non-Goals:
  - Web dashboard, auth outside Telegram, multi-user/manager mode.
  - Natural-language commands, automatic holiday calendars, reminders, exports.
  - Delete-record action (intentionally excluded in V1.1).
  - Historical week/month selection via query params (V1.1 reports the current period only).

## Decisions
- **Replace `/end HH:mm` with `/edit dd-mm`.** A single edit flow handles open/closed/absent/missing dates, removing the special-case manual-end path and the `MANUAL_END_TIME_REQUIRED` code. Entered times always bind to the edited `workDate`, never "now".
- **`/setup` is first-time-only.** Re-running `/setup` returns `409 SETUP_ALREADY_COMPLETED`; edits go through `PATCH /settings/:telegramId` (`/settings_edit`). This prevents accidental overwrites and removes the MVP's silent defaults.
- **Single `daily_records` table for work and absences.** A `record_type` column distinguishes them; absence rows have null `start_time`/`expected_end_time`/`end_time` and a credited `worked_minutes`. This keeps the one-row-per-date invariant and simplifies summary queries.
- **Absence crediting in the service layer.** `calculateCreditedMinutes(recordType, dailyRequiredMinutes)` is a pure shared helper: full day for `SICK`/`VACATION`/`HOLIDAY`/`ELECTION`, `floor(required/2)` for `HOLIDAY_EVE`, `0` for `UNPAID_ABSENCE`.
- **New error codes** (`INVALID_DATE_FORMAT`, `INVALID_TIME_FORMAT`, `INVALID_TIME_RANGE`, `INVALID_RECORD_TYPE`, `SETUP_ALREADY_COMPLETED`) give the edit/setup flows precise, user-actionable messages.
- **Localization.** A `LocalizationService` renders messages in the user's `language`; the bot resolves language from settings before formatting.
- **Multi-step bot flows.** Setup, settings-edit, and edit-day are conversational; the bot layer owns conversation state and calls services per step. Services stay stateless and HTTP-testable.
- Alternatives considered: keeping `/end HH:mm` alongside `/edit` (rejected — two overlapping ways to fix a day); a separate `absences` table (rejected — breaks the per-date uniqueness and complicates summaries).

## Risks / Trade-offs
- **Breaking DB migration** (`record_type`, nullable work timestamps, `language`). → Provide a Prisma migration; default `record_type` to `WORK` and `language` to `en` for existing rows.
- **Open record from a previous date during summaries** still blocks with `PREVIOUS_RECORD_STILL_OPEN`. → Bot points to `/edit dd-mm`.
- **Timezone/`dd-mm` resolution** must use the current year in the user's timezone; off-by-one risks around midnight/DST. → Centralize in date utils with tests.

## Migration Plan
1. Add `language` to `user_settings` (default `en`) and `record_type` + nullable timestamps to `daily_records` (default `WORK`) via a Prisma migration.
2. Ship validators/services/handlers; remove `/end HH:mm` handling and `MANUAL_END_TIME_REQUIRED`.
3. Backfill is implicit (defaults). No data loss; existing work rows remain valid `WORK` records.
4. Rollback: revert the migration (drop new columns) and restore MVP handlers if needed.

## Open Questions
- None blocking; defaults above follow the V1.1 docs.
