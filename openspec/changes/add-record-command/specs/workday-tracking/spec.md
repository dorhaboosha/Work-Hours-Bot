## ADDED Requirements

### Requirement: Inspect a Specific Date's Record
The system SHALL return the details of a specific date via `/record dd-mm` (`GET /workdays/record/:telegramId/:date`). The `date` path parameter uses `dd-mm` format and is resolved to the current year in the user's timezone. The response SHALL include `workDate`, `displayDate`, `state` (one of `COMPLETED_WORK_RECORD`, `OPEN_WORK_RECORD`, `ABSENCE_RECORD`, `NO_RECORD`), and the `record` (or `null`). This endpoint SHALL be read-only and SHALL never create, update, or delete a record.

#### Scenario: Completed work record
- **WHEN** the date has a `WORK` record with both `startTime` and `endTime`
- **THEN** `state` is `COMPLETED_WORK_RECORD` and `record` includes `startTime`, `endTime`, and `workedMinutes`

#### Scenario: Open work record
- **WHEN** the date has a `WORK` record with `startTime` and no `endTime`
- **THEN** `state` is `OPEN_WORK_RECORD` and `record` has `endTime = null` and `workedMinutes = null`

#### Scenario: Absence record
- **WHEN** the date has an absence record
- **THEN** `state` is `ABSENCE_RECORD` and `record` includes the absence `recordType` and credited `workedMinutes`

#### Scenario: No record
- **WHEN** the date has no record
- **THEN** `state` is `NO_RECORD` and `record` is `null`

#### Scenario: Read-only lookup never mutates data
- **WHEN** a `/record dd-mm` lookup is performed for any date
- **THEN** no daily record is created, updated, or deleted as a result

#### Scenario: Invalid date format
- **WHEN** the `date` parameter is not valid `dd-mm`
- **THEN** the response is `400` with `error.code = "INVALID_DATE_FORMAT"`

#### Scenario: Settings missing
- **WHEN** the user has no settings
- **THEN** the response is `404` with `error.code = "USER_SETTINGS_NOT_FOUND"`
