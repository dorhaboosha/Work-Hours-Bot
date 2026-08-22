# Change: Add `/record dd-mm` Record Lookup

## Why
Users can edit a date with `/edit dd-mm`, but there is no way to simply view a specific date's record without entering the editing flow. A read-only `/record dd-mm` lets users quickly check the details of any past date in the current year.

## What Changes
- Add a new read-only command `/record dd-mm` backed by `GET /workdays/record/:telegramId/:date`.
- Resolve the `dd-mm` date to the current year in the user's timezone and return the date's state: `COMPLETED_WORK_RECORD`, `OPEN_WORK_RECORD`, `ABSENCE_RECORD`, or `NO_RECORD`.
- The endpoint is strictly read-only: it never creates, updates, or deletes a record.
- Add the `/record dd-mm` → `GET /workdays/record/:telegramId/:date` entry to the Telegram command mapping.

## Impact
- Affected specs: `workday-tracking` (new requirement), `api-contract` (modified command mapping)
- Affected code:
  - `backend/src/routes/WorkdayRoutes.ts` (new route, declared before `/:telegramId`)
  - `backend/src/controllers/WorkdayController.ts` (new controller)
  - `backend/src/services/WorkdayService.ts` (new read-only lookup service)
  - `backend/src/validators/WorkdaySchemas.ts` (reuse `dd-mm` date param validation)
  - `backend/src/bot/handlers/RecordCommandHandler.ts` (new handler)
  - `backend/src/bot/BotCommands.ts` (register `/record`)
  - `backend/src/lang/botLabels.json` (record lookup messages)
