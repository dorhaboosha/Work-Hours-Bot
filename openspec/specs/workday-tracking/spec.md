# workday-tracking Specification

## Purpose
TBD - created by archiving change add-workhours-bot-mvp. Update Purpose after archive.
## Requirements
### Requirement: Start Workday
The system SHALL allow a user to start a workday via `/start` (`POST /workdays/start`). Starting creates a daily record for today's local `workDate` with `recordType = WORK`, `startTime`, and a calculated `expectedEndTime = startTime + dailyRequiredMinutes`, leaving `endTime` and `workedMinutes` null.

#### Scenario: Start creates a record with expected end time
- **WHEN** a user with settings and no open record starts a workday
- **THEN** a `daily_records` row is created for today's local date with `recordType = WORK`, `startTime`, `expectedEndTime = startTime + dailyRequiredMinutes`, `endTime = null`, and `workedMinutes = null`
- **AND** the response is `201` with the new record

#### Scenario: Today already started
- **WHEN** the user already has an active record for today's local date
- **THEN** the response is `409` with `error.code = "DAILY_RECORD_ALREADY_EXISTS"`
- **AND** no second record is created

#### Scenario: Blocked by previous unfinished workday
- **WHEN** the user has an open record from a previous local date
- **THEN** the response is `409` with `error.code = "PREVIOUS_RECORD_STILL_OPEN"`
- **AND** the bot instructs the user to fix it with `/edit dd-mm`

#### Scenario: Settings missing
- **WHEN** the user has no settings
- **THEN** the response is `404` with `error.code = "USER_SETTINGS_NOT_FOUND"`

### Requirement: Workday Status
The system SHALL return today's active workday status via `/status` (`GET /workdays/status/:telegramId`), including `startTime`, `expectedEndTime`, `workedMinutesSoFar`, `remainingMinutes`, and `isActive`.

#### Scenario: Active status returned
- **WHEN** the user has an active record for today
- **THEN** the response returns `workedMinutesSoFar` (from `startTime` to now), `remainingMinutes`, `expectedEndTime`, and `isActive: true`

#### Scenario: Remaining clamped to zero
- **WHEN** the user has already worked at least their required minutes
- **THEN** `remainingMinutes` is `0` rather than negative

#### Scenario: No active workday
- **WHEN** there is no active record for today
- **THEN** the response is `404` with `error.code = "ACTIVE_RECORD_NOT_FOUND"`
- **AND** the bot suggests using `/start` or `/edit dd-mm`

#### Scenario: Blocked by previous unfinished workday
- **WHEN** the user has an open record from a previous local date
- **THEN** the response is `409` with `error.code = "PREVIOUS_RECORD_STILL_OPEN"`
- **AND** the bot instructs the user to fix it with `/edit dd-mm`

### Requirement: End Today's Workday
The system SHALL close today's active workday via `/end` (`POST /workdays/end`) using the current time, calculating `workedMinutes` and `balanceMinutes = workedMinutes - requiredMinutes`. `/end` SHALL only close today's active workday; V1.1 does not support `/end HH:mm`.

#### Scenario: Close today's workday
- **WHEN** the user has an active record for today and sends `/end`
- **THEN** the record's `endTime` is set to the current time, `workedMinutes` is calculated, and the response includes `workedMinutes`, `requiredMinutes`, and `balanceMinutes`

#### Scenario: No active workday to end
- **WHEN** the user has no active workday for today
- **THEN** the response is `404` with `error.code = "ACTIVE_RECORD_NOT_FOUND"`
- **AND** the bot instructs the user to fix another date with `/edit dd-mm`

#### Scenario: Already closed
- **WHEN** today's workday is already closed
- **THEN** the response is `409` with `error.code = "DAILY_RECORD_ALREADY_CLOSED"`

### Requirement: Single Open Record Invariant
The system SHALL enforce that a user has at most one active record at a time and at most one record per `workDate`. A record is open only when `recordType = WORK`, `startTime` is set, and `endTime` is null.

#### Scenario: Duplicate daily record prevented
- **WHEN** a record already exists for a given `telegramId` and `workDate`
- **THEN** the system does not create a second record for that date

#### Scenario: Active record defined by open WORK record
- **WHEN** a `WORK` record has `startTime` set and `endTime = null`
- **THEN** it is treated as the user's active/open workday

### Requirement: List Daily Records
The system SHALL allow listing a user's daily records via `GET /workdays/:telegramId`, optionally filtered by `from` and `to` dates (`YYYY-MM-DD`), returning each record's `recordType`, to support debugging and future dashboard/manual-edit flows.

#### Scenario: List records in range
- **WHEN** a request includes optional `from` and `to` dates
- **THEN** the response returns the user's daily records within that date range with `success: true`

#### Scenario: Settings missing
- **WHEN** the user has no settings
- **THEN** the response is `404` with `error.code = "USER_SETTINGS_NOT_FOUND"`

### Requirement: Inspect Editable Date State
The system SHALL return the editable state of a specific date via `/edit dd-mm` (`GET /workdays/edit/:telegramId/:date`). The `date` path parameter uses `dd-mm` format and is resolved to the current year in the user's timezone. The response SHALL include `workDate`, `displayDate`, `state` (one of `OPEN_WORK_RECORD`, `NO_RECORD`, `CLOSED_WORK_RECORD`, `ABSENCE_RECORD`), the `record` (or `null`), and the `allowedActions`.

#### Scenario: Open work record
- **WHEN** the date has a `WORK` record with `startTime` and no `endTime`
- **THEN** `state` is `OPEN_WORK_RECORD` and `allowedActions` includes `SET_END_HOUR`, `SET_START_AND_END_HOURS`, `MARK_ABSENCE`, and `CANCEL`

#### Scenario: No record
- **WHEN** the date has no record
- **THEN** `state` is `NO_RECORD` and `allowedActions` includes `SET_START_AND_END_HOURS` and `MARK_ABSENCE`

#### Scenario: Closed work record
- **WHEN** the date has a closed `WORK` record
- **THEN** `state` is `CLOSED_WORK_RECORD` and `allowedActions` includes `SET_START_AND_END_HOURS`, `MARK_ABSENCE`, and `CANCEL`

#### Scenario: Absence record
- **WHEN** the date has an absence record
- **THEN** `state` is `ABSENCE_RECORD` and `allowedActions` includes `SET_START_AND_END_HOURS`, `MARK_ABSENCE`, and `CANCEL`

#### Scenario: Invalid date format
- **WHEN** the `date` parameter is not valid `dd-mm`
- **THEN** the response is `400` with `error.code = "INVALID_DATE_FORMAT"`

### Requirement: Edit a Specific Date
The system SHALL create or update a daily record for a specific date via `/edit dd-mm` (`PATCH /workdays/edit/:telegramId/:date`). The `action` SHALL be one of `SET_END_HOUR`, `SET_START_AND_END_HOURS`, or `MARK_ABSENCE`. Entered times SHALL be applied to the resolved edited date (current year, user's timezone) and stored as UTC — never the current date/time. The response SHALL include `workedMinutes`, `requiredMinutes`, and `balanceMinutes`. V1.1 provides no delete action.

#### Scenario: Set end hour on an open work record
- **WHEN** the date has an open `WORK` record and `action = SET_END_HOUR` with a valid `endTime`
- **THEN** the existing `startTime` is kept, `endTime` is applied to the edited date, `workedMinutes` is calculated, and the record is closed as `WORK`

#### Scenario: Set start and end hours
- **WHEN** `action = SET_START_AND_END_HOURS` with valid `startTime` and `endTime`
- **THEN** the record is created or updated as `WORK` for the edited date with calculated `expectedEndTime` and `workedMinutes`

#### Scenario: Mark absence
- **WHEN** `action = MARK_ABSENCE` with a supported absence `recordType`
- **THEN** the record is created or updated with that `recordType`, `startTime`/`expectedEndTime`/`endTime` set to `null`, and `workedMinutes` set by the absence credit rule

#### Scenario: Set end hour only allowed on an open work record
- **WHEN** `action = SET_END_HOUR` is used on a date that is not an open `WORK` record
- **THEN** the response is `409` with `error.code = "CONFLICT"`

#### Scenario: Invalid time format
- **WHEN** a provided `startTime` or `endTime` is not valid `HH:mm`
- **THEN** the response is `400` with `error.code = "INVALID_TIME_FORMAT"`

#### Scenario: Invalid time range
- **WHEN** `endTime` is not after `startTime`
- **THEN** the response is `400` with `error.code = "INVALID_TIME_RANGE"`

#### Scenario: Invalid record type for absence
- **WHEN** `action = MARK_ABSENCE` with `recordType = WORK` or an unsupported type
- **THEN** the response is `400` with `error.code = "INVALID_RECORD_TYPE"`

