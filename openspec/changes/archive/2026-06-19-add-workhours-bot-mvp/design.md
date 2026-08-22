## Context
WorkHours Bot is a Telegram-first MVP for tracking personal work hours. There is no implementation yet—only documentation in `docs/`. This change introduces the foundational architecture and a layered backend so the documented behavior can be built consistently. The work spans multiple modules (bot, HTTP API, services, persistence) and a new external dependency (Telegram + PostgreSQL), so technical decisions are captured here before implementation.

## Goals / Non-Goals
- Goals:
  - Define a layered backend (bot → routes → controllers → services → repositories) with one-directional dependencies.
  - Persist user settings and daily records in PostgreSQL via Prisma, using minutes and UTC consistently.
  - Support the full MVP command set with a shared response/error contract.
  - Run PostgreSQL locally via Docker Compose; load secrets from environment variables.
- Non-Goals (per `docs/Spec.md`): web dashboard, non-Telegram auth, manager/team mode, NLP, holiday/vacation handling, full manual edit/add flow, CSV/Excel export, payroll, reminders.

## Decisions
- **Layered architecture**: Bot and HTTP controllers are thin adapters that call the services layer. Services own all business logic and time math; repositories own all Prisma access. Bot handlers never touch Prisma and never embed business rules. Rationale: testability and a future dashboard can reuse services via HTTP.
- **Time & duration model**: All durations are integer minutes; all timestamps stored in UTC (`TIMESTAMPTZ`). `workDate` is the user's local date (`DATE`) derived from their configured timezone. Decimal hours from `/setup` are converted to minutes via `Math.round(hours * 60)` before persistence. Rationale: avoids decimal drift and timezone ambiguity (`docs/Spec.md` §3, `docs/DataModels.md` §9).
- **Identity by `telegramId`**: One `user_settings` row per `telegramId` (unique); many `daily_records` related by `telegramId`. No separate users table in the MVP (`docs/DatabaseSchema.md`).
- **Single open record invariant**: At most one active record (`endTime = null`) per user. Starting/status/summaries must detect an open record from a *previous* date and force the user to close it with `/end HH:mm` (`PREVIOUS_RECORD_STILL_OPEN`). Unique `(telegram_id, work_date)` prevents duplicate daily records.
- **Previous-day close semantics**: When the open record is from a prior date, `manualEndTime` (HH:mm) is required and applied to the original `workDate` in the user's timezone, then converted to UTC. The current date/time is never used. Rationale: correctness of historical balances (`docs/API.md` §3.5, `docs/Spec.md` §3.8).
- **Standard API envelope**: `{ success: true, data }` or `{ success: false, error: { code, message, details? } }` with a fixed `ErrorCode` union and HTTP status mapping (400/404/409/500). Centralized via response helpers and an error middleware.
- **Validation with Zod**: Request/setup/query validation lives in validators (backend) and shared schemas, surfaced as `VALIDATION_ERROR`.
- **Shared package**: `shared/src` holds reusable types, Zod schemas, and pure utilities (`decimalHoursToMinutes`, `formatMinutesAsDuration`, `formatBalance`, `isWorkday`) with no backend-only imports.

## Risks / Trade-offs
- **Timezone correctness** (DST, local-date boundaries) is the highest-risk area → isolate in a dedicated time utility/service and unit-test boundary cases (midnight, month edges, previous-day close).
- **HTTP layer for a Telegram-only MVP** adds surface area → justified by testability and future dashboard; kept thin to limit cost.
- **`manualEndTime` is input-only** (not stored) → document clearly so it isn't added as a DB column; only the computed `endTime` is persisted.

## Migration Plan
Greenfield; no data migration. Initial Prisma migration creates `user_settings` and `daily_records` with documented constraints/indexes. Local DB via `docker-compose up`. Rollback = drop the dev database/volume.

## Open Questions
- `/setup` UX: interactive multi-step Telegram conversation vs. a single structured message? (Spec lists fields and defaults but not the exact prompt flow.) Default assumption: collect fields with sensible defaults (Sunday–Thursday, `Asia/Jerusalem`) and allow overrides.
- Week boundary definition for `/week`: derive the week window strictly from configured `workdays`, or from a fixed week start? Assumption: window is based on configured workdays around the reference date.
