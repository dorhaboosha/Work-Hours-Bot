## ADDED Requirements

### Requirement: Start Workday
The system SHALL allow a user to start a workday via `/start` (`POST /workdays/start`). Starting creates a daily record for today's local `workDate` with `startTime` and a calculated `expectedEndTime = startTime + dailyRequiredMinutes`, leaving `endTime` and `workedMinutes` null.

#### Scenario: Start creates a record with expected end time
- **WHEN** a user with settings and no open record starts a workday
- **THEN** a `daily_records` row is created for today's local date with `startTime`, `expectedEndTime = startTime + dailyRequiredMinutes`, `endTime = null`, and `workedMinutes = null`
- **AND** the response is `201` with the new record

#### Scenario: Today already started
- **WHEN** the user already has an active record for today's local date
- **THEN** the response is `409` with `error.code = "DAILY_RECORD_ALREADY_EXISTS"`
- **AND** no second record is created

#### Scenario: Blocked by previous unfinished workday
- **WHEN** the user has an open record from a previous local date
- **THEN** the response is `409` with `error.code = "PREVIOUS_RECORD_STILL_OPEN"`
- **AND** the bot instructs the user to close it with `/end HH:mm`

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
- **AND** the bot suggests using `/start`

#### Scenario: Blocked by previous unfinished workday
- **WHEN** the user has an open record from a previous local date
- **THEN** the response is `409` with `error.code = "PREVIOUS_RECORD_STILL_OPEN"`

### Requirement: End Today's Workday
The system SHALL close today's active workday via `/end` (`POST /workdays/end` with no `manualEndTime`) using the current time, calculating `workedMinutes` and `balanceMinutes = workedMinutes - requiredMinutes`.

#### Scenario: Close today's workday
- **WHEN** the user has an active record for today and sends `/end`
- **THEN** the record's `endTime` is set to the current time, `workedMinutes` is calculated, and the response includes `workedMinutes`, `requiredMinutes`, and `balanceMinutes`

#### Scenario: No active workday to end
- **WHEN** the user has no active or unfinished workday
- **THEN** the response is `404` with `error.code = "ACTIVE_RECORD_NOT_FOUND"`

#### Scenario: Already closed
- **WHEN** today's workday is already closed
- **THEN** the response is `409` with `error.code = "DAILY_RECORD_ALREADY_CLOSED"`

### Requirement: Close Previous Unfinished Workday
The system SHALL require a manual end time to close an open record from a previous local date via `/end HH:mm` (`POST /workdays/end` with `manualEndTime`). The manual end time SHALL be applied to the record's original `workDate` in the user's timezone and converted to UTC. The system MUST NOT use the current date/time and MUST NOT compute worked time spanning from the previous date to now.

#### Scenario: Manual end time applied to original work date
- **WHEN** the open record is from `2026-06-12`, the user sends `/end 17:30` on `2026-06-13`
- **THEN** the record is closed with `endTime` equal to `2026-06-12 17:30` in the user's timezone (stored as UTC)
- **AND** `workedMinutes` is computed from that day's `startTime` to that day's `endTime`

#### Scenario: Manual end time required for previous date
- **WHEN** the open record is from a previous local date and `/end` is sent without a time
- **THEN** the response is `409` with `error.code = "MANUAL_END_TIME_REQUIRED"`
- **AND** the bot instructs the user to use `/end HH:mm`

#### Scenario: Invalid manual end time format
- **WHEN** `manualEndTime` is provided but is not valid `HH:mm` 24-hour format (hour `00`–`23`, minute `00`–`59`)
- **THEN** the response is `400` with `error.code = "VALIDATION_ERROR"`
- **AND** the bot explains the expected `/end HH:mm` format

### Requirement: Single Open Record Invariant
The system SHALL enforce that a user has at most one active record at a time and at most one record per `workDate`.

#### Scenario: Duplicate daily record prevented
- **WHEN** a record already exists for a given `telegramId` and `workDate`
- **THEN** the system does not create a second record for that date

#### Scenario: Active record defined by null end time
- **WHEN** a record has `endTime = null`
- **THEN** it is treated as the user's active/open workday

### Requirement: List Daily Records
The system SHALL allow listing a user's daily records via `GET /workdays/:telegramId`, optionally filtered by `from` and `to` dates (`YYYY-MM-DD`), to support debugging and future dashboard/manual-edit flows.

#### Scenario: List records in range
- **WHEN** a request includes optional `from` and `to` dates
- **THEN** the response returns the user's daily records within that date range with `success: true`

#### Scenario: Settings missing
- **WHEN** the user has no settings
- **THEN** the response is `404` with `error.code = "USER_SETTINGS_NOT_FOUND"`
