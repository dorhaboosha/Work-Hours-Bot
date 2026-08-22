## 1. Data model & migration
- [x] 1.1 Remove the `language` field from the `user_settings` model in `backend/prisma/schema.prisma`
- [x] 1.2 Create a Prisma migration that drops the `language` column
- [x] 1.3 Update `shared/` types/schemas that reference `language`

## 2. Validation & services
- [x] 2.1 Remove `language` from the setup schema in `backend/src/validators/SettingsSchemas.ts`
- [x] 2.2 Remove `language` from the settings-edit schema (keep "at least one field" rule for the remaining fields)
- [x] 2.3 Stop reading/writing `language` in the settings service and repository

## 3. Bot layer
- [x] 3.1 Remove the language selection step from the `/setup` flow
- [x] 3.2 Remove the language option from the `/settings_edit` flow
- [x] 3.3 Add/confirm a single English `botLabels.json` and route bot messages through it
- [x] 3.4 Remove any per-user language lookup used when formatting responses
- [x] 3.5 Collapse `backend/src/i18n.ts` to a single English label source: drop the `en`/`he` dual-resource setup and the `(i18n.t as any)` cast wrapper
- [x] 3.6 Delete `backend/src/lang/he.json` (consolidate `en.json` into the single labels file) and remove the `@types/i18next.d.ts` shim if no longer needed
- [x] 3.7 Drop the `lang`/`LanguageCode` argument threaded through handlers and services (`ConversationHandler`, `EditCommandHandler`, `handleBotError`, etc.) and remove `LanguageCode`/`LANGUAGE_LABELS` from `shared/`

## 4. Extract hardcoded constants & messages
> Several bot handlers still inline both user-facing message text and config constants. For example, `ConversationHandler.ts` hardcodes message blocks (`SETUP_ASK_HOURS`, `SETUP_CHOOSE_WORKDAYS`, `SETUP_ASK_CUSTOM_WORKDAYS`, `SETUP_CHOOSE_TIMEZONE`, `SETUP_ASK_CUSTOM_TIMEZONE`, and inline `❌ ...` error strings) plus non-message constants (`PREDEFINED_TIMEZONES`, `HH_MM_RE`, `HH_MM_RANGE_RE`, `ABSENCE_TYPES`, `EDIT_ACTION_MAP`). Move all user-facing text to `botLabels.json` and all non-message constants into a dedicated constants folder.
- [x] 4.1 Create a `backend/src/constants/` folder with focused files (e.g. `timezones.ts`, `timeFormats.ts`, `absenceTypes.ts`, `editActions.ts`)
- [x] 4.2 Move non-message constants out of `ConversationHandler.ts` into those files (`PREDEFINED_TIMEZONES`, `HH_MM_RE`/`HH_MM_RANGE_RE`, `ABSENCE_TYPES`, `EDIT_ACTION_MAP`) and import them
- [x] 4.3 Move all hardcoded setup/edit message blocks and inline `❌ ...` error strings into `botLabels.json` and reference them via the labels helper
- [x] 4.4 Audit the other bot handlers (`SetupCommandHandler`, `SettingsEditCommandHandler`, `EditCommandHandler`, `Start/End/Status/Week/Month/Help` handlers) for remaining inline strings/constants and relocate them the same way
- [x] 4.5 Verify no user-facing strings remain hardcoded in handlers (search for `ctx.reply("`/string literals) and that constants are imported from `constants/`

## 5. Split the bot conversation into flow files
> `ConversationHandler.ts` (~520 lines) holds three unrelated flows (setup, settings-edit, edit-day) plus parsing helpers in one file, which is hard to read. `docs/Spec.md` §6.7 recommends splitting it into focused flow files. The dispatcher already branches on `setup:`/`settings_edit:`/`edit:` prefixes, so each branch can move out almost verbatim.
- [x] 5.1 Create `backend/src/bot/flows/setupFlow.ts` and move `handleSetupStep` (+ its `startSetupFlow` starter) there
- [x] 5.2 Create `backend/src/bot/flows/settingsEditFlow.ts` and move `handleSettingsEditStep` (+ `applySettingsUpdate`, `startSettingsEditFlow`) there
- [x] 5.3 Create `backend/src/bot/flows/editDayFlow.ts` and move `handleEditStep` (+ `startEditFlow`) there
- [x] 5.4 Create `backend/src/bot/utils/timeInputParser.ts` for the `HH:mm` / range parsing helpers shared by the flows
- [x] 5.5 Reduce `ConversationHandler.ts` to a thin dispatcher that routes by session-step prefix to the flow files

## 6. Simplify SummaryService
> `getWeekSummary` and `getMonthSummary` are ~90% identical; only the window builder and returned shape differ.
- [x] 6.1 Extract the shared pipeline (settings fetch, `assertNoPreviousOpenRecord`, `listRecordsByRange` → `enrichWithOpenDay` → `aggregateSummary`) into one private `buildSummary` helper used by both
- [x] 6.2 Move `getWeekWindow`/`getMonthWindow` (and `luxonToJsWeekday`) into a `utils/` week/month range-builder module, per the Utils-layer responsibility in `openspec/project.md`

## 7. Edit-day time validation fix (service layer)
> Pre-existing bug (not caused by this change): the bot calls `setEndHour`/`setStartAndEndHours` directly with loose regexes (`/^\d{2}:\d{2}$/`), so invalid inputs like `25:00-45:00` (bad format) and `17:30-09:00` (bad range) are accepted. Per `docs/Spec.md` §2.14.4, validation must live in the service layer so both HTTP and bot paths are protected.
- [x] 7.1 In `EditWorkdayService.setEndHour`, strictly validate `endTime` is `HH:mm` (`/^([01]\d|2[0-3]):[0-5]\d$/`), throwing `AppError("INVALID_TIME_FORMAT", ...)` otherwise
- [x] 7.2 In `setEndHour`, enforce that the entered end time is after the existing start time on the edited date, throwing `AppError("INVALID_TIME_RANGE", ...)` otherwise
- [x] 7.3 In `EditWorkdayService.setStartAndEndHours`, strictly validate both `startTime` and `endTime` formats and enforce `endTime > startTime` (`INVALID_TIME_FORMAT` / `INVALID_TIME_RANGE`)
- [x] 7.4 Tighten the bot's `HH_MM_RE`/`HH_MM_RANGE_RE` (now in `constants/`) for friendlier inline errors (service check remains authoritative)
- [x] 7.5 Add service tests for `25:00-45:00`, `17:70`, and `17:30-09:00` (all rejected) plus a valid `08:15-17:30` (accepted)

## 8. Validation & verification
- [x] 8.1 Update/adjust tests that assert on `language` (setup, settings, settings-edit)
- [x] 8.2 Run `openspec validate remove-multi-language-support --strict`
- [x] 8.3 Verify `/setup`, `/settings`, and `/settings_edit` no longer reference language end-to-end

## 9. Deploy to Render
> Goal: get the bot running on Render so it can be used live. The app runs the Express API and the Telegram bot (long-polling via `bot.launch()`) in a single process (`src/server.ts`), builds with `tsc` → `dist/`, and starts with `node dist/server.js`.
> NOTE — production blocker: the `start` script runs `node dist/server.js` but `tsc` leaves the `@/` and `@shared/` path aliases in the compiled output (only the `dev` script registers `tsconfig-paths`). The build must rewrite or resolve those aliases or the deployed app will crash on startup.
- [x] 9.1 Make `dist` runnable standalone: add `tsc-alias` to the build (e.g. `tsc && tsc-alias`) or register `tsconfig-paths` at runtime, then verify `node dist/server.js` boots locally with no `@/`/`@shared/` resolution errors
- [x] 9.2 Add `prisma generate` to the build pipeline (so the client is generated on Render) and confirm `shared/src` is compiled into `dist` correctly
- [x] 9.3 Confirm `backend/.env.example` documents `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, and `NODE_ENV` (Render injects `PORT`), and that `.env` stays gitignored
- [x] 9.4 Provision a Render PostgreSQL instance and copy its connection string for `DATABASE_URL`
- [x] 9.5 Create a Render Web Service from the repo — Build Command `npm install && npm run build -w backend`, Start Command `npm start -w backend`
- [x] 9.6 Add a Render Pre-Deploy Command `npx prisma migrate deploy` (run in `backend/`) to apply migrations to the Render database on every deploy — implemented via build command instead (`npm run migrate:deploy -w backend && npm run build -w backend`) since Pre-Deploy is a paid feature
- [x] 9.7 Set Render env vars: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN` (secret), `NODE_ENV=production`; confirm the server binds to Render's injected `PORT`
- [x] 9.8 Address sleep behavior: a free-tier Web Service spins down on inactivity, which stops bot polling — use a paid instance (or a keep-alive ping to `/health`) so the bot stays responsive
- [x] 9.9 Verify the live deployment: `GET /health` returns ok, then exercise `/setup`, `/start`, `/status`, `/end`, `/edit dd-mm`, `/week`, `/month` against the bot in Telegram
- [ ] 9.10 (Optional) Add a `render.yaml` blueprint capturing the Web Service + PostgreSQL config as code for reproducible deploys

## 10. Professional README for GitHub
> The repo will be published on GitHub, so `README.md` should look professional and match V1.1. The current README is outdated: it lists the removed `/end HH:mm`, omits `/settings`, `/settings_edit`, `/edit dd-mm`, and `/help`, and has no absences, tech-stack, deployment, or license sections.
- [x] 10.1 Update the commands table to the real V1.1 set (`/setup`, `/settings`, `/settings_edit`, `/start`, `/status`, `/end`, `/edit dd-mm`, `/week`, `/month`, `/help`) and remove `/end HH:mm`
- [x] 10.2 Add a concise feature overview (work tracking, edit/fix dates, absence types, weekly/monthly summaries) and note English-only V1.1 scope
- [x] 10.3 Add a Tech Stack section (Node.js, Express, TypeScript, Prisma, PostgreSQL, Zod, Telegraf) and keep the project-structure tree current
- [x] 10.4 Add a top header block with status badges (e.g. license, Node version, tech) for a polished first impression
- [x] 10.5 Add a Deployment section (Render) cross-referencing section 9, plus environment-variable documentation
- [x] 10.6 Add a `LICENSE` file and a matching License section, and a short Contributing/scripts (`dev`, `build`, `start`, `test`) reference
- [x] 10.7 Proofread for accurate setup steps end-to-end (fresh clone → running bot) so the instructions actually work
