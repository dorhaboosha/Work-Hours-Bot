# Change: Add WorkHours Bot MVP

## Why
The project currently has only documentation (`docs/`) and no implemented capabilities. We need an authoritative set of specs that turns the documented MVP into spec-driven, buildable requirements so a developer can implement the Telegram-based work-hour tracker end to end.

## What Changes
- Add the **api-contract** capability: standard success/error response envelope, typed error codes, and the Telegram-command-to-endpoint mapping shared by all endpoints.
- Add the **user-settings** capability: `/setup` flow to create/update per-user work settings (daily required minutes, timezone, workdays) and retrieval of those settings, including decimal-hours-to-minutes conversion and defaults.
- Add the **workday-tracking** capability: `/start`, `/status`, `/end`, and `/end HH:mm`, covering the daily-record lifecycle, the single-open-record rule, and closing a previous unfinished workday against its original date.
- Add the **work-summaries** capability: `/week` and `/month` summaries with required/worked/balance minutes, missing-workday handling, and open-current-day handling.
- Establish project scaffolding referenced by the specs: monorepo (`backend/`, `shared/`), Express + TypeScript app, Prisma schema/migrations, Zod validators, and a Docker Compose PostgreSQL service.

## Impact
- Affected specs (new capabilities): `api-contract`, `user-settings`, `workday-tracking`, `work-summaries`.
- Affected code (to be created):
  - `backend/` — `bot/`, `routes/`, `controllers/`, `services/`, `repositories/`, `validators/`, `middlewares/`, `utils/`, `config/`, `app.ts`, `server.ts`.
  - `backend/prisma/schema.prisma` and migrations (`user_settings`, `daily_records`).
  - `shared/src/` — shared types, schemas, and pure utilities.
  - `docker-compose.yml`, backend `.env.example`.
- External dependencies: Telegram Bot API, PostgreSQL (via Docker), Prisma, Zod.
- Reference docs: `docs/Spec.md`, `docs/API.md`, `docs/Architecture.md`, `docs/DatabaseSchema.md`, `docs/DataModels.md`.
