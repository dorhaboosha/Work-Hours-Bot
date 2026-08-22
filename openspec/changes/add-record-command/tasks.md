## 1. Backend lookup endpoint
- [x] 1.1 Add a `dd-mm` date param validation schema (or reuse the `/edit` one) in `backend/src/validators/WorkdaySchemas.ts`
- [x] 1.2 Add a read-only `getDateRecord(telegramId, date)` service in `backend/src/services/WorkdayService.ts` that resolves `dd-mm` to the current year in the user's timezone and returns `{ workDate, displayDate, state, record }`
- [x] 1.3 Map record state to `COMPLETED_WORK_RECORD` / `OPEN_WORK_RECORD` / `ABSENCE_RECORD` / `NO_RECORD` without mutating any data
- [x] 1.4 Add a controller in `backend/src/controllers/WorkdayController.ts` returning the standard success envelope
- [x] 1.5 Register `GET /workdays/record/:telegramId/:date` in `backend/src/routes/WorkdayRoutes.ts` before the `/:telegramId` route so it is not shadowed

## 2. Bot command
- [x] 2.1 Add `backend/src/bot/handlers/RecordCommandHandler.ts` that parses `dd-mm`, calls the service, and formats each state
- [x] 2.2 Add record lookup labels to `backend/src/lang/botLabels.json` (completed, open, absence, no-record)
- [x] 2.3 Register `/record` in `backend/src/bot/BotCommands.ts`

## 3. Validation & tests
- [x] 3.1 Add service tests covering completed, open, absence, no-record, and invalid date cases
- [x] 3.2 Run `openspec validate add-record-command --strict`
